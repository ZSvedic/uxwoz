// The work behind a mock: the filing chain per mockup and the fixer's visits, settling, and the streaming of
// one design (a new screen, an Edit, Another, Draw again) as NDJSON. server.ts's routes call what `drawing` returns.
// In a starter's mockup a recording answers where a model would be called (spec/public.md, Recordings).

import {
  ALTERNATIVE_REQUEST, DEFAULT_DEVICE, DEFAULT_MODEL, HOME_LINE, HOME_NAME, canonicalAction, drawRequest, editRequest,
  fileDecision, generateScreen, isComponent, isDevice, isModelId, normalizePrompt, plannedScreens, promptFromLabel, recordedDesign,
  recordedFiling, recordedHtml, recordingFor, screenKey, screenRef, VISIT_EVERY, visitPaper,
  type CacheEntry, type Device, type Io, type ModelId, type Recorded, type Recording, type ScreenCache, type Version, type VisitOptions,
} from '@uxwoz/core'

/** One line of a /api/screen or /api/revise NDJSON stream (spec/code-contract.md): one design. */
export type ScreenEvent =
  | { type: 'meta'; key: string; cached: boolean }
  | { type: 'chunk'; text: string }
  | { type: 'version'; version: Version }
  | { type: 'done'; entry: CacheEntry; filing?: boolean }
  | { type: 'error'; message: string }

/** What a revise asks for: an Edit (`change`), Draw again (`prompt`), or Another (neither). */
export type Revise = { change: string } | { prompt: string } | null

const shown = (e: CacheEntry) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: e.versions.at(-1)?.html ?? '' })
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function ndjson(events: AsyncIterable<ScreenEvent>): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      // Once the browser has gone, writing throws; keep draining, so the generator still stores a design that finished.
      let open = true
      const send = (ev: ScreenEvent) => {
        if (!open) return
        try { controller.enqueue(enc.encode(JSON.stringify(ev) + '\n')) } catch { open = false }
      }
      try {
        for await (const ev of events) send(ev)
      } catch (err) {
        console.warn(`screen stream failed: ${err}`)
        send({ type: 'error', message: message(err) })
      } finally {
        if (open) try { controller.close() } catch { /* already closed */ }
      }
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}

/** A recorded call to replay: it cost nothing this time. */
const free = (r: Recorded | null): Recorded | undefined => (r ? { ...r, final: { ...r.final, costUsd: 0 } } : undefined)

/** How a settle is filed: a replay (Home's first filing), `nothing` (another recorded screen), or `live`. */
type Plan = { replay: Recorded } | 'nothing' | 'live'

/** The chains of every mockup, and the screens drawn with them. `may`: whether a live filing or visit may start now. */
export function drawing(cache: ScreenCache, io: Omit<Io, 'log'>, log: (m: string) => void, fileWaitMs: number, may: () => boolean = () => true) {
  /** Mockups that have had a live call since the server started. */
  const lived = new Set<string>()
  /** The screens being drawn now (a new screen, a revise), by key. */
  const drawingNow = new Set<string>()

  /** A mockup's size: its first screen's. */
  const deviceOf = (app: string): Device | undefined => { const e = cache.get(normalizePrompt(app)); return (e?.versions.at(-1) ?? e?.versions[0])?.device }
  /** The mockup's recording, if its prompt is a starter's and its size has one. */
  const recOf = (app: string, device = deviceOf(app)): Recording | null => recordingFor(app, device)
  /** Whether the mockup has had a live call: here, or (after a restart) a design that cost something, or a visit. */
  function live(app: string): boolean {
    if (lived.has(normalizePrompt(app))) return true
    const { entries, boxes } = cache.map(app)
    return !!boxes.visits?.length || entries.some((e) => !isComponent(e) && [...e.versions, ...e.redo ?? []].some((v) => v.costUsd !== 0))
  }
  const goLive = (app: string) => lived.add(normalizePrompt(app))

  /** The recorded first design of a new screen, or null. */
  function recordedFirst(app: string, action: string | null, device: Device): Recorded | null {
    const rec = recOf(app, device), ref = action && screenRef(action)
    if (!rec || (action && !ref)) return null
    return recordedDesign(rec, ref ? ref.name : null, 0)
  }
  /** The recorded Another of `entry`: a recorded screen with one design in its History, from its first words. */
  function recordedAnother(entry: CacheEntry): Recorded | null {
    const rec = recOf(entry.app), all = [...entry.versions, ...entry.redo ?? []], v = all[0]
    if (!rec || isComponent(entry) || all.length !== 1 || !v || v.feedback || v.by || v.prompt) return null
    return recordedDesign(rec, entry.name ?? null, 1)
  }
  /** How settling `entry` (`first` time or `again`) is filed. */
  function plan(entry: CacheEntry, how: 'first' | 'again'): Plan {
    const rec = recOf(entry.app), v = entry.versions.at(-1)
    if (!rec || !v || live(entry.app)) return 'live'
    const n = [0, 1].findIndex((i) => { const d = recordedDesign(rec, entry.name ?? null, i); return !!d && recordedHtml(d) === v.html })
    if (n < 0) return 'live'
    if ((entry.name ?? HOME_NAME) !== HOME_NAME) return 'nothing'
    const f = how === 'first' ? recordedFiling(rec, n) : null
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

  /** File the version showing in the mockup's chain: a settled screen's (`{}`) or an Edit's (`change`). `replay`: a recorded filing. Whether a filing started. */
  function file(key: string, decision: Record<string, never> | { change: string }, replay?: Recorded): boolean {
    const e = cache.get(key)
    if (!e || isComponent(e)) return false
    const root = normalizePrompt(e.app), t0 = performance.now(), since = cache.now()
    if (!replay) {
      if (!may()) return false
      goLive(e.app)
    }
    count(root, 1)
    chain(root, () => fileDecision({ cache, key, decision, ...io, log, recorded: free(replay ?? null) }))
      .then((run) => run && log(`filed ${run.screen} in ${(run.ms / 1000).toFixed(1)} s for $${run.costUsd?.toFixed(4)}: added ${run.added.join(', ') || 'nothing'}, changed ${run.changed.join(', ') || 'nothing'}, refused ${run.refused.length}`))
      .catch((err) => {
        log(`filing failed: ${message(err)}`)
        if (cache.get(root) && !cache.removedSince(root, since)) cache.noteFiling(key, { at: new Date().toISOString(), screen: e.name ?? HOME_NAME, ms: Math.round(performance.now() - t0), costUsd: null, added: [], changed: [], refused: [], error: message(err) })
      })
      .finally(() => count(root, -1))
    return true
  }

  /**
   * Settle a screen the user clicks on from: its filing starts (a recording's, or none, in a starter's mockup), and on
   * every 5th screen settled for the first time a visit after it, unless a recording answered. Null for an unknown screen.
   */
  function settle(key: string): { entry: CacheEntry; filing: boolean; visiting: boolean } | null {
    const entry = cache.get(key)
    if (!entry || isComponent(entry) || !entry.versions.length) return null
    const how = cache.settle(key)
    if (!how) return { entry, filing: false, visiting: false }
    const p = plan(entry, how)
    const filing = p === 'nothing' ? false : file(key, {}, p === 'live' ? undefined : p.replay)
    const every = how === 'first' && p === 'live' && cache.boxesOf(entry.app).settled! % VISIT_EVERY === 0
    return { entry, filing, visiting: every && !visit(entry.app) }
  }

  /** Per mockup: the visit running (with its redraws), how to stop its redraws, and whether another waits. */
  const visits = new Map<string, Promise<unknown>>(), stops = new Map<string, AbortController>(), again = new Set<string>()

  /**
   * A visit of the fixer in the mockup's chain (`ask`: an Edit of a box); its redraws are Edits that file
   * nothing. One asked for while one runs comes after it; an Edit is refused then. Why not, or null.
   */
  function visit(app: string, ask?: VisitOptions['ask']): string | null {
    const root = normalizePrompt(app)
    if (!cache.get(root)?.versions.length) return 'Wait for Home.'
    if (visits.has(root)) {
      if (ask) return 'The fixer is visiting now: try again when it is done.'
      again.add(root)
      return null
    }
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
          if (v.createdAt > r.visit.at || drawingNow.has(e.key)) return void (d.change.text = `did not redraw ${e.name}: it changed during the visit`)
          for await (const ev of reviseEvents(e, { change: d.sentence }, isModelId(v.model) ? v.model : DEFAULT_MODEL, stop.signal, r.group)) {
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

  /** Mark a key as being drawn while `events` run. */
  async function* drawingKey<T>(key: string, events: AsyncGenerator<T>): AsyncGenerator<T> {
    drawingNow.add(key)
    try { yield* events } finally { drawingNow.delete(key) }
  }

  /**
   * A new screen: from the cache when it is there, else one design. The click's screen (`from`) is settled first,
   * whether or not the screen it opens is drawn already.
   */
  async function* screenEvents(app: string, asked: string | null, model: ModelId, device: Device, click: { from: string; label: string } | null, signal: AbortSignal): AsyncGenerator<ScreenEvent> {
    let action = canonicalAction(asked)
    if (click && cache.get(click.from)?.versions.length) settle(click.from)
    const hit = cache.find(app, action)
    const key = hit?.key ?? screenKey(app, action)
    if (hit) {
      yield { type: 'meta', key, cached: true }
      yield { type: 'done', entry: hit }
      return
    }
    const root = screenKey(app, null)
    if (action != null && !cache.get(root)) return void (yield { type: 'error', message: 'this mockup has no first screen: it was deleted, or never made' })
    if (click && !cache.get(click.from)?.versions.length) return void (yield { type: 'error', message: 'the screen clicked in is gone' })
    // Every later screen takes the first screen's size.
    if (action != null) device = deviceOf(app) ?? device
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
    yield { type: 'meta', key, cached: false }
    // The paper should hold what the last settle filed: wait for it, a little.
    await filed(app, fileWaitMs)
    if (signal.aborted) return
    const from = click && cache.get(click.from)
    const target = { id: ref ? ref.name : HOME_NAME, line: prompt ?? HOME_LINE }
    const recorded = recordedFirst(app, action, device)
    if (!recorded) goLive(app)
    const parent = click && { key: click.from, label: click.label || prompt || 'home' }
    try {
      for await (const ev of generateScreen({ user: drawRequest(cache.paper(app, device), target, from ? { ...shown(from), label: click!.label } : null), model, device, signal, ...io, recorded: free(recorded) })) {
        if (ev.type === 'chunk') { yield { type: 'chunk', text: ev.text }; continue }
        // A finished design is paid for: keep it even if the browser left, unless its screen or mockup was deleted.
        if (gone()) return void (yield { type: 'error', message: 'this screen was deleted while it was being made' })
        const made = cache.find(app, action)
        const entry = made ? cache.addVersion(made.key, ev.version) : cache.addScreen(app, action, ev.version, parent)
        if (!entry) return void (yield { type: 'error', message: 'no screen was made' })
        yield { type: 'version', version: ev.version }
        yield { type: 'done', entry }
      }
    } catch (err) {
      if (signal.aborted) return
      log(`screen failed (${model}): ${message(err)}`)
      yield { type: 'error', message: message(err) }
    }
  }

  /**
   * A new version: an Edit (`change`; a screen's is filed), Draw again (`prompt`; Home's renames the mockup) or Another
   * (neither). `group`: a fixer's redraw, in its visit's change.
   */
  async function* reviseEvents(entry: CacheEntry, ask: Revise, model: ModelId, signal: AbortSignal, group?: number): AsyncGenerator<ScreenEvent> {
    const fixer = group != null
    const change = ask && 'change' in ask ? ask.change : null, words = ask && 'prompt' in ask ? ask.prompt : null
    const home = entry.key === normalizePrompt(entry.app)
    yield { type: 'meta', key: entry.key, cached: false }
    await filed(entry.app, fileWaitMs)
    if (signal.aborted) return
    const device = entry.versions.at(-1)?.device ?? deviceOf(entry.app) ?? DEFAULT_DEVICE
    const parent = entry.parent && cache.get(entry.parent.key)
    const from = parent?.versions.length ? { ...shown(parent), label: entry.parent!.label } : null
    const paper = cache.paper(entry.app, device)
    const user = change ? editRequest(paper, shown(entry), change, isComponent(entry))
      : words != null ? drawRequest(home ? { ...paper, app: words } : paper, { id: entry.name ?? HOME_NAME, line: home ? HOME_LINE : words }, from)
      : `${drawRequest(paper, shown(entry), from)}\n\n${ALTERNATIVE_REQUEST}`
    const recorded = fixer || ask ? null : recordedAnother(entry)
    if (!recorded) goLive(entry.app)
    try {
      for await (const ev of generateScreen({ user, model, device, signal, ...io, recorded: free(recorded) })) {
        if (ev.type === 'chunk') { yield { type: 'chunk', text: ev.text }; continue }
        const version: Version = { ...ev.version, ...(change && { feedback: change }), ...(words != null && { prompt: words }), ...(fixer && { by: 'fixer' as const }) }
        let key = entry.key
        if (words != null && cache.get(key)) {
          // Draw again: the new words are the screen's prompt; Home's are the mockup's name.
          try {
            if (home) { cache.rename(entry.app, words); key = normalizePrompt(words) } else entry.action = words
          } catch (err) { return void (yield { type: 'error', message: message(err) }) }
        }
        const stored = cache.group(() => cache.addVersion(key, version), group)
        // A component the user changed is the user's now; a fixer's redraw keeps its mark.
        if (isComponent(entry) && !fixer) Object.assign(entry, { by: 'user', at: version.createdAt, seen: true })
        if (signal.aborted) return
        if (!stored) return void (yield { type: 'error', message: 'this screen was deleted while it was being changed' })
        yield { type: 'version', version }
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
   * Whether a request to `path` with JSON body `b` would be answered by a recording, with no model call: a recorded
   * screen's first design, Another on it, a settle whose filing is replayed or that files nothing.
   */
  function replayed(path: string, b: any): boolean {
    if (path === '/api/screen') {
      const app = typeof b?.app === 'string' ? b.app.trim() : ''
      const action = canonicalAction(typeof b?.action === 'string' && b.action.trim() ? b.action.trim() : null)
      const device = action != null ? deviceOf(app) : isDevice(b?.device) ? b.device : DEFAULT_DEVICE
      return !!app && !!device && !!recordedFirst(app, action, device)
    }
    const entry = cache.get(String(b?.key ?? ''))
    if (!entry?.versions.length) return false
    if (path === '/api/revise') return b?.change == null && b?.prompt == null && !!recordedAnother(entry)
    if (path === '/api/settle') return !isComponent(entry) && plan(entry, entry.settled ? 'again' : 'first') !== 'live'
    return false
  }

  return {
    file, settle, visit, mapOf, forget, idle, busy, replayed, drawingNow: (key: string) => drawingNow.has(key),
    screenEvents: (...a: Parameters<typeof screenEvents>) => drawingKey(screenKey(a[0], canonicalAction(a[1])), screenEvents(...a)),
    reviseEvents: (...a: Parameters<typeof reviseEvents>) => drawingKey(a[0].key, reviseEvents(...a)),
  }
}

