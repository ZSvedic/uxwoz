// Sharing: a link per role (view, comment, edit), the player's map, feedback and trips, the edit link's
// cap, and the owner's gate (UXWOZ_OWNER). server.ts registers it with `sharing(...)` and `guard(...)`.

import { HOME_NAME, canonicalAction, componentsOf, isComponent, normalizePrompt, screenTree, type CacheEntry, type Feedback, type ScreenCache, type Share, type Trip } from '@uxwoz/core'

/** How many of each kind a mockup keeps (comments, thumbs, answers, trips; the oldest go), the most screens and dead clicks
 * a trip keeps, the longest text, an edit link's default cap. */
export const SHARE_KEEP = 500
export const TRIP_KEEP = 50
export const FEEDBACK_CHARS = 1000
export const EDIT_CAP = 20
const ROLES = ['view', 'comment', 'edit'] as const
/** The routes an edit link may not use: the share links themselves, deleting the whole mockup, the owner's warm-up. */
const OWNER_ONLY = new Set(['/api/share', '/api/shares', '/api/unshare', '/api/delete-app', '/api/warmup'])
/** The routes that call a model when an edit link uses them (a new screen only when it is not in the cache). */
const PAID = new Set(['/api/screen', '/api/revise', '/api/pick'])

type Api = (run: (b: any, req: Request) => Response | Promise<Response>) => (req: Request) => Promise<Response>
type Route = any
const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (error: string, status = 400) => json({ error }, status)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const token = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
/** Keep the newest `SHARE_KEEP` of a list's items in the `same` group. */
function capped<T>(list: T[], same: (x: T) => boolean = () => true) {
  const mine = list.filter(same)
  if (mine.length <= SHARE_KEEP) return
  const drop = new Set(mine.slice(0, mine.length - SHARE_KEEP))
  list.splice(0, list.length, ...list.filter((x) => !drop.has(x)))
}
/** Feedback kinds kept apart, so one kind cannot push out another: comments, thumbs, answers (dead controls and Done). */
const groupOf = (kind: Feedback['kind']) => (kind === 'done' ? 'dead' : kind)
const titleOf = (e: CacheEntry) => e.versions.at(-1)?.name || e.name || HOME_NAME

/** The player's mockup: the picked screens' newest versions, their tree parents and the components; nothing else. */
export function playerMap(cache: ScreenCache, root: string) {
  const all = cache.map(root).entries.filter((e) => e.versions.length)
  const tree = screenTree(all)
  return {
    root,
    components: componentsOf(all),
    screens: all.filter((e) => !isComponent(e)).map((e) => {
      const v = e.versions.at(-1)!
      return { key: e.key, name: e.name ?? HOME_NAME, title: titleOf(e), html: v.html, device: v.device, parent: tree.get(e.key)?.parent ?? null }
    }),
  }
}

export function sharing(cache: ScreenCache, api: Api, pages: { app: Route; player: Route }, owner = process.env.UXWOZ_OWNER) {
  const linkOf = (req: Request, s: Share) => ({ ...s, url: `${new URL(req.url).origin}/s/${s.token}` })
  const found = (req: Request & { params?: Record<string, string> }) => cache.share(req.params?.token ?? '')
  const isOwner = (req: Request) => !owner || req.headers.get('cookie')?.split(/;\s*/).includes(`uxwoz_owner=${owner}`)
  /** Proxy one of our own pages (the app or the player), so a link keeps its own address; from this server itself, never from the request's Host. */
  const page = (server: { port?: number }, path: string) => fetch(`http://127.0.0.1:${server.port}${path}`)
  /** Visitors write often: save the file at most once a second. */
  let saving: ReturnType<typeof setTimeout> | undefined
  const saveSoon = () => { saving ??= setTimeout(() => { saving = undefined; cache.save() }, 1000) }

  /** A visitor's feedback or trip: the link must work, and a view link only views. */
  const visitor = (run: (b: any, root: string) => Response) => api((b, req) => {
    const f = found(req as Request & { params?: Record<string, string> })
    if (!f) return fail('This link does not work any more.', 404)
    if (f.share.role === 'view') return fail('This link can only view.', 403)
    return run(b, f.root)
  })
  const who = (b: any) => ({ visitor: /^[a-f0-9]{8,40}$/.test(String(b?.visitor)) ? String(b.visitor) : 'unknown', name: str(b?.name, 60) || 'Someone' })

  const routes: Record<string, Route> = {
    '/_app': pages.app,
    '/_player': pages.player,
    '/s/:token': (req: Request & { params: Record<string, string> }, server: { port?: number }) => {
      const f = found(req)
      if (!f) return new Response('This link does not work any more.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      if (f.share.role === 'edit') return page(server, '/_app')
      // Crawlers ignore a relative og:image: give it this link's own origin, as linkOf does.
      const origin = new URL(req.url).origin
      return page(server, '/_player').then(async (r) => new Response((await r.text()).replace('content="/og.png"', `content="${origin}/og.png"`), { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') ?? 'text/html;charset=utf-8' } }))
    },
    '/api/s/:token/map': (req: Request & { params: Record<string, string> }) => {
      const f = found(req)
      if (!f) return fail('This link does not work any more.', 404)
      // Counted in memory; the next save keeps it (a GET never writes the file).
      f.share.opens++
      return json({ role: f.share.role, app: cache.get(f.root)?.app ?? f.root, ...playerMap(cache, f.root) })
    },
    '/api/s/:token/feedback': { POST: visitor((b, root) => {
      const kind = b?.kind
      if (!['comment', 'thumb', 'dead', 'done'].includes(kind)) return fail('unknown kind')
      const text = typeof b?.text === 'string' ? b.text.trim() : ''
      if (text.length > FEEDBACK_CHARS) return fail(`a text must be at most ${FEEDBACK_CHARS} characters`)
      if (kind !== 'thumb' && !text) return fail('write something first')
      const screen = cache.get(String(b?.screen ?? ''))
      const at = screen && normalizePrompt(screen.app) === root && !isComponent(screen) ? screen : undefined
      if (kind !== 'done' && !at) return fail('no such screen', 404)
      const f: Feedback = { at: new Date().toISOString(), ...who(b), screen: at?.key ?? root, title: at ? titleOf(at) : '', kind,
        ...(text && { text }), ...(str(b?.about, 120) && { about: str(b?.about, 120) }), ...(kind === 'thumb' && { up: !!b?.up }), ...(str(b?.label, 80) && { label: str(b?.label, 80) }) }
      const list = cache.ownShared(root).feedback
      // One thumb per visitor and screen: the newest counts.
      if (kind === 'thumb') list.splice(0, list.length, ...list.filter((x) => !(x.kind === 'thumb' && x.visitor === f.visitor && x.screen === f.screen)))
      list.push(f)
      capped(list, (x) => groupOf(x.kind) === groupOf(kind))
      saveSoon()
      return json({ ok: true })
    }) },
    '/api/s/:token/trip': { POST: visitor((b, root) => {
      const id = /^[a-f0-9]{8,40}$/.test(String(b?.id)) ? String(b.id) : null
      if (!id) return fail('a trip needs its id')
      const names = (v: unknown) => (Array.isArray(v) ? v.slice(0, TRIP_KEEP).map((x) => str(x, 80)).filter(Boolean) : [])
      const trips = cache.ownShared(root).trips
      const old = trips.findIndex((t) => t.id === id)
      const t: Trip = { id, ...who(b), at: old >= 0 ? trips[old]!.at : new Date().toISOString(), screens: names(b?.screens), dead: names(b?.dead) }
      if (old >= 0) trips[old] = t
      else trips.push(t)
      capped(trips)
      saveSoon()
      return json({ ok: true })
    }) },
    '/api/share': { POST: api((b, req) => {
      const app = str(b?.app, 2000), role = b?.role
      if (!cache.get(normalizePrompt(app))?.versions.length) return fail('no such mockup, or its first screen is not picked yet', 404)
      if (!ROLES.includes(role)) return fail('role must be view, comment or edit')
      const cap = role === 'edit' ? Math.max(1, Math.min(1000, Math.round(Number(b?.cap) || EDIT_CAP))) : undefined
      const s: Share = { token: token(), role, createdAt: new Date().toISOString(), ...(cap && { cap }), used: 0, opens: 0 }
      cache.ownShared(app).shares.push(s)
      cache.save()
      return json(linkOf(req, s))
    }) },
    '/api/shares': (req: Request) => {
      const app = new URL(req.url).searchParams.get('app')?.trim() ?? ''
      const s = cache.sharedOf(app)
      return json({ shares: s.shares.map((x) => linkOf(req, x)), feedback: s.feedback, trips: s.trips })
    },
    '/api/unshare': { POST: api((b) => {
      const f = cache.share(String(b?.token ?? ''))
      if (!f) return fail('no such link', 404)
      const list = cache.ownShared(f.root).shares
      list.splice(list.indexOf(f.share), 1)
      cache.save()
      return json({ ok: true })
    }) },
  }

  /**
   * The mockup a request is about, and its body: a GET's `?app=`, a POST's `app` or the first part of its
   * screen `key`, read from the body only. 'refuse' for an `app` or `key` that is not a string, or a query
   * naming another mockup than the body.
   */
  async function scopeOf(req: Request): Promise<{ root: string | null; b: any } | 'refuse'> {
    const q = new URL(req.url).searchParams.get('app')
    if (req.method !== 'POST') return { root: q == null ? null : normalizePrompt(q), b: null }
    const b = await req.clone().json().catch(() => null)
    const has = (k: string) => b != null && typeof b === 'object' && Object.hasOwn(b, k)
    if ((has('app') && typeof b.app !== 'string') || (has('key') && typeof b.key !== 'string')) return 'refuse'
    const root = has('app') ? normalizePrompt(b.app) : has('key') ? (b.key as string).split(' » ')[0]! : null
    if (q != null && normalizePrompt(q) !== root) return 'refuse'
    return { root, b }
  }

  /** Whether a request makes a model work: a new screen (not a cache hit), an Edit or a Regenerate, a pick (its filing), an Edit of a box or a visit. */
  function costs(path: string, b: any): boolean {
    if (path === '/api/box') return b?.op === 'edit' || b?.op === 'visit'
    if (path === '/api/screen') return !cache.find(String(b?.app ?? ''), canonicalAction(typeof b?.action === 'string' ? b.action : null))
    return PAID.has(path)
  }

  /** An /api route as the owner (cookie, or no UXWOZ_OWNER), or through an edit link for its mockup, within its cap. */
  const wrap = (path: string, run: (req: Request) => Response | Promise<Response>) => async (req: Request) => {
    const t = req.headers.get('x-uxwoz-share')
    if (!t) return isOwner(req) ? run(req) : fail('This UX Woz is private.', 401)
    const f = cache.share(t)
    if (!f || f.share.role !== 'edit') return fail('This link does not work any more.', 403)
    if (OWNER_ONLY.has(path)) return fail('Only the owner can do this.', 403)
    if (path === '/api/apps') return json({ apps: cache.apps().filter((a) => normalizePrompt(a.app) === f.root) })
    const scope = await scopeOf(req)
    if (scope === 'refuse' || (scope.root != null && scope.root !== f.root)) return fail('This link opens one mockup only.', 403)
    // Deleting the first screen deletes the mockup, its links and its feedback: only the owner may.
    if (path === '/api/delete' && scope.b?.key === f.root) return fail('Only the owner can delete the whole mockup.', 403)
    const paid = costs(path, scope.b)
    if (paid && f.share.used >= (f.share.cap ?? EDIT_CAP)) return fail('This link\'s budget is used up.', 429)
    // Counted before the call, so two at once cannot both pass the cap; given back when refused.
    if (paid) f.share.used++
    const res = await run(req)
    if (paid && !res.ok) f.share.used--
    if (paid) cache.save()
    return res
  }

  const closed = () => new Response('This UX Woz is private.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  /** Every /api route but the visitors' goes through `wrap`; with UXWOZ_OWNER set, `/` and `/design` ask for the owner's cookie. */
  function guard<R extends string>(all: Bun.Serve.Routes<unknown, R>): Bun.Serve.Routes<unknown, R> {
    const out: Record<string, Route> = { ...all, ...routes }
    for (const [path, r] of Object.entries(out)) {
      if (!path.startsWith('/api/') || path.startsWith('/api/s/')) continue
      out[path] = typeof r === 'function' ? wrap(path, r) : Object.fromEntries(Object.entries(r).map(([m, f]) => [m, wrap(path, f as any)]))
    }
    if (owner) out['/'] = (req: Request, server: { port?: number }) => {
      const secret = new URL(req.url).searchParams.get('owner')
      const https = new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https'
      if (secret === owner) return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': `uxwoz_owner=${owner}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${https ? '; Secure' : ''}` } })
      return isOwner(req) ? page(server, '/_app') : closed()
    }
    // The design sheet is the owner's too: its page moves to /_design, as the app's is at /_app.
    if (owner && out['/design']) { out['/_design'] = out['/design']; out['/design'] = (req: Request, server: { port?: number }) => isOwner(req) ? page(server, '/_design') : closed() }
    return out as Bun.Serve.Routes<unknown, R>
  }

  return { guard }
}

