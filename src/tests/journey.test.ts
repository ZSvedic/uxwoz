// A person's journey over HTTP in public mode (spec/public.md): a starter for free, an own prompt down to zero,
// sign-up and the waiting top-up, a quota request; and around it the code limits, a second browser, delete-account,
// the owner's pages, the backup zip and the idle sweep. No cassette: a fake provider whose Haiku designs cost $0.02,
// Terra failing at once (its cost never arrives), Resend caught, the store's clock injected, replays that do not wait.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { STARTERS, ScreenCache, type Fetch } from '@uxwoz/core'
import { people, type People } from '../packages/web/src/people.ts'
import { createServer } from '@uxwoz/web/src/server.ts'

const COST = 0.02
const ADMIN = 'owner@example.com'
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake', RESEND_API_KEY: 're_test', UXWOZ_ADMIN_EMAIL: ADMIN, UXWOZ_URL: 'https://woz.test/' }
const OWNER = { cookie: 'uxwoz_owner=sesame' }
const PLANTS = STARTERS.find((s) => s.id === 'plants')!.prompt
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: COST } })}\n\n`

let calls = { haiku: 0, terra: 0 }
let mails: { to: string[]; subject: string; text: string }[] = []
const fakeFetch: Fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('resend.com')) { mails.push(JSON.parse(String(init!.body))); return new Response('{"id":"m"}') }
  if (u.includes('openai.com')) { calls.terra++; return new Response('down', { status: 503 }) }
  calls.haiku++
  return new Response(reply(`<title>Home</title><h1>Home ${Math.random()}</h1>`))
}

let server: ReturnType<typeof createServer> | null = null
let store: People
let clock: { t: number }
let dir: string
beforeEach(() => { calls = { haiku: 0, terra: 0 }; mails = []; clock = { t: Date.parse('2026-11-11T10:00:00Z') } })
afterEach(() => { server?.stop(true); server = null })
function start() {
  store = people(':memory:', { now: () => new Date(clock.t) })
  dir = mkdtempSync(join(tmpdir(), 'uxwoz-journey-'))
  server = createServer({ port: 0, cache: new ScreenCache(), fetch: fakeFetch, env, log: () => {}, fileWaitMs: 0, sleep: async () => {}, public: true, owner: 'sesame', people: store, usersDir: dir })
  return server
}
const url = (p: string) => new URL(p, server!.url)

/** A browser: one cookie, from a network address. */
function browser(ip = '10.0.0.1') {
  let cookie = ''
  const headers = (h: Record<string, string> = {}) => ({ 'x-real-ip': ip, ...(cookie && { cookie }), ...h })
  const keep = (res: Response) => { const c = res.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]!; return res }
  return {
    get cookie() { return cookie },
    get: async (p: string) => keep(await fetch(url(p), { headers: headers() })),
    post: async (p: string, body: object) => keep(await fetch(url(p), { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })),
    me: async function () { return (await this.get('/api/me')).json() as Promise<any> },
  }
}
type Browser = ReturnType<typeof browser>
const owner = {
  get: (p: string) => fetch(url(p), { headers: OWNER }),
  post: (p: string, body: object) => fetch(url(p), { method: 'POST', headers: { ...OWNER, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
}
const lines = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
async function screen(b: Browser, app: string) {
  const res = await b.post('/api/screen', { app })
  if (res.status !== 200) return { status: res.status, body: await res.json() as any }
  const evs = await lines(res)
  return { status: 200, key: evs[0].key as string, body: evs.at(-1) }
}
const personOf = (b: Browser) => store.byToken(b.cookie.split('=')[1]!)!
const codeOf = (email: string) => mails.findLast((m) => m.to[0] === email && m.subject.startsWith('Your UX Woz code'))!.subject.slice(-6)
async function signUp(b: Browser, email: string) {
  expect((await b.post('/api/signin', { email })).status).toBe(204)
  const r = await b.post('/api/verify', { email, code: codeOf(email) })
  expect(r.status).toBe(200)
  return (await r.json() as any).me
}
const callRows = () => (store.db.query('SELECT COUNT(*) AS n FROM calls').get() as { n: number }).n
const fileOf = (id: string) => join(dir, `${id}.json`)

describe('a person\'s journey', () => {
  test('a starter for free, an own prompt to zero, sign-up, the top-up after 12 hours, a paid call, a request approved', async () => {
    start()
    const ana = browser()
    // No cookie: the starter makes the visitor, replays its recording and costs nothing.
    const home = await screen(ana, PLANTS)
    expect(home.status).toBe(200)
    expect(ana.cookie).toMatch(/^uxwoz_who=[a-f0-9]{32}$/)
    const pick = await ana.post('/api/pick', { key: home.key, index: 0 })
    expect(pick.status).toBe(200)
    await ana.get(`/api/map?app=${encodeURIComponent(PLANTS)}&wait=1`)
    expect(calls).toEqual({ haiku: 0, terra: 0 })
    expect(callRows()).toBe(0)
    expect(personOf(ana)).toMatchObject({ spent: 0, steps: ['starter', 'picked'] })

    // An own prompt is live and paid, down to zero; then 402.
    for (const app of ['Dog walks', 'Cat sits', 'Bird feeds']) expect((await screen(ana, app)).status).toBe(200)
    expect(personOf(ana).spent).toBeCloseTo(0.12, 6)
    expect(await ana.me()).toMatchObject({ role: 'visitor', left: 0, screensLeft: 0 })
    expect(await screen(ana, 'Fish tanks')).toMatchObject({ status: 402, body: { reason: 'allowance' } })
    expect(personOf(ana).steps).toEqual(['starter', 'picked', 'own', 'limit'])

    // Sign up: nothing is granted at verify.
    const me = await signUp(ana, 'ana@example.com')
    expect(me).toMatchObject({ role: 'user', email: 'ana@example.com', left: 0, allowance: 0.1, topupDue: clock.t + 12 * 3600_000 })
    expect(await screen(ana, 'Fish tanks')).toMatchObject({ status: 402, body: { reason: 'allowance' } })
    await server!.tick.topups()
    expect(personOf(ana).topupDue).not.toBeNull()

    // The tick after 12 hours grants the top-up and emails it, with the app's address.
    clock.t += 12 * 3600_000
    await server!.tick.topups()
    expect(personOf(ana)).toMatchObject({ allowance: 0.25, topupDue: null })
    const ready = mails.findLast((m) => m.to[0] === 'ana@example.com')!
    expect(ready.subject).toBe('Your free screens are ready')
    expect(ready.text).toContain('https://woz.test/')
    expect((await screen(ana, 'Fish tanks')).status).toBe(200)

    // Ask for more; the owner gets it, approves it, and the answer is emailed.
    expect((await ana.post('/api/ask', { note: 'A shop for my bakery' })).status).toBe(204)
    expect(mails.at(-1)).toMatchObject({ to: [ADMIN] })
    expect(mails.at(-1)!.text).toContain('https://woz.test/admin')
    const admin = await (await owner.get('/api/admin')).json() as any
    const request = admin.requests[0]
    expect(request).toMatchObject({ email: 'ana@example.com', note: 'A shop for my bakery', answer: null })
    const answered = await owner.post('/api/admin', { op: 'answer', request: request.id, approved: true })
    expect(answered.status).toBe(200)
    expect(mails.at(-1)!.to).toEqual(['ana@example.com'])
    expect(personOf(ana).allowance).toBeCloseTo(0.75, 6)
    expect((await ana.me()).request).toMatchObject({ answer: 'approved' })
  })

  test('at zero a pick starts no filing, and Visit now is refused', async () => {
    start()
    store.setCaps({ visitor: 0.03 })
    const ana = browser()
    const s = await screen(ana, 'Dog walks')
    expect(s.status).toBe(200)
    expect(personOf(ana).spent).toBeCloseTo(0.04, 6)
    const pick = await ana.post('/api/pick', { key: s.key, index: 0 })
    expect(await pick.json()).toMatchObject({ filing: false, visiting: false })
    expect((await ana.post('/api/box', { app: 'Dog walks', box: 'rules', op: 'visit' })).status).toBe(402)
    expect(calls.terra).toBe(0)
  })

  test('a second browser signs in and gets the first one\'s mockups; a visitor\'s own move in', async () => {
    start()
    const ana = browser()
    expect((await screen(ana, 'Dog walks')).status).toBe(200)
    await signUp(ana, 'ana@example.com')
    const id = personOf(ana).id

    // A browser with no cookie may sign in.
    const phone = browser()
    await signUp(phone, 'ana@example.com')
    expect(personOf(phone).id).toBe(id)
    expect((await (await phone.get('/api/apps')).json() as any).apps.map((a: any) => a.app)).toEqual(['Dog walks'])

    // A visitor with a mockup of their own signs in: it moves in, the visitor and their file go.
    const laptop = browser('10.0.0.2')
    expect((await screen(laptop, 'Cat sits')).status).toBe(200)
    const visitor = personOf(laptop).id
    await server!.desks.desk(visitor)!.cache.save()
    expect(existsSync(fileOf(visitor))).toBe(true)
    await signUp(laptop, 'ana@example.com')
    expect(personOf(laptop).id).toBe(id)
    expect((await (await laptop.get('/api/apps')).json() as any).apps.map((a: any) => a.app).sort()).toEqual(['Cat sits', 'Dog walks'])
    expect(store.person(visitor)).toBeNull()
    expect(existsSync(fileOf(visitor))).toBe(false)
    expect(server!.desks.open()).not.toContain(visitor)
  })

  test('delete-account leaves no file and no row', async () => {
    start()
    const ana = browser()
    expect((await screen(ana, 'Dog walks')).status).toBe(200)
    await signUp(ana, 'ana@example.com')
    const id = personOf(ana).id
    server!.desks.desk(id)!.cache.save()
    expect(existsSync(fileOf(id))).toBe(true)
    expect((await ana.post('/api/delete-account', { email: 'bo@example.com' })).status).toBe(400)
    const r = await ana.post('/api/delete-account', { email: 'ana@example.com' })
    expect(r.status).toBe(204)
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(existsSync(fileOf(id))).toBe(false)
    const tables = store.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    for (const { name } of tables) expect(JSON.stringify(store.db.query(`SELECT * FROM ${name}`).all())).not.toContain(id)
    // Its calls stay, with no person, so the day's sums hold.
    expect(callRows()).toBe(2)
    expect((await ana.me()).role).toBe('new')
  })

  test('sign-in codes: one a minute for an email, 10 a day for a network', async () => {
    start()
    const b = browser()
    expect((await b.post('/api/signin', { email: 'a@example.com' })).status).toBe(204)
    expect((await b.post('/api/signin', { email: 'a@example.com' })).status).toBe(429)
    for (let n = 2; n <= 10; n++) expect((await b.post('/api/signin', { email: `n${n}@example.com` })).status).toBe(204)
    const r = await b.post('/api/signin', { email: 'late@example.com' })
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ error: 'Sign-ups are full for today.' })
    expect((await browser('10.0.0.3').post('/api/signin', { email: 'late@example.com' })).status).toBe(204)
  })

  test('/admin and /api/admin are the owner\'s; /privacy is everyone\'s', async () => {
    start()
    const ana = browser()
    expect((await screen(ana, 'Dog walks')).status).toBe(200)
    expect((await ana.get('/admin')).status).toBe(403)
    expect((await ana.get('/api/admin')).status).toBe(403)
    expect((await ana.post('/api/admin', { op: 'mode', mode: 'starters' })).status).toBe(403)
    expect((await browser('10.0.0.4').get('/api/admin')).status).toBe(401)
    expect(store.settings().mode).toBe('open')
    expect((await owner.get('/admin')).status).toBe(200)
    expect(await (await owner.get('/api/admin')).json()).toMatchObject({ address: '127.0.0.1', mode: 'open' })
    const privacy = await browser('10.0.0.5').get('/privacy')
    expect(privacy.status).toBe(200)
    expect(await privacy.text()).toContain('<')
  })

  test('the owner\'s backup is a zip of the cache, the database and every person\'s file; a person gets none', async () => {
    start()
    const ana = browser(), bo = browser('10.0.0.2')
    expect((await screen(ana, 'Dog walks')).status).toBe(200)
    expect((await screen(bo, 'Cat sits')).status).toBe(200)
    server!.desks.desk(personOf(bo).id)!.cache.save()
    server!.desks.sweep(Date.now() + 3600_000)
    expect(server!.desks.open()).not.toContain(personOf(bo).id)
    expect((await ana.get('/api/backup')).status).toBe(403)
    const res = await owner.get('/api/backup')
    expect(res.headers.get('content-type')).toBe('application/zip')
    const files = unzip(new Uint8Array(await res.arrayBuffer()))
    expect([...files.keys()].sort()).toEqual(['screen-cache.json', `users/${personOf(ana).id}.json`, `users/${personOf(bo).id}.json`, 'uxwoz.db'].sort())
    expect(new TextDecoder().decode(files.get(`users/${personOf(bo).id}.json`))).toContain('Cat sits')
    const db = Database.deserialize(files.get('uxwoz.db')!)
    expect((db.query('SELECT COUNT(*) AS n FROM people').get() as { n: number }).n).toBe(2)
  })

  test('once a day, visitors idle for 30 days lose their file and rows; a user stays', async () => {
    start()
    const ana = browser(), bo = browser('10.0.0.2')
    expect((await screen(ana, 'Dog walks')).status).toBe(200)
    expect((await screen(bo, 'Cat sits')).status).toBe(200)
    await signUp(bo, 'bo@example.com')
    const a = personOf(ana).id, b = personOf(bo).id
    for (const id of [a, b]) server!.desks.desk(id)!.cache.save()
    clock.t += 29 * 86_400_000
    expect(await server!.tick.idle()).toEqual([])
    clock.t += 2 * 86_400_000
    expect(await server!.tick.idle()).toEqual([a])
    expect(store.person(a)).toBeNull()
    expect(existsSync(fileOf(a))).toBe(false)
    expect(store.person(b)).not.toBeNull()
    expect(existsSync(fileOf(b))).toBe(true)
  })
})

/** A zip's stored entries by name (zip.ts writes them uncompressed). */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Map<string, Uint8Array>()
  for (let i = 0; v.getUint32(i, true) === 0x04034b50;) {
    const size = v.getUint32(i + 18, true), n = v.getUint16(i + 26, true), x = v.getUint16(i + 28, true)
    const name = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + n))
    out.set(name, bytes.subarray(i + 30 + n + x, i + 30 + n + x + size))
    i += 30 + n + x + size
  }
  return out
}
