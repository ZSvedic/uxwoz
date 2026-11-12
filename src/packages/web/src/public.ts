// The public app (spec/public.md: Modes, Who a request is, The meter, What a role may do): who a request
// is (the owner's cookie, a person's `uxwoz_who`, or nobody yet), the address, and the gate a person's
// /api request passes onto their own desk: the role table, Haiku only, the meter (402), one paid request
// at a time (409), the 5 MB file (413), the warm-up rule and the steps the server counts. /api/me and
// /api/step live here. share.ts's `wrap` sends every non-owner request through `route`.

import { STARTERS, canonicalAction, normalizePrompt, type Io, type ModelId } from '@uxwoz/core'
import { screensOf, type People, type Person, type Reason, type Step } from './people.ts'
import { closedOf, meOf, moreOf } from './account.ts'
import type { Desk, Desks } from './desks.ts'

/** The public's one model. */
export const PUBLIC_MODEL: ModelId = 'claude-haiku-5.5'
/** The person's cookie; its value is the session token (32 hex). */
export const COOKIE = 'uxwoz_who'
/** A person's cache file stops taking new screens past this. */
export const FILE_CAP = 5 * 1024 * 1024
/** A warm-up from the public calls the model only when no Haiku call ran for this long. */
export const WARM_MS = 4 * 60_000

export const REASONS: Record<Reason, string> = {
  allowance: 'Your free screens are used up.',
  address: 'This network has used today\'s free screens. Register to carry on.',
  paused: 'Live designs are paused for now. The starters still work.',
  guests: 'Today\'s free screens for guests are used up. Register to carry on.',
  blocked: 'This account is closed.',
}

export type Who =
  | { role: 'owner' }
  | { role: 'visitor' | 'user'; person: Person; token: string }
  | { role: 'new' }

const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (error: string, status = 400, extra: object = {}) => json({ error, ...extra }, status)
const cookies = (req: Request) => new Map((req.headers.get('cookie') ?? '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)] as [string, string] }))
const https = (req: Request) => (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || new URL(req.url).protocol.slice(0, -1)) === 'https'

/** UXWOZ_PUBLIC=1 opens the app; it needs UXWOZ_OWNER, and a server without it refuses to start. */
export function publicMode(on: boolean, owner: string | undefined): boolean {
  if (on && !owner) throw new Error('UXWOZ_PUBLIC needs UXWOZ_OWNER: the public app has an owner. Set it, or unset UXWOZ_PUBLIC.')
  return on
}

/** The person's cookie for a session token: a year, HttpOnly, Lax, Secure on https. */
export const setCookie = (token: string, req: Request) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${https(req) ? '; Secure' : ''}`
/** The person's cookie cleared (sign out). */
export const clearCookie = (req: Request) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${https(req) ? '; Secure' : ''}`
/** The session token a request carries, or null. */
export const tokenOf = (req: Request) => cookies(req).get(COOKIE) || null

/** A response with a Set-Cookie added, and `after` called once its body has been read or dropped. */
function finish(res: Response, cookie: string | null, after: (() => void) | null): Response {
  if (!cookie && !after) return res
  const headers = new Headers(res.headers)
  if (cookie) headers.append('Set-Cookie', cookie)
  if (!res.body || !after) { after?.(); return new Response(res.body, { status: res.status, statusText: res.statusText, headers }) }
  const reader = res.body.getReader()
  const body = new ReadableStream({
    async pull(c) {
      try {
        const r = await reader.read()
        if (r.done) { after(); c.close() } else c.enqueue(r.value)
      } catch (err) { after(); c.error(err) }
    },
    cancel(why) { after(); return reader.cancel(why) },
  })
  return new Response(body, { status: res.status, statusText: res.statusText, headers })
}

export interface GateOptions {
  store: People
  owner: string
  /** The desks, once made (they need `who` first). */
  desks: () => Desks
  /** The socket's address of a request. */
  socket: (req: Request) => string | null
  /** The header with the visitor's address; UXWOZ_ADDRESS_HEADER, default `x-real-ip`. */
  addressHeader?: string
  /** server.ts's check of a POST from another site: run before a visitor is made. */
  refuse: (req: Request) => Response | null
  /** The environment, for the address a blocked person writes to; default process.env. */
  env?: () => Record<string, string | undefined>
}

export type Gate = ReturnType<typeof gate>

/** The public's gate. Made only in public mode. */
export function gate(o: GateOptions) {
  const { store } = o
  /** A reason's words; a blocked person's say whom to write to. */
  const words = (r: Reason) => (r === 'blocked' ? closedOf(o.env?.() ?? process.env) : REASONS[r])
  const header = (o.addressHeader ?? process.env.UXWOZ_ADDRESS_HEADER ?? 'x-real-ip').toLowerCase()
  const known = new WeakMap<Request, Who>()
  /** Each person's last address: their background calls are charged to it. */
  const lastAddress = new Map<string, string>()

  const isOwner = (req: Request) => cookies(req).get('uxwoz_owner') === o.owner
  /** The request's address: the configured header's value, else the socket's. Of X-Forwarded-For the last value is
   * the one our proxy added; the ones before it are the client's own claim. */
  const address = (req: Request) => {
    const values = (req.headers.get(header) ?? '').split(',').map((v) => v.trim()).filter(Boolean)
    return (header === 'x-forwarded-for' ? values.at(-1) : values[0]) || o.socket(req) || 'unknown'
  }
  /** When the public's last warm-up was let through: one slot for the whole public, claimed before the call. */
  let warmClaim = 0

  /** Who sent the request; a person is looked up once per request (and marked seen). */
  function who(req: Request): Who {
    const k = known.get(req)
    if (k) return k
    let w: Who
    if (isOwner(req)) w = { role: 'owner' }
    else {
      const t = tokenOf(req), p = t ? store.byToken(t) : null
      w = p && t ? { role: p.email ? 'user' : 'visitor', person: p, token: t } : { role: 'new' }
    }
    if (w.role !== 'owner' && w.role !== 'new') lastAddress.set(w.person.id, address(req))
    known.set(req, w)
    return w
  }
  /** For desks: 'owner', a person's id, or '' (nobody yet: no desk). */
  const deskOf = (req: Request) => { const w = who(req); return w.role === 'owner' ? 'owner' : w.role === 'new' ? '' : w.person.id }
  const isPublic = (req: Request) => who(req).role !== 'owner'

  /**
   * A person's Io: each live call is checked when it is about to be sent (`allow` reserves its hold or throws the
   * reason's words), whatever route or race started it; its cost, when it arrives, frees the hold and is charged to
   * them at their last address.
   */
  const io = <T extends Io>(id: string, base: T): T => {
    const holds: (() => void)[] = []
    return {
      ...base,
      allow: () => {
        const p = store.person(id)
        const r = p ? store.reserve(p, lastAddress.get(id) ?? 'unknown') : 'blocked'
        if (typeof r === 'string') throw new Error(words(r))
        holds.push(r)
        base.allow?.()
      },
      spent: (usd: number | null, model: ModelId) => {
        holds.shift()?.()
        const p = store.person(id)
        if (p) store.charge(p, usd, model, lastAddress.get(id) ?? 'unknown')
        base.spent?.(usd, model)
      },
    }
  }
  /** Whether a person's background work (filing, a visit) may start: a paid request would pass. */
  const may = (id: string) => () => { const p = store.person(id); return !!p && store.mayCall(p, lastAddress.get(id) ?? 'unknown') === null }

  const step = (id: string | null, s: Step, req: Request) => store.step(id, s, address(req))

  /** What /api/me answers. */
  function me(req: Request) {
    const w = who(req), paused = store.paused()
    if (w.role === 'owner') return { role: 'owner', paused, may: { share: true, exportZip: true } }
    if (w.role === 'new') {
      const a = store.settings().caps.visitor
      return { role: 'new', left: a, allowance: a, screensLeft: screensOf(a), more: moreOf(store), paused, may: { share: false, exportZip: false } }
    }
    return meOf(store, store.person(w.person.id) ?? w.person)
  }

  /** Paths a person may never use, and those a visitor must register for. */
  const OWNERS = new Set(['/api/backup', '/api/admin'])
  const REGISTER = new Set(['/api/share', '/api/shares', '/api/unshare', '/api/feedback', '/api/export'])
  /** The paths a request with no person yet may use: signing in needs none (a second browser). */
  const OPEN = new Set(['/api/config', '/api/me', '/api/step', '/api/signin', '/api/verify', '/api/signout'])

  /**
   * A non-owner's /api request (no edit link): onto their own desk, within the role table and the meter.
   * `paidOf` is share.ts's `costs`: whether the request makes a model work.
   */
  async function route(path: string, req: Request, run: (req: Request) => Response | Promise<Response>, paidOf: (b: any, cache: Desk['cache']) => boolean): Promise<Response> {
    let w = who(req), cookie: string | null = null
    const all = o.desks()
    if (w.role === 'owner') return run(req)
    if (OPEN.has(path)) return run(req)
    const post = req.method === 'POST'
    if (w.role === 'new') {
      if (path === '/api/apps') return json({ apps: [] })
      // Opening a mockup reads its map before the first screen makes the person: an empty mockup, as for an unknown prompt.
      if (path === '/api/map' && !post) { all.bind(req, all.nobody); return run(req) }
      if (path === '/api/shares' && !post) return json({ shares: [], feedback: [], trips: [] })
      if (path === '/api/warmup') return new Response(null, { status: 204 })
      if (path !== '/api/screen' || !post) return fail('Start with a starter or a prompt of your own.', 401, { reason: 'new' })
      const foreign = o.refuse(req)
      if (foreign) return foreign
      const made = store.makeVisitor(address(req))
      if (!made) return fail(REASONS.address, 402, { reason: 'address' })
      w = { role: 'visitor', person: made.person, token: made.token }
      known.set(req, w)
      lastAddress.set(made.person.id, address(req))
      cookie = setCookie(made.token, req)
    }
    const person = w.person, id = person.id
    const desk = all.desk(id)
    if (!desk) return fail('Who sent this is not known.', 400)
    all.bind(req, desk)
    const answer = (res: Response, after: (() => void) | null = null) => finish(res, cookie, after)

    const b = post ? await req.clone().json().catch(() => null) : null
    if (OWNERS.has(path)) return answer(fail('Only the owner can do this.', 403))
    if (path === '/api/share' && b?.role === 'edit') return answer(fail('Edit links are the owner\'s only.', 403))
    if (REGISTER.has(path) && !person.email) return answer(fail(path === '/api/export' ? 'Register to export it.' : 'Register to share a mockup.', 403, { reason: 'register' }))
    if (b?.model != null && b.model !== PUBLIC_MODEL) return answer(fail('Only Claude Haiku is open to the public.', 403))

    // A pick calls no model itself: its filing and visit start only while `may` says so.
    const warm = path === '/api/warmup'
    // A warm-up is checked for coming from another site here, before it can take the public's slot.
    if (warm) { const foreign = o.refuse(req); if (foreign) return answer(foreign) }
    const paid = warm || (path !== '/api/pick' && paidOf(b, desk.cache) && !desk.draw.replayed(path, b))
    if (warm && Date.now() - Math.max(store.lastCall(PUBLIC_MODEL) ?? 0, warmClaim) < WARM_MS) return answer(new Response(null, { status: 204 }))
    if (paid && (path === '/api/screen' || path === '/api/revise') && Buffer.byteLength(desk.cache.serialize()) > FILE_CAP)
      return answer(fail('This account is full: delete a mockup first.', 413))
    let release: (() => void) | null = null
    if (paid) {
      const reason = store.mayCall(person, address(req))
      if (reason) {
        if (reason === 'allowance') step(id, 'limit', req)
        return answer(fail(words(reason), 402, { reason }))
      }
      // Claimed with no wait since the check, so warm-ups sent together make one call.
      if (warm) warmClaim = Date.now()
      // A stream holds until it ends; a warm-up and a box's Edit or visit return at once and run in the background.
      if (path === '/api/screen' || path === '/api/revise') {
        release = store.hold(id)
        if (!release) return answer(fail('One at a time: wait for this one.', 409))
      }
    }
    if (path === '/api/screen' && post && typeof b?.app === 'string' && !canonicalAction(typeof b?.action === 'string' ? b.action : null) && !desk.cache.find(b.app, null))
      step(id, STARTERS.some((s) => normalizePrompt(s.prompt) === normalizePrompt(b.app)) ? 'starter' : 'own', req)
    let res: Response
    try { res = await run(req) } catch (err) { release?.(); throw err }
    if (path === '/api/pick' && res.ok) step(id, 'picked', req)
    return answer(res, release)
  }

  /** POST /api/step {step: "arrived"}: the one step the page sends; the server counts the others. */
  function arrived(req: Request, b: any): Response {
    if (b?.step !== 'arrived') return fail('only arrived is sent; the server counts the other steps')
    const w = who(req)
    step(w.role === 'visitor' || w.role === 'user' ? w.person.id : null, 'arrived', req)
    return new Response(null, { status: 204 })
  }

  /** A share link made, or links gone (unshare, a mockup deleted): the index follows. The owner's links are not in it. */
  const shared = (token: string, desk: string) => { if (desk !== 'owner') store.addShare(token, desk) }
  const unshared = (tokens: string[]) => { for (const t of tokens) store.removeShare(t) }

  return { who, deskOf, isPublic, isOwner, address, io, may, me, arrived, route, shared, unshared }
}
