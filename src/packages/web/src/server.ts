// The UX Woz web server: serves the app, streams screens from the models, keeps the screen cache.
// API keys stay here; the browser only ever sees generated HTML.

import { join, resolve } from 'node:path'
import {
  BOX_TITLES, DEFAULT_DEVICE, DEFAULT_MODEL, DEVICES, MODELS, ScreenCache, canonicalAction, isComponent, isDevice, isModelId, normalizePrompt,
  screenKey, screenRef, VISIT_EVERY, warmUp, type BoxName, type Io,
} from '@uxwoz/core'
import { drawing, ndjson } from './drawing.ts'
import { exportRoute } from './export.ts'
import index from './index.html'
import player from './player.html'
import sheet from './design/sheet.html'
import { sharing } from './share.ts'

const THEMES_DIR = resolve(import.meta.dir, '../themes')
/** Theme ids and labels; the first is the default. `clean` is Pico alone, `mockup` is Pico plus mockup.css. */
const THEMES = { mockup: 'Mockup (sketch)', clean: 'Clean (Pico)' } as const
const THEME_FILES = new Set(['pico', 'mockup'])

export type { ScreenEvent } from './drawing.ts'

interface ServerOptions extends Io {
  port?: number
  cache?: ScreenCache
  /** Picks the side that is asked for a clearly different design; Math.random by default. */
  random?: () => number
  /** How long a new screen or a change waits for a running filing before it goes on without it. */
  fileWaitMs?: number
}

const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (error: string, status = 400) => json({ error }, status)

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

export function createServer(opts: ServerOptions = {}) {
  const cache = opts.cache ?? new ScreenCache()
  const log = opts.log ?? ((m: string) => console.warn(m))
  const random = opts.random ?? Math.random
  const fileWaitMs = opts.fileWaitMs ?? 5000
  const io = { fetch: opts.fetch, env: opts.env }
  const { file, visit, mapOf, forget, idle, screenEvents, reviseEvents } = drawing(cache, io, log, random, fileWaitMs)

  const pickers = (b: { model?: unknown; device?: unknown } | null) => {
    const model = b?.model ?? DEFAULT_MODEL, device = b?.device ?? DEFAULT_DEVICE
    if (!isModelId(model)) return fail(`unknown model ${model}`)
    if (!isDevice(device)) return fail(`unknown device ${device}`)
    return { model, device }
  }

  const { guard } = sharing(cache, api, { app: index, player })
  return Bun.serve({
    port: opts.port ?? Number(process.env.PORT ?? 3000),
    // Only this machine: the API spends the owner's model credits.
    hostname: process.env.UXWOZ_HOST ?? '127.0.0.1',
    // Bun closes connections idle for 10 s by default; a screen may take up to 20 s.
    idleTimeout: 30,
    // No request needs more; a bigger one is refused before it is read.
    maxRequestBodySize: 64 * 1024,
    development: process.env.NODE_ENV !== 'production',
    routes: guard({
      '/': index,
      '/design': sheet,
      '/og.png': () => new Response(Bun.file(join(import.meta.dir, 'design/brand/og.png')), { headers: { 'Content-Type': 'image/png' } }),
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
        if (url.searchParams.get('wait') === '1') await Promise.race([idle(app), Bun.sleep(60_000)])
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
      '/api/export': exportRoute(cache),
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
    }),
    fetch: () => new Response('Not found', { status: 404 }),
  })
}

if (import.meta.main) {
  const file = process.env.UXWOZ_CACHE_FILE ?? resolve(import.meta.dir, '../../../../temp/screen-cache.json')
  const cache = new ScreenCache(file)
  const server = createServer({ cache })
  console.log(`UX Woz on ${server.url} (cache: ${file}, ${cache.size} screens)`)
}