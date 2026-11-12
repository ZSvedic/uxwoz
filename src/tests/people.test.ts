// People and money: the store over bun:sqlite, every limit at its edge, with an injected clock.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CAPS, CODE_AGAIN_MS, CODE_MS, CODES_PER_ADDRESS, network, people, screensOf, type People, type Person } from '../packages/web/src/people.ts'

const HAIKU = 'claude-haiku-5.5'
const IP = '203.0.113.7'
function store(start = '2026-11-11T10:00:00Z') {
  const clock = { t: Date.parse(start) }
  const s = people(':memory:', { now: () => new Date(clock.t) })
  return { s, clock, at: (iso: string) => { clock.t = Date.parse(iso) }, later: (ms: number) => { clock.t += ms } }
}
const visitor = (s: People, ip = IP) => s.makeVisitor(ip)!.person
/** Spends `usd` for a person in one call. */
const spend = (s: People, p: Person, usd: number, ip = IP) => s.charge(p, usd, HAIKU, ip)
async function signUp(s: People, email: string, visitorId: string | null, ip = IP) {
  const c = s.makeCode(email, visitorId, ip)
  if (typeof c === 'string') throw new Error(c)
  const v = s.verify(email, c.code, visitorId, ip)
  if (typeof v === 'string') throw new Error(v)
  return v
}
/** Every row in every table that names `id`. */
function rowsAbout(s: People, id: string) {
  const tables = s.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  return tables.flatMap(({ name }) => (s.db.query(`SELECT * FROM ${name}`).all() as Record<string, unknown>[])
    .filter((r) => Object.values(r).includes(id)).map((r) => ({ name, r })))
}

describe('people and sessions', () => {
  test('a visitor gets a session; the database keeps a hash of the token', () => {
    const { s } = store()
    const v = s.makeVisitor(IP)!
    expect(v.token).toMatch(/^[a-f0-9]{32}$/)
    expect(v.person).toMatchObject({ email: null, allowance: 0.1, spent: 0, blocked: false })
    expect(s.byToken(v.token)!.id).toBe(v.person.id)
    expect(JSON.stringify(s.db.query('SELECT * FROM sessions').all())).not.toContain(v.token)
    expect(s.byToken('f'.repeat(32))).toBeNull()
    expect(s.byToken('not a token')).toBeNull()
    s.signOut(v.token)
    expect(s.byToken(v.token)).toBeNull()
  })

  test('byToken marks the person as seen', () => {
    const { s, later } = store()
    const v = s.makeVisitor(IP)!
    later(60_000)
    expect(s.byToken(v.token)!.seen).toBe(v.person.created + 60_000)
  })

  test('20 new visitors a day per address, then none until the next UTC day', () => {
    const { s, at } = store('2026-11-11T23:00:00Z')
    for (let i = 0; i < 20; i++) expect(s.makeVisitor(IP)).not.toBeNull()
    expect(s.makeVisitor(IP)).toBeNull()
    expect(s.makeVisitor('198.51.100.1')).not.toBeNull()
    at('2026-11-12T00:00:01Z')
    expect(s.makeVisitor(IP)).not.toBeNull()
  })
})

describe('the address', () => {
  test('IPv6 counts by its /64; IPv4-mapped as IPv4', () => {
    expect(network('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64')
    expect(network('2001:0db8:0001:0002:ffff:1:2:3')).toBe('2001:db8:1:2::/64')
    expect(network('[2001:db8::5]')).toBe('2001:db8:0:0::/64')
    expect(network('fe80::1%en0')).toBe('fe80:0:0:0::/64')
    expect(network('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(network(' 203.0.113.7 ')).toBe('203.0.113.7')
  })

  test('an HMAC under a salt made new each UTC day', () => {
    const { s, at } = store()
    const a = s.addressOf('2001:db8:1:2::1')
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(s.addressOf('2001:db8:1:2:ffff::9')).toBe(a)
    expect(s.addressOf('2001:db8:1:3::1')).not.toBe(a)
    at('2026-11-12T00:00:00Z')
    expect(s.addressOf('2001:db8:1:2::1')).not.toBe(a)
  })

  test('the raw address is never stored', () => {
    const { s } = store()
    spend(s, visitor(s), 0.01)
    expect(JSON.stringify(s.db.query('SELECT * FROM addresses').all())).not.toContain('203.0.113')
  })
})

describe('the meter', () => {
  test('the allowance: one cent under, at, over', () => {
    const { s } = store()
    const p = visitor(s)
    spend(s, p, 0.09)
    expect(s.mayCall(p, IP)).toBeNull()
    spend(s, p, 0.01)
    expect(s.mayCall(p, IP)).toBe('allowance')
    spend(s, p, 0.01)
    expect(s.mayCall(p, IP)).toBe('allowance')
    expect(s.person(p.id)!.spent).toBe(0.11)
  })

  test('micro-dollars: many small calls add up exactly', () => {
    const { s } = store()
    const p = visitor(s)
    for (let i = 0; i < 125; i++) spend(s, p, 0.0008)
    expect(s.person(p.id)!.spent).toBe(0.1)
    expect(s.mayCall(p, IP)).toBe('allowance')
  })

  test('a cost that never arrived costs $0.002, and a calls row', () => {
    const { s } = store()
    const p = visitor(s)
    s.charge(p, null, HAIKU, IP)
    expect(s.person(p.id)!.spent).toBe(0.002)
    expect(s.db.query('SELECT person, usd, model FROM calls').all()).toEqual([{ person: p.id, usd: 2000, model: HAIKU }])
    expect(s.lastCall(HAIKU)).toBe(Date.parse('2026-11-11T10:00:00Z'))
    expect(s.lastCall('gpt-6.1-terra')).toBeNull()
  })

  test('visitors from one address share $0.30 a day: under, at, over', () => {
    const { s, at } = store()
    const [a, b, c, d] = [visitor(s), visitor(s), visitor(s), visitor(s)]
    spend(s, a, 0.1); spend(s, b, 0.1); spend(s, c, 0.09)
    expect(s.mayCall(d, IP)).toBeNull()
    spend(s, c, 0.01)
    expect(s.mayCall(d, IP)).toBe('address')
    spend(s, d, 0.01)
    expect(s.mayCall(d, IP)).toBe('address')
    expect(s.mayCall(d, '198.51.100.1')).toBeNull()
    at('2026-11-12T00:00:00Z')
    expect(s.mayCall(d, IP)).toBeNull()
  })

  test("a registered user's calls do not count against the address", async () => {
    const { s } = store()
    const u = (await signUp(s, 'ana@example.com', visitor(s).id)).person
    s.give(u.id, 1)
    spend(s, u, 0.5)
    expect(s.mayCall(visitor(s), IP)).toBeNull()
    expect(s.mayCall(u, IP)).toBeNull()
  })

  test('the public pauses at $3 a day, then the next UTC day opens again', async () => {
    const { s, at } = store('2026-11-11T23:59:00Z')
    const rich = visitor(s, '198.51.100.9')
    s.give(rich.id, 100)
    const u = (await signUp(s, 'ana@example.com', null)).person
    s.charge(rich, 2.99, HAIKU, '198.51.100.9')
    expect(s.mayCall(u, IP)).toBeNull()
    expect(s.paused()).toBe(false)
    s.charge(rich, 0.01, HAIKU, '198.51.100.9')
    expect(s.mayCall(u, IP)).toBe('paused')
    expect(s.paused()).toBe(true)
    at('2026-11-12T00:00:00Z')
    expect(s.mayCall(u, IP)).toBeNull()
    expect(s.spent()).toEqual({ today: 0, month: 3 })
  })

  test('guests stop at 70% of the day; registered users go on to the whole, then the next UTC day opens again', async () => {
    const { s, at } = store('2026-11-11T23:00:00Z')
    const rich = visitor(s, '198.51.100.9')
    s.give(rich.id, 100)
    const p = visitor(s)
    const u = (await signUp(s, 'ana@example.com', null)).person
    s.charge(rich, 2.09, HAIKU, '198.51.100.9')
    expect(s.mayCall(p, IP)).toBeNull()
    s.charge(rich, 0.01, HAIKU, '198.51.100.9')
    expect(s.mayCall(p, IP)).toBe('guests')
    expect(s.reserve(p, IP)).toBe('guests')
    expect(s.mayCall(u, IP)).toBeNull()
    expect(s.paused()).toBe(false)
    // Reservations count: a guest is refused while the running calls would pass the 70%.
    s.charge(rich, -0.01, HAIKU, '198.51.100.9')
    expect(s.mayCall(p, IP)).toBeNull()
    const holds = [0, 1, 2].map(() => s.reserve(u, IP))
    expect(holds.every((h) => typeof h === 'function')).toBe(true)
    expect(s.mayCall(p, IP)).toBe('guests')
    for (const h of holds) (h as () => void)()
    expect(s.mayCall(p, IP)).toBeNull()
    // Order: blocked, paused, then guests before allowance and address.
    spend(s, p, 0.1)
    s.charge(rich, 0.01, HAIKU, '198.51.100.9')
    expect(s.mayCall(p, IP)).toBe('guests')
    s.setMode('starters')
    expect(s.mayCall(p, IP)).toBe('paused')
    s.block(p.id, true)
    expect(s.mayCall(p, IP)).toBe('blocked')
    s.block(p.id, false); s.setMode('open')
    at('2026-11-12T00:00:00Z')
    expect(s.mayCall(visitor(s), IP)).toBeNull()
  })

  test('the public pauses at $20 a month, then the next month opens again', () => {
    const { s, at } = store('2026-11-01T12:00:00Z')
    const rich = visitor(s, '198.51.100.9')
    s.give(rich.id, 100)
    const p = visitor(s)
    for (let d = 1; d <= 7; d++) { at(`2026-11-0${d}T12:00:00Z`); s.charge(rich, 2.85, HAIKU, '198.51.100.9') }
    at('2026-11-08T12:00:00Z')
    s.charge(rich, 0.04, HAIKU, '198.51.100.9')
    expect(s.spent().month).toBe(19.99)
    expect(s.mayCall(p, IP)).toBeNull()
    s.charge(rich, 0.01, HAIKU, '198.51.100.9')
    expect(s.mayCall(p, IP)).toBe('paused')
    at('2026-11-30T23:59:59Z')
    expect(s.mayCall(p, IP)).toBe('paused')
    at('2026-12-01T00:00:00Z')
    expect(s.mayCall(p, IP)).toBeNull()
  })

  test('the mode `starters` pauses everyone; blocked comes before all', () => {
    const { s } = store()
    const p = visitor(s)
    s.setMode('starters')
    expect(s.mayCall(p, IP)).toBe('paused')
    s.block(p.id, true)
    expect(s.mayCall(p, IP)).toBe('blocked')
    s.setMode('open')
    s.block(p.id, false)
    expect(s.mayCall(p, IP)).toBeNull()
    spend(s, p, 0.1)
    s.setMode('starters')
    expect(s.mayCall(p, IP)).toBe('paused')
  })

  test('one paid request at a time per person', () => {
    const { s } = store()
    const [p, q] = [visitor(s), visitor(s)]
    const release = s.hold(p.id)!
    expect(release).toBeFunction()
    expect(s.hold(p.id)).toBeNull()
    expect(s.hold(q.id)).not.toBeNull()
    release(); release()
    expect(s.hold(p.id)).not.toBeNull()
  })

  test('two calls racing past a cap: both were let in, the overshoot is theirs, the next is refused', async () => {
    const { s } = store()
    const [a, b] = [visitor(s), visitor(s)]
    s.give(a.id, 1); s.give(b.id, 1)
    spend(s, a, 0.29)
    const checks = await Promise.all([a, b].map(async (p) => s.mayCall(p, IP)))
    expect(checks).toEqual([null, null])
    await Promise.all([a, b].map(async (p) => spend(s, p, 0.008)))
    const row = s.db.query('SELECT usd FROM addresses').get() as { usd: number }
    expect(row.usd).toBe(306_000)
    expect(s.mayCall(a, IP)).toBe('address')
    expect(s.mayCall(b, IP)).toBe('address')
  })

  test('the caps change on the admin page; a bad value is ignored', () => {
    const { s } = store()
    expect(s.settings()).toEqual({ mode: 'open', caps: CAPS })
    s.setCaps({ visitor: 0.2, dayUsd: -1, monthUsd: NaN } as any)
    expect(s.settings().caps).toEqual({ ...CAPS, visitor: 0.2 })
    expect(visitor(s).allowance).toBe(0.2)
  })

  test('screens left from dollars', () => {
    expect(screensOf(0.1)).toBe(25)
    expect(screensOf(0.15)).toBe(37)
    expect(screensOf(0.004)).toBe(1)
    expect(screensOf(0.0039)).toBe(0)
  })
})

describe('sign-in codes', () => {
  test('six digits, 15 minutes', () => {
    const { s, later } = store()
    const c = s.makeCode('Ana@Example.com ', null, IP) as { code: string }
    expect(c.code).toMatch(/^\d{6}$/)
    later(CODE_MS)
    expect(s.checkCode('ana@example.com', c.code)).toBe(true)
    const d = s.makeCode('ana@example.com', null, IP) as { code: string }
    later(CODE_MS + 1)
    expect(s.checkCode('ana@example.com', d.code)).toBe(false)
  })

  test('a code works once; a new one replaces the old', () => {
    const { s, later } = store()
    const a = s.makeCode('ana@example.com', null, IP) as { code: string }
    let b: { code: string }
    do { later(CODE_AGAIN_MS); b = s.makeCode('ana@example.com', null, IP) as { code: string } } while (b.code === a.code)
    expect(s.checkCode('ana@example.com', a.code)).toBe(false)
    expect(s.checkCode('ana@example.com', b.code)).toBe(true)
    expect(s.checkCode('ana@example.com', b.code)).toBe(false)
  })

  test('dead after 5 wrong tries: the fourth wrong still leaves it alive', () => {
    const { s } = store()
    const wrong = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, '0')
    const a = s.makeCode('ana@example.com', null, IP) as { code: string }
    for (let i = 0; i < 4; i++) expect(s.checkCode('ana@example.com', wrong(a.code))).toBe(false)
    expect(s.checkCode('ana@example.com', a.code)).toBe(true)
    const b = s.makeCode('ana@example.com', null, IP) as { code: string }
    for (let i = 0; i < 5; i++) expect(s.checkCode('ana@example.com', wrong(b.code))).toBe(false)
    expect(s.checkCode('ana@example.com', b.code)).toBe(false)
  })

  test('a bad email; the mail quota; 3 new accounts a day per address, refused at verify only', async () => {
    const { s, at, later } = store()
    expect(s.makeCode('ana', null, IP)).toBe('email')
    expect(s.makeCode('ana@example', null, IP)).toBe('email')
    for (const n of [1, 2, 3]) await signUp(s, `u${n}@example.com`, null)
    // Asking for a code never depends on the address's accounts: the fourth new one is refused at verify.
    const four = s.makeCode('u4@example.com', null, IP) as { code: string }
    expect(s.verify('u4@example.com', four.code, null, IP)).toBe('address')
    later(CODE_AGAIN_MS)
    expect(s.makeCode('u1@example.com', null, IP)).toHaveProperty('code')
    at('2026-11-12T00:00:00Z')
    expect(s.makeCode('u4@example.com', null, IP)).toHaveProperty('code')
    // Each code counts its mail when it is made: u4's is the day's first.
    for (let i = 0; i < CAPS.mailPerDay - 2; i++) s.mailed()
    expect(s.makeCode('u5@example.com', null, IP)).toHaveProperty('code')
    expect(s.mailToday()).toBe(100)
    later(CODE_AGAIN_MS)
    expect(s.makeCode('u5@example.com', null, IP)).toBe('mail')
    at('2026-11-13T00:00:00Z')
    expect(s.mailToday()).toBe(0)
  })

  test('a network asks for 10 codes a day; an email for one a minute', () => {
    const { s, later, at } = store()
    expect(s.makeCode('a@example.com', null, IP)).toHaveProperty('code')
    expect(s.makeCode('A@example.com ', null, IP)).toBe('soon')
    expect(s.makeCode('a@example.com', null, '198.51.100.1')).toBe('soon')
    later(CODE_AGAIN_MS - 1)
    expect(s.makeCode('a@example.com', null, IP)).toBe('soon')
    later(1)
    expect(s.makeCode('a@example.com', null, IP)).toHaveProperty('code')
    for (let n = 3; n <= CODES_PER_ADDRESS; n++) expect(s.makeCode(`n${n}@example.com`, null, IP)).toHaveProperty('code')
    expect(s.makeCode('late@example.com', null, IP)).toBe('codes')
    expect(s.makeCode('late@example.com', null, '198.51.100.1')).toHaveProperty('code')
    at('2026-11-12T00:00:00Z')
    expect(s.makeCode('late2@example.com', null, IP)).toHaveProperty('code')
  })

  test('codes asked before the cap cannot make a fourth account at verify', () => {
    const { s } = store()
    const codes = [1, 2, 3, 4].map((n) => (s.makeCode(`u${n}@example.com`, null, IP) as { code: string }).code)
    const results = codes.map((c, i) => s.verify(`u${i + 1}@example.com`, c, null, IP))
    expect(results.slice(0, 3).every((r) => typeof r === 'object')).toBe(true)
    expect(results[3]).toBe('address')
    expect(s.verify('u1@example.com', 'x', null, IP)).toBe('code')
  })
})

describe('verify: takeover and merge', () => {
  test('a new email takes over the visitor; the top-up comes with it, once', async () => {
    const { s, later } = store()
    const v = s.makeVisitor(IP)!
    spend(s, v.person, 0.1)
    expect(s.mayCall(v.person, IP)).toBe('allowance')
    const r = await signUp(s, 'ana@example.com', v.person.id)
    expect(r.merged).toBeNull()
    expect(r.person).toEqual({ id: v.person.id, email: 'ana@example.com', created: v.person.created, seen: v.person.seen, allowance: 0.25, spent: 0.1, blocked: false, steps: [] })
    expect(s.byToken(r.token)!.id).toBe(v.person.id)
    expect(s.mayCall(r.person, IP)).toBeNull()
    later(60_000)
    expect((await signUp(s, 'ana@example.com', null)).person.allowance).toBe(0.25)
  })

  test('the top-up follows its cap; an account with no visitor gets both', async () => {
    const { s } = store()
    s.setCaps({ topup: 0.4 })
    expect((await signUp(s, 'bo@example.com', null)).person.allowance).toBe(0.5)
  })

  test('an old database: a waiting top-up arrives at start, once, and the column and the old cap go', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uxwoz-old-'))
    const file = join(dir, 'old.db')
    const old = people(file)
    old.db.exec('ALTER TABLE people ADD COLUMN topupDue INTEGER')
    const a = old.makeVisitor(IP)!.person, b = old.makeVisitor(IP)!.person
    old.db.query("UPDATE people SET email = 'a@example.com', topupDue = 1 WHERE id = ?").run(a.id)
    old.db.query("INSERT INTO settings (key, value) VALUES ('caps', '{\"topupHours\":12,\"visitor\":0.2}')").run()
    old.close()
    const s = people(file)
    expect(s.person(a.id)!.allowance).toBe(0.25)
    expect(s.person(b.id)!.allowance).toBe(0.1)
    expect(s.settings().caps).toEqual({ ...CAPS, visitor: 0.2 })
    s.close()
    expect(people(file).person(a.id)!.allowance).toBe(0.25)
  })

  test('an existing account: both ids come back and the visitor is gone', async () => {
    const { s, later } = store()
    const account = (await signUp(s, 'ana@example.com', visitor(s).id)).person
    const v = s.makeVisitor(IP)!
    spend(s, v.person, 0.05)
    later(CODE_AGAIN_MS)
    const r = await signUp(s, 'ANA@example.com', v.person.id)
    expect(r.person.id).toBe(account.id)
    expect(r.merged).toBe(v.person.id)
    expect(s.byToken(v.token)).toBeNull()
    expect(s.person(v.person.id)).toBeNull()
    expect(rowsAbout(s, v.person.id)).toEqual([])
    expect(s.spent().today).toBe(0.05)
  })

  test('signing in from a registered session or none merges nothing', async () => {
    const { s, later } = store()
    const a = (await signUp(s, 'ana@example.com', visitor(s).id)).person
    const b = (await signUp(s, 'bo@example.com', null)).person
    expect(b).toMatchObject({ email: 'bo@example.com', allowance: 0.25 })
    later(CODE_AGAIN_MS)
    const r = await signUp(s, 'ana@example.com', b.id)
    expect(r).toMatchObject({ person: { id: a.id }, merged: null })
    expect(s.person(b.id)).not.toBeNull()
  })
})

describe('requests, steps, shares, the admin', () => {
  test('a quota request: registered only, one open, the note 1 to 500 characters', async () => {
    const { s } = store()
    const v = visitor(s)
    expect(s.ask(v.id, 'more')).toBe('register')
    const u = (await signUp(s, 'ana@example.com', null)).person
    expect(s.ask(u.id, '  ')).toBe('note')
    expect(s.ask(u.id, 'x'.repeat(501))).toBe('note')
    const id = s.ask(u.id, 'x'.repeat(500)) as number
    expect(id).toBeNumber()
    expect(s.ask(u.id, 'again')).toBe('open')
    expect(s.lastRequest(u.id)).toMatchObject({ id, answer: null, email: 'ana@example.com' })
    const a = s.answer(id, true)!
    expect(a.person.allowance).toBe(0.75)
    expect(a.request).toMatchObject({ answer: 'approved', usd: 0.5 })
    expect(s.answer(id, true)).toBeNull()
    const id2 = s.ask(u.id, 'again') as number
    expect(s.answer(id2, false)!.person.allowance).toBe(0.75)
    const id3 = s.ask(u.id, 'once more') as number
    expect(s.answer(id3, true, 0.2)!.person.allowance).toBe(0.95)
  })

  test('steps count once per person; arrived at most 50 a day per address', () => {
    const { s, at } = store()
    const p = visitor(s)
    expect(s.step(p.id, 'own', IP)).toBe(true)
    expect(s.step(p.id, 'own', IP)).toBe(false)
    expect(s.step(null, 'own', IP)).toBe(false)
    expect(s.step(p.id, 'nonsense' as any, IP)).toBe(false)
    for (let i = 0; i < 50; i++) expect(s.step(null, 'arrived', IP)).toBe(true)
    expect(s.step(null, 'arrived', IP)).toBe(false)
    expect(s.step(null, 'arrived', '198.51.100.1')).toBe(true)
    expect(s.person(p.id)!.steps).toEqual(['own'])
    at('2026-11-12T08:00:00Z')
    expect(s.step(null, 'arrived', IP)).toBe(true)
    expect(s.steps()).toEqual([{ day: '2026-11-12', arrived: 1 }, { day: '2026-11-11', own: 1, arrived: 51 }])
    at('2026-12-11T08:00:00Z')
    expect(s.steps().map((d) => d.day)).toEqual(['2026-11-12'])
  })

  test('the share-token index', () => {
    const { s } = store()
    const [a, b] = [visitor(s), visitor(s)]
    s.addShare('abc123', a.id)
    expect(s.shareOwner('abc123')).toBe(a.id)
    s.moveShares(a.id, b.id)
    expect(s.shareOwner('abc123')).toBe(b.id)
    s.removeShare('abc123')
    expect(s.shareOwner('abc123')).toBeNull()
  })

  test("the admin's summary; give, block", async () => {
    const { s } = store()
    const v = visitor(s)
    const u = (await signUp(s, 'ana@example.com', null)).person
    spend(s, v, 0.03)
    s.ask(u.id, 'for a demo')
    s.step(v.id, 'own', IP)
    expect(s.give(v.id, 0.05)!.allowance).toBe(0.15)
    expect(s.give(v.id, -1)!.allowance).toBe(0)
    expect(s.block(u.id, true)!.blocked).toBe(true)
    const sum = s.summary()
    expect(sum.spent).toEqual({ today: 0.03, month: 0.03 })
    expect(sum.mode).toBe('open')
    expect(sum.people.map((p) => p.id).sort()).toEqual([v.id, u.id].sort())
    expect(sum.requests).toMatchObject([{ person: u.id, email: 'ana@example.com', note: 'for a demo', answer: null }])
    expect(sum.steps).toEqual([{ day: '2026-11-11', own: 1 }])
    // The sign-up's code mail, counted when the code was made.
    expect(sum.mailToday).toBe(1)
  })

  test('deleting a person leaves no row about them; the day still counts the money', async () => {
    const { s } = store()
    const r = await signUp(s, 'ana@example.com', visitor(s).id)
    const id = r.person.id
    spend(s, r.person, 0.04)
    s.ask(id, 'more')
    s.addShare('tok1', id)
    s.makeCode('ana@example.com', id, IP)
    s.step(id, 'verified', IP)
    s.deletePerson(id)
    expect(rowsAbout(s, id)).toEqual([])
    expect(JSON.stringify(s.db.query('SELECT * FROM codes').all())).not.toContain('ana@example.com')
    expect(s.byToken(r.token)).toBeNull()
    expect(s.spent().today).toBe(0.04)
  })

  test('visitors idle 30 days', async () => {
    const { s, later } = store()
    const old = s.makeVisitor(IP)!
    const user = (await signUp(s, 'ana@example.com', null)).person
    later(30 * 86_400_000)
    const fresh = visitor(s)
    expect(s.idleVisitors()).toEqual([])
    later(1)
    expect(s.idleVisitors()).toEqual([old.person.id])
    s.byToken(old.token)
    expect(s.idleVisitors()).toEqual([])
    expect([user.id, fresh.id]).not.toContain(old.person.id)
  })
})

test('a file survives a reopen', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-people-')), 'uxwoz.db')
  const a = people(file)
  const v = a.makeVisitor(IP)!
  a.charge(v.person, 0.01, HAIKU, IP)
  a.setMode('starters')
  a.close()
  const b = people(file)
  expect(b.byToken(v.token)!.spent).toBe(0.01)
  expect(b.settings().mode).toBe('starters')
  b.close()
})
