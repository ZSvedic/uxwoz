// Sign-in and mail against abuse (spec/public.md, Routes): the critic's runs over HTTP, now holding. A mail that does
// not go, guesses spread over networks, a wait skipped, a burst past the day's mail, a blocked email coming back,
// the owner's pages and caps. No cassette: Resend is faked and can be told to refuse; the store's clock is injected.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ScreenCache, type Fetch } from '@uxwoz/core'
import { CODES_PER_EMAIL, WRONG_PER_EMAIL, people, type People } from '../packages/web/src/people.ts'
import { createServer } from '@uxwoz/web/src/server.ts'

const ADMIN = 'owner@example.com'
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake', RESEND_API_KEY: 're_test', UXWOZ_ADMIN_EMAIL: ADMIN }
const OWNER = { cookie: 'uxwoz_owner=sesame' }

let mails: { to: string[]; subject: string; text: string }[] = []
/** Resend's answer; 200 unless a test says otherwise. Each mail asked for is kept, sent or not. */
let resend = 200
let asked: { to: string[]; subject: string }[] = []
const fakeFetch: Fetch = async (url, init) => {
  if (String(url).includes('resend.com')) {
    const m = JSON.parse(String(init!.body))
    asked.push(m)
    await Bun.sleep(5)
    if (resend !== 200) return new Response('slow down', { status: resend })
    mails.push(m)
    return new Response('{"id":"m"}')
  }
  return new Response('down', { status: 503 })
}

let server: ReturnType<typeof createServer> | null = null
let store: People
let clock: { t: number }
beforeEach(() => { mails = []; asked = []; resend = 200; clock = { t: Date.parse('2026-11-11T10:00:00Z') } })
afterEach(() => { server?.stop(true); server = null })
function start() {
  store = people(':memory:', { now: () => new Date(clock.t) })
  server = createServer({ port: 0, cache: new ScreenCache(), fetch: fakeFetch, env, log: () => {}, fileWaitMs: 0, public: true, owner: 'sesame', people: store })
}
const url = (p: string) => new URL(p, server!.url)
function browser(ip = '10.0.0.1') {
  let cookie = ''
  const headers = (h: Record<string, string> = {}) => ({ 'x-real-ip': ip, ...(cookie && { cookie }), ...h })
  const keep = (res: Response) => { const c = res.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]!; return res }
  return {
    get cookie() { return cookie },
    get: async (p: string) => keep(await fetch(url(p), { headers: headers() })),
    post: async (p: string, body: object) => keep(await fetch(url(p), { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })),
  }
}
const owner = {
  get: (p: string) => fetch(url(p), { headers: OWNER }),
  post: (p: string, body: object) => fetch(url(p), { method: 'POST', headers: { ...OWNER, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
}
const codeIn = (list: { to: string[]; subject: string }[], email: string) => list.findLast((m) => m.to[0] === email && m.subject.startsWith('Your UX Woz code'))?.subject.slice(-6)
const wrongFor = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
const minute = () => { clock.t += 60_000 }
async function signUp(b: ReturnType<typeof browser>, email: string) {
  expect((await b.post('/api/signin', { email })).status).toBe(204)
  return b.post('/api/verify', { email, code: codeIn(mails, email) })
}

describe('sign-in and mail against abuse', () => {
  test('a mail Resend refuses: 503, the code is dead, the mail is counted', async () => {
    start()
    resend = 429
    const b = browser()
    expect((await b.post('/api/signin', { email: 'ana@example.com' })).status).toBe(503)
    const code = codeIn(asked, 'ana@example.com')!
    expect(store.mailToday()).toBe(1)
    expect((await b.post('/api/verify', { email: 'ana@example.com', code })).status).toBe(400)
  })

  test('guesses spread over networks: 5 codes and 15 wrong tries an email a day, then 429 for it until tomorrow', async () => {
    start()
    resend = 429
    // From many /64s: each code's mail fails, and still only 5 codes come for the email.
    const statuses: number[] = []
    for (let n = 0; n < 20; n++) {
      const b = browser(`2001:db8:${n.toString(16)}::1`)
      statuses.push((await b.post('/api/signin', { email: 'ana@example.com' })).status)
      minute()
    }
    expect(statuses.filter((s) => s === 503)).toHaveLength(CODES_PER_EMAIL)
    expect(statuses.slice(CODES_PER_EMAIL).every((s) => s === 429)).toBe(true)

    // Wrong tries count per email, whatever the network and whether a code lives.
    clock.t = Date.parse('2026-11-12T10:00:00Z')
    resend = 200
    const ana = browser('10.0.0.1')
    expect((await ana.post('/api/signin', { email: 'ana@example.com' })).status).toBe(204)
    const code = codeIn(mails, 'ana@example.com')!
    for (let n = 0; n < WRONG_PER_EMAIL; n++) expect((await browser(`2001:db8:${n.toString(16)}::1`).post('/api/verify', { email: 'ana@example.com', code: wrongFor(code) })).status).toBe(400)
    expect((await ana.post('/api/verify', { email: 'ana@example.com', code })).status).toBe(429)
    minute()
    expect((await ana.post('/api/signin', { email: 'ana@example.com' })).status).toBe(429)
    clock.t = Date.parse('2026-11-13T10:00:00Z')
    expect((await signUp(ana, 'ana@example.com')).status).toBe(200)
  })

  test('5 wrong verifies kill the code, and the minute\'s wait still holds', async () => {
    start()
    const b = browser()
    expect((await b.post('/api/signin', { email: 'ana@example.com' })).status).toBe(204)
    const code = codeIn(mails, 'ana@example.com')!
    for (let n = 0; n < 5; n++) expect((await b.post('/api/verify', { email: 'ana@example.com', code: wrongFor(code) })).status).toBe(400)
    const again = await b.post('/api/signin', { email: 'ana@example.com' })
    expect(again.status).toBe(429)
    expect((await again.json() as any).error).toContain('wait a minute')
  })

  test('8 sign-ins at once with 2 emails a day: 2 mails go', async () => {
    start()
    store.setCaps({ mailPerDay: 2 })
    const all = await Promise.all(Array.from({ length: 8 }, (_, n) => browser(`10.0.${n}.1`).post('/api/signin', { email: `u${n}@example.com` })))
    expect(all.map((r) => r.status).sort()).toEqual([204, 204, 429, 429, 429, 429, 429, 429])
    expect(asked).toHaveLength(2)
    expect(store.mailToday()).toBe(2)
  })

  test('a blocked email stays closed after delete-account; it cannot ask; it gets no top-up; unblock opens it', async () => {
    start()
    const ana = browser()
    expect((await signUp(ana, 'ana@example.com')).status).toBe(200)
    const id = store.byEmail('ana@example.com')!.id
    expect((await owner.post('/api/admin', { op: 'block', id, blocked: true })).status).toBe(200)

    // Blocked: no request reaches the owner, no top-up and no ready mail when it is due.
    const before = mails.length
    expect((await ana.post('/api/ask', { note: 'more please' })).status).toBe(403)
    clock.t += 13 * 3600_000
    await server!.tick.topups()
    expect(store.person(id)).toMatchObject({ topupDue: expect.any(Number), allowance: 0.1 })
    expect(mails.slice(before).filter((m) => m.to[0] === 'ana@example.com' || m.subject.includes('waiting'))).toHaveLength(0)

    // Deleting the account is their right; signing up again with that email is refused at verify.
    expect((await ana.post('/api/delete-account', { email: 'ana@example.com' })).status).toBe(204)
    expect(store.person(id)).toBeNull()
    minute()
    const back = browser('10.0.0.2')
    const r = await signUp(back, 'ana@example.com')
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'This account is closed.' })
    expect(store.byEmail('ana@example.com')).toBeNull()

    // Unblock takes the email off the list.
    const bo = browser('10.0.0.3')
    expect((await signUp(bo, 'bo@example.com')).status).toBe(200)
    const boId = store.byEmail('bo@example.com')!.id
    await owner.post('/api/admin', { op: 'block', id: boId, blocked: true })
    minute()
    expect((await signUp(browser('10.0.0.4'), 'bo@example.com')).status).toBe(403)
    await owner.post('/api/admin', { op: 'block', id: boId, blocked: false })
    minute()
    expect((await signUp(browser('10.0.0.4'), 'bo@example.com')).status).toBe(200)
  })

  test('the network\'s 3 accounts refuse a fourth at verify, and its right code stays good from elsewhere', async () => {
    start()
    for (const n of [1, 2, 3]) expect((await signUp(browser(), `a${n}@example.com`)).status).toBe(200)
    const b = browser()
    expect((await b.post('/api/signin', { email: 'a4@example.com' })).status).toBe(204)
    const code = codeIn(mails, 'a4@example.com')!
    expect((await b.post('/api/verify', { email: 'a4@example.com', code })).status).toBe(429)
    expect((await browser('10.9.9.9').post('/api/verify', { email: 'a4@example.com', code })).status).toBe(200)
  })

  test('the owner\'s pages answer only through their gate; caps take CAPS\'s own keys only', async () => {
    start()
    for (const p of ['/_admin', '/_design']) expect((await fetch(url(p))).status).toBe(404)
    expect((await fetch(url('/admin'))).status).toBe(403)
    expect((await fetch(url('/design'))).status).toBe(403)
    expect((await owner.get('/admin')).status).toBe(200)
    expect((await owner.get('/design')).status).toBe(200)
    for (const k of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      const r = await fetch(url('/api/admin'), { method: 'POST', headers: { ...OWNER, 'Content-Type': 'application/json' }, body: `{"op":"caps","caps":{"${k}":1}}` })
      expect(r.status).toBe(400)
    }
    expect(Object.keys(store.settings().caps)).not.toContain('toString')
  })
})
