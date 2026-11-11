// The admin's page and the privacy page (spec/public.md, Routes; spec/behavior.md, The public): GET and POST
// /api/admin, GET /admin, GET /privacy. The server registers these routes and puts the owner's gate on the first three.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Io } from '@uxwoz/core'
import { CAPS, type Caps, type People } from './people.ts'
import { answerMail, readyMail, send, type Mail } from './mail.ts'
import adminPage from './admin.html'

/** What the store does not know, given by the server. */
export interface AdminExtras {
  /** How many mockups a person's cache file holds. */
  mockups: (id: string) => number
  /** The caller's address as the server sees it (the header or the socket's), raw. */
  address: (req: Request) => string
  /** False when a starter's recording was made with another system prompt than today's. */
  startersCurrent: () => boolean
  /** Deletes a person's cache file; the store's rows go after it. */
  deleteFile: (id: string) => void | Promise<void>
  /** For mail (fetch, env, log). */
  io: Io
  /** The app's address for the links in emails; by default the request's origin. */
  appUrl?: (req: Request) => string
}

/** The largest amount one op may give, and each cap's largest value. */
export const MAX_USD = 100
const CAP_MAX: Record<keyof Caps, number> = {
  visitor: MAX_USD, topup: MAX_USD, topupHours: 24 * 30,
  addressUsd: 1000, addressVisitors: 100_000, addressAccounts: 100_000,
  dayUsd: 10_000, monthUsd: 100_000, mailPerDay: 100_000,
}

const json = (body: unknown, status = 200) => Response.json(body, { status })
const fail = (status: number, error: string) => json({ error }, status)
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{1,64}$/.test(v)
const isUsd = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= MAX_USD

export function adminRoutes(store: People, extras: AdminExtras) {
  const env = () => extras.io.env ?? process.env
  const appUrl = (req: Request) => extras.appUrl?.(req) ?? new URL('/', req.url).href

  function view(req: Request) {
    const s = store.summary()
    return {
      ...s,
      people: s.people.map(({ steps: _, ...p }) => ({ ...p, mockups: extras.mockups(p.id) })),
      address: extras.address(req),
      startersCurrent: extras.startersCurrent(),
    }
  }

  /** Sends one email and counts it; false when it did not go. */
  async function mail(m: Mail) {
    const sent = await send(m, extras.io)
    if (sent) store.mailed()
    return sent
  }

  type Op = (b: any, req: Request) => Promise<Response | { mailed?: boolean }> | Response | { mailed?: boolean }
  const ops: Record<string, Op> = {
    mode: (b) => {
      if (b.mode !== 'open' && b.mode !== 'starters') return fail(400, 'mode must be open or starters')
      store.setMode(b.mode)
      return {}
    },
    caps: (b) => {
      const c = b.caps
      if (!c || typeof c !== 'object' || Array.isArray(c) || !Object.keys(c).length) return fail(400, 'caps must be an object of numbers')
      for (const [k, v] of Object.entries(c)) {
        if (!(k in CAPS)) return fail(400, `unknown cap ${k}`)
        const max = CAP_MAX[k as keyof Caps]
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return fail(400, `${k} must be a number from 0 to ${max}`)
      }
      store.setCaps(c)
      return {}
    },
    give: (b) => {
      if (!isId(b.id)) return fail(400, 'id must be a person\'s id')
      if (!isUsd(b.usd, -MAX_USD) || b.usd === 0) return fail(400, `usd must be a number from -${MAX_USD} to ${MAX_USD}, not 0`)
      if (!store.person(b.id)) return fail(404, 'no such person')
      store.give(b.id, b.usd)
      return {}
    },
    block: (b) => {
      if (!isId(b.id)) return fail(400, 'id must be a person\'s id')
      if (typeof b.blocked !== 'boolean') return fail(400, 'blocked must be true or false')
      if (!store.person(b.id)) return fail(404, 'no such person')
      store.block(b.id, b.blocked)
      return {}
    },
    delete: async (b) => {
      if (!isId(b.id)) return fail(400, 'id must be a person\'s id')
      if (!store.person(b.id)) return fail(404, 'no such person')
      await extras.deleteFile(b.id)
      store.deletePerson(b.id)
      return {}
    },
    topup: async (b, req) => {
      if (!isId(b.id)) return fail(400, 'id must be a person\'s id')
      const p = store.person(b.id)
      if (!p) return fail(404, 'no such person')
      if (p.topupDue === null) return fail(409, 'No top-up waits for this person.')
      const after = store.grantTopup(b.id)
      if (!after) return fail(409, 'No top-up waits for this person.')
      return { mailed: after.email ? await mail(readyMail(after.email, store.settings().caps.topup, appUrl(req))) : false }
    },
    answer: async (b, req) => {
      if (typeof b.request !== 'number' || !Number.isSafeInteger(b.request) || b.request < 1) return fail(400, 'request must be a request\'s id')
      if (typeof b.approved !== 'boolean') return fail(400, 'approved must be true or false')
      if (b.usd !== undefined && (!isUsd(b.usd, 0) || b.usd === 0)) return fail(400, `usd must be a number above 0, at most ${MAX_USD}`)
      const r = store.request(b.request)
      if (!r) return fail(404, 'no such request')
      if (r.answer) return fail(409, 'This request is answered already.')
      const done = b.usd === undefined ? store.answer(r.id, b.approved) : store.answer(r.id, b.approved, b.usd)
      if (!done) return fail(409, 'This request is answered already.')
      const email = done.person.email
      return { mailed: email ? await mail(answerMail(email, b.approved, done.request.usd ?? 0, appUrl(req))) : false }
    },
  }

  let privacy: string | null = null
  function privacyPage() {
    if (privacy !== null) return privacy
    const e = env()
    const operator = e.UXWOZ_OPERATOR?.trim() || 'the person who runs this site'
    const contact = e.UXWOZ_CONTACT?.trim() || e.UXWOZ_ADMIN_EMAIL?.trim() || ''
    const style = ['tokens.css', 'base.css', 'admin.css']
      .map((f) => readFileSync(join(import.meta.dir, 'design', f), 'utf8'))
      .join('\n').replace(/@font-face\s*{[^}]*}/g, '')
    const write = contact.includes('@') ? `<a href="mailto:${esc(contact)}">${esc(contact)}</a>` : contact ? esc(contact) : 'the address on this site'
    privacy = readFileSync(join(import.meta.dir, 'privacy.html'), 'utf8')
      .replace('<!--style-->', `<style>${style}</style>`)
      .replaceAll('{{operator}}', esc(operator))
      .replaceAll('{{contact}}', write)
    return privacy
  }

  return {
    '/api/admin': {
      GET: (req: Request) => json(view(req)),
      POST: async (req: Request) => {
        let b: any
        try { b = await req.json() } catch { return fail(400, 'the body must be JSON') }
        if (!b || typeof b !== 'object' || typeof b.op !== 'string') return fail(400, 'op is missing')
        const op = Object.hasOwn(ops, b.op) ? ops[b.op] : undefined
        if (!op) return fail(400, `unknown op ${b.op}`)
        const out = await op(b, req)
        if (out instanceof Response) return out
        return json({ ...view(req), ...out })
      },
    },
    '/admin': adminPage,
    '/privacy': () => new Response(privacyPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
