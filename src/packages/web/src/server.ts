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

/** How many variants a new screen comes with; an Edit or an edited prompt adds one. */
export const VARIANTS = 2

/**
 * One line of the /api/screen NDJSON stream. `meta.variants` is how many variants stream now (0 for
 * a cache hit); each chunk names its variant. `done.variants` maps each variant to its candidate
 * index in the entry, or null if it failed (its message is in `failed`).
 */
export type ScreenEvent =
  | { type: 'meta'; key: string; cached: boolean; variants: number }
  | { type: 'chunk'; variant: number; text: string }
  | { type: 'done'; entry: CacheEntry; variants: (number | null)[]; failed: string[]; link: Link | null; removed: string[] }
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

  /** A click in variant `variant` of screen `from`, on a control labelled `label`. Absent for the first screen and Regenerate. */
  interface Click { from: string; variant: number; label: string }
  /**
   * `regenerate` adds one variant to a screen even when it is cached; `prompt`, when given, is what
   * the model is asked for instead of the screen's own prompt (an edited prompt). `edit` adds one
   * variant made by changing that variant as asked (the user's Edit). `replace` makes a new version
   * of that variant the way it was made (its prompt, or its Edit again); it takes the old one's place.
   */
  interface ScreenRequest {
    app: string; action: string | null; model: ModelId; device: Device; regenerate: boolean; prompt: string | null
    edit: { variant: number; change: string } | null; replace: number | null; click: Click | null
  }

  async function* screenEvents(r: ScreenRequest, signal: AbortSignal): AsyncGenerator<ScreenEvent> {
    const { app, model, device, click, replace } = r
    const action = canonicalAction(app, r.action)
    const key = screenKey(app, action)
    const hit = cache.get(key)
    const old = replace == null ? undefined : hit?.candidates[replace]
    if (replace != null && (!old || old.deleted)) {
      yield { type: 'error', message: 'no such variant to refresh' }
      return
    }
    // An Edit changes a live variant; a refreshed Edit changes the same variant again, if it is still there.
    const asked = r.edit ?? (old?.editOf != null && old.feedback ? { variant: old.editOf, change: old.feedback } : null)
    const base = asked ? hit?.candidates[asked.variant] : undefined
    if (r.edit && (!base || base.deleted)) {
      yield { type: 'error', message: 'no such variant to edit' }
      return
    }
    const edit = asked && base && !base.deleted ? { ...asked, html: base.html } : null
    const prompt = old ? old.prompt ?? null : base ? base.prompt ?? null : r.prompt
    const linkFrom = () => (click ? cache.link(click.from, click.variant, key, click.label || action || 'home') ?? null : null)
    if (hit && !r.regenerate && replace == null && !edit) {
      yield { type: 'meta', key, cached: true, variants: 0 }
      yield { type: 'done', entry: hit, variants: [], failed: [], link: linkFrom(), removed: [] }
      return
    }
    if (action && !cache.get(screenKey(app, null))) {
      yield { type: 'error', message: 'this mockup has no first screen: it was deleted, or never made' }
      return
    }
    const count = r.regenerate || replace != null || edit ? 1 : VARIANTS
    yield { type: 'meta', key, cached: false, variants: count }
    const existing = cache.existingScreens(app).filter((a) => a !== action)
    const streams = Array.from({ length: count }, (_, slot) => tagged(slot, generateScreen({
      // A refreshed alternative stays the different design it was asked to be (index 1 before the flag existed).
      // An Edit keeps the device its variant was made for, and asks for no other design.
      app, action: prompt ?? action, existing, model, device: (edit && base!.device) || device,
      alternative: edit ? false : old ? old.alternative ?? (replace === 1 && old.replaces == null && old.editOf == null) : slot % 2 === 1,
      edit: edit ? { html: edit.html, change: edit.change } : undefined,
      signal, fetch: opts.fetch, env: opts.env, log,
    })))
    const made: (Candidate | null)[] = Array(count).fill(null)
    const failed: string[] = []
    for await (const t of merge(streams)) {
      if ('error' in t) {
        if (signal.aborted) continue // the browser left; nothing to report
        const message = t.error instanceof Error ? t.error.message : String(t.error)
        log(`screen failed (${model}): ${message}`)
        failed.push(message)
      } else if (t.ev.type === 'chunk') yield { type: 'chunk', variant: t.slot, text: t.ev.text }
      else made[t.slot] = { ...t.ev.candidate, ...(prompt && { prompt }), ...(edit && { editOf: edit.variant, feedback: edit.change }) }
    }
    const ok = made.filter((c): c is Candidate => c != null)
    const parent = click && { key: click.from, variant: click.variant, label: click.label }
    // A later screen of a mockup deleted meanwhile (Delete, Start over) is not kept: it would bring
    // the mockup back without its first screen.
    const gone = action != null && !cache.get(screenKey(app, null))
    // A variant that finished is paid for: keep it, even if the browser left before the other one.
    if (signal.aborted) {
      if (ok.length && !gone) {
        if (replace != null) cache.replace(key, replace, ok[0]!)
        else cache.add(app, action, ok, { parent })
      }
      return
    }
    if (gone) {
      yield { type: 'error', message: 'this mockup was deleted while the screen was being made' }
      return
    }
    if (!ok.length) {
      yield { type: 'error', message: [...new Set(failed)].join('; ') || 'no screen was made' }
      return
    }
    // Both variants are stored together, in slot order, so the first stays first whichever finished first.
    if (replace != null) {
      const done = cache.replace(key, replace, ok[0]!)
      if (!done) yield { type: 'error', message: 'the variant was deleted while it was being refreshed' }
      else yield { type: 'done', entry: done.entry, variants: [done.index], failed, link: null, removed: done.removed }
      return
    }
    const { entry, index } = cache.add(app, action, ok, { parent })
    let n = index
    yield { type: 'done', entry, variants: made.map((c) => (c ? n++ : null)), failed, link: linkFrom(), removed: [] }
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
          const prompt = typeof b?.prompt === 'string' && b.prompt.trim() ? b.prompt.trim() : null
          const change = typeof b?.edit?.change === 'string' ? b.edit.change.trim() : ''
          const edit = b?.edit != null ? { variant: b.edit.variant, change } : null
          if (edit && (!Number.isInteger(edit.variant) || edit.variant < 0 || !change || change.length > 1000))
            return json({ error: 'edit needs a variant number and a change of 1-1000 characters' }, 400)
          if (!app || app.length > 2000) return json({ error: 'app must be 1-2000 characters' }, 400)
          if (action && action.length > 500) return json({ error: 'action must be at most 500 characters' }, 400)
          if (prompt && prompt.length > 2000) return json({ error: 'prompt must be at most 2000 characters' }, 400)
          if (!isModelId(model)) return json({ error: `unknown model ${model}` }, 400)
          if (!isDevice(device)) return json({ error: `unknown device ${device}` }, 400)
          const replace = b?.replace ?? null
          if (replace != null && (!Number.isInteger(replace) || replace < 0)) return json({ error: 'replace must be a whole number' }, 400)
          const variant = b?.variant ?? 0
          if (!Number.isInteger(variant) || variant < 0) return json({ error: 'variant must be a whole number' }, 400)
          const click = typeof b?.from === 'string' && b.from
            ? { from: b.from.slice(0, 3000), variant, label: String(b?.label ?? '').slice(0, 200) }
            : null
          return ndjson(screenEvents({ app, action, model, device, regenerate: b?.regenerate === true, prompt, edit, replace, click }, req.signal))
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
          const link = cache.link(String(b?.from ?? ''), Number(b?.variant ?? 0), String(b?.to ?? ''), String(b?.label ?? '').slice(0, 200))
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
      // Delete one variant; screens only it reached go too. Returns the mockup as /api/map does.
      '/api/delete': {
        POST: async (req) => {
          const refused = refuseForeign(req)
          if (refused) return refused
          const b = await req.json().catch(() => null)
          const key = String(b?.key ?? ''), app = cache.get(key)?.app
          const done = cache.deleteVariant(key, Number(b?.index))
          // The whole mockup comes back too: a delete can give other screens new parents.
          return done && app
            ? json({ entry: done.entry ?? null, removed: done.removed, ...cache.map(app) })
            : json({ error: 'no such screen or variant' }, 404)
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
