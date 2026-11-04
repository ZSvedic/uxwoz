// The UX Woz web server: serves the app, streams screens from the models, keeps the screen cache.
// API keys stay here; the browser only ever sees generated HTML.

import { join, resolve } from 'node:path'
import {
  DEFAULT_DEVICE, DEFAULT_MODEL, DEVICES, MODELS, PROPOSALS, ScreenCache, canonicalAction, generateScreen, isDevice, isModelId,
  plannedScreens, promptFromLabel, screenKey, screenRef, warmUp, type CacheEntry, type Device, type Fetch, type GenerateEvent, type ModelId, type Version,
} from '@uxwoz/core'
import index from './index.html'

const THEMES_DIR = resolve(import.meta.dir, '../themes')
/** Theme ids and labels; the first is the default. `clean` is Pico alone, `mockup` is Pico plus mockup.css. */
export const THEMES = { mockup: 'Mockup (sketch)', clean: 'Clean (Pico)' } as const
const THEME_FILES = new Set(['pico', 'mockup'])

/**
 * One line of a /api/screen or /api/revise NDJSON stream. `meta.variants` is how many designs stream
 * now (2 for a new screen's A OR B, 1 for a revise, 0 for a cache hit); each chunk names its side.
 * `version` says a side finished and is stored, `failed` that it did not. `done` ends a stream that
 * stored something (or a cache hit), `error` one that did not.
 */
export type ScreenEvent =
  | { type: 'meta'; key: string; cached: boolean; variants: number }
  | { type: 'chunk'; variant: number; text: string }
  | { type: 'version'; variant: number; version: Version }
  | { type: 'failed'; variant: number; message: string }
  | { type: 'done'; entry: CacheEntry }
  | { type: 'error'; message: string }

export interface ServerOptions {
  port?: number
  cache?: ScreenCache
  fetch?: Fetch
  env?: Record<string, string | undefined>
  log?: (msg: string) => void
  /** Picks the side that is asked for a clearly different design; Math.random by default. */
  random?: () => number
}

const json = (data: unknown, status = 200) => Response.json(data, { status })

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

/**
 * Every POST costs money or changes the shared cache, so it must come from this app's own page:
 * JSON only (a cross-site form or no-cors fetch cannot send it without a preflight we never answer),
 * and no cross-site Origin.
 */
function refuseForeign(req: Request): Response | null {
  if (!req.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'send application/json' }, 415)
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return json({ error: 'cross-origin request refused' }, 403)
  if (req.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'cross-site request refused' }, 403)
  return null
}

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

  /** A click in screen `from`, on a control labelled `label`. Absent for the first screen. */
  interface Click { from: string; label: string }
  interface ScreenRequest { app: string; action: string | null; model: ModelId; device: Device; click: Click | null }

  const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

  /** A new screen: from the cache when it is there (with its open A OR B, if any), else two designs at once. */
  async function* screenEvents(r: ScreenRequest, signal: AbortSignal): AsyncGenerator<ScreenEvent> {
    const { app, model, device, click } = r
    let action = canonicalAction(app, r.action)
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
    // A design that finishes after its screen, the screen clicked in, or its mockup was deleted
    // (Delete, Start over, dropping the A OR B) is not kept: it would bring them back.
    const since = cache.now()
    const gone = () => cache.removedSince(key, since) || cache.removedSince(root, since) || (!!click && cache.removedSince(click.from, since))
    // A screen opened by name alone is made from the planned screen's prompt, else from the words clicked.
    const ref = action && screenRef(action)
    if (ref && !ref.prompt) {
      const planned = plannedScreens(cache.map(app).entries).find((p) => p.name === ref.name)
      action = `@${ref.name}: ${planned?.action ?? promptFromLabel(ref.name, click?.label ?? '')}`
    }
    const prompt = ref ? screenRef(action!)!.prompt : action
    yield { type: 'meta', key, cached: false, variants: PROPOSALS }
    const existing = cache.existingScreens(app, ref ? ref.name : undefined)
    // One random side asks for a clearly different design, so the side says nothing about which is which.
    const different = Math.min(PROPOSALS - 1, Math.floor(random() * PROPOSALS))
    const streams = Array.from({ length: PROPOSALS }, (_, slot) => tagged(slot, generateScreen({
      app, action: prompt, existing, model, device, alternative: slot === different,
      signal, fetch: opts.fetch, env: opts.env, log,
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
        // A side that finished is paid for: keep it, even if the browser left (or picked the other
        // side, which aborts this one). Not when the screen was deleted meanwhile, or the other side
        // was already picked (by another browser).
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

  /** One new version of a picked screen: an Edit with `change`, else a Regenerate from its prompt. */
  async function* reviseEvents(entry: CacheEntry, change: string | null, model: ModelId, device: Device, signal: AbortSignal): AsyncGenerator<ScreenEvent> {
    const { key, app, action } = entry
    const now = entry.versions.at(-1)!
    yield { type: 'meta', key, cached: false, variants: 1 }
    try {
      for await (const ev of generateScreen({
        // A revise keeps the device the screen was made for.
        app, action, existing: cache.existingScreens(app, entry.name), model, device: now.device ?? device,
        edit: change ? { html: now.html, change } : undefined,
        signal, fetch: opts.fetch, env: opts.env, log,
      })) {
        if (ev.type === 'chunk') { yield { type: 'chunk', variant: 0, text: ev.text }; continue }
        const version = { ...ev.version, ...(change && { feedback: change }) }
        const stored = cache.addVersion(key, version)
        if (signal.aborted) return
        if (!stored) { yield { type: 'error', message: 'this screen was deleted while it was being changed' }; return }
        yield { type: 'version', variant: 0, version }
        yield { type: 'done', entry: stored }
      }
    } catch (err) {
      if (signal.aborted) return
      log(`revise failed (${model}): ${message(err)}`)
      yield { type: 'error', message: message(err) }
    }
  }

  /** The model and device of a request body, or the error response for a bad one. */
  const pickers = (b: { model?: unknown; device?: unknown } | null) => {
    const model = b?.model ?? DEFAULT_MODEL, device = b?.device ?? DEFAULT_DEVICE
    if (!isModelId(model)) return json({ error: `unknown model ${model}` }, 400)
    if (!isDevice(device)) return json({ error: `unknown device ${device}` }, 400)
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
        models: Object.values(MODELS).map((m) => ({ id: m.id, label: m.label, costEstimated: m.costEstimated })),
        themes: Object.entries(THEMES).map(([id, label]) => ({ id, label })),
        defaultTheme: 'mockup',
        devices: Object.entries(DEVICES).map(([id, d]) => ({ id, label: d.label, width: d.width })),
        defaultDevice: DEFAULT_DEVICE,
      }),
      '/api/screen': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const app = typeof b?.app === 'string' ? b.app.trim() : ''
          const action = typeof b?.action === 'string' && b.action.trim() ? b.action.trim() : null
          if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
          if (action && action.length > 500) return json({ error: 'action must be at most 500 characters' }, 400)
          const p = pickers(b)
          if (p instanceof Response) return p
          const click = typeof b?.from === 'string' && b.from ? { from: b.from.slice(0, 3000), label: String(b?.label ?? '').slice(0, 200) } : null
          return ndjson(screenEvents({ app, action, ...p, click }, req.signal))
        },
      },
      // Keep one side of a screen's open A OR B; the other is gone.
      '/api/pick': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const entry = cache.pick(String(b?.key ?? ''), Number(b?.index))
          return entry ? json({ entry }) : json({ error: 'no such screen, or no such design to pick' }, 404)
        },
      },
      // One new version of a screen: an Edit with `change`, else a Regenerate.
      '/api/revise': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const change = typeof b?.change === 'string' ? b.change.trim() : null
          if (b?.change != null && (!change || change.length > 1000)) return json({ error: 'change must be 1-1000 characters' }, 400)
          const p = pickers(b)
          if (p instanceof Response) return p
          const entry = cache.get(String(b?.key ?? ''))
          if (!entry) return json({ error: 'no such screen' }, 404)
          if (!entry.versions.length) return json({ error: 'pick one of the two designs first' }, 409)
          return ndjson(reviseEvents(entry, change, p.model, p.device, req.signal))
        },
      },
      // Drop a screen's newest version, so the one before shows again.
      '/api/undo': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const entry = cache.undo(String(b?.key ?? ''))
          return entry ? json({ entry }) : json({ error: 'no such screen, or nothing to undo' }, 404)
        },
      },
      '/api/map': (req) => {
        const app = new URL(req.url).searchParams.get('app')?.trim() ?? ''
        if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
        return json(cache.map(app))
      },
      '/api/apps': () => json({ apps: cache.apps() }),
      // Delete a screen and the screens only it reaches; the first screen takes the mockup with it.
      // Returns the mockup as /api/map does: a delete can give other screens new parents.
      '/api/delete': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const key = String(b?.key ?? ''), app = cache.get(key)?.app
          const removed = cache.delete(key)
          return removed && app ? json({ removed, ...cache.map(app) }) : json({ error: 'no such screen' }, 404)
        },
      },
      // Delete a whole mockup, so its prompt starts over.
      '/api/delete-app': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const app = typeof b?.app === 'string' ? b.app.trim() : ''
          if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
          return json({ removed: cache.deleteApp(app) })
        },
      },
      '/api/warmup': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const model = b?.model ?? DEFAULT_MODEL
          if (!isModelId(model)) return json({ error: `unknown model ${model}` }, 400)
          warmUp(model, { fetch: opts.fetch, env: opts.env }).catch((e) => log(`warm-up failed (${model}): ${e.message}`))
          return new Response(null, { status: 204 })
        },
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
