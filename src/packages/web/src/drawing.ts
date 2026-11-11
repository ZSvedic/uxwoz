// The work behind a screen: the filing chain per mockup and the fixer's visits, and the streaming of a
// screen (A OR B at once, a revise) as NDJSON. server.ts's routes call what `drawing` returns.
// In a starter's mockup a recording answers where a model would be called (spec/public.md, Recordings).

import {
  DEFAULT_DEVICE, DEFAULT_MODEL, HOME_LINE, HOME_NAME, PROPOSALS, canonicalAction, drawRequest, editRequest,
  fileDecision, generateScreen, recordedDesign, recordedFiling, recordedHtml, recordingFor, isComponent, isModelId, normalizePrompt, visitPaper, plannedScreens, promptFromLabel, screenKey, screenRef,
  type CacheEntry, type Device, type ScreenCache, type GenerateEvent, type Io, type ModelId, type Recorded, type Recording, type Version, type VisitOptions,
} from '@uxwoz/core'

/** One line of a /api/screen or /api/revise NDJSON stream (spec/code-contract.md). `meta.variants`: 2, 1 for a revise, 0 for a cache hit. */
export type ScreenEvent =
  | { type: 'meta'; key: string; cached: boolean; variants: number }
  | { type: 'chunk'; variant: number; text: string }
  | { type: 'version'; variant: number; version: Version }
  | { type: 'failed'; variant: number; message: string }
  | { type: 'done'; entry: CacheEntry; filing?: boolean }
  | { type: 'error'; message: string }

const shown = (e: CacheEntry) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: e.versions.at(-1)?.html ?? '' })

/** Interleave several streams, yielding each item as soon as its stream has it. */
async function* merge<T>(sources: AsyncIterator<T>[]): AsyncGenerator<T> {
  const next = (i: number) => sources[i]!.next().then((r) => ({ i, r }))
  const pending = new Map(sources.map((_, i) => [i, next(i)]))
  while (pending.size) {
    const { i, r } = await Promise.race(pending.values())
    if (r.done) pending.delete(i)
    else { pending.set(i, next(i)); yield r.value }
  }
}

/** One side's events, tagged with its slot; a failure becomes an event, so the other side goes on. */
async function* tagged(slot: number, events: AsyncIterable<GenerateEvent>): AsyncGenerator<{ slot: number; ev: GenerateEvent } | { slot: number; error: unknown }> {
  try {
    for await (const ev of events) yield { slot, ev }
  } catch (error) {
    yield { slot, error }
  }
}

export function ndjson(events: AsyncIterable<ScreenEvent>): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      // Once the browser has gone, writing throws; keep draining, so the generator still gets to
      // cache the sides that finished.
      let open = true
      const send = (ev: ScreenEvent) => {
        if (!open) return
        try { controller.enqueue(enc.encode(JSON.stringify(ev) + '\n')) } catch { open = false }
      }
      try {
        for await (const ev of events) send(ev)
      } catch (err) {
        console.warn(`screen stream failed: ${err}`)
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      } finally {
        if (open) try { controller.close() } catch { /* already closed */ }
      }
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}

/** A recorded call to replay: it cost nothing this time. */
const free = (r: Recorded | null): Recorded | undefined => (r ? { ...r, final: { ...r.final, costUsd: 0 } } : undefined)

/** The chains of every mockup, and the screens drawn with them. `may`: whether a live filing or visit may start now. */
export function drawing(cache: ScreenCache, io: Omit<Io, 'log'>, log: (m: string) => void, random: () => number, fileWaitMs: number, may: () => boolean = () => true) {
  /** Mockups that have had a live call since the server started. */
  const lived = new Set<string>()
  /** Mockups whose pick was just answered by a recording: the visit asked for in the same breath is refused. */
  const quiet = new Set<string>()

  /** The mockup's recording, if its prompt is a starter's. */
  const recOf = (app: string): Recording | null => recordingFor(app)
  /** Whether the mockup has had a live call: here, or (after a restart) a screen's design that cost something, or a visit. */
  function live(app: string): boolean {
    const root = normalizePrompt(app)
    if (lived.has(root)) return true
    const { entries, boxes } = cache.map(app)
    return !!boxes.visits?.length || entries.some((e) => !isComponent(e) && [...e.versions, ...(e.proposals ?? [])].some((v) => v && v.costUsd !== 0))
  }
  const goLive = (app: string) => lived.add(normalizePrompt(app))

  /** The recorded design for a new screen's side `slot`, or null when it has none. */
  function recordedScreen(app: string, action: string | null, slot: number): Recorded | null {
    const rec = recOf(app), ref = action && screenRef(action)
    if (!rec || (action && !ref)) return null
    return recordedDesign(rec, ref ? ref.name : null, slot)
  }
  /** The recorded design for a Regenerate of `entry` (the next after those it has), or null: an Edit, a component, or a screen whose newest version an Edit made stay live. */
  function recordedRegenerate(entry: CacheEntry, change: string | null): Recorded | null {
    const rec = recOf(entry.app), v = entry.versions.at(-1)
    if (!rec || change || isComponent(entry) || !v || v.feedback || v.by) return null
    return recordedDesign(rec, entry.name ?? null, entry.versions.length + 1)
  }
  /**
   * How a pick of `key` is filed: a replay (Home's filing by its side), `nothing` (another recorded screen,
   * before the mockup's first live call), or `live`.
   */
  function pickFiling(key: string, side: number | null): { replay: Recorded } | 'nothing' | 'live' {
    const e = cache.get(key), rec = e && recOf(e.app)
    if (!e || !rec || live(e.app) || !recordedDesign(rec, e.name ?? null, 0)) return 'live'
    if ((e.name ?? HOME_NAME) !== HOME_NAME) return 'nothing'
    // After the pick, the side is the recorded design the screen now shows.
    side ??= rec.screens[HOME_NAME]!.designs.slice(0, PROPOSALS).findIndex((d) => recordedHtml(d) === e.versions[0]?.html)
    const f = side >= 0 ? recordedFiling(rec, side) : null
    return f ? { replay: f } : 'live'
  }
  /** The background job running for each mockup, by root key: filings and the fixer's visits run one after another. */
  const filings = new Map<string, Promise<unknown>>()
  /** How many filings each mockup has in its chain. */
  const filingCount = new Map<string, number>()
  const count = (root: string, n: number) => filingCount.set(root, (filingCount.get(root) ?? 0) + n)

  /** Run a job in the mockup's chain, after the jobs before it. */
  function chain<T>(root: string, job: () => Promise<T>): Promise<T> {
    const p = (filings.get(root) ?? Promise.resolve()).then(job)
    const settled: Promise<unknown> = p.catch(() => {}).finally(() => { if (filings.get(root) === settled) filings.delete(root) })
    filings.set(root, settled)
    return p
  }

  /** File a decision in the mockup's chain (a pick's is `other`). Whether a filing started. */
  function file(key: string, decision: { other: string } | { change: string }): boolean {
    const e = cache.get(key)
    if (!e || isComponent(e)) return false
    const root = normalizePrompt(e.app), t0 = performance.now(), since = cache.now()
    const how = 'other' in decision ? pickFiling(key, null) : 'live'
    if (how !== 'live') {
      quiet.add(root)
      queueMicrotask(() => quiet.delete(root))
      if (how === 'nothing') return false
    } else {
      if (!may()) return false
      goLive(e.app)
    }
    const recorded = how === 'live' ? undefined : free(how.replay)
    count(root, 1)
    chain(root, () => fileDecision({ cache, key, decision, ...io, log, recorded }))
      .then((run) => run && log(`filed ${run.screen} in ${(run.ms / 1000).toFixed(1)} s for $${run.costUsd?.toFixed(4)}: added ${run.added.join(', ') || 'nothing'}, changed ${run.changed.join(', ') || 'nothing'}, refused ${run.refused.length}`))
      .catch((err) => {
        log(`filing failed: ${message(err)}`)
        if (cache.get(root) && !cache.removedSince(root, since)) cache.noteFiling(key, { at: new Date().toISOString(), screen: e.name ?? HOME_NAME, ms: Math.round(performance.now() - t0), costUsd: null, added: [], changed: [], refused: [], error: message(err) })
      })
      .finally(() => count(root, -1))
    return true
  }

  /** Per mockup: the visit running (with its redraws), how to stop its redraws, and whether another waits. */
  const visits = new Map<string, Promise<unknown>>(), stops = new Map<string, AbortController>(), again = new Set<string>()

  /**
   * A visit of the fixer in the mockup's chain (`ask`: an Edit of a box); its redraws are Edits that file
   * nothing. One asked for while one runs comes after it; an Edit is refused then. Why not, or null.
   */
  function visit(app: string, ask?: VisitOptions['ask']): string | null {
    const root = normalizePrompt(app)
    if (!cache.get(root)?.versions.length) return 'Wait for Home\'s pick.'
    if (visits.has(root)) {
      if (ask) return 'The fixer is visiting now: try again when it is done.'
      again.add(root)
      return null
    }
    if (!ask && quiet.has(root)) return 'A pick answered by a recording brings no visit.'
    if (!may()) return 'No live calls now.'
    goLive(app)
    const since = cache.now(), t0 = performance.now(), stop = new AbortController()
    stops.set(root, stop)
    const p = chain(root, () => visitPaper({ cache, app, ask, ...io, log }, () => cache.removedSince(root, since)))
      .then(async (r) => {
        if (!r) return log('visit dropped: the mockup changed meanwhile')
        let cost = r.visit.costUsd ?? 0
        await Promise.all(r.redraws.map(async (d) => {
          const e = cache.get(d.key), v = e?.versions.at(-1)
          if (!e || !v) return
          if (v.createdAt > r.visit.at) return void (d.change.text = `did not redraw ${e.name}: it changed during the visit`)
          for await (const ev of reviseEvents(e, d.sentence, isModelId(v.model) ? v.model : DEFAULT_MODEL, v.device ?? DEFAULT_DEVICE, stop.signal, r.group)) {
            if (ev.type === 'version') Object.assign(d.change, { text: d.change.text.replace('redrawing', 'redrew'), undo: { key: d.key, createdAt: ev.version.createdAt } }), cost += ev.version.costUsd ?? 0
            if (ev.type === 'error') d.change.text = `could not redraw ${e.name}: ${ev.message}`
          }
        }))
        Object.assign(r.visit, { ms: Math.round(performance.now() - t0), costUsd: cost })
        cache.save()
        log(`visited ${root.slice(0, 40)}: ${r.visit.changes.length} changes, ${r.visit.refused.length} refused, ${(r.visit.ms / 1000).toFixed(1)} s, $${cost.toFixed(4)}`)
      })
      .catch((err) => {
        log(`visit failed: ${message(err)}`)
        if (cache.get(root) && !cache.removedSince(root, since)) cache.noteVisit(app, { at: new Date().toISOString(), ...(ask && { ask: ask.text }), ms: Math.round(performance.now() - t0), costUsd: null, screens: 0, changes: [], refused: [], error: message(err), seen: false })
      })
      .finally(() => {
        if (visits.get(root) === p) visits.delete(root)
        if (stops.get(root) === stop) stops.delete(root)
        if (again.delete(root)) visit(app)
      })
    visits.set(root, p)
    return null
  }

  const filed = (app: string, ms: number) => Promise.race([filings.get(normalizePrompt(app)), Bun.sleep(ms)])

  /** One mockup as every reply that carries it sends it: screens, components, boxes, and whether filing or a visit runs. */
  const mapOf = (app: string) => ({ ...cache.map(app), past: cache.past(app), filing: !!filingCount.get(normalizePrompt(app)), visiting: visits.has(normalizePrompt(app)) })

  /** A deleted mockup's filing is not waited for (its result is dropped anyway), and its visit's redraws stop. */
  const forget = (app: string) => {
    const root = normalizePrompt(app)
    filings.delete(root)
    visits.delete(root)
    again.delete(root)
    stops.get(root)?.abort()
  }

  const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

  /** A new screen: from the cache when it is there (with its open A OR B, if any), else two designs at once. */
  async function* screenEvents(app: string, asked: string | null, model: ModelId, device: Device, click: { from: string; label: string } | null, signal: AbortSignal): AsyncGenerator<ScreenEvent> {
    let action = canonicalAction(asked)
    const hit = cache.find(app, action)
    const key = hit?.key ?? screenKey(app, action)
    if (hit) {
      yield { type: 'meta', key, cached: true, variants: 0 }
      yield { type: 'done', entry: hit }
      return
    }
    const root = screenKey(app, null)
    if (action != null && !cache.get(root)) {
      yield { type: 'error', message: 'this mockup has no first screen: it was deleted, or never made' }
      return
    }
    if (click && !cache.get(click.from)?.versions.length) {
      yield { type: 'error', message: 'the screen clicked in is gone' }
      return
    }
    // A design that finishes after its screen, the screen clicked in or its mockup was deleted is not kept.
    const since = cache.now()
    const gone = () => cache.removedSince(key, since) || cache.removedSince(root, since) || (!!click && cache.removedSince(click.from, since))
    // A screen opened by name alone is made from the planned screen's prompt, else from the words clicked.
    const ref = action && screenRef(action)
    if (ref && !ref.prompt) {
      const planned = plannedScreens(cache.map(app).entries).find((p) => p.name === ref.name)
      action = `@${ref.name}: ${planned?.action ?? promptFromLabel(ref.name, click?.label ?? '')}`
    }
    const prompt = ref ? screenRef(action!)!.prompt : null
    yield { type: 'meta', key, cached: false, variants: PROPOSALS }
    // The paper should hold what the last decision filed: wait for it, a little.
    await filed(app, fileWaitMs)
    if (signal.aborted) return
    const from = click && cache.get(click.from)
    const target = { id: ref ? ref.name : HOME_NAME, line: prompt ?? HOME_LINE }
    const paper = cache.paper(app, device)
    // One random side asks for a clearly different design, so the side says nothing about which is which.
    const different = Math.min(PROPOSALS - 1, Math.floor(random() * PROPOSALS))
    // A starter's recorded screen replays its first two designs, A and B; any other is drawn live.
    const recorded = Array.from({ length: PROPOSALS }, (_, slot) => recordedScreen(app, action, slot))
    if (recorded.some((r) => !r)) goLive(app)
    const streams = Array.from({ length: PROPOSALS }, (_, slot) => tagged(slot, generateScreen({
      user: drawRequest(paper, target, from ? { ...shown(from), label: click!.label } : null, slot === different),
      model, device, signal, ...io, recorded: free(recorded[slot] ?? null),
    })))
    const parent = click && { key: click.from, label: click.label || prompt || 'home' }
    const failed: string[] = []
    for await (const t of merge(streams)) {
      if ('error' in t) {
        if (signal.aborted) continue // the browser left; nothing to report
        log(`screen failed (${model}): ${message(t.error)}`)
        failed.push(message(t.error))
        yield { type: 'failed', variant: t.slot, message: message(t.error) }
      } else if (t.ev.type === 'chunk') yield { type: 'chunk', variant: t.slot, text: t.ev.text }
      else {
        // A finished side is paid for: keep it even if the browser left or picked the other side,
        // unless the screen was deleted or picked meanwhile.
        if (gone()) continue
        if (!cache.propose(app, action, t.slot, t.ev.version, parent)) continue
        yield { type: 'version', variant: t.slot, version: t.ev.version }
      }
    }
    if (signal.aborted) return
    const entry = cache.get(key)
    if (gone()) yield { type: 'error', message: 'this screen was deleted while it was being made' }
    else if (!entry) yield { type: 'error', message: [...new Set(failed)].join('; ') || 'no screen was made' }
    else yield { type: 'done', entry }
  }

  /** A new version: an Edit with `change` (a screen's is filed), else a Regenerate. `group`: a fixer's redraw, in its visit's change. */
  async function* reviseEvents(entry: CacheEntry, change: string | null, model: ModelId, device: Device, signal: AbortSignal, group?: number): AsyncGenerator<ScreenEvent> {
    const fixer = group != null
    const { key, app } = entry
    yield { type: 'meta', key, cached: false, variants: 1 }
    await filed(app, fileWaitMs)
    if (signal.aborted) return
    device = entry.versions.at(-1)!.device ?? device
    const paper = cache.paper(app, device), parent = entry.parent && cache.get(entry.parent.key)
    const user = change ? editRequest(paper, shown(entry), change, isComponent(entry))
      : drawRequest(paper, shown(entry), parent?.versions.length ? { ...shown(parent), label: entry.parent!.label } : null)
    const recorded = fixer ? null : recordedRegenerate(entry, change)
    if (!recorded) goLive(app)
    try {
      for await (const ev of generateScreen({ user, model, device, signal, ...io, recorded: free(recorded) })) {
        if (ev.type === 'chunk') { yield { type: 'chunk', variant: 0, text: ev.text }; continue }
        const version: Version = { ...ev.version, ...(change && { feedback: change }), ...(fixer && { by: 'fixer' as const }) }
        const stored = cache.group(() => cache.addVersion(key, version), group)
        // A component the user changed is the user's now; a fixer's redraw keeps its mark.
        if (isComponent(entry) && !fixer) Object.assign(entry, { by: 'user', at: version.createdAt, seen: true })
        if (signal.aborted) return
        if (!stored) { yield { type: 'error', message: 'this screen was deleted while it was being changed' }; return }
        yield { type: 'version', variant: 0, version }
        yield { type: 'done', entry: stored, filing: !!change && !fixer && file(key, { change }) }
      }
    } catch (err) {
      if (signal.aborted) return
      log(`revise failed (${model}): ${message(err)}`)
      yield { type: 'error', message: message(err) }
    }
  }

  /** Settles when the mockup's filing and visit have. */
  const idle = (app: string) => Promise.all([filings.get(normalizePrompt(app)), visits.get(normalizePrompt(app))])

  /** Whether any mockup's filing or visit runs (a desk does not close then). */
  const busy = () => filings.size > 0 || visits.size > 0 || [...filingCount.values()].some((n) => n > 0)

  /**
   * Whether a request to `path` with JSON body `b` would be answered by a recording, with no model call:
   * a recorded screen's A OR B, a Regenerate of one, a pick whose filing is replayed or that files nothing.
   */
  function replayed(path: string, b: any): boolean {
    if (path === '/api/screen') {
      const app = typeof b?.app === 'string' ? b.app.trim() : ''
      const action = canonicalAction(typeof b?.action === 'string' && b.action.trim() ? b.action.trim() : null)
      return !!app && Array.from({ length: PROPOSALS }, (_, slot) => recordedScreen(app, action, slot)).every(Boolean)
    }
    const entry = cache.get(String(b?.key ?? ''))
    if (!entry) return false
    if (path === '/api/revise') {
      const change = typeof b?.change === 'string' && b.change.trim() ? b.change.trim() : null
      return !!entry.versions.length && !!recordedRegenerate(entry, change)
    }
    if (path === '/api/pick') return !!entry.proposals && pickFiling(entry.key, Number(b?.index)) !== 'live'
    return false
  }

  return { file, visit, mapOf, forget, idle, busy, screenEvents, reviseEvents, replayed }
}
