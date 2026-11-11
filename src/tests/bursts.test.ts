// Bursts against the meter (spec/public.md, The meter): every live call is checked when it is about to be sent, so
// requests sent together, background work and races cannot spend past the allowance by more than one reservation.
// No cassette: a fake provider whose Haiku designs cost $0.003; Terra waits for `gate` when one is set, then fails
// (its cost never arrives: $0.002). Replays do not wait.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { STARTERS, ScreenCache, type Fetch } from '@uxwoz/core'
import { RESERVE_USD, people, type People } from '../packages/web/src/people.ts'
import { createServer } from '@uxwoz/web/src/server.ts'

const COST = 0.003
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: COST } })}\n\n`
const starter = (id: string) => STARTERS.find((s) => s.id === id)!.prompt

let calls = { haiku: 0, terra: 0 }
let gate: Promise<void> | null = null
/** Haiku waits this long before it answers: requests sent together then all start before any ends. */
let slowMs = 0
const fakeFetch: Fetch = async (url) => {
  if (String(url).includes('openai.com')) { calls.terra++; if (gate) await gate; return new Response('down', { status: 503 }) }
  calls.haiku++
  if (slowMs) await Bun.sleep(slowMs)
  return new Response(reply(`<title>Home</title><h1>Home ${Math.random()}</h1>`))
}

let server: ReturnType<typeof createServer> | null = null
let store: People
beforeEach(() => { calls = { haiku: 0, terra: 0 }; gate = null; slowMs = 0 })
afterEach(() => { server?.stop(true); server = null })
function start(o: { env?: Record<string, string>; fileWaitMs?: number } = {}) {
  store = people(':memory:')
  server = createServer({ port: 0, cache: new ScreenCache(), fetch: fakeFetch, env: o.env ?? env, log: () => {}, fileWaitMs: o.fileWaitMs ?? 0, sleep: async () => {}, public: true, owner: 'sesame', people: store })
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
type Browser = ReturnType<typeof browser>
const lines = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
const personOf = (b: Browser) => store.byToken(b.cookie.split('=')[1]!)!
const callRows = () => (store.db.query('SELECT COUNT(*) AS n FROM calls').get() as { n: number }).n
/** A starter's Home drawn and its first design picked, both from the recording; its key. */
async function starterHome(b: Browser, id: string) {
  const evs = await lines(await b.post('/api/screen', { app: starter(id) }))
  expect((await b.post('/api/pick', { key: evs[0].key, index: 0 })).status).toBe(200)
  await b.get(`/api/map?app=${encodeURIComponent(starter(id))}&wait=1`)
  return evs[0].key as string
}
/** Lets the background work run (warm-ups, visits answer before their calls). */
const settle = () => Bun.sleep(30)

describe('bursts against the meter', () => {
  test('30 warm-ups at once after a free starter make one Haiku call', async () => {
    start()
    const ana = browser()
    await starterHome(ana, 'plants')
    expect(calls.haiku).toBe(0)
    slowMs = 50
    const all = await Promise.all(Array.from({ length: 30 }, () => ana.post('/api/warmup', {})))
    expect(all.every((r) => r.status === 204)).toBe(true)
    await Bun.sleep(100)
    expect(calls.haiku).toBe(1)
  })

  test('25 Regenerates judged replayed while a live filing runs wake to an Edit and go live: spend stays within the allowance and one reservation', async () => {
    start({ fileWaitMs: 300 })
    store.setCaps({ visitor: 0.02 })
    const ana = browser()
    const key = await starterHome(ana, 'plants')
    let open!: () => void
    gate = new Promise((r) => { open = r })
    // An Edit goes live; its filing hangs on Terra. Undo it: the newest is the recording's again.
    expect((await lines(await ana.post('/api/revise', { key, change: 'bigger' }))).at(-1).type).toBe('done')
    expect((await ana.post('/api/undo', { key })).status).toBe(200)
    // A second Edit waits for the filing; 25 Regenerates sent meanwhile are judged replayed (no meter, no hold)
    // and wait too. They wake to the second Edit as the newest version, find no recording, and go live.
    const edit = ana.post('/api/revise', { key, change: 'greener' }).then(lines)
    await Bun.sleep(5)
    const regenerates = Array.from({ length: 25 }, () => ana.post('/api/revise', { key }).then(lines))
    expect((await edit).at(-1).type).toBe('done')
    open()
    const outs = await Promise.all(regenerates)
    await ana.get(`/api/map?app=${encodeURIComponent(starter('plants'))}&wait=1`)
    await settle()
    const p = personOf(ana)
    // Some went live and some were refused when their call was about to be sent.
    expect(calls.haiku).toBeGreaterThan(3)
    expect(outs.some((o) => o.at(-1).type === 'error')).toBe(true)
    expect(p.spent).toBeLessThanOrEqual(p.allowance + RESERVE_USD + 1e-9)
    expect(callRows()).toBe(calls.haiku + calls.terra)
  })

  test('4 Visit nows at once on four starters: none at zero, one when less than a reservation is left; a refused call charges nothing', async () => {
    start()
    const ana = browser()
    const ids = ['plants', 'bill', 'recipes', 'words']
    for (const id of ids) await starterHome(ana, id)
    const p = personOf(ana)
    store.give(p.id, -p.allowance)
    const visit = () => Promise.all(ids.map((id) => ana.post('/api/box', { app: starter(id), box: 'rules', op: 'visit' })))
    expect((await visit()).map((r) => r.status)).toEqual([402, 402, 402, 402])
    await settle()
    expect(calls.terra).toBe(0)

    store.give(p.id, 0.001)
    let open!: () => void
    gate = new Promise((r) => { open = r })
    await visit()
    await settle()
    expect(calls.terra).toBe(1)
    open()
    await settle()
    expect(callRows()).toBe(1)
    expect(personOf(ana).spent).toBeCloseTo(0.002, 6)
  })

  test('with $0.004 left an A OR B still gets both designs; then 402', async () => {
    start()
    store.setCaps({ visitor: RESERVE_USD })
    const ana = browser()
    const evs = await lines(await ana.post('/api/screen', { app: 'Dog walks' }))
    expect(evs.filter((e) => e.type === 'version')).toHaveLength(2)
    expect(calls.haiku).toBe(2)
    expect((await ana.post('/api/screen', { app: 'Cat sits' })).status).toBe(402)
  })

  test('a call that fails before it is sent (no key) costs nothing', async () => {
    start({ env: {} })
    const ana = browser()
    const evs = await lines(await ana.post('/api/screen', { app: 'Dog walks' }))
    expect(evs.some((e) => e.type === 'failed')).toBe(true)
    expect(personOf(ana).spent).toBe(0)
    expect(callRows()).toBe(0)
  })

  test('X-Forwarded-For counts by its last value, the one the proxy added', async () => {
    store = people(':memory:')
    server = createServer({ port: 0, cache: new ScreenCache(), fetch: fakeFetch, env, log: () => {}, fileWaitMs: 0, public: true, owner: 'sesame', people: store, addressHeader: 'x-forwarded-for' })
    const admin = await (await fetch(url('/api/admin'), { headers: { cookie: 'uxwoz_owner=sesame', 'x-forwarded-for': '1.2.3.4, 203.0.113.9' } })).json() as any
    expect(admin.address).toBe('203.0.113.9')
  })
})
