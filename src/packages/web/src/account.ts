// The account's routes (spec/public.md, Routes; spec/behavior.md, The account card): sign in by a code, verify,
// sign out, delete the account, ask for more; and the check once a minute that tells the owner of the open requests.
// The server registers the routes and gives what the store does not know in `AccountExtras`.

import type { Io } from '@uxwoz/core'
import { left, normalEmail, screensOf, validEmail, NOTE_CHARS, type People, type Person } from './people.ts'

type Env = Record<string, string | undefined>
import { codeMail, contactOf, mailReady, requestMail, send, type Mail } from './mail.ts'

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
  /** The app's address for the links in the owner's mail of requests; https://app.uxwoz.com/ by default. */
  appUrl?: (req?: Request) => string
  /** What /api/verify answers as `me`; by default `meOf`. */
  me?: (person: Person) => unknown
  /** The clock of the once-a-minute check, in ms; tests inject it. */
  now?: () => number
  /** A request was made: the owner's mail goes now unless one went in the last hour (`startAsks`'s `tick`). */
  asked?: () => unknown | Promise<unknown>
}

/** How often the check runs, and how often at most the owner hears of open requests. */
export const ASKS_EVERY_MS = 60_000
export const ASKS_MAIL_MS = 3600_000
const APP_URL = 'https://app.uxwoz.com/'

const json = (body: unknown, status = 200) => Response.json(body, { status })
const fail = (status: number, error: string, reason?: string) => json(reason ? { error, reason } : { error }, status)
const none = () => new Response(null, { status: 204 })
const FULL = 'Sign-ups are full for today.'
const SOON = 'A code is on its way: wait a minute before asking again.'
const LOCKED = 'Too many codes for this email today. Try again tomorrow.'
const CLOSED = 'This account is closed.'
/** What a blocked person reads: whom to write to, when the site has an address. */
export const closedOf = (env: Env) => { const c = contactOf(env); return c ? `${CLOSED} Write to ${c}.` : CLOSED }
const REGISTER = 'Register first.'

async function body(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null
  } catch { return null }
}

/** The screens a new account adds, for `more` in /api/me. */
export const moreOf = (store: People) => screensOf(store.settings().caps.topup)

/** `/api/me` for a person (spec/public.md, Routes). */
export function meOf(store: People, p: Person) {
  const l = left(p), r = store.lastRequest(p.id), registered = p.email !== null
  return {
    role: registered ? 'user' : 'visitor', ...(p.email ? { email: p.email } : {}),
    left: l, allowance: p.allowance, screensLeft: screensOf(l), ...(registered ? {} : { more: moreOf(store) }),
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
  const me = (p: Person) => (extras.me ?? ((x: Person) => meOf(store, x)))(p)
  const closed = () => closedOf(env())

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
        if (made === 'locked') return fail(429, LOCKED)
        // The day's mail was counted by makeCode before the send; a code whose mail did not go dies.
        if (!(await send(codeMail(normalEmail(email), made.code), extras.io))) {
          store.dropCode(email)
          return fail(503, 'The email did not go. Try again in a minute.')
        }
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
        if (done === 'locked') return fail(429, LOCKED)
        if (done === 'blocked') return fail(403, closed())
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
        if (id === 'blocked') return fail(403, closed())
        if (id === 'note') return fail(400, `Say what you are building, in 1 to ${NOTE_CHARS} characters.`)
        if (id === 'open') return fail(409, 'You asked already: the answer comes by email.')
        await extras.asked?.()
        return none()
      },
    },
  }
}

/**
 * Every minute: tells the owner of the open quota requests when one is new since the last such email, one email an
 * hour at most, listing them all. `/api/ask` runs it at once, so a first request is heard of at once. Returns a stop
 * function (with `tick`, one run now); its timer does not keep the process alive.
 */
export function startAsks(store: People, extras: Pick<AccountExtras, 'io' | 'appUrl' | 'now'>, everyMs = ASKS_EVERY_MS) {
  const now = extras.now ?? Date.now
  const app = () => extras.appUrl?.() ?? APP_URL
  let running: Promise<void> | null = null

  // When the last mail went and what it told of live in the store, so a restart does not mail them again.
  async function run() {
    const owner = (extras.io.env ?? process.env).UXWOZ_ADMIN_EMAIL?.trim()
    const open = store.openRequests()
    const { at: last, ids } = store.asksMailed()
    const told = new Set(ids)
    if (!owner || !open.some((r) => !told.has(r.id)) || now() - last < ASKS_MAIL_MS || store.mailToday() >= store.settings().caps.mailPerDay) return
    const asking = open.map((r) => { const p = store.person(r.person); return { email: r.email, note: r.note, spent: p?.spent ?? 0, allowance: p?.allowance ?? 0 } })
    if (await mailer(store, extras.io, requestMail(owner, asking, new URL('/admin', app()).href))) store.setAsksMailed(now(), open.map((r) => r.id))
  }
  /** One run; a run still going is waited for, never doubled. */
  const tick = () => (running ??= run().catch((e) => (extras.io.log ?? console.log)(`asks: ${(e as Error).message}`)).finally(() => { running = null }))

  const timer = setInterval(tick, everyMs)
  timer.unref?.()
  return Object.assign(() => clearInterval(timer), { tick })
}
