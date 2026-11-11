// The public app (spec/public.md: Modes, Who a request is, The meter, What a role may do, /api/me,
// /api/step, /api/config). No cassette: a fake provider whose every Haiku design costs $0.01.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScreenCache, type Fetch } from '@uxwoz/core'
import { people, type People } from '../packages/web/src/people.ts'
import { createServer } from '@uxwoz/web/src/server.ts'

const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const COST = 0.01
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: COST } })}\n\n`
const OWNER = { cookie: 'uxwoz_owner=sesame' }

/** Every call counted by provider; a screen waits for `gate` when one is set. Terra (filing) fails at once: its cost never arrives. */
let calls = { haiku: 0, terra: 0 }
let gate: Promise<void> | null = null
const fakeFetch: Fetch = async (url) => {
  if (String(url).includes('openai.com')) { calls.terra++; return new Response('down', { status: 503 }) }
  calls.haiku++
  if (gate) await gate
  return new Response(reply(`<title>Home</title><h1>Home ${Math.random()}</h1>`))
}

let server: ReturnType<typeof createServer> | null = null
let store: People
afterEach(() => { server?.stop(true); server = null; gate = null; calls = { haiku: 0, terra: 0 } })
const start = (o: { usersDir?: string; idleMs?: number; public?: boolean } = {}) => {
  store = people(':memory:')
  server = createServer({ port: 0, cache: new ScreenCache(), fetch: fakeFetch, env, log: () => {}, fileWaitMs: 0, public: true, owner: 'sesame', people: store, ...o })
  return server
}
const url = (p: string) => new URL(p, server!.url)

/** A browser: its cookie jar of one cookie, from a network address. */
function browser(ip = '10.0.0.1') {
  let cookie = ''
  const headers = (h: Record<string, string> = {}) => ({ 'x-real-ip': ip, ...(cookie && { cookie }), ...h })
  const keep = (res: Response) => { const c = res.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]!; return res }
  return {
    get cookie() { return cookie },
    set cookie(c: string) { cookie = c },
    get: async (p: string, h: Record<string, string> = {}) => keep(await fetch(url(p), { headers: headers(h) })),
    post: async (p: string, body: object, h: Record<string, string> = {}) => keep(await fetch(url(p), { method: 'POST', headers: headers({ 'Content-Type': 'application/json', ...h }), body: JSON.stringify(body) })),
    me: async function () { return (await this.get('/api/me')).json() },
  }
}
type Browser = ReturnType<typeof browser>
const lines = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
/** A new screen's two designs; returns its key, or the status when refused. */
async function screen(b: Browser, app: string, extra: object = {}) {
  const res = await b.post('/api/screen', { app, ...extra })
  if (res.status !== 200) return { status: res.status, body: await res.json() }
  const evs = await lines(res)
  return { status: 200, key: evs[0].key as string, done: evs.at(-1) }
}
const personOf = (b: Browser) => store.byToken(b.cookie.split('=')[1]!)!

describe('public mode', () => {
  test('UXWOZ_PUBLIC without an owner refuses to start', () => {
    expect(() => createServer({ port: 0, public: true, owner: '' })).toThrow('UXWOZ_OWNER')
  })

  test('a visitor\'s first screen makes the visitor and its cookie; /api/me and /api/config answer for them', async () => {
    start()
    const ana = browser()
    expect(await ana.me()).toMatchObject({ role: 'new', left: 0.1, allowance: 0.1, screensLeft: 14, paused: false, may: { share: false, exportZip: false } })
    // With no person yet: an empty Recent, nothing else, and a warm-up that calls nothing.
    expect(await (await ana.get('/api/apps')).json()).toEqual({ apps: [] })
    expect((await ana.get('/api/map?app=x')).status).toBe(401)
    expect((await ana.post('/api/warmup', {})).status).toBe(204)
    expect((await ana.post('/api/step', { step: 'arrived' })).status).toBe(204)
    expect(calls.haiku).toBe(0)
    expect(ana.cookie).toBe('')

    const res = await ana.post('/api/screen', { app: 'A dog walking app' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/^uxwoz_who=[a-f0-9]{32}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=31536000$/)
    expect((await lines(res)).at(-1).type).toBe('done')
    expect(calls.haiku).toBe(2)
    const me = await ana.me()
    expect(me).toMatchObject({ role: 'visitor', allowance: 0.1, screensLeft: 11 })
    expect(me.left).toBeCloseTo(0.08, 6)
    expect(me.email).toBeUndefined()
    // `arrived` came before there was a person: counted for the day only.
    expect(personOf(ana).steps).toEqual(['own'])
    const cfg = await (await ana.get('/api/config')).json()
    expect(cfg).toMatchObject({ public: true, defaultModel: 'claude-haiku-5.5' })
    expect(cfg.models.map((m: any) => m.id)).toEqual(['claude-haiku-5.5'])
    expect(cfg.starters.length).toBe(8)
    // The owner sees every model, and has no meter.
    const owner = await (await fetch(url('/api/config'), { headers: OWNER })).json()
    expect(owner.models.length).toBeGreaterThan(1)
    expect(await (await fetch(url('/api/me'), { headers: OWNER })).json()).toMatchObject({ role: 'owner' })
    // A cross-site first POST makes nobody.
    const evil = browser('10.0.0.9')
    expect((await evil.post('/api/screen', { app: 'x' }, { origin: 'https://evil.example' })).status).toBe(403)
    expect(evil.cookie).toBe('')
  })

  test('the meter runs to zero, then each 402 reason in its order', async () => {
    start()
    store.setCaps({ visitor: 0.03 })
    const ana = browser()
    expect((await screen(ana, 'App one')).status).toBe(200)
    expect((await screen(ana, 'App two')).status).toBe(200)
    expect(personOf(ana).spent).toBeCloseTo(0.04, 6)
    expect((await ana.me()).left).toBe(0)
    const r = await screen(ana, 'App three')
    expect(r).toMatchObject({ status: 402, body: { reason: 'allowance', error: 'Your free screens are used up.' } })
    expect(personOf(ana).steps).toContain('limit')
    // A cache hit is free.
    expect((await screen(ana, 'App one')).status).toBe(200)
    // An Edit is paid too.
    expect((await ana.post('/api/revise', { key: 'app one', change: 'bigger' })).status).toBe(402)
    // Paused comes before allowance; blocked before both.
    store.setMode('starters')
    expect((await screen(ana, 'App three')).body).toMatchObject({ reason: 'paused' })
    expect((await ana.me()).paused).toBe(true)
    store.block(personOf(ana).id, true)
    expect((await screen(ana, 'App three')).body).toMatchObject({ reason: 'blocked', error: 'This account is closed.' })
    store.setMode('open')
    // Visitors from one address share its day's dollars: a new visitor there is refused at once.
    store.setCaps({ visitor: 1, addressUsd: 0.04 })
    const bo = browser()
    expect((await screen(bo, 'Bo\'s app')).body).toMatchObject({ reason: 'address' })
    expect(bo.cookie).toMatch(/^uxwoz_who=/)
    // Another address is fine.
    expect((await screen(browser('10.0.0.2'), 'Cy\'s app')).status).toBe(200)
    // The day's cap pauses everyone.
    store.setCaps({ dayUsd: 0.05 })
    expect((await screen(browser('10.0.0.3'), 'Di\'s app')).body).toMatchObject({ reason: 'paused' })
  })

  test('the 21st new visitor from an address gets 402 address', async () => {
    start()
    store.setCaps({ addressVisitors: 1 })
    expect((await screen(browser(), 'One')).status).toBe(200)
    expect((await screen(browser(), 'Two')).body).toMatchObject({ reason: 'address' })
  })

  test('one paid request at a time (409); background work stops at zero', async () => {
    start()
    const ana = browser()
    expect((await screen(ana, 'First')).status).toBe(200)
    let release!: () => void
    gate = new Promise((r) => (release = r))
    const slow = ana.post('/api/screen', { app: 'Second' })
    await Bun.sleep(50)
    const busy = await ana.post('/api/screen', { app: 'Third' })
    expect(busy.status).toBe(409)
    expect((await busy.json()).error).toBe('One at a time: wait for this one.')
    // Another person is not held.
    gate = null
    expect((await screen(browser('10.0.0.5'), 'Elsewhere')).status).toBe(200)
    release()
    await (await slow).text()
    expect((await screen(ana, 'Third')).status).toBe(200)
    // A pick files in the background while the balance is above zero...
    const first = await ana.post('/api/pick', { key: 'first', index: 0 })
    expect(first.status).toBe(200)
    await ana.get('/api/map?app=First&wait=1')
    expect(calls.terra).toBe(1)
    expect(personOf(ana).steps).toContain('picked')
    // The failed filing's cost never arrived: it is charged $0.002. With none left, the pick itself still works
    // (drawing's `may` keeps its filing from starting: tested with drawing).
    expect(personOf(ana).spent).toBeCloseTo(6 * COST + 0.002, 6)
    store.give(personOf(ana).id, -1)
    expect((await ana.post('/api/pick', { key: 'second', index: 0 })).status).toBe(200)
  })

  test('two visitors never see each other\'s mockups', async () => {
    start()
    const ana = browser('10.0.1.1'), bo = browser('10.0.1.2')
    await screen(ana, 'A sleep tracker')
    await ana.post('/api/pick', { key: 'a sleep tracker', index: 0 })
    expect((await (await bo.get('/api/apps')).json()).apps).toEqual([])
    await screen(bo, 'Bo alone')
    expect((await (await bo.get('/api/apps')).json()).apps.map((a: any) => a.app)).toEqual(['Bo alone'])
    expect((await (await bo.get('/api/map?app=A%20sleep%20tracker')).json()).entries).toEqual([])
    // The same prompt is no cache hit for Bo: he pays for his own.
    const before = personOf(bo).spent
    expect((await lines(await bo.post('/api/screen', { app: 'A sleep tracker' })))[0].cached).toBe(false)
    expect(personOf(bo).spent).toBeGreaterThan(before)
    // A cookie that is not a session is nobody; the owner's cache saw neither.
    const fake = browser('10.0.1.3'); fake.cookie = `uxwoz_who=${'0'.repeat(32)}`
    expect((await fake.me()).role).toBe('new')
    expect((await (await fetch(url('/api/apps'), { headers: OWNER })).json()).apps).toEqual([])
  })

  test('the role table, and another model refused', async () => {
    start()
    const ana = browser()
    await screen(ana, 'Mine')
    await ana.post('/api/pick', { key: 'mine', index: 0 })
    const register = { status: 403, reason: 'register' }
    const status = async (p: Promise<Response>) => { const r = await p; return { status: r.status, reason: (await r.json().catch(() => ({}))).reason } }
    expect(await status(ana.post('/api/share', { app: 'Mine', role: 'view' }))).toEqual(register)
    expect(await status(ana.post('/api/share', { app: 'Mine', role: 'comment' }))).toEqual(register)
    expect(await status(ana.get('/api/shares?app=Mine'))).toEqual(register)
    expect(await status(ana.post('/api/unshare', { token: 'ab' }))).toEqual(register)
    expect(await status(ana.post('/api/feedback', { app: 'Mine', id: 'x' }))).toEqual(register)
    expect(await status(ana.get('/api/export?app=Mine'))).toEqual(register)
    expect(await status(ana.post('/api/share', { app: 'Mine', role: 'edit' }))).toEqual({ status: 403, reason: undefined })
    expect(await status(ana.get('/api/backup'))).toEqual({ status: 403, reason: undefined })
    expect((await ana.get('/design')).status).toBe(403)
    // Free routes on her own cache work.
    expect((await ana.post('/api/box', { app: 'Mine', op: 'add', box: 'rules', text: 'Buttons are round.' })).status).toBe(200)
    // Haiku only.
    for (const path of ['/api/screen', '/api/warmup']) expect((await ana.post(path, { app: 'Other', model: 'gpt-6-luna-fast' })).status).toBe(403)
    expect((await ana.post('/api/revise', { key: 'mine', model: 'gpt-6.1-sol-ultrafast' })).status).toBe(403)
    // Registered: view and comment links, the export; still no edit link, no backup.
    const { code } = store.makeCode('ana@example.com', personOf(ana).id, '10.0.0.1') as { code: string }
    expect(store.verify('ana@example.com', code, personOf(ana).id, '10.0.0.1')).toMatchObject({ merged: null })
    expect(await ana.me()).toMatchObject({ role: 'user', email: 'ana@example.com', may: { share: true, exportZip: true } })
    expect((await ana.post('/api/share', { app: 'Mine', role: 'view' })).status).toBe(200)
    expect((await ana.get('/api/export?app=Mine')).status).toBe(200)
    expect(await status(ana.post('/api/share', { app: 'Mine', role: 'edit' }))).toEqual({ status: 403, reason: undefined })
    expect((await ana.get('/api/backup')).status).toBe(403)
    // The owner may do all of it.
    expect((await fetch(url('/api/backup'), { headers: OWNER })).status).toBe(200)
  })

  test('a warm-up calls Haiku only when none ran in the last 4 minutes', async () => {
    start()
    const ana = browser()
    await screen(ana, 'Warm')
    const n = calls.haiku
    expect((await ana.post('/api/warmup', {})).status).toBe(204)
    expect(calls.haiku).toBe(n)
    store.db.query('UPDATE calls SET at = at - 300000').run()
    expect((await ana.post('/api/warmup', {})).status).toBe(204)
    await Bun.sleep(30)
    expect(calls.haiku).toBe(n + 1)
  })

  test('a file past 5 MB takes no new screen', async () => {
    start()
    const ana = browser()
    await screen(ana, 'Big')
    const cache = server!.desks.desk(personOf(ana).id)!.cache
    cache.propose('Big', null, 0, { html: 'x'.repeat(5_300_000), createdAt: new Date().toISOString(), model: 'claude-haiku-5.5', costUsd: 0, name: 'Home' } as any)
    expect((await screen(ana, 'Another')).status).toBe(413)
  })

  test('a share link works after its desk closed; the index follows unshare and delete', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uxwoz-public-'))
    start({ usersDir: dir, idleMs: 10 })
    const ana = browser()
    await screen(ana, 'Shared')
    await ana.post('/api/pick', { key: 'shared', index: 0 })
    await ana.get('/api/map?app=Shared&wait=1')
    const { code } = store.makeCode('ana@example.com', personOf(ana).id, '10.0.0.1') as { code: string }
    store.verify('ana@example.com', code, personOf(ana).id, '10.0.0.1')
    const view = await (await ana.post('/api/share', { app: 'Shared', role: 'view' })).json()
    const other = await (await ana.post('/api/share', { app: 'Shared', role: 'comment' })).json()
    expect(store.shareOwner(view.token)).toBe(personOf(ana).id)
    server!.desks.sweep(Date.now() + 3_600_000)
    expect(server!.desks.open()).toEqual([])
    // A stranger with no cookie opens it: the desk opens again.
    const map = await fetch(url(`/api/s/${view.token}/map`))
    expect(map.status).toBe(200)
    expect((await map.json()).screens.length).toBe(1)
    expect((await fetch(url(`/s/${view.token}`))).status).toBe(200)
    expect(server!.desks.open()).toEqual([personOf(ana).id])
    expect((await ana.post('/api/unshare', { token: view.token })).status).toBe(200)
    expect(store.shareOwner(view.token)).toBeNull()
    expect((await fetch(url(`/api/s/${view.token}/map`))).status).toBe(404)
    expect((await ana.post('/api/delete-app', { app: 'Shared' })).status).toBe(200)
    expect(store.shareOwner(other.token)).toBeNull()
    // The owner's links still work, and are not in the index.
    const o = (p: string, body: object) => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json', ...OWNER }, body: JSON.stringify(body) })
    const ev = await lines(await o('/api/screen', { app: 'The owner\'s' }))
    expect((await o('/api/pick', { key: ev[0].key, index: 0 })).status).toBe(200)
    const link = await (await o('/api/share', { app: 'The owner\'s', role: 'edit' })).json()
    expect(store.shareOwner(link.token)).toBeNull()
    // The owner may use any model.
    expect((await o('/api/warmup', { model: 'gpt-6-luna-fast' })).status).toBe(204)
    expect((await fetch(url(`/api/s/${link.token}/map`))).status).toBe(200)
    // Through the owner's edit link a stranger works on the owner's mockup, as today.
    expect((await browser().get('/api/apps', { 'x-uxwoz-share': link.token })).status).toBe(200)
  })

  test('the page is open to everyone; the design sheet is the owner\'s', async () => {
    start()
    expect((await fetch(url('/'))).status).toBe(200)
    expect((await fetch(url('/design'))).status).toBe(403)
    expect((await fetch(url('/design'), { headers: OWNER })).status).toBe(200)
  })
})

describe('private mode', () => {
  test('nothing of the public: /api/me is the owner, no cookie, every model', async () => {
    server = createServer({ port: 0, cache: new ScreenCache(), fetch: fakeFetch, env, log: () => {}, fileWaitMs: 0, public: false, owner: '' })
    expect(await (await fetch(url('/api/me'))).json()).toEqual({ role: 'owner' })
    expect((await fetch(url('/api/step'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"step":"arrived"}' })).status).toBe(204)
    const cfg = await (await fetch(url('/api/config'))).json()
    expect(cfg.public).toBeUndefined()
    expect(cfg.starters).toBeUndefined()
    expect(cfg.models.length).toBeGreaterThan(1)
    const res = await fetch(url('/api/screen'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Private', model: 'gpt-6-luna-fast' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    await res.text()
    expect(server.people).toBeNull()
  })
})
