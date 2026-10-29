// The UX Woz web server: serves the app, streams screens from the models, keeps the screen cache.
// API keys stay here; the browser only ever sees generated HTML.

import { join, resolve } from 'node:path'
import {
  DEFAULT_DEVICE, DEFAULT_MODEL, DEVICES, MODELS, ScreenCache, canonicalAction, generateScreen, isDevice, isModelId,
  screenKey, warmUp, type CacheEntry, type Candidate, type Device, type Fetch, type GenerateEvent, type Link, type ModelId,
} from '@uxwoz/core'
import index from './index.html'

const THEMES_DIR = resolve(import.meta.dir, '../themes')
/** Theme ids and labels; the first is the default. `clean` is Pico alone, `mockup` is Pico plus mockup.css. */
export const THEMES = { mockup: 'Mockup (sketch)', clean: 'Clean (Pico)' } as const
const THEME_FILES = new Set(['pico', 'mockup'])

/** How many variants one request makes: the first screen, a new screen, or a regenerate. */
export const VARIANTS = 2

/**
 * One line of the /api/screen NDJSON stream. `meta.variants` is how many variants stream now (0 for
 * a cache hit); each chunk names its variant. `done.variants` maps each variant to its candidate
 * index in the entry, or null if it failed (its message is in `failed`).
 */
export type ScreenEvent =
  | { type: 'meta'; key: string; cached: boolean; variants: number }
  | { type: 'chunk'; variant: number; text: string }
  | { type: 'done'; entry: CacheEntry; variants: (number | null)[]; failed: string[]; link: Link | null }
  | { type: 'error'; message: string }

export interface ServerOptions {
  port?: number
  cache?: ScreenCache
  fetch?: Fetch
  env?: Record<string, string | undefined>
  log?: (msg: string) => void
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

/** One variant's events, tagged with its slot; a failure becomes an event, so the other variant goes on. */
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
      // cache the variants that finished.
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

  /** A click from screen `from`, on a control labelled `label`. Absent for the first screen and Regenerate. */
  interface Click { from: string; label: string }
  interface ScreenRequest { app: string; action: string | null; model: ModelId; device: Device; regenerate: boolean; feedback: string; click: Click | null }

  async function* screenEvents(r: ScreenRequest, signal: AbortSignal): AsyncGenerator<ScreenEvent> {
    const { app, model, device, feedback, click } = r
    const action = canonicalAction(app, r.action)
    const key = screenKey(app, action)
    const linkFrom = () => (click ? cache.link(click.from, key, click.label || action || 'home') ?? null : null)
    const hit = cache.get(key)
    if (hit && !r.regenerate) {
      yield { type: 'meta', key, cached: true, variants: 0 }
      yield { type: 'done', entry: hit, variants: [], failed: [], link: linkFrom() }
      return
    }
    yield { type: 'meta', key, cached: false, variants: VARIANTS }
    const existing = cache.existingScreens(app).filter((a) => a !== action)
    const streams = Array.from({ length: VARIANTS }, (_, slot) => tagged(slot, generateScreen({
      app, action, existing, model, device, alternative: slot % 2 === 1, feedback: feedback || undefined,
      signal, fetch: opts.fetch, env: opts.env, log,
    })))
    const made: (Candidate | null)[] = Array(VARIANTS).fill(null)
    const failed: string[] = []
    for await (const t of merge(streams)) {
      if ('error' in t) {
        if (signal.aborted) continue // the browser left; nothing to report
        const message = t.error instanceof Error ? t.error.message : String(t.error)
        log(`screen failed (${model}): ${message}`)
        failed.push(message)
      } else if (t.ev.type === 'chunk') yield { type: 'chunk', variant: t.slot, text: t.ev.text }
      else made[t.slot] = t.ev.candidate
    }
    const ok = made.filter((c): c is Candidate => c != null)
    // A variant that finished is paid for: keep it, even if the browser left before the other one.
    if (signal.aborted) {
      if (ok.length) cache.add(app, action, ...ok)
      return
    }
    if (!ok.length) {
      yield { type: 'error', message: [...new Set(failed)].join('; ') || 'no screen was made' }
      return
    }
    // Both variants are stored together, in slot order, so the first stays first whichever finished first.
    const { entry, index } = cache.add(app, action, ...ok)
    let n = index
    yield { type: 'done', entry, variants: made.map((c) => (c ? n++ : null)), failed, link: linkFrom() }
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
          const model = b?.model ?? DEFAULT_MODEL
          const device = b?.device ?? DEFAULT_DEVICE
          const feedback = typeof b?.feedback === 'string' ? b.feedback.trim() : ''
          if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
          if (action && action.length > 500) return json({ error: 'action must be at most 500 characters' }, 400)
          if (feedback.length > 500) return json({ error: 'feedback must be at most 500 characters' }, 400)
          if (!isModelId(model)) return json({ error: `unknown model ${model}` }, 400)
          if (!isDevice(device)) return json({ error: `unknown device ${device}` }, 400)
          const click = typeof b?.from === 'string' && b.from ? { from: b.from.slice(0, 3000), label: String(b?.label ?? '').slice(0, 200) } : null
          return ndjson(screenEvents({ app, action, model, device, regenerate: b?.regenerate === true, feedback, click }, req.signal))
        },
      },
      '/api/map': (req) => {
        const app = new URL(req.url).searchParams.get('app')?.trim() ?? ''
        if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
        return json(cache.map(app))
      },
      '/api/apps': () => json({ apps: cache.apps() }),
      // A click to a screen already in the flow opens no new screen; this records it as a link.
      '/api/link': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const link = cache.link(String(b?.from ?? ''), String(b?.to ?? ''), String(b?.label ?? '').slice(0, 200))
          return link ? json({ link }) : json({ error: 'no such screens, or not in the same mockup' }, 404)
        },
      },
      '/api/choose': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const entry = cache.choose(String(b?.key ?? ''), Number(b?.index))
          return entry ? json({ entry }) : json({ error: 'no such screen or variant' }, 404)
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
