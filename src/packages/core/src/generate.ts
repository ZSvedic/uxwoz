// One screen generation: stream the model's fragment, then report what it cost and who served it.

import type { Version } from './cache.ts'
import { extractFragment, screenIdea, screenName } from './frame.ts'
import { DEVICES, type Device } from './frame.ts'
import { MODELS, type ModelId } from './models.ts'
import { SYSTEM_PROMPT, WARMUP_REQUEST, screenRequest } from './prompt.ts'
import { ProviderError, streamModel, type Fetch } from './providers.ts'

/** A slower screen is useless, and keep-alive comments can stall a stream, so this is an overall deadline. */
export const DEADLINE_MS = 20_000

export interface GenerateOptions {
  app: string
  action: string | null
  /** The tree of screens the mockup already has (lines from treeLines); the model links to them by @name. */
  existing?: string[]
  model: ModelId
  /** The device to design for; left out of the request when absent. */
  device?: Device
  /** True for one side of an A OR B: ask for a clearly different design. */
  alternative?: boolean
  /** An Edit: change this screen as asked instead of designing a new one. */
  edit?: { html: string; change: string }
  signal?: AbortSignal
  fetch?: Fetch
  env?: Record<string, string | undefined>
  log?: (msg: string) => void
}

export type GenerateEvent = { type: 'chunk'; text: string } | { type: 'done'; version: Version }

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
      user: screenRequest(o.app, o.action, o.existing, { device: o.device && DEVICES[o.device].request, alternative: o.alternative, edit: o.edit }),
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
      // Prose before the title goes, and a reply that holds the screen twice keeps its first copy.
      const html = firstCopy(cutProse(extractFragment(raw)))
      if (!html.trim()) throw new ProviderError('the model returned an empty screen')
      const name = screenName(html), idea = screenIdea(html)
      yield {
        type: 'done',
        version: {
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
          ...(name && { name }),
          ...(idea && { idea }),
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

/**
 * The first copy of a reply that holds the screen twice, as Luna's sometimes do: cut where a second
 * idea, or a second title outside SVG, starts.
 */
export function firstCopy(html: string): string {
  const ideas = [...html.matchAll(/<meta\s+name=["']?idea\b/gi)].map((m) => m.index!)
  const titles = [...html.matchAll(/<title>/gi)].map((m) => m.index!).filter((i) => !inside(html, i, 'svg') && !inside(html, i, 'script'))
  const at = Math.min(...[ideas[1], titles[1]].filter((x): x is number => x != null))
  // Never a kept copy that ends inside a script: a title in a script's string is no second copy.
  if (!Number.isFinite(at) || inside(html, at, 'script')) return html
  const kept = html.slice(0, at)
  // The junk between the copies goes: from a marker like </final> or </assistant>, else after the last tag.
  const junk = kept.search(/<\/(?:final|assistant|analysis|answer|response|output)>/i)
  return (junk >= 0 ? kept.slice(0, junk) : kept.slice(0, kept.lastIndexOf('>') + 1)).trimEnd()
}

/** True when position `i` of `html` lies inside an element `tag` (svg, script). */
function inside(html: string, i: number, tag: string): boolean {
  const before = html.slice(0, i).toLowerCase()
  return before.lastIndexOf(`<${tag}`) > before.lastIndexOf(`</${tag}>`)
}

/** Prose a model wrote before `<title>` goes: the reply must begin with the title. Markup before it stays. */
export function cutProse(html: string): string {
  const i = html.search(/<title>/i)
  return i > 0 && !html.slice(0, i).includes('<') ? html.slice(i) : html
}

/** One short request with the same system prompt, so the provider's prompt cache is warm for the session. */
export async function warmUp(model: ModelId, opts: { fetch?: Fetch; env?: Record<string, string | undefined> } = {}) {
  const stream = streamModel({
    model, system: SYSTEM_PROMPT, user: WARMUP_REQUEST, maxTokens: 16,
    signal: AbortSignal.timeout(DEADLINE_MS), ...opts,
  })
  for await (const _ of stream) { /* drain */ }
}
