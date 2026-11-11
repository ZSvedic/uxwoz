// People and money for the public app (spec/public.md, Stored and The meter): one bun:sqlite file. No other
// file reads it. Money is integer micro-dollars inside; every method takes and returns USD.

import { Database } from 'bun:sqlite'
import { createHash, createHmac, randomBytes } from 'node:crypto'

export type Reason = 'allowance' | 'address' | 'paused' | 'blocked'
export type Mode = 'open' | 'starters'
export const STEPS = ['arrived', 'starter', 'picked', 'own', 'limit', 'asked', 'verified'] as const
export type Step = (typeof STEPS)[number]

/** The limits, each changeable on the admin's page. Money in USD. */
export interface Caps {
  visitor: number; topup: number; topupHours: number
  addressUsd: number; addressVisitors: number; addressAccounts: number
  dayUsd: number; monthUsd: number; mailPerDay: number
}
export const CAPS: Caps = {
  visitor: 0.1, topup: 0.15, topupHours: 12,
  addressUsd: 0.3, addressVisitors: 20, addressAccounts: 3,
  dayUsd: 3, monthUsd: 20, mailPerDay: 100,
}
/** What a call whose cost never arrived is charged; what one picked screen costs, for "screens left". */
export const UNKNOWN_USD = 0.002
export const SCREEN_USD = 0.007
/** What a live call holds from its start until its cost arrives. */
export const RESERVE_USD = 0.004
/** A code's life and its wrong tries; how many `arrived` an address counts a day; idle days before a visitor goes; the default answer. */
export const CODE_MS = 15 * 60_000
export const CODE_TRIES = 5
/** Sign-in codes a network may ask for in a day, and how soon one email may ask again. */
export const CODES_PER_ADDRESS = 10
export const CODE_AGAIN_MS = 60_000
/** Per email and UTC day, whatever the mails did: codes it may ask for, wrong tries it may make. */
export const CODES_PER_EMAIL = 5
export const WRONG_PER_EMAIL = 15
export const ARRIVED_PER_ADDRESS = 50
export const IDLE_DAYS = 30
export const ASK_USD = 0.5
export const NOTE_CHARS = 500

export interface Person {
  id: string; email: string | null; created: number; seen: number
  allowance: number; spent: number; blocked: boolean; topupDue: number | null; steps: Step[]
}
export interface Request { id: number; person: string; email: string | null; note: string; at: number; answer: 'approved' | 'refused' | null; answeredAt: number | null; usd: number | null }
export type Verified = { person: Person; token: string; merged: string | null }

const micros = (usd: number) => Math.round(usd * 1e6)
const usd = (m: number) => m / 1e6
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const hex = (bytes: number) => randomBytes(bytes).toString('hex')
const TOKEN = /^[a-f0-9]{32}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const normalEmail = (e: string) => e.trim().toLowerCase()
export const validEmail = (e: string) => e.length <= 254 && EMAIL.test(normalEmail(e))
export const left = (p: Person) => Math.max(0, usd(micros(p.allowance) - micros(p.spent)))
export const screensOf = (dollars: number) => Math.floor(micros(dollars) / micros(SCREEN_USD))

/** The network an address stands for: IPv4 as it is, IPv6 by its /64, an IPv4-mapped IPv6 as its IPv4. */
export function network(raw: string): string {
  let a = raw.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) a = mapped[1]!
  if (!a.includes(':')) return a || 'unknown'
  const [head = '', tail] = a.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  return groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':') + '::/64'
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, email TEXT UNIQUE, created INTEGER NOT NULL, seen INTEGER NOT NULL,
  allowance INTEGER NOT NULL, spent INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0, topupDue INTEGER, steps TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, person TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, hash TEXT NOT NULL, person TEXT, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS calls (at INTEGER NOT NULL, person TEXT, usd INTEGER NOT NULL, model TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS calls_at ON calls (at);
CREATE TABLE IF NOT EXISTS addresses (day TEXT NOT NULL, hash TEXT NOT NULL, usd INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0,
  accounts INTEGER NOT NULL DEFAULT 0, arrived INTEGER NOT NULL DEFAULT 0, codes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, hash));
CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, person TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL,
  answer TEXT, answeredAt INTEGER, usd INTEGER);
CREATE TABLE IF NOT EXISTS steps (day TEXT NOT NULL, step TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, step));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, person TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS emails (day TEXT NOT NULL, hash TEXT NOT NULL, codes INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0,
  asked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, hash));
CREATE TABLE IF NOT EXISTS blocked (hash TEXT PRIMARY KEY);
`

type Row = { id: string; email: string | null; created: number; seen: number; allowance: number; spent: number; blocked: number; topupDue: number | null; steps: string }
const toPerson = (r: Row): Person => ({
  id: r.id, email: r.email, created: r.created, seen: r.seen, allowance: usd(r.allowance), spent: usd(r.spent),
  blocked: !!r.blocked, topupDue: r.topupDue, steps: r.steps ? (r.steps.split(',') as Step[]) : [],
})

export type People = ReturnType<typeof people>

/** The store over `file` (`:memory:` in tests). `now` is the clock, injected by tests. */
export function people(file: string, opts: { now?: () => Date } = {}) {
  const now = () => (opts.now ?? (() => new Date()))().getTime()
  const day = (ms = now()) => new Date(ms).toISOString().slice(0, 10)
  const dayStart = () => Date.parse(day() + 'T00:00:00Z')
  const monthStart = () => Date.parse(day().slice(0, 7) + '-01T00:00:00Z')
  const db = new Database(file, { create: true, strict: true })
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  // A database from before the codes count gets the column.
  if (!(db.query('PRAGMA table_info(addresses)').all() as { name: string }[]).some((c) => c.name === 'codes')) db.exec('ALTER TABLE addresses ADD COLUMN codes INTEGER NOT NULL DEFAULT 0')
  const busy = new Set<string>()
  /** What the running live calls hold, in micros: per person, per visitor's address (its hash), for the whole public. */
  const held = { people: new Map<string, number>(), addresses: new Map<string, number>(), all: 0 }
  /** Nothing left (`spent` at the cap), or what runs could pass it: a call may start while anything is left, so the
   * most a cap is passed by is one reservation's worth beyond the calls' real costs. */
  const over = (spent: number, reserved: number, cap: number) => spent >= cap || spent + reserved > cap
  /** mayCall's checks, and a visitor's address hash for the reservation. */
  function check(person: Person, address: string): { reason: Reason | null; hash: string | null } {
    const p = byId(person.id)
    if (!p || p.blocked) return { reason: 'blocked', hash: null }
    const c = caps()
    if (mode() === 'starters' || over(spentSince(dayStart()), held.all, micros(c.dayUsd)) || over(spentSince(monthStart()), held.all, micros(c.monthUsd))) return { reason: 'paused', hash: null }
    if (over(micros(p.spent), held.people.get(p.id) ?? 0, micros(p.allowance))) return { reason: 'allowance', hash: null }
    if (p.email !== null) return { reason: null, hash: null }
    const a = addr(address)
    return over(a.usd, held.addresses.get(a.hash) ?? 0, micros(c.addressUsd)) ? { reason: 'address', hash: null } : { reason: null, hash: a.hash }
  }

  const get = (key: string) => (db.query('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | null)?.value
  const put = (key: string, value: string) => db.query('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value)
  const row = (id: string) => db.query('SELECT * FROM people WHERE id = ?').get(id) as Row | null
  const byId = (id: string) => { const r = row(id); return r ? toPerson(r) : null }
  const byEmail = (email: string) => { const r = db.query('SELECT * FROM people WHERE email = ?').get(normalEmail(email)) as Row | null; return r ? toPerson(r) : null }

  const caps = (): Caps => ({ ...CAPS, ...JSON.parse(get('caps') ?? '{}') })
  const mode = (): Mode => (get('mode') === 'starters' ? 'starters' : 'open')

  /** The day's salt: made new each UTC day; yesterday's address rows go with the old one. */
  function salt() {
    const s = JSON.parse(get('salt') ?? '{}') as { day?: string; key?: string }
    if (s.day === day() && s.key) return s.key
    const key = hex(32)
    db.transaction(() => { put('salt', JSON.stringify({ day: day(), key })); db.query('DELETE FROM addresses WHERE day < ?').run(day()) })()
    return key
  }
  const addressOf = (raw: string) => createHmac('sha256', salt()).update(network(raw)).digest('hex')
  type AddrRow = { usd: number; visitors: number; accounts: number; arrived: number; codes: number }
  function addr(raw: string): AddrRow & { hash: string } {
    const hash = addressOf(raw)
    db.query('INSERT OR IGNORE INTO addresses (day, hash) VALUES (?, ?)').run(day(), hash)
    return { hash, ...(db.query('SELECT usd, visitors, accounts, arrived, codes FROM addresses WHERE day = ? AND hash = ?').get(day(), hash) as AddrRow) }
  }
  const bump = (hash: string, col: keyof AddrRow, by = 1) => db.query(`UPDATE addresses SET ${col} = ${col} + ? WHERE day = ? AND hash = ?`).run(by, day(), hash)

  const spentSince = (ms: number) => (db.query('SELECT COALESCE(SUM(usd), 0) AS s FROM calls WHERE at >= ?').get(ms) as { s: number }).s
  const mailToday = () => { const [d, n] = (get('mail') ?? '').split(':'); return d === day() ? Number(n) || 0 : 0 }

  function session(person: string) {
    const token = hex(16)
    db.query('INSERT INTO sessions (hash, person, created) VALUES (?, ?, ?)').run(sha(token), person, now())
    return token
  }
  function insertPerson(email: string | null, topupDue: number | null) {
    const id = hex(16)
    db.query('INSERT INTO people (id, email, created, seen, allowance, topupDue) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, now(), now(), micros(caps().visitor), topupDue)
    return id
  }
  /** Every row of a person goes; their calls stay for the day's and month's sums, with no person. */
  function remove(id: string) {
    const p = row(id)
    if (p?.email) db.query('DELETE FROM codes WHERE email = ?').run(p.email)
    db.query('DELETE FROM codes WHERE person = ?').run(id)
    db.query('DELETE FROM sessions WHERE person = ?').run(id)
    db.query('UPDATE calls SET person = NULL WHERE person = ?').run(id)
    db.query('DELETE FROM requests WHERE person = ?').run(id)
    db.query('DELETE FROM shares WHERE person = ?').run(id)
    db.query('DELETE FROM people WHERE id = ?').run(id)
  }
  const topupAt = () => now() + caps().topupHours * 3600_000
  const requestOf = (r: any): Request => ({ ...r, usd: r.usd === null ? null : usd(r.usd) })

  const spent = () => ({ today: usd(spentSince(dayStart())), month: usd(spentSince(monthStart())) })
  /** An email's day: its codes asked, wrong tries and when it last asked. The email itself is kept only as a hash. */
  const emailHash = (e: string) => sha(`email:${normalEmail(e)}`)
  type EmailDay = { codes: number; wrong: number; asked: number }
  function emailDay(e: string): EmailDay & { hash: string } {
    const hash = emailHash(e)
    db.query('DELETE FROM emails WHERE day < ?').run(day())
    db.query('INSERT OR IGNORE INTO emails (day, hash) VALUES (?, ?)').run(day(), hash)
    return { hash, ...(db.query('SELECT codes, wrong, asked FROM emails WHERE day = ? AND hash = ?').get(day(), hash) as EmailDay) }
  }
  const bumpEmail = (hash: string, set: string) => db.query(`UPDATE emails SET ${set} WHERE day = ? AND hash = ?`).run(day(), hash)
  const isBlocked = (e: string) => !!db.query('SELECT 1 FROM blocked WHERE hash = ?').get(emailHash(e))
  /** True for the right code within its 15 minutes (used up unless `keep`); a wrong one counts a try for the code
   * (the fifth kills it) and for the email's day. */
  function checkCode(email: string, code: string, keep = false): boolean {
    const e = normalEmail(email)
    const c = db.query('SELECT hash, expires, tries FROM codes WHERE email = ?').get(e) as { hash: string; expires: number; tries: number } | null
    if (c && now() <= c.expires && sha(`${e}:${String(code).trim()}`) === c.hash) {
      if (!keep) db.query('DELETE FROM codes WHERE email = ?').run(e)
      return true
    }
    bumpEmail(emailDay(e).hash, 'wrong = wrong + 1')
    if (!c) return false
    if (now() > c.expires || c.tries + 1 >= CODE_TRIES) db.query('DELETE FROM codes WHERE email = ?').run(e)
    else db.query('UPDATE codes SET tries = tries + 1 WHERE email = ?').run(e)
    return false
  }
  function request(requestId: number): Request | null {
    const r = db.query('SELECT r.*, p.email FROM requests r LEFT JOIN people p ON p.id = r.person WHERE r.id = ?').get(requestId)
    return r ? requestOf(r) : null
  }
  /** The step counts of the last `days` days, newest first; a day with none is left out. */
  function steps(days = 30): ({ day: string } & Partial<Record<Step, number>>)[] {
    const from = day(now() - (days - 1) * 86_400_000)
    const out = new Map<string, { day: string } & Partial<Record<Step, number>>>()
    for (const r of db.query('SELECT day, step, n FROM steps WHERE day >= ? ORDER BY day DESC').all(from) as { day: string; step: Step; n: number }[]) {
      const d = out.get(r.day) ?? { day: r.day }
      d[r.step] = r.n
      out.set(r.day, d)
    }
    return [...out.values()]
  }

  return {
    db,
    addressOf,

    // ── People and sessions ──
    /** A new visitor and its session, or null when this address made its visitors for today. */
    makeVisitor(address: string): { person: Person; token: string } | null {
      return db.transaction(() => {
        const a = addr(address)
        if (a.visitors >= caps().addressVisitors) return null
        bump(a.hash, 'visitors')
        const id = insertPerson(null, null)
        return { person: byId(id)!, token: session(id) }
      })()
    },
    person: byId,
    byEmail,
    /** The person whose session this token is, marked as seen now; null for an unknown or malformed token. */
    byToken(token: string): Person | null {
      if (!TOKEN.test(token)) return null
      const s = db.query('SELECT person FROM sessions WHERE hash = ?').get(sha(token)) as { person: string } | null
      if (!s) return null
      db.query('UPDATE people SET seen = ? WHERE id = ?').run(now(), s.person)
      return byId(s.person)
    },
    signOut(token: string) { db.query('DELETE FROM sessions WHERE hash = ?').run(sha(token)) },

    // ── The meter ──
    /** Null when a paid request may run. Checked in this order: what no one but the owner can fix comes first.
     * The calls running count with what they hold (see `reserve`). */
    mayCall(person: Person, address: string): Reason | null { return check(person, address).reason },
    /**
     * A live call about to be sent: it holds RESERVE_USD of the person's allowance, of a visitor's address and of the
     * public's day and month until `release` (when its cost arrives and is charged). The reason it may not, by the
     * same checks as `mayCall`.
     */
    reserve(person: Person, address: string): (() => void) | Reason {
      const { reason, hash } = check(person, address)
      if (reason) return reason
      const m = micros(RESERVE_USD), id = person.id
      const add = (map: Map<string, number>, k: string, by: number) => { const v = (map.get(k) ?? 0) + by; if (v > 0) map.set(k, v); else map.delete(k) }
      add(held.people, id, m)
      if (hash) add(held.addresses, hash, m)
      held.all += m
      let done = false
      return () => {
        if (done) return
        done = true
        add(held.people, id, -m)
        if (hash) add(held.addresses, hash, -m)
        held.all -= m
      }
    },
    /** True when a paid request would get `paused`. */
    paused() {
      const c = caps()
      return mode() === 'starters' || spentSince(dayStart()) >= micros(c.dayUsd) || spentSince(monthStart()) >= micros(c.monthUsd)
    },
    /** A person's one paid request at a time: a release, or null while another runs. */
    hold(id: string): (() => void) | null {
      if (busy.has(id)) return null
      busy.add(id)
      let done = false
      return () => { if (!done) { done = true; busy.delete(id) } }
    },
    /** One model call's cost: a calls row, the person's spent, and the address's when a visitor. `null` costs UNKNOWN_USD. */
    charge(person: Person, cost: number | null, model: string, address: string) {
      const m = micros(cost ?? UNKNOWN_USD)
      db.transaction(() => {
        db.query('INSERT INTO calls (at, person, usd, model) VALUES (?, ?, ?, ?)').run(now(), person.id, m, model)
        db.query('UPDATE people SET spent = spent + ? WHERE id = ?').run(m, person.id)
        const p = row(person.id)
        if (p && p.email === null) bump(addr(address).hash, 'usd', m)
      })()
    },
    /** When the last call to `model` ran, or null. */
    lastCall(model: string) { return (db.query('SELECT MAX(at) AS at FROM calls WHERE model = ?').get(model) as { at: number | null }).at },
    spent,

    // ── Sign-in ──
    /** A six-digit code for `email` (a new one replaces the old), or why not: `mail` when today's mail is used up,
     * `codes` when this network asked for its 10 today, `locked` when this email asked for its 5 today or made its 15
     * wrong tries, `soon` when it asked less than a minute ago. The email's counts are kept apart from the code, and
     * the day's mail is counted here, before the send, and never given back. It never depends on the address's
     * accounts or on whether the email has one: the accounts are checked at verify. */
    makeCode(email: string, asker: string | null, address: string): { code: string } | 'email' | 'mail' | 'codes' | 'locked' | 'soon' {
      if (!validEmail(email)) return 'email'
      const e = normalEmail(email)
      return db.transaction(() => {
        if (mailToday() >= caps().mailPerDay) return 'mail'
        const a = addr(address)
        if (a.codes >= CODES_PER_ADDRESS) return 'codes'
        const m = emailDay(e)
        if (m.codes >= CODES_PER_EMAIL || m.wrong >= WRONG_PER_EMAIL) return 'locked'
        if (m.asked && now() < m.asked + CODE_AGAIN_MS) return 'soon'
        bump(a.hash, 'codes')
        db.query('UPDATE emails SET codes = codes + 1, asked = ? WHERE day = ? AND hash = ?').run(now(), day(), m.hash)
        put('mail', `${day()}:${mailToday() + 1}`)
        const code = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, '0')
        db.query('INSERT OR REPLACE INTO codes (email, hash, person, expires, tries) VALUES (?, ?, ?, ?, 0)').run(e, sha(`${e}:${code}`), asker, now() + CODE_MS)
        return { code }
      })()
    },
    checkCode: (email: string, code: string) => checkCode(email, code),
    /** A code whose mail did not go: it can never be used. */
    dropCode(email: string) { db.query('DELETE FROM codes WHERE email = ?').run(normalEmail(email)) },
    /** Sign in by code, with a new session. A new email takes over the visitor (or makes a person) and its
     * top-up waits; an existing account comes back with `merged`, the visitor's id, whose rows are gone: the
     * caller moves that cache file in. `code` for a wrong code, `locked` when the email made its 15 wrong tries today,
     * `blocked` for a blocked email (after the right code, so only its owner learns it), `address` when the address
     * made its accounts (the right code stays good then). */
    verify(email: string, code: string, visitor: string | null, address: string): Verified | 'code' | 'locked' | 'blocked' | 'address' {
      const e = normalEmail(email)
      if (!validEmail(e)) return 'code'
      return db.transaction((): Verified | 'code' | 'locked' | 'blocked' | 'address' => {
        if (emailDay(e).wrong >= WRONG_PER_EMAIL) return 'locked'
        if (!checkCode(e, code, true)) return 'code'
        const account = byEmail(e)
        if (isBlocked(e) || account?.blocked) { db.query('DELETE FROM codes WHERE email = ?').run(e); return 'blocked' }
        const a = addr(address)
        if (!account && a.accounts >= caps().addressAccounts) return 'address'
        db.query('DELETE FROM codes WHERE email = ?').run(e)
        const v = visitor ? row(visitor) : null
        const fromVisitor = v && v.email === null ? v.id : null
        if (account) {
          if (fromVisitor) remove(fromVisitor)
          return { person: account, token: session(account.id), merged: fromVisitor }
        }
        bump(a.hash, 'accounts')
        let id = fromVisitor
        if (id) db.query('UPDATE people SET email = ?, topupDue = ? WHERE id = ?').run(e, topupAt(), id)
        else id = insertPerson(e, topupAt())
        return { person: byId(id)!, token: session(id), merged: null }
      })()
    },
    /** Counts one email sent; `mailToday` is today's count. */
    mailed() { put('mail', `${day()}:${mailToday() + 1}`) },
    mailToday,

    // ── Top-ups and requests ──
    /** The people whose waiting top-up is due now. */
    topupsDue(): Person[] { return (db.query('SELECT * FROM people WHERE topupDue IS NOT NULL AND topupDue <= ? AND blocked = 0').all(now()) as Row[]).map(toPerson) },
    /** Hands out a person's waiting top-up now; null when none waits (so it never comes twice). */
    grantTopup(id: string): Person | null {
      return db.transaction(() => {
        const p = row(id)
        if (!p || p.topupDue === null) return null
        db.query('UPDATE people SET allowance = allowance + ?, topupDue = NULL WHERE id = ?').run(micros(caps().topup), id)
        return byId(id)
      })()
    },
    /** A quota request: its id, or `register` (a visitor), `note` (empty or over 500), `open` (one waits already). */
    ask(id: string, note: string): number | 'register' | 'blocked' | 'note' | 'open' {
      const p = row(id)
      if (!p || p.email === null) return 'register'
      if (p.blocked) return 'blocked'
      const n = note.trim()
      if (!n || n.length > NOTE_CHARS) return 'note'
      if (db.query('SELECT 1 FROM requests WHERE person = ? AND answer IS NULL').get(id)) return 'open'
      return Number(db.query('INSERT INTO requests (person, note, at) VALUES (?, ?, ?)').run(id, n, now()).lastInsertRowid)
    },
    /** Answers an open request; approved adds `usd` (default $0.50) to the allowance. Null when it is gone or answered. */
    answer(requestId: number, approved: boolean, amount = ASK_USD): { request: Request; person: Person } | null {
      return db.transaction(() => {
        const r = db.query('SELECT * FROM requests WHERE id = ? AND answer IS NULL').get(requestId) as any
        if (!r) return null
        const m = approved ? Math.max(0, micros(amount)) : null
        db.query('UPDATE requests SET answer = ?, answeredAt = ?, usd = ? WHERE id = ?').run(approved ? 'approved' : 'refused', now(), m, requestId)
        if (m) db.query('UPDATE people SET allowance = allowance + ? WHERE id = ?').run(m, r.person)
        return { request: request(requestId)!, person: byId(r.person)! }
      })()
    },
    request,
    /** A person's latest request, for /api/me. */
    lastRequest(id: string): Request | null {
      const r = db.query('SELECT r.*, p.email FROM requests r LEFT JOIN people p ON p.id = r.person WHERE r.person = ? ORDER BY r.id DESC LIMIT 1').get(id)
      return r ? requestOf(r) : null
    },

    // ── Steps ──
    /** Counts a step once per person (`person` null for `arrived` before there is one); `arrived` at most 50 a day per address. True when counted. */
    step(person: string | null, step: Step, address: string): boolean {
      if (!STEPS.includes(step)) return false
      return db.transaction(() => {
        const p = person ? row(person) : null
        if (person && !p) return false
        if (step !== 'arrived' && !p) return false
        const done = p?.steps ? p.steps.split(',') : []
        if (done.includes(step)) return false
        if (step === 'arrived') {
          const a = addr(address)
          if (a.arrived >= ARRIVED_PER_ADDRESS) return false
          bump(a.hash, 'arrived')
        }
        if (p) db.query('UPDATE people SET steps = ? WHERE id = ?').run([...done, step].join(','), p.id)
        db.query('INSERT INTO steps (day, step, n) VALUES (?, ?, 1) ON CONFLICT (day, step) DO UPDATE SET n = n + 1').run(day(), step)
        return true
      })()
    },
    steps,

    // ── Settings ──
    settings() { return { mode: mode(), caps: caps() } },
    setMode(m: Mode) { if (m === 'open' || m === 'starters') put('mode', m) },
    /** Changes the caps given; a value that is not a number at or above 0 is ignored. */
    setCaps(change: Partial<Caps>) {
      const next = { ...JSON.parse(get('caps') ?? '{}') }
      for (const [k, v] of Object.entries(change)) if (Object.hasOwn(CAPS, k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) next[k] = v
      put('caps', JSON.stringify(next))
      return caps()
    },

    // ── Share tokens ──
    addShare(token: string, person: string) { db.query('INSERT OR REPLACE INTO shares (token, person) VALUES (?, ?)').run(token, person) },
    shareOwner(token: string) { return (db.query('SELECT person FROM shares WHERE token = ?').get(token) as { person: string } | null)?.person ?? null },
    removeShare(token: string) { db.query('DELETE FROM shares WHERE token = ?').run(token) },
    /** Moves share tokens from one person to another (a merge). */
    moveShares(from: string, to: string) { db.query('UPDATE shares SET person = ? WHERE person = ?').run(to, from) },

    // ── The admin ──
    /** What /api/admin shows from the database; the caller adds each person's mockups, the address and startersCurrent. */
    summary() {
      return {
        spent: spent(), caps: caps(), mode: mode(), steps: steps(), mailToday: mailToday(),
        people: (db.query('SELECT * FROM people ORDER BY seen DESC').all() as Row[]).map(toPerson),
        requests: (db.query('SELECT r.*, p.email FROM requests r LEFT JOIN people p ON p.id = r.person ORDER BY r.answer IS NOT NULL, r.id DESC LIMIT 200').all()).map(requestOf),
      }
    },
    /** Blocks or unblocks a person, and their email (hashed) in `blocked`, which outlives the person. */
    block(id: string, blocked: boolean) {
      db.transaction(() => {
        db.query('UPDATE people SET blocked = ? WHERE id = ?').run(blocked ? 1 : 0, id)
        const e = row(id)?.email
        if (e && blocked) db.query('INSERT OR IGNORE INTO blocked (hash) VALUES (?)').run(emailHash(e))
        else if (e) db.query('DELETE FROM blocked WHERE hash = ?').run(emailHash(e))
      })()
      return byId(id)
    },
    /** Adds `amount` USD to an allowance (a negative one takes away, never below 0). */
    give(id: string, amount: number) {
      if (!Number.isFinite(amount)) return byId(id)
      db.query('UPDATE people SET allowance = MAX(0, allowance + ?) WHERE id = ?').run(micros(amount), id)
      return byId(id)
    },
    /** Deletes a person and every row about them; the caller deletes their cache file. */
    deletePerson(id: string) { db.transaction(() => remove(id))() },
    /** Visitors with no request for `IDLE_DAYS`: the caller deletes each one's file, then the person. */
    idleVisitors(): string[] {
      return (db.query('SELECT id FROM people WHERE email IS NULL AND seen < ?').all(now() - IDLE_DAYS * 86_400_000) as { id: string }[]).map((r) => r.id)
    },
    close() { db.close() },
  }
}
