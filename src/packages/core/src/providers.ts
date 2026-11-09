// Streaming clients for OpenRouter (Chat Completions) and OpenAI (Responses API).
// Both yield the same events: text deltas, then one `final` with usage and the served model.

import { MODELS, type ModelConfig, type ModelId } from './models.ts'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface FinalEvent {
  type: 'final'
  servedModel: string | null
  finishReason: string | null
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
}

export type StreamEvent = { type: 'text'; text: string } | FinalEvent

export interface StreamOptions {
  model: ModelId
  system: string
  user: string
  maxTokens?: number
  signal?: AbortSignal
  fetch?: Fetch
  env?: Record<string, string | undefined>
}

const noFinal = (): FinalEvent => ({ type: 'final', servedModel: null, finishReason: null, inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null })

export class ProviderError extends Error {}

/** Yield the payload of each `data:` line; SSE comments and event names are skipped. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buf = ''
  for await (const bytes of body) {
    buf += decoder.decode(bytes, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
  if (buf.startsWith('data:')) yield buf.slice(5).trim()
}

function key(env: Record<string, string | undefined>, name: string): string {
  const v = env[name]
  if (!v) throw new ProviderError(`${name} is not set in the root .env`)
  return v
}

async function post(f: Fetch, url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal) {
  const res = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new ProviderError(`${new URL(url).host} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.body
}

async function* streamOpenRouter(cfg: ModelConfig, o: StreamOptions, f: Fetch, env: Record<string, string | undefined>) {
  const body = {
    model: cfg.model,
    stream: true,
    max_tokens: o.maxTokens ?? 8000,
    messages: [
      { role: 'system', content: o.system },
      { role: 'user', content: o.user },
    ],
    reasoning: cfg.reasoning,
    usage: { include: true },
    provider: { order: cfg.providerOrder, allow_fallbacks: false, require_parameters: true },
  }
  const stream = await post(f, 'https://openrouter.ai/api/v1/chat/completions', body, {
    Authorization: `Bearer ${key(env, 'OPENROUTER_API_KEY')}`,
    'HTTP-Referer': 'http://localhost/uxwoz',
    'X-Title': 'uxwoz',
  }, o.signal)
  const final = noFinal()
  for await (const data of sseData(stream)) {
    if (data === '[DONE]') break
    const chunk = JSON.parse(data)
    if (chunk.error) throw new ProviderError(`OpenRouter stream error: ${JSON.stringify(chunk.error).slice(0, 300)}`)
    final.servedModel = chunk.model ?? final.servedModel
    for (const choice of chunk.choices ?? []) {
      const text = choice.delta?.content
      if (text) yield { type: 'text', text } as const
      if (choice.finish_reason) final.finishReason ??= choice.finish_reason
    }
    const u = chunk.usage
    if (u) Object.assign(final, { inputTokens: u.prompt_tokens ?? null, cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? null, outputTokens: u.completion_tokens ?? null, costUsd: u.cost ?? null })
  }
  yield final
}

async function* streamOpenAI(cfg: ModelConfig, o: StreamOptions, f: Fetch, env: Record<string, string | undefined>) {
  const body = {
    model: cfg.model,
    stream: true,
    service_tier: cfg.serviceTier,
    reasoning: cfg.reasoning,
    max_output_tokens: o.maxTokens ?? 8000,
    instructions: o.system,
    input: o.user,
    store: false,
  }
  const stream = await post(f, 'https://api.openai.com/v1/responses', body, {
    Authorization: `Bearer ${key(env, 'OPENAI_API_KEY')}`,
  }, o.signal)
  const final = noFinal()
  for await (const data of sseData(stream)) {
    if (data === '[DONE]') break
    const ev = JSON.parse(data)
    if (ev.type === 'response.output_text.delta' && ev.delta) {
      yield { type: 'text', text: ev.delta } as const
    } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
      const r = ev.response, u = r.usage ?? {}
      Object.assign(final, { servedModel: r.model ?? null, finishReason: ev.type === 'response.completed' ? 'stop' : (r.incomplete_details?.reason ?? 'incomplete'),
        inputTokens: u.input_tokens ?? null, cachedInputTokens: u.input_tokens_details?.cached_tokens ?? null, outputTokens: u.output_tokens ?? null })
      final.costUsd = estimateCost(cfg, final)
    } else if (ev.type === 'response.failed' || ev.type === 'error') {
      throw new ProviderError(`OpenAI stream error: ${JSON.stringify(ev).slice(0, 300)}`)
    }
  }
  yield final
}

export function estimateCost(cfg: ModelConfig, f: FinalEvent): number | null {
  const p = cfg.pricePerMTok
  if (!p || f.inputTokens == null || f.outputTokens == null) return null
  const cached = f.cachedInputTokens ?? 0
  return ((f.inputTokens - cached) * p.input + cached * p.cachedInput + f.outputTokens * p.output) / 1_000_000
}

export function streamModel(o: StreamOptions): AsyncGenerator<StreamEvent> {
  const cfg = MODELS[o.model]
  const f = o.fetch ?? fetch
  const env = o.env ?? process.env
  return cfg.provider === 'openrouter' ? streamOpenRouter(cfg, o, f, env) : streamOpenAI(cfg, o, f, env)
}
