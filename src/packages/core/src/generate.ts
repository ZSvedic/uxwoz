// One screen generation: stream the model's fragment, then report what it cost and who served it.

import type { PlanInfo, Version } from './cache.ts'
import { extractFragment, screenIdea, screenName } from './frame.ts'
import { DEVICES, type Device } from './frame.ts'
import { MODELS, type ModelId } from './models.ts'
import { SYSTEM_PROMPT, WARMUP_REQUEST, screenRequest } from './prompt.ts'
import { applyEdit, checkScreen, cutProse, firstCopy, flowNames, flowRequest, markTab, namesIn, navNames, specRequest, takeSpecLines, type Spec, type SpecLine } from './spec.ts'
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
  /** The mockup's spec, sent after the tree, and the screen's name, for the check. A string is sent as it is. */
  spec?: Spec | string
  name?: string
  /** For a first screen: how the plan went, kept on the version for Info. */
  plan?: PlanInfo
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
      user: screenRequest(o.app, o.action, o.existing, { device: o.device && DEVICES[o.device].request, alternative: o.alternative, spec: typeof o.spec === 'string' ? o.spec : o.spec && specRequest(o.spec),
        flow: typeof o.spec === 'object' ? flowRequest(o.spec, o.name) : undefined, edit: o.edit }),
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
      // Prose before the title goes, the spec lines the design proposes come out of the stored
      // screen, and the app marks the current tab.
      // A reply that holds the screen twice keeps its first copy.
      const first = firstCopy(cutProse(extractFragment(raw)))
      const taken = takeSpecLines(first.html)
      const html = typeof o.spec === 'object' ? markTab(taken.html, o.name) : taken.html
      if (!html.trim()) throw new ProviderError('the model returned an empty screen')
      // An Edit is checked against the spec with its own lines in: the Edit that sets Back is not a Back miss.
      let spec = typeof o.spec === 'object' ? o.spec : null
      if (spec && o.edit && taken.lines.length) {
        spec = JSON.parse(JSON.stringify(spec)) as Spec
        applyEdit(spec, taken.lines, '', '')
      }
      const misses = spec && Object.keys(spec).length ? checkScreen(html, spec, o.name, knownNames(o.existing, spec, taken.lines)) : null
      if (misses && first.cut) misses.push('the reply held the screen twice; the first copy was kept')
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
          ...(taken.lines.length && { spec: taken.lines }),
          ...(o.edit && taken.refusals.length && { specRefused: taken.refusals }),
          // A mockup with no spec rows (made before the spec) has nothing to check.
          ...(misses && { misses }),
          ...(o.plan && { plan: o.plan }),
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
 * The screens a new screen may link to without opening one the mockup does not plan: the names in
 * the request's tree (`  @sleep-report: …`), the spec's flow and tabs, and the tabs of the design's
 * own ui.nav line (Home plans its tabs as it draws them).
 */
function knownNames(lines: string[] = [], spec: Spec, own: SpecLine[]): Set<string> {
  const tree = lines.map((l) => l.match(/^\s*@([a-z0-9_-]+)/i)?.[1]?.toLowerCase()).filter((n): n is string => !!n)
  const tabs = own.filter((l) => l.key === 'ui.nav').flatMap((l) => namesIn(l.text))
  return new Set(['home', ...tree, ...flowNames(spec), ...navNames(spec), ...tabs])
}

/** One short request with the same system prompt, so the provider's prompt cache is warm for the session. */
export async function warmUp(model: ModelId, opts: { fetch?: Fetch; env?: Record<string, string | undefined> } = {}) {
  const stream = streamModel({
    model, system: SYSTEM_PROMPT, user: WARMUP_REQUEST, maxTokens: 16,
    signal: AbortSignal.timeout(DEADLINE_MS), ...opts,
  })
  for await (const _ of stream) { /* drain */ }
}
