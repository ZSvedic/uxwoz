// Streaming clients for OpenRouter (Chat Completions) and OpenAI (Responses API).
// Both yield the same events: text deltas, then one `final` with usage and the served model.

import { MODELS, type ModelConfig, type ModelId } from './models.ts'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>
type Env = Record<string, string | undefined>
/** What one call said, with its timing: each text delta after `ms` since the call began, then its final event. */
export interface Recorded { events: [ms: number, text: string][]; final: FinalEvent }

/** How a call reaches the world: a fetch and an env to use instead of the real ones (tests), and a log. */
export interface Io {
  fetch?: Fetch
  env?: Env
  log?: (msg: string) => void
  /** Called with each live call that reached its final event, as it was said. */
  record?: (r: Recorded, call: { model: ModelId; user: string }) => void
  /** Called once per live call that was sent, when it ends, however it ends; `usd` is null when the cost never arrived.
   * Never for a replay, nor for a call that failed before it was sent (no key) or that `allow` refused. */
  spent?: (usd: number | null, model: ModelId) => void
  /** Called right before a live call is sent, never for a replay; if it throws, the call ends with that error. */
  allow?: () => void
  /** The clock a replay waits on: real time unless a test speeds it up. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** The parts of an Io a call passes on. */
export const ioOf = (o: Io): Io => ({ fetch: o.fetch, env: o.env, log: o.log, record: o.record, spent: o.spent, allow: o.allow, sleep: o.sleep })

export interface FinalEvent {
  type: 'final'
  servedModel: string | null
  finishReason: string | null
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
}

type StreamEvent = { type: 'text'; text: string } | FinalEvent

interface StreamOptions extends Io {
  model: ModelId
  system: string
  user: string
  maxTokens?: number
  signal?: AbortSignal
  /** Replay this instead of calling the model: no network, no `spent`. */
  recorded?: Recorded
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

function key(env: Env, name: string): string {
  const v = env[name]
  if (!v) throw new ProviderError(`${name} is not set in the root .env`)
  return v
}

/** `send` runs right before the fetch: the call's `allow`, then it counts as sent. */
async function post(f: Fetch, url: string, body: unknown, headers: Record<string, string>, send: () => void, signal?: AbortSignal) {
  send()
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

async function* streamOpenRouter(cfg: ModelConfig, o: StreamOptions, f: Fetch, env: Env, send: () => void) {
  const body = {
    model: cfg.model,
    stream: true,
    max_tokens: o.maxTokens ?? 8000,
    messages: [
      // The system prompt is the same for every call, so it is marked for the provider's prompt cache (5 minutes,
      // renewed by each read): Claude caches nothing without a mark. The user message differs per call and stays unmarked.
      { role: 'system', content: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }] },
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
  }, send, o.signal)
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

async function* streamOpenAI(cfg: ModelConfig, o: StreamOptions, f: Fetch, env: Env, send: () => void) {
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
  }, send, o.signal)
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

function estimateCost(cfg: ModelConfig, f: FinalEvent): number | null {
  const p = cfg.pricePerMTok
  if (!p || f.inputTokens == null || f.outputTokens == null) return null
  const cached = f.cachedInputTokens ?? 0
  return ((f.inputTokens - cached) * p.input + cached * p.cachedInput + f.outputTokens * p.output) / 1_000_000
}

export function streamModel(o: StreamOptions): AsyncGenerator<StreamEvent> {
  if (o.recorded) return replay(o.recorded, o.sleep ?? sleep, o.signal)
  const cfg = MODELS[o.model]
  const f = o.fetch ?? fetch
  const env = o.env ?? process.env
  const state = { sent: false }
  const send = () => { o.allow?.(); state.sent = true }
  return metered(cfg.provider === 'openrouter' ? streamOpenRouter(cfg, o, f, env, send) : streamOpenAI(cfg, o, f, env, send), o, state)
}

/** A live call: its cost to `spent` once however it ends, if it was sent; the whole call to `record` when it reached its end. */
async function* metered(events: AsyncGenerator<StreamEvent>, o: StreamOptions, state: { sent: boolean }): AsyncGenerator<StreamEvent> {
  const t0 = performance.now(), said: [number, string][] = []
  let ended = false
  try {
    for await (const ev of events) {
      if (ev.type === 'text') said.push([Math.round(performance.now() - t0), ev.text])
      else {
        ended = true
        o.spent?.(ev.costUsd, o.model)
        o.record?.({ events: said, final: { ...ev } }, { model: o.model, user: o.user })
      }
      yield ev
    }
  } finally {
    if (!ended && state.sent) o.spent?.(null, o.model)
  }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason)
  const t = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve() }, ms)
  const stop = () => { clearTimeout(t); reject(signal!.reason) }
  signal?.addEventListener('abort', stop, { once: true })
})

/** A recorded call said again: each delta after its recorded delay, then its final event. */
async function* replay(r: Recorded, wait: NonNullable<Io['sleep']>, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  let at = 0
  for (const [ms, text] of r.events) {
    if (ms > at) await wait(ms - at, signal)
    at = Math.max(at, ms)
    if (signal?.aborted) throw signal.reason
    yield { type: 'text', text }
  }
  yield { ...r.final }
}
