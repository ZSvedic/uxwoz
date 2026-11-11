// Desks: one person's screen cache and the work behind it (filing chains, visits). A request reaches
// its own person's desk and has no way to name another's. `owner` is the cache createServer gets; any
// other person's opens from `<dir>/<id>.json` when their request comes and closes after 10 idle minutes.

import { join } from 'node:path'
import { ScreenCache, type Share } from '@uxwoz/core'
import type { drawing } from './drawing.ts'

/** A person's id other than `owner`: lowercase hex, 16 to 40 characters. */
export const PERSON_ID = /^[a-f0-9]{16,40}$/
/** How long a person's desk stays open after their last request. */
export const IDLE_MS = 10 * 60_000

export type Drawing = ReturnType<typeof drawing>
export interface Desk { id: string; cache: ScreenCache; draw: Drawing; used: number }

export interface DeskOptions {
  /** Where people's cache files live; null keeps them in memory (they never close then). */
  dir: string | null
  /** Who sent a request: 'owner' or a person's id. */
  who: (req: Request) => string
  /** A desk's drawing; `id` is 'owner' or the person's, so their calls are charged to them. */
  draw: (cache: ScreenCache, id: string) => Drawing
  idleMs?: number
  /** The share index (public mode): whose a token is, so its desk opens even when closed. Without it, the open desks are searched. */
  shareOwner?: (token: string) => string | null
}

export function desks(owner: ScreenCache, opts: DeskOptions) {
  const idleMs = opts.idleMs ?? IDLE_MS
  const own: Desk = { id: 'owner', cache: owner, draw: opts.draw(owner, 'owner'), used: 0 }
  const open = new Map<string, Desk>()

  /** A person's desk, opened when it is not; null for an id that is neither `owner` nor a person's. */
  function desk(id: string): Desk | null {
    if (id === 'owner') return own
    if (!PERSON_ID.test(id)) return null
    let d = open.get(id)
    if (!d) {
      const cache = new ScreenCache(opts.dir ? join(opts.dir, `${id}.json`) : null)
      open.set(id, (d = { id, cache, draw: opts.draw(cache, id), used: 0 }))
    }
    d.used = Date.now()
    return d
  }

  /** The desk that holds a share link, its mockup and the link: the owner's, else the index's person's
   * (opened if closed), else, with no index, an open one's. */
  function whose(token: string): { desk: Desk; root: string; share: Share } | undefined {
    const indexed = opts.shareOwner && /^[a-f0-9]{8,64}$/.test(token) ? opts.shareOwner(token) : null
    const person = indexed && indexed !== 'owner' ? desk(indexed) : null
    for (const d of opts.shareOwner ? [own, ...(person ? [person] : [])] : [own, ...open.values()]) {
      const f = d.cache.share(token)
      if (f) { d.used = Date.now(); return { desk: d, ...f } }
    }
    return undefined
  }

  const byReq = new WeakMap<Request, Desk>()
  /** The desk a request works on: an edit link's (`x-uxwoz-share`), else its sender's; null when there is none. */
  function of(req: Request): Desk | null {
    const known = byReq.get(req)
    if (known) return known
    const t = req.headers.get('x-uxwoz-share')
    const d = t ? whose(t)?.desk : desk(opts.who(req))
    if (d) byReq.set(req, d)
    return d ?? null
  }

  /** Fix a request to the desk its edit link was checked on, so a link revoked meanwhile cannot leave it with none. */
  const bind = (req: Request, d: Desk) => void byReq.set(req, d)

  /** Close the desks idle for `idleMs`, each saved first; never one whose filing or visit runs. */
  function sweep(now = Date.now()) {
    if (!opts.dir) return
    for (const [id, d] of open) {
      if (now - d.used < idleMs || d.draw.busy()) continue
      d.cache.save()
      open.delete(id)
    }
  }
  setInterval(sweep, Math.min(60_000, idleMs)).unref()

  return { owner: own, desk, whose, of, bind, sweep, open: () => [...open.keys()] }
}
export type Desks = ReturnType<typeof desks>
