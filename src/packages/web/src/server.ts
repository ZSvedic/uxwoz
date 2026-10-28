// The UX Woz web server: serves the app, streams screens from the models, keeps the screen cache.
// API keys stay here; the browser only ever sees generated HTML.

import { join, resolve } from 'node:path'
import {
  DEFAULT_MODEL, MODELS, ScreenCache, canonicalAction, generateScreen, isModelId, screenKey, warmUp,
  type CacheEntry, type Fetch, type Link, type ModelId,
} from '@uxwoz/core'
import index from './index.html'

const THEMES_DIR = resolve(import.meta.dir, '../themes')
/** Theme ids and labels; the first is the default. `clean` is Pico alone, `mockup` is Pico plus mockup.css. */
export const THEMES = { mockup: 'Mockup (sketch)', clean: 'Clean (Pico)' } as const
const THEME_FILES = new Set(['pico', 'mockup'])

/** One line of the /api/screen NDJSON stream. */
export type ScreenEvent =
  | { type: 'meta'; key: string; cached: boolean }
  | { type: 'chunk'; text: string }
  | { type: 'done'; entry: CacheEntry; index: number; link: Link | null }
  | { type: 'error'; message: string }

export interface ServerOptions {
  port?: number
  cache?: ScreenCache
  fetch?: Fetch
  env?: Record<string, string | undefined>
  log?: (msg: string) => void
}

const json = (data: unknown, status = 200) => Response.json(data, { status })

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
      try {
        for await (const ev of events) controller.enqueue(enc.encode(JSON.stringify(ev) + '\n'))
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}

export function createServer(opts: ServerOptions = {}) {
  const cache = opts.cache ?? new ScreenCache()
  const log = opts.log ?? ((m: string) => console.warn(m))

  /** A click from screen `from`, on a control labelled `label`. Absent for the first screen, Back, Home and Regenerate. */
  interface Click { from: string; label: string }

  async function* screenEvents(app: string, action: string | null, model: ModelId, regenerate: boolean, click: Click | null, signal: AbortSignal): AsyncGenerator<ScreenEvent> {
    action = canonicalAction(app, action)
    const key = screenKey(app, action)
    const linkFrom = () => (click ? cache.link(click.from, key, click.label || action || 'home') ?? null : null)
    const hit = cache.get(key)
    if (hit && !regenerate) {
      yield { type: 'meta', key, cached: true }
      yield { type: 'done', entry: hit, index: hit.chosen, link: linkFrom() }
      return
    }
    yield { type: 'meta', key, cached: false }
    try {
      for await (const ev of generateScreen({ app, action, existing: cache.existingScreens(app).filter((a) => a !== action), model, signal, fetch: opts.fetch, env: opts.env, log })) {
        if (ev.type === 'chunk') yield ev
        else {
          const added = cache.add(app, action, ev.candidate)
          yield { type: 'done', ...added, link: linkFrom() }
        }
      }
    } catch (err) {
      if (signal.aborted) return // the browser left; nothing to report, nothing cached
      const message = err instanceof Error ? err.message : String(err)
      log(`screen failed (${model}): ${message}`)
      yield { type: 'error', message }
    }
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
      }),
      '/api/screen': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const app = typeof b?.app === 'string' ? b.app.trim() : ''
          const action = typeof b?.action === 'string' && b.action.trim() ? b.action.trim() : null
          const model = b?.model ?? DEFAULT_MODEL
          if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
          if (action && action.length > 500) return json({ error: 'action must be at most 500 characters' }, 400)
          if (!isModelId(model)) return json({ error: `unknown model ${model}` }, 400)
          const click = typeof b?.from === 'string' && b.from ? { from: b.from.slice(0, 3000), label: String(b?.label ?? '').slice(0, 200) } : null
          return ndjson(screenEvents(app, action, model, b?.regenerate === true, click, req.signal))
        },
      },
      '/api/map': (req) => {
        const app = new URL(req.url).searchParams.get('app')?.trim() ?? ''
        if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
        return json(cache.map(app))
      },
      '/api/choose': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const entry = cache.choose(String(b?.key ?? ''), Number(b?.index))
          return entry ? json({ entry }) : json({ error: 'no such screen or version' }, 404)
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
