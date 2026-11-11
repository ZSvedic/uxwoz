// The account's routes and the once-a-minute check over a store in memory: a fake fetch for mail, an injected
// clock, caches in memory for the mockups a sign-in moves.
import { beforeEach, expect, test } from 'bun:test'
import { ScreenCache, type Fetch, type Version } from '@uxwoz/core'
import { accountRoutes, startTopups, WAITING_MAIL_MS, type AccountExtras } from '../packages/web/src/account.ts'
import { RESEND_URL } from '../packages/web/src/mail.ts'
import { people, type People } from '../packages/web/src/people.ts'

const ADDR = '203.0.113.7'
const ADMIN = 'owner@example.com'
let clock: { t: number }
let store: People
let mails: { to: string[]; subject: string; text: string }[]
let caches: Map<string, ScreenCache>
let logs: string[]
let routes: ReturnType<typeof accountRoutes>
let extras: AccountExtras

function make(env: Record<string, string | undefined> = { RESEND_API_KEY: 're_test', UXWOZ_ADMIN_EMAIL: ADMIN }) {
  const f: Fetch = async (url, init) => {
    expect(url).toBe(RESEND_URL)
    mails.push(JSON.parse(init!.body as string))
    return new Response('{"id":"x"}')
  }
  extras = {
    who: (req) => { const t = token(req); return t ? store.byToken(t) : null },
    token,
    address: (req) => req.headers.get('x-real-ip') ?? ADDR,
    cookie: (res, t) => { res.headers.set('Set-Cookie', t ? `uxwoz_who=${t}` : 'uxwoz_who=; Max-Age=0'); return res },
    move: (from, to) => { cacheOf(to).takeIn(cacheOf(from)); caches.delete(from) },
    deleteFile: (id) => { caches.delete(id) },
    io: { fetch: f, env, log: (m) => { logs.push(m) } },
    appUrl: () => 'https://uxwoz.example/',
    now: () => clock.t,
  }
  routes = accountRoutes(store, extras)
}
const token = (req: Request) => req.headers.get('cookie')?.match(/uxwoz_who=([a-f0-9]{32})/)?.[1] ?? null
const cacheOf = (id: string) => { let c = caches.get(id); if (!c) caches.set(id, (c = new ScreenCache())); return c }

beforeEach(() => {
  clock = { t: Date.parse('2026-11-11T10:00:00Z') }
  store = people(':memory:', { now: () => new Date(clock.t) })
  mails = []; logs = []; caches = new Map()
  make()
})

type Path = keyof ReturnType<typeof accountRoutes>
const post = (path: Path, body: unknown, who?: string | null, address = ADDR) => routes[path].POST(new Request(`http://x${path}`, {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { ...(who ? { cookie: `uxwoz_who=${who}` } : {}), 'x-real-ip': address },
}))
const codeOf = (email: string) => mails.findLast((m) => m.to[0] === email.trim().toLowerCase() &&m.subject.startsWith('Your UX Woz code'))!.subject.slice(-6)
const cookieOf = (r: Response) => r.headers.get('Set-Cookie')!.match(/uxwoz_who=([a-f0-9]{32})/)![1]!
const ver = (html: string): Version => ({ html, model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-11T00:00:00Z', costUsd: 0.001, costEstimated: false, firstChunkMs: 1, totalMs: 2, finishReason: 'stop' })
function mockup(id: string, app: string, html: string) {
  const c = cacheOf(id), e = c.propose(app, null, 0, ver(html))!
  c.pick(e.key, 0)
}
/** Signs in by code; the response of /api/verify. */
async function signIn(email: string, who: string | null, address = ADDR) {
  expect((await post('/api/signin', { email }, who, address)).status).toBe(204)
  return post('/api/verify', { email, code: codeOf(email) }, who, address)
}

test('a visitor registers, waits, and the top-up arrives with its email; the owner hears once', async () => {
  const v = store.makeVisitor(ADDR)!
  mockup(v.person.id, 'Dog walks', '<h1>dogs</h1>')
  store.charge(v.person, 0.1, 'haiku', ADDR)

  expect((await post('/api/signin', { email: ' Ana@Example.com ' }, v.token)).status).toBe(204)
  expect(mails).toHaveLength(1)
  expect(mails[0]!.to).toEqual(['ana@example.com'])
  expect((await post('/api/verify', { email: 'ana@example.com', code: '000000' === codeOf('ana@example.com') ? '111111' : '000000' }, v.token)).status).toBe(400)
  const r = await post('/api/verify', { email: 'ana@example.com', code: codeOf('ana@example.com') }, v.token)
  expect(r.status).toBe(200)
  const { me } = await r.json() as any
  expect(me).toMatchObject({ role: 'user', email: 'ana@example.com', left: 0, allowance: 0.1, screensLeft: 0, paused: false, may: { share: true, exportZip: true } })
  expect(me.topupDue).toBe(clock.t + 12 * 3600_000)
  const t = cookieOf(r)
  expect(store.byToken(t)!.id).toBe(v.person.id)
  // The mockups stay where they are; the steps are counted.
  expect(cacheOf(v.person.id).apps().map((a) => a.app)).toEqual(['Dog walks'])
  expect(store.person(v.person.id)!.steps).toEqual(['asked', 'verified'])

  const stop = startTopups(store, extras)
  await stop.tick()
  expect(mails.at(-1)).toMatchObject({ to: [ADMIN], subject: 'UX Woz: 1 sign-up waiting' })
  await stop.tick()
  clock.t += WAITING_MAIL_MS
  await stop.tick()
  expect(mails.filter((m) => m.to[0] === ADMIN)).toHaveLength(1)

  clock.t = me.topupDue - 1
  await stop.tick()
  expect(store.person(v.person.id)!.topupDue).not.toBeNull()
  clock.t = me.topupDue
  await stop.tick()
  expect(store.person(v.person.id)).toMatchObject({ topupDue: null, allowance: 0.25 })
  expect(mails.at(-1)).toMatchObject({ to: ['ana@example.com'], subject: 'Your free screens are ready' })
  expect(mails.at(-1)!.text).toContain('https://uxwoz.example/')
  await stop.tick()
  expect(mails.filter((m) => m.subject === 'Your free screens are ready')).toHaveLength(1)
  stop()
})

test('an account signs in from a second browser: the visitor\'s mockups move in, a prompt it has stays its own', async () => {
  const first = await signIn('bo@example.com', null)
  const account = store.byToken(cookieOf(first))!
  mockup(account.id, 'A cafe', '<h1>account cafe</h1>')

  const v = store.makeVisitor('198.51.100.1')!
  mockup(v.person.id, 'Dog walks', '<h1>dogs</h1>')
  mockup(v.person.id, 'a cafe', '<h1>visitor cafe</h1>')
  const r = await signIn('BO@example.com', v.token, '198.51.100.1')
  expect(r.status).toBe(200)
  expect(((await r.json()) as any).me.email).toBe('bo@example.com')
  expect(store.byToken(cookieOf(r))!.id).toBe(account.id)
  expect(store.person(v.person.id)).toBeNull()
  expect(caches.has(v.person.id)).toBe(false)
  const c = cacheOf(account.id)
  expect(c.apps().map((a) => a.app).sort()).toEqual(['A cafe', 'Dog walks'])
  expect(c.find('a cafe', null)!.versions[0]!.html).toBe('<h1>account cafe</h1>')
})

test('a wrong code five times kills it; the right one after says no too', async () => {
  expect((await post('/api/signin', { email: 'cy@example.com' })).status).toBe(204)
  const code = codeOf('cy@example.com'), wrong = code === '123456' ? '654321' : '123456'
  for (let i = 0; i < 5; i++) {
    const r = await post('/api/verify', { email: 'cy@example.com', code: wrong })
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'That code is not right.' })
  }
  expect((await post('/api/verify', { email: 'cy@example.com', code })).status).toBe(400)
  for (const b of [{ email: 'cy@example.com', code: 'abc' }, { email: 'cy@example.com' }, { email: 1, code }, 'not json', [1]]) expect((await post('/api/verify', b)).status).toBe(400)
})

test('sign-in checks the email and never says whether it has an account', async () => {
  for (const b of [{ email: 'nope' }, { email: '' }, {}, { email: ['a@b.co'] }, 'not json', null]) expect((await post('/api/signin', b)).status).toBe(400)
  // Three accounts from one address today; asking for a code is the same 204 for a known email and a new one,
  // so existing users are never locked out; the fourth new account is refused at verify.
  for (const e of ['a1@example.com', 'a2@example.com', 'a3@example.com']) expect((await signIn(e, null)).status).toBe(200)
  expect((await signIn('a1@example.com', null)).status).toBe(200)
  const r = await signIn('a4@example.com', null)
  expect(r.status).toBe(429)
  expect(await r.json()).toEqual({ error: 'Sign-ups are full for today.' })
  // A second code for one email within a minute is refused.
  expect((await post('/api/signin', { email: 'a5@example.com' })).status).toBe(204)
  const again = await post('/api/signin', { email: 'a5@example.com' })
  expect(again.status).toBe(429)
  expect((await again.json() as any).error).toContain('wait a minute')
  // From another address, the new one signs up.
  clock.t += 60_000
  expect((await signIn('a4@example.com', null, '192.0.2.9')).status).toBe(200)
})

test('codes asked together cannot make a fourth account: 429 at verify', async () => {
  for (const e of ['b1@example.com', 'b2@example.com', 'b3@example.com', 'b4@example.com']) expect((await post('/api/signin', { email: e })).status).toBe(204)
  for (const e of ['b1@example.com', 'b2@example.com', 'b3@example.com']) expect((await post('/api/verify', { email: e, code: codeOf(e) })).status).toBe(200)
  expect((await post('/api/verify', { email: 'b4@example.com', code: codeOf('b4@example.com') })).status).toBe(429)
})

test('429 when the day\'s emails are used; 503 in production with no mail key, and the code is never logged', async () => {
  store.setCaps({ mailPerDay: 1 })
  expect((await post('/api/signin', { email: 'd@example.com' })).status).toBe(204)
  expect((await post('/api/signin', { email: 'd@example.com' })).status).toBe(429)

  make({ NODE_ENV: 'production' })
  const r = await post('/api/signin', { email: 'e@example.com' })
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ error: 'Sign-up is not set up yet.' })

  // Off production with no key the email is logged, code and all; in production it never is.
  make({})
  store.setCaps({ mailPerDay: 100 })
  expect((await post('/api/signin', { email: 'f@example.com' })).status).toBe(204)
  expect(logs.join('\n')).toContain('Your UX Woz code')
  logs = []
  const failing: Fetch = async () => new Response('nope', { status: 500 })
  routes = accountRoutes(store, { ...extras, io: { fetch: failing, env: { NODE_ENV: 'production', RESEND_API_KEY: 're_x' }, log: (m) => { logs.push(m) } } })
  expect((await post('/api/signin', { email: 'g@example.com' })).status).toBe(503)
  expect(logs.join('\n')).not.toMatch(/\d{6}/)
})

test('sign out deletes the session and clears the cookie', async () => {
  const t = cookieOf(await signIn('h@example.com', null))
  const r = await post('/api/signout', {}, t)
  expect(r.status).toBe(204)
  expect(r.headers.get('Set-Cookie')).toContain('Max-Age=0')
  expect(store.byToken(t)).toBeNull()
  expect((await post('/api/signout', {})).status).toBe(204)
})

test('delete-account: the right email deletes the file and every row; a wrong one or a visitor cannot', async () => {
  const t = cookieOf(await signIn('i@example.com', null))
  const id = store.byToken(t)!.id
  mockup(id, 'Dog walks', '<h1>dogs</h1>')
  expect((await post('/api/delete-account', { email: 'other@example.com' }, t)).status).toBe(400)
  expect((await post('/api/delete-account', {}, t)).status).toBe(400)
  expect(store.person(id)).not.toBeNull()
  const v = store.makeVisitor(ADDR)!
  expect((await post('/api/delete-account', { email: 'i@example.com' }, v.token)).status).toBe(403)
  expect((await post('/api/delete-account', { email: 'i@example.com' })).status).toBe(403)

  const r = await post('/api/delete-account', { email: ' I@example.com' }, t)
  expect(r.status).toBe(204)
  expect(r.headers.get('Set-Cookie')).toContain('Max-Age=0')
  expect(store.person(id)).toBeNull()
  expect(store.byToken(t)).toBeNull()
  expect(caches.has(id)).toBe(false)
})

test('ask: the owner hears at once; a second ask waits for the answer; a visitor must register', async () => {
  const t = cookieOf(await signIn('j@example.com', null))
  mails = []
  expect((await post('/api/ask', { note: '' }, t)).status).toBe(400)
  expect((await post('/api/ask', { note: 'x'.repeat(501) }, t)).status).toBe(400)
  expect((await post('/api/ask', {}, t)).status).toBe(400)
  expect((await post('/api/ask', { note: 'A vet clinic app' }, t)).status).toBe(204)
  expect(mails).toHaveLength(1)
  expect(mails[0]).toMatchObject({ to: [ADMIN], subject: 'UX Woz: j@example.com asks for more' })
  expect(mails[0]!.text).toContain('A vet clinic app')
  expect(mails[0]!.text).toContain('https://uxwoz.example/admin')
  const again = await post('/api/ask', { note: 'Please' }, t)
  expect(again.status).toBe(409)
  expect(mails).toHaveLength(1)

  const v = store.makeVisitor(ADDR)!
  const r = await post('/api/ask', { note: 'Hi' }, v.token)
  expect(r.status).toBe(403)
  expect(((await r.json()) as any).reason).toBe('register')
  expect((await post('/api/ask', { note: 'Hi' })).status).toBe(403)
})

test('the check\'s timer does not keep the process alive, and stop ends it', () => {
  const stop = startTopups(store, extras, 10)
  expect(typeof stop).toBe('function')
  stop()
})
