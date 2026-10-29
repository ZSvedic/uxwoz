// One screen generation: stream the model's fragment, then report what it cost and who served it.

import type { Candidate } from './cache.ts'
import { extractFragment } from './frame.ts'
import { DEVICES, type Device } from './frame.ts'
import { MODELS, type ModelId } from './models.ts'
import { SYSTEM_PROMPT, WARMUP_REQUEST, screenRequest } from './prompt.ts'
import { ProviderError, streamModel, type Fetch } from './providers.ts'

/** A slower screen is useless, and keep-alive comments can stall a stream, so this is an overall deadline. */
export const DEADLINE_MS = 20_000

export interface GenerateOptions {
  app: string
  action: string | null
  /** Action prompts of screens the mockup already has; the model links to them by exact prompt. */
  existing?: string[]
  model: ModelId
  /** The device to design for; left out of the request when absent. */
  device?: Device
  /** True for the second variant of a pair: ask for a clearly different design. */
  alternative?: boolean
  /** What the user wants changed, from a regenerate. */
  feedback?: string
  signal?: AbortSignal
  fetch?: Fetch
  env?: Record<string, string | undefined>
  log?: (msg: string) => void
}

export type GenerateEvent = { type: 'chunk'; text: string } | { type: 'done'; candidate: Candidate }

export async function* generateScreen(o: GenerateOptions): AsyncGenerator<GenerateEvent> {
  const cfg = MODELS[o.model]
  const log = o.log ?? ((m) => console.warn(m))
  const deadline = AbortSignal.timeout(DEADLINE_MS)
  const signal = o.signal ? AbortSignal.any([o.signal, deadline]) : deadline
  const t0 = performance.now()
  let raw = ''
  let firstChunkMs: number | null = null
  try {
    for await (const ev of streamModel({
      model: o.model, system: SYSTEM_PROMPT,
      user: screenRequest(o.app, o.action, o.existing, { device: o.device && DEVICES[o.device].request, alternative: o.alternative, feedback: o.feedback }),
      signal, fetch: o.fetch, env: o.env,
    })) {
      if (ev.type === 'text') {
        firstChunkMs ??= performance.now() - t0
        raw += ev.text
        yield { type: 'chunk', text: ev.text }
        continue
      }
      // Served names may carry a snapshot suffix (gpt-6-luna-2026-10-01), so compare the prefix.
      if (ev.servedModel && !ev.servedModel.startsWith(cfg.model))
        log(`model substituted: asked ${cfg.model}, served ${ev.servedModel}`)
      if (cfg.serviceTier && ev.servedTier && ev.servedTier !== cfg.serviceTier)
        log(`tier substituted: asked ${cfg.serviceTier}, served ${ev.servedTier}`)
      // Only a finished screen may be cached: a stream that stopped early or hit the token limit is an error.
      if (!ev.finishReason) throw new ProviderError('the stream ended before the screen was complete')
      if (ev.finishReason !== 'stop') throw new ProviderError(`the screen was cut off (${ev.finishReason})`)
      const html = extractFragment(raw)
      if (!html.trim()) throw new ProviderError('the model returned an empty screen')
      yield {
        type: 'done',
        candidate: {
          html,
          model: o.model,
          servedModel: ev.servedModel,
          createdAt: new Date().toISOString(),
          costUsd: ev.costUsd,
          costEstimated: cfg.costEstimated,
          firstChunkMs: firstChunkMs == null ? null : Math.round(firstChunkMs),
          totalMs: Math.round(performance.now() - t0),
          finishReason: ev.finishReason,
          ...(o.device && { device: o.device }),
          ...(o.feedback && { feedback: o.feedback }),
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
