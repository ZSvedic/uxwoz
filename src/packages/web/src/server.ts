// The UX Woz web server: serves the app, streams screens from the models, keeps the screen cache.
// API keys stay here; the browser only ever sees generated HTML.

import { join, resolve } from 'node:path'
import {
  BOX_TITLES, DEFAULT_DEVICE, DEFAULT_MODEL, DEVICES, HOME_LINE, HOME_NAME, MODELS, PROPOSALS, ScreenCache, canonicalAction, drawRequest, editRequest,
  fileDecision, generateScreen, isComponent, isDevice, isModelId, normalizePrompt, visitPaper, plannedScreens, promptFromLabel, screenKey, screenRef,
  warmUp, type BoxName, type CacheEntry, type Device, type GenerateEvent, type Io, type ModelId, type Version, type VisitOptions,
} from '@uxwoz/core'
import index from './index.html'

const THEMES_DIR = resolve(import.meta.dir, '../themes')
/** Theme ids and labels; the first is the default. `clean` is Pico alone, `mockup` is Pico plus mockup.css. */
const THEMES = { mockup: 'Mockup (sketch)', clean: 'Clean (Pico)' } as const
const THEME_FILES = new Set(['pico', 'mockup'])
/** The fixer visits a mockup after every this many picks. */
const VISIT_EVERY = 5

/** One line of a /api/screen or /api/revise NDJSON stream (spec/code-contract.md). `meta.variants`: 2, 1 for a revise, 0 for a cache hit. */
export type ScreenEvent =
  | { type: 'meta'; key: string; cached: boolean; variants: number }
  | { type: 'chunk'; variant: number; text: string }
  | { type: 'version'; variant: number; version: Version }
  | { type: 'failed'; variant: number; message: string }
  | { type: 'done'; entry: CacheEntry; filing?: boolean }
  | { type: 'error'; message: string }

interface ServerOptions extends Io {
  port?: number
  cache?: ScreenCache
  /** Picks the side that is asked for a clearly different design; Math.random by default. */
  random?: () => number
  /** How long a new screen or a change waits for a running filing before it goes on without it. */
  fileWaitMs?: number
}

const shown = (e: CacheEntry) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: e.versions.at(-1)?.html ?? '' })

const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (error: string, status = 400) => json({ error }, status)

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

/** Every POST costs money or changes the cache, so only this app's page may send it: JSON only (no preflight is answered), no cross-site Origin. */
function refuseForeign(req: Request): Response | null {
  if (!req.headers.get('content-type')?.startsWith('application/json')) return fail('send application/json', 415)
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return fail('cross-origin request refused', 403)
  if (req.headers.get('sec-fetch-site') === 'cross-site') return fail('cross-site request refused', 403)
  return null
}

/** A POST route: refuse a foreign request, then read its JSON body (null when it has none). */
const api = (run: (b: any, req: Request) => Response | Promise<Response>) => async (req: Request) => refuseForeign(req) ?? run(await req.json().catch(() => null), req)
const appOf = (b: any): string => (typeof b?.app === 'string' ? b.app.trim() : '')
const badApp = (app: string) => (!app || app.length > 2000 ? fail('app must be 1-2000 characters') : null)

function ndjson(events: AsyncIterable<ScreenEvent>): Response {
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

export function createServer(opts: ServerOptions = {}) {
  const cache = opts.cache ?? new ScreenCache()
  const log = opts.log ?? ((m: string) => console.warn(m))
  const random = opts.random ?? Math.random
  const fileWaitMs = opts.fileWaitMs ?? 5000
  const io = { fetch: opts.fetch, env: opts.env }

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

  function file(key: string, decision: { other: string } | { change: string }): boolean {
    const e = cache.get(key)
    if (!e || isComponent(e)) return false
    const root = normalizePrompt(e.app), t0 = performance.now(), since = cache.now()
    count(root, 1)
    chain(root, () => fileDecision({ cache, key, decision, ...io, log }))
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
  const mapOf = (app: string) => ({ ...cache.map(app), undos: cache.undos(app), filing: !!filingCount.get(normalizePrompt(app)), visiting: visits.has(normalizePrompt(app)) })

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
    const streams = Array.from({ length: PROPOSALS }, (_, slot) => tagged(slot, generateScreen({
      user: drawRequest(paper, target, from ? { ...shown(from), label: click!.label } : null, slot === different),
      model, device, signal, ...io,
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
    try {
      for await (const ev of generateScreen({ user, model, device, signal, ...io })) {
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

  const pickers = (b: { model?: unknown; device?: unknown } | null) => {
    const model = b?.model ?? DEFAULT_MODEL, device = b?.device ?? DEFAULT_DEVICE
    if (!isModelId(model)) return fail(`unknown model ${model}`)
    if (!isDevice(device)) return fail(`unknown device ${device}`)
    return { model, device }
  }

  return Bun.serve({
    port: opts.port ?? Number(process.env.PORT ?? 3000),
    // Only this machine: the API spends the owner's model credits.
    hostname: process.env.UXWOZ_HOST ?? '127.0.0.1',
    // Bun closes connections idle for 10 s by default; a screen may take up to 20 s.
    idleTimeout: 30,
    development: process.env.NODE_ENV !== 'production',
    routes: {
      '/': index,
      '/themes/:name': (req) => {
        const name = req.params.name.replace(/\.css$/, '')
        if (!THEME_FILES.has(name)) return new Response('Not found', { status: 404 })
        return new Response(Bun.file(join(THEMES_DIR, `${name}.css`)), { headers: { 'Content-Type': 'text/css' } })
      },
      '/api/config': () => json({
        defaultModel: DEFAULT_MODEL,
        models: Object.values(MODELS).filter((m) => !m.background).map((m) => ({ id: m.id, label: m.label, costEstimated: m.costEstimated })),
        themes: Object.entries(THEMES).map(([id, label]) => ({ id, label })),
        defaultTheme: 'mockup',
        devices: Object.entries(DEVICES).map(([id, d]) => ({ id, label: d.label, width: d.width })),
        defaultDevice: DEFAULT_DEVICE,
        ...(cache.warning && { warning: cache.warning }),
      }),
      '/api/screen': {
        POST: api(async (b, req) => {
          const app = appOf(b)
          const action = typeof b?.action === 'string' && b.action.trim() ? b.action.trim() : null
          if (badApp(app)) return badApp(app)!
          if (action && (action.length > 500 || (canonicalAction(action) && !screenRef(action)))) return fail('action must be @name or @name: its one line, at most 500 characters')
          const p = pickers(b)
          if (p instanceof Response) return p
          const click = typeof b?.from === 'string' && b.from ? { from: b.from.slice(0, 3000), label: String(b?.label ?? '').slice(0, 200) } : null
          return ndjson(screenEvents(app, action, p.model, p.device, click, req.signal))
        }),
      },
      '/api/pick': {
        POST: api(async (b) => {
          const key = String(b?.key ?? ''), index = Number(b?.index)
          const other = cache.get(key)?.proposals?.find((p, i) => p && i !== index)?.html
          const entry = cache.pick(key, index)
          if (!entry) return fail('no such screen, or no such design to pick', 404)
          // Filing reads the pick in the background, and every 5th pick the fixer visits after it;
          // the page learns of both from /api/map?wait=1.
          const filing = file(key, { other: other ?? '(none: it failed)' })
          return json({ entry, filing, visiting: cache.boxesOf(entry.app).picks! % VISIT_EVERY === 0 && !visit(entry.app) })
        }),
      },
      '/api/revise': {
        POST: api(async (b, req) => {
          const change = typeof b?.change === 'string' ? b.change.trim() : null
          if (b?.change != null && (!change || change.length > 1000)) return fail('change must be 1-1000 characters')
          const p = pickers(b)
          if (p instanceof Response) return p
          const entry = cache.get(String(b?.key ?? ''))
          if (!entry) return fail('no such screen', 404)
          if (!entry.versions.length) return fail('pick one of the two designs first', 409)
          if (isComponent(entry) && !change) return fail('a component changes by Edit')
          return ndjson(reviseEvents(entry, change, p.model, p.device, req.signal))
        }),
      },
      '/api/undo': {
        POST: api(async (b) => {
          const entry = cache.undo(String(b?.key ?? ''))
          return entry ? json({ entry }) : fail('no such screen, or nothing to undo', 404)
        }),
      },
      '/api/map': async (req) => {
        const url = new URL(req.url), app = url.searchParams.get('app')?.trim() ?? ''
        if (badApp(app)) return badApp(app)!
        const root = normalizePrompt(app)
        if (url.searchParams.get('wait') === '1') await Promise.race([Promise.all([filings.get(root), visits.get(root)]), Bun.sleep(60_000)])
        return json(mapOf(app))
      },
      '/api/box': {
        POST: api(async (b) => {
          const app = appOf(b)
          if (!cache.get(screenKey(app, null))) return fail('no such mockup', 404)
          const box = b?.box as BoxName | 'notes', op = b?.op, any = Object.hasOwn(BOX_TITLES, String(box))
          let why: string | null = null
          if (op === 'seen' && any) cache.markSeen(app, box, Array.isArray(b?.ids) ? b.ids.map(String) : undefined)
          else if (op === 'undo') why = cache.undoChange(app, String(b?.at ?? ''), Number(b?.i))
          // Undo of the fixer's notes undoes their newest visit, and sends the map with what it skipped.
          else if (op === 'undo-box' && box === 'notes') return json({ ...mapOf(app), error: cache.undoVisit(app) ?? undefined })
          else if (op === 'undo-box' && any) why = cache.undoBox(app, box as BoxName)
          else if (op === 'visit' || (op === 'edit' && any)) {
            const text = typeof b?.text === 'string' ? b.text.trim() : ''
            if (op === 'edit' && (!text || text.length > 1000)) return fail('text must be 1-1000 characters')
            const busy = visit(app, op === 'edit' ? { box, text } : undefined)
            if (busy) return fail(busy, 409)
          } else if ((box === 'rules' || box === 'data') && ['add', 'set', 'delete'].includes(op)) {
            // A new entry's ID comes from its words: the rule's sentence, or the table's name.
            const id = op === 'add' ? cache.freeId(app, box, String(b?.text ?? b?.id ?? '')) : String(b?.id ?? '')
            why = cache.setBox(app, op, box, { id, text: b?.text, columns: b?.columns, rows: b?.rows }, 'user')
          } else return fail('unknown box or op')
          return why ? fail(why) : json(mapOf(app))
        }),
      },
      '/api/apps': () => json({ apps: cache.apps() }),
      // Returns the whole mockup: a delete can give other screens new parents.
      '/api/delete': {
        POST: api(async (b) => {
          const key = String(b?.key ?? ''), app = cache.get(key)?.app
          const removed = cache.delete(key)
          if (app && key === normalizePrompt(app)) forget(app)
          return removed && app ? json({ removed, ...mapOf(app) }) : fail('no such screen', 404)
        }),
      },
      '/api/delete-app': {
        POST: api(async (b) => {
          const app = appOf(b)
          if (badApp(app)) return badApp(app)!
          forget(app)
          return json({ removed: cache.deleteApp(app) })
        }),
      },
      '/api/warmup': {
        POST: api(async (b) => {
          const p = pickers(b)
          if (p instanceof Response) return p
          const { model } = p
          warmUp(model, io).catch((e) => log(`warm-up failed (${model}): ${e.message}`))
          return new Response(null, { status: 204 })
        }),
      },
    },
    fetch: () => new Response('Not found', { status: 404 }),
  })
}

if (import.meta.main) {
  const file = process.env.UXWOZ_CACHE_FILE ?? resolve(import.meta.dir, '../../../../temp/screen-cache.json')
  const cache = new ScreenCache(file)
  const server = createServer({ cache })
  console.log(`UX Woz on ${server.url} (cache: ${file}, ${cache.size} screens)`)
}
