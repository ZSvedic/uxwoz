// One screen generation: stream the model's fragment, then report what it cost and who served it.

import type { Version } from './cache.ts'
import { extractFragment, screenIdea, screenName } from './frame.ts'
import type { Device } from './frame.ts'
import { MODELS, type ModelId } from './models.ts'
import { SYSTEM_PROMPT, WARMUP_REQUEST } from './prompt.ts'
import { ProviderError, streamModel, type Fetch } from './providers.ts'

/** A slower screen is useless, and keep-alive comments can stall a stream, so this is an overall deadline. */
export const DEADLINE_MS = 20_000

export interface GenerateOptions {
  /** The user message: the paper and the job (drawRequest or editRequest). */
  user: string
  model: ModelId
  /** The device the request designs for, stored with the version. */
  device?: Device
  signal?: AbortSignal
  fetch?: Fetch
  env?: Record<string, string | undefined>
}

export type GenerateEvent = { type: 'chunk'; text: string } | { type: 'done'; version: Version }

export async function* generateScreen(o: GenerateOptions): AsyncGenerator<GenerateEvent> {
  const cfg = MODELS[o.model]
  const deadline = AbortSignal.timeout(DEADLINE_MS)
  const signal = o.signal ? AbortSignal.any([o.signal, deadline]) : deadline
  const t0 = performance.now()
  let raw = ''
  let firstChunkMs: number | null = null
  try {
    for await (const ev of streamModel({
      model: o.model, system: SYSTEM_PROMPT, user: o.user, signal, fetch: o.fetch, env: o.env,
    })) {
      if (ev.type === 'text') {
        firstChunkMs ??= performance.now() - t0
        raw += ev.text
        yield { type: 'chunk', text: ev.text }
        continue
      }
      // Only a finished screen may be cached: a stream that stopped early or hit the token limit is an error.
      if (!ev.finishReason) throw new ProviderError('the stream ended before the screen was complete')
      if (ev.finishReason !== 'stop') throw new ProviderError(`the screen was cut off (${ev.finishReason})`)
      const html = extractFragment(raw)
      if (!html.trim()) throw new ProviderError('the model returned an empty screen')
      const name = screenName(html), idea = screenIdea(html)
      yield {
        type: 'done',
        version: {
          html, model: o.model, servedModel: ev.servedModel, createdAt: new Date().toISOString(), costUsd: ev.costUsd, costEstimated: cfg.costEstimated,
          firstChunkMs: firstChunkMs == null ? null : Math.round(firstChunkMs), totalMs: Math.round(performance.now() - t0), finishReason: ev.finishReason,
          ...(o.device && { device: o.device }), ...(name && { name }), ...(idea && { idea }),
        },
      }
      return
    }
    throw new ProviderError('the stream ended without a final event')
  } catch (err) {
    if (deadline.aborted) throw new ProviderError(`no complete screen within ${DEADLINE_MS / 1000} s`)
    throw err
  }
}

/** One short request with the same system prompt, so the provider's prompt cache is warm for the session. */
export async function warmUp(model: ModelId, opts: { fetch?: Fetch; env?: Record<string, string | undefined> } = {}) {
  const stream = streamModel({
    model, system: SYSTEM_PROMPT, user: WARMUP_REQUEST, maxTokens: 16,
    signal: AbortSignal.timeout(DEADLINE_MS), ...opts,
  })
  for await (const _ of stream) { /* drain */ }
}
