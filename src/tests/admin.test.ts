// The admin's routes over a store in memory: each op, its bad inputs, the emails it sends (a fake fetch), the pages.
import { beforeEach, expect, test } from 'bun:test'
import type { Fetch } from '@uxwoz/core'
import { adminRoutes, type AdminExtras } from '../packages/web/src/admin.ts'
import { RESEND_URL } from '../packages/web/src/mail.ts'
import { people, type People } from '../packages/web/src/people.ts'

const ADDR = '203.0.113.7'
let clock = { t: Date.parse('2026-11-11T10:00:00Z') }
let store: People
let mails: { to: string[]; subject: string; text: string }[]
let deleted: string[]
let routes: ReturnType<typeof adminRoutes>

function make(env: Record<string, string> = { RESEND_API_KEY: 're_test' }, extra: Partial<AdminExtras> = {}) {
  const f: Fetch = async (url, init) => {
    expect(url).toBe(RESEND_URL)
    mails.push(JSON.parse(init!.body as string))
    return new Response('{"id":"x"}')
  }
  routes = adminRoutes(store, {
    mockups: () => 2,
    address: () => ADDR,
    startersCurrent: () => true,
    deleteFile: (id) => { deleted.push(id) },
    io: { fetch: f, env, log: () => {} },
    appUrl: () => 'https://uxwoz.example/',
    ...extra,
  })
}

beforeEach(() => {
  clock = { t: Date.parse('2026-11-11T10:00:00Z') }
  store = people(':memory:', { now: () => new Date(clock.t) })
  mails = []
  deleted = []
  make()
})

const get = async () => (await routes['/api/admin'].GET(new Request('http://x/api/admin'))).json() as Promise<any>
const post = (body: unknown) => routes['/api/admin'].POST(new Request('http://x/api/admin', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))
const ok = async (body: unknown) => { const r = await post(body); expect(r.status).toBe(200); return r.json() as Promise<any> }
const status = async (body: unknown) => (await post(body)).status

/** A registered user by code, with their top-up waiting. */
function user(email: string) {
  const v = store.makeVisitor(ADDR)!
  const c = store.makeCode(email, v.person.id, ADDR) as { code: string }
  const done = store.verify(email, c.code, v.person.id, ADDR)
  if (typeof done === 'string') throw new Error(done)
  return done.person
}

test('GET: the summary, each person\'s mockups, the address, the starters; no steps per person', async () => {
  const v = store.makeVisitor(ADDR)!.person
  store.charge(v, 0.01, 'haiku', ADDR)
  const a = await get()
  expect(a.spent.today).toBeCloseTo(0.01)
  expect(a.mode).toBe('open')
  expect(a.caps.visitor).toBe(0.1)
  expect(a.address).toBe(ADDR)
  expect(a.startersCurrent).toBe(true)
  expect(a.mailToday).toBe(0)
  expect(a.people).toEqual([{ id: v.id, email: null, created: clock.t, seen: clock.t, allowance: 0.1, spent: 0.01, mockups: 2, blocked: false, topupDue: null }])
  expect(a.requests).toEqual([])
})

test('mode: open or starters, anything else 400', async () => {
  expect((await ok({ op: 'mode', mode: 'starters' })).mode).toBe('starters')
  expect(store.paused()).toBe(true)
  expect((await ok({ op: 'mode', mode: 'open' })).mode).toBe('open')
  expect(await status({ op: 'mode', mode: 'closed' })).toBe(400)
  expect(await status({ op: 'mode' })).toBe(400)
})

test('caps: changes the ones given; unknown, negative, huge or not a number is 400 and changes nothing', async () => {
  const a = await ok({ op: 'caps', caps: { dayUsd: 5, visitor: 0.2 } })
  expect(a.caps.dayUsd).toBe(5)
  expect(a.caps.visitor).toBe(0.2)
  for (const caps of [{ dayUsd: -1 }, { dayUsd: 1e9 }, { dayUsd: '5' }, { nope: 1 }, { dayUsd: null }, {}, [], null, { topupHours: 10_000 }]) {
    expect([caps, await status({ op: 'caps', caps })]).toEqual([caps, 400])
  }
  expect(await status({ op: 'caps', caps: { visitor: 1, dayUsd: -1 } })).toBe(400)
  expect(store.settings().caps.visitor).toBe(0.2)
})

test('give: adds or takes away; a bad amount 400, an unknown id 404', async () => {
  const v = store.makeVisitor(ADDR)!.person
  expect((await ok({ op: 'give', id: v.id, usd: 0.5 })).people[0].allowance).toBeCloseTo(0.6)
  expect((await ok({ op: 'give', id: v.id, usd: -0.2 })).people[0].allowance).toBeCloseTo(0.4)
  for (const usd of [0, 101, -101, '1', null, Infinity, undefined]) expect([usd, await status({ op: 'give', id: v.id, usd })]).toEqual([usd, 400])
  expect(await status({ op: 'give', id: 'f'.repeat(32), usd: 1 })).toBe(404)
  expect(await status({ op: 'give', id: '../x', usd: 1 })).toBe(400)
  expect(await status({ op: 'give', usd: 1 })).toBe(400)
})

test('block: blocks and unblocks; a bad flag 400, an unknown id 404', async () => {
  const v = store.makeVisitor(ADDR)!.person
  expect((await ok({ op: 'block', id: v.id, blocked: true })).people[0].blocked).toBe(true)
  expect(store.mayCall(v, ADDR)).toBe('blocked')
  expect((await ok({ op: 'block', id: v.id, blocked: false })).people[0].blocked).toBe(false)
  expect(await status({ op: 'block', id: v.id, blocked: 'yes' })).toBe(400)
  expect(await status({ op: 'block', id: 'a'.repeat(32), blocked: true })).toBe(404)
})

test('delete: the file first, then the person; an unknown id 404 and no file deleted', async () => {
  const v = store.makeVisitor(ADDR)!.person
  expect((await ok({ op: 'delete', id: v.id })).people).toEqual([])
  expect(deleted).toEqual([v.id])
  expect(store.person(v.id)).toBeNull()
  expect(await status({ op: 'delete', id: v.id })).toBe(404)
  expect(deleted).toEqual([v.id])
})

test('topup: hands out the waiting top-up now and emails the user; once only', async () => {
  const u = user('ana@example.com')
  expect((await get()).people[0].topupDue).not.toBeNull()
  const a = await ok({ op: 'topup', id: u.id })
  expect(a.mailed).toBe(true)
  expect(a.people[0].allowance).toBeCloseTo(0.25)
  expect(a.people[0].topupDue).toBeNull()
  // The sign-in code's mail is counted when the code is made, and the ready mail after it.
  expect(a.mailToday).toBe(2)
  expect(mails).toEqual([expect.objectContaining({ to: ['ana@example.com'], subject: 'Your free screens are ready', text: expect.stringContaining('https://uxwoz.example/') })])
  expect(await status({ op: 'topup', id: u.id })).toBe(409)
  expect(mails).toHaveLength(1)
  expect(await status({ op: 'topup', id: 'b'.repeat(32) })).toBe(404)
  expect(await status({ op: 'topup' })).toBe(400)
})

test('answer: approve adds the amount and emails it; refuse emails the refusal; once only', async () => {
  const u = user('ana@example.com')
  const r1 = store.ask(u.id, 'A vet clinic app') as number
  const a = await ok({ op: 'answer', request: r1, approved: true, usd: 1 })
  expect(a.requests[0]).toEqual(expect.objectContaining({ id: r1, answer: 'approved', usd: 1, email: 'ana@example.com', note: 'A vet clinic app' }))
  expect(a.people[0].allowance).toBeCloseTo(1.1)
  expect(mails.at(-1)).toEqual(expect.objectContaining({ to: ['ana@example.com'], subject: 'You have more free screens', text: expect.stringContaining('about 142 more') }))
  expect(await status({ op: 'answer', request: r1, approved: false })).toBe(409)

  const r2 = store.ask(u.id, 'More please') as number
  await ok({ op: 'answer', request: r2, approved: false })
  expect(store.person(u.id)!.allowance).toBeCloseTo(1.1)
  expect(mails.at(-1)).toEqual(expect.objectContaining({ subject: 'About your request for more screens' }))

  const r3 = store.ask(u.id, 'Default amount') as number
  await ok({ op: 'answer', request: r3, approved: true })
  expect(store.person(u.id)!.allowance).toBeCloseTo(1.6)
  expect(mails).toHaveLength(3)
})

test('answer: a bad id, flag or amount 400, an unknown request 404, and no email', async () => {
  const u = user('ana@example.com')
  const r = store.ask(u.id, 'note') as number
  for (const body of [{ request: '1', approved: true }, { request: 1.5, approved: true }, { request: 0, approved: true }, { request: r, approved: 'yes' },
    { request: r, approved: true, usd: -1 }, { request: r, approved: true, usd: 0 }, { request: r, approved: true, usd: 1000 }, { request: r, approved: true, usd: 'x' }]) {
    expect([body, await status({ op: 'answer', ...body })]).toEqual([body, 400])
  }
  expect(await status({ op: 'answer', request: r + 99, approved: true })).toBe(404)
  expect(mails).toEqual([])
  expect(store.request(r)!.answer).toBeNull()
})

test('a body that is not JSON, no op or an unknown op is 400', async () => {
  expect(await status('not json')).toBe(400)
  expect(await status({})).toBe(400)
  expect(await status({ op: 'drop' })).toBe(400)
  expect(await status({ op: 'toString' })).toBe(400)
})

test('a mail that does not go is said, and not counted', async () => {
  make({ RESEND_API_KEY: 're_test' }, { io: { fetch: async () => new Response('no', { status: 500 }), env: { RESEND_API_KEY: 're_test' }, log: () => {} } })
  const u = user('ana@example.com')
  const a = await ok({ op: 'topup', id: u.id })
  expect(a.mailed).toBe(false)
  // Only the sign-in code's mail, counted when the code was made.
  expect(a.mailToday).toBe(1)
  expect(a.people[0].topupDue).toBeNull()
})

test('/privacy names the operator and the contact from the env, escaped, with the design inline', async () => {
  make({ UXWOZ_OPERATOR: 'Ana <Studio>', UXWOZ_CONTACT: 'privacy@example.com' })
  const res = routes['/privacy']()
  expect(res.headers.get('content-type')).toContain('text/html')
  const html = await res.text()
  expect(html).toContain('UX Woz is run by Ana &#60;Studio&#62;.')
  // The address is not in the HTML as written: backwards in two pieces, and as words for a reader with no script.
  expect(html).not.toContain('privacy@example.com')
  expect(html).not.toContain('mailto:')
  expect(html).toContain('data-u="ycavirp" data-d="moc.elpmaxe"')
  expect(html).toContain('privacy at example dot com')
  expect(html).toContain('<style>')
  expect(html).toContain('.sheet')
  expect(html).not.toContain('{{')
  expect(html).not.toContain('@font-face')
  expect(html).toContain('30 days')
})

test('/admin is the admin page', () => {
  expect(routes['/admin']).toBeDefined()
})
