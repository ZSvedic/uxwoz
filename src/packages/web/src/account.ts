// The account's routes (spec/public.md, Routes; spec/behavior.md, The account card): sign in by a code, verify,
// sign out, delete the account, ask for more; and the check once a minute that hands out the waiting top-ups.
// The server registers the routes and gives what the store does not know in `AccountExtras`.

import type { Io } from '@uxwoz/core'
import { left, normalEmail, screensOf, validEmail, NOTE_CHARS, type People, type Person } from './people.ts'
import { codeMail, mailReady, readyMail, requestMail, send, waitingMail, type Mail } from './mail.ts'

/** What the store does not know, given by the server. */
export interface AccountExtras {
  /** The person a request comes from (by its session cookie), or null: no cookie, an unknown one, or the owner. */
  who: (req: Request) => Person | null
  /** The session token in the request's cookie, or null; for sign out. */
  token: (req: Request) => string | null
  /** The caller's address as the server sees it (the header or the socket's), raw. */
  address: (req: Request) => string
  /** The response with the session cookie set to `token`, or cleared when `token` is null; `req` says whether it is https. */
  cookie: (res: Response, token: string | null, req: Request) => Response
  /** Moves a visitor's mockups into an account's cache, skipping the prompts the account has, and deletes the visitor's file. */
  move: (fromId: string, toId: string) => unknown | Promise<unknown>
  /** Deletes a person's cache file; the store's rows go after it. */
  deleteFile: (id: string) => void | Promise<void>
  /** For mail (fetch, env, log). */
  io: Io
  /** The app's address for the links in emails: by default the request's origin, and https://app.uxwoz.com/ for the check. */
  appUrl?: (req?: Request) => string
  /** What /api/verify answers as `me`; by default `meOf`. */
  me?: (person: Person) => unknown
  /** The clock of the once-a-minute check, in ms; tests inject it. */
  now?: () => number
}

/** How often the check runs, and how often at most the owner hears of waiting sign-ups. */
export const TOPUP_EVERY_MS = 60_000
export const WAITING_MAIL_MS = 3600_000
const APP_URL = 'https://app.uxwoz.com/'

const json = (body: unknown, status = 200) => Response.json(body, { status })
const fail = (status: number, error: string, reason?: string) => json(reason ? { error, reason } : { error }, status)
const none = () => new Response(null, { status: 204 })
const FULL = 'Sign-ups are full for today.'
const SOON = 'A code is on its way: wait a minute before asking again.'
const REGISTER = 'Register first.'

async function body(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null
  } catch { return null }
}

/** `/api/me` for a person (spec/public.md, Routes). */
export function meOf(store: People, p: Person) {
  const l = left(p), r = store.lastRequest(p.id), registered = p.email !== null
  return {
    role: registered ? 'user' : 'visitor', ...(p.email ? { email: p.email } : {}),
    left: l, allowance: p.allowance, screensLeft: screensOf(l),
    ...(p.topupDue !== null ? { topupDue: p.topupDue } : {}),
    ...(r ? { request: { at: r.at, ...(r.answer ? { answer: r.answer } : {}) } } : {}),
    paused: store.paused(), may: { share: registered, exportZip: registered },
  }
}

/** Sends one email and counts it toward the day's; false when it did not go. */
async function mailer(store: People, io: Io, m: Mail) {
  const sent = await send(m, io)
  if (sent) store.mailed()
  return sent
}

export function accountRoutes(store: People, extras: AccountExtras) {
  const env = () => extras.io.env ?? process.env
  const appUrl = (req: Request) => extras.appUrl?.(req) ?? new URL('/', req.url).href
  const me = (p: Person) => (extras.me ?? ((x: Person) => meOf(store, x)))(p)
  const mail = (m: Mail) => mailer(store, extras.io, m)

  return {
    '/api/signin': {
      POST: async (req: Request) => {
        const b = await body(req)
        const email = b?.email
        if (typeof email !== 'string' || !validEmail(email)) return fail(400, 'That email does not look right.')
        if (!mailReady(extras.io)) return fail(503, 'Sign-up is not set up yet.')
        const address = extras.address(req)
        // Never by the address's accounts nor by whether the email has one: a new account is refused at verify.
        const asker = extras.who(req)
        const made = store.makeCode(email, asker?.id ?? null, address)
        if (made === 'email') return fail(400, 'That email does not look right.')
        if (made === 'mail' || made === 'codes') return fail(429, FULL)
        if (made === 'soon') return fail(429, SOON)
        if (!(await mail(codeMail(normalEmail(email), made.code)))) return fail(503, 'The email did not go. Try again in a minute.')
        if (asker) store.step(asker.id, 'asked', address)
        return none()
      },
    },
    '/api/verify': {
      POST: async (req: Request) => {
        const b = await body(req)
        const email = b?.email, code = b?.code
        if (typeof email !== 'string' || !validEmail(email) || typeof code !== 'string' || !/^\s*\d{6}\s*$/.test(code)) return fail(400, 'That code is not right.')
        const address = extras.address(req)
        const done = store.verify(email, code.trim(), extras.who(req)?.id ?? null, address)
        if (done === 'code') return fail(400, 'That code is not right.')
        if (done === 'address') return fail(429, FULL)
        if (done.merged) await extras.move(done.merged, done.person.id)
        store.step(done.person.id, 'verified', address)
        return extras.cookie(json({ me: me(store.person(done.person.id) ?? done.person) }), done.token, req)
      },
    },
    '/api/signout': {
      POST: (req: Request) => {
        const t = extras.token(req)
        if (t) store.signOut(t)
        return extras.cookie(none(), null, req)
      },
    },
    '/api/delete-account': {
      POST: async (req: Request) => {
        const p = extras.who(req)
        if (!p?.email) return fail(403, REGISTER, 'register')
        const b = await body(req)
        if (typeof b?.email !== 'string' || normalEmail(b.email) !== p.email) return fail(400, 'That is not the email of this account.')
        await extras.deleteFile(p.id)
        store.deletePerson(p.id)
        return extras.cookie(none(), null, req)
      },
    },
    '/api/ask': {
      POST: async (req: Request) => {
        const p = extras.who(req)
        if (!p?.email) return fail(403, REGISTER, 'register')
        const b = await body(req)
        if (typeof b?.note !== 'string') return fail(400, `Say what you are building, in 1 to ${NOTE_CHARS} characters.`)
        const id = store.ask(p.id, b.note)
        if (id === 'register') return fail(403, REGISTER, 'register')
        if (id === 'note') return fail(400, `Say what you are building, in 1 to ${NOTE_CHARS} characters.`)
        if (id === 'open') return fail(409, 'You asked already: the answer comes by email.')
        const owner = env().UXWOZ_ADMIN_EMAIL?.trim()
        const r = store.request(id)
        if (owner && r) await mail(requestMail(owner, { email: p.email, note: r.note, spent: p.spent, allowance: p.allowance }, new URL('/admin', appUrl(req)).href))
        return none()
      },
    },
  }
}

/**
 * Every minute: grants the top-ups that are due, each with *Your free screens are ready*; tells the owner of
 * sign-ups that started waiting since the last such email, one email an hour at most. Returns a stop function
 * (with `tick`, one run now, for tests); its timer does not keep the process alive.
 */
export function startTopups(store: People, extras: Pick<AccountExtras, 'io' | 'appUrl' | 'now'>, everyMs = TOPUP_EVERY_MS) {
  const now = extras.now ?? Date.now
  const app = () => extras.appUrl?.() ?? APP_URL
  const told = new Set<string>()
  let lastWaiting = -Infinity
  let running: Promise<void> | null = null

  async function run() {
    const caps = () => store.settings().caps
    const room = () => store.mailToday() < caps().mailPerDay
    for (const due of store.topupsDue()) {
      const p = store.grantTopup(due.id)
      if (p?.email && room()) await mailer(store, extras.io, readyMail(p.email, caps().topup, app()))
    }
    const owner = (extras.io.env ?? process.env).UXWOZ_ADMIN_EMAIL?.trim()
    const waiting = store.summary().people.filter((p) => p.email && p.topupDue !== null)
    for (const id of told) if (!waiting.some((p) => p.id === id)) told.delete(id)
    if (!owner || !waiting.some((p) => !told.has(p.id)) || now() - lastWaiting < WAITING_MAIL_MS || !room()) return
    if (await mailer(store, extras.io, waitingMail(owner, waiting.length, new URL('/admin', app()).href))) {
      lastWaiting = now()
      for (const p of waiting) told.add(p.id)
    }
  }
  /** One run; a run still going is waited for, never doubled. */
  const tick = () => (running ??= run().catch((e) => (extras.io.log ?? console.log)(`top-ups: ${(e as Error).message}`)).finally(() => { running = null }))

  const timer = setInterval(tick, everyMs)
  timer.unref?.()
  return Object.assign(() => clearInterval(timer), { tick })
}
