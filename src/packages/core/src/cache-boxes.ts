// The screen cache's boxes: components (entries of the cache), rules and tables within the manual's limits,
// their last states for Undo, and the fixer's notes and their Undo. The screens and the file are in cache.ts.

import { BOX_STATES, LIMITS, VISITS_KEPT, isId, normalizePrompt } from './keys.ts'
import { pasteComponents, type Device } from './frame.ts'
import { HOME_NAME, isComponent, nameFrom, screenList, uniqueName } from './tree.ts'
import type { Paper } from './prompt.ts'
import { ScreenCacheBase, type CacheEntry, type Parent, type Version } from './cache.ts'

/** Who last wrote a box entry and when, and whether the user has looked at it since. */
export interface Mark { by: 'filing' | 'fixer' | 'user'; at: string; seen: boolean }
export interface Rule extends Mark { id: string; text: string }
export interface Table extends Mark { id: string; columns: string[]; rows: string[][] }
export type BoxName = 'components' | 'rules' | 'data'
export type Entry = Rule | Table | CacheEntry
export type EntryBody = { id: string; text?: string; columns?: string[]; rows?: string[][] }
/** A mockup's Rules and Data (its components are entries), and the IDs each box used and deleted. */
export interface Boxes {
  rules: Rule[]
  data: Table[]
  gone: Record<BoxName, string[]>
  /** The fixer's notes, oldest first (the last 20), and the picks so far. */
  visits?: Visit[]
  picks?: number
}

/** A filing: when, on which screen, what it added, changed and refused, its time and cost. */
export interface Filing { at: string; screen: string; ms: number; costUsd: number | null; added: string[]; changed: string[]; refused: string[]; error?: string }
/** A box as it was before a change (`what` it was, `at` when): its entries and the IDs it had used. It keeps the last BOX_STATES. */
export interface BoxState { list: Entry[]; gone: string[]; what?: string; at?: string }
/** A change Undo can take back: what it was, when. */
export type Past = { what: string; at?: string }

/** How to undo one change of the fixer: put an entry back (`over` the one it changed), drop an entry it added, or drop a version it drew. */
export type Undo = { put: BoxName; entry: Entry; index: number; over?: true } | { drop: BoxName; id: string } | { key: string; createdAt: string }
/** One change of a visit, in words (`merged a into b`), with the fixer's note on why. */
export interface Change { text: string; note?: string; undo?: Undo; undone?: boolean }
/** One visit of the fixer; `ask`: the user's request, for an Edit of a box. */
export interface Visit { at: string; ask?: string; undone?: boolean; ms: number; costUsd: number | null; screens: number; changes: Change[]; refused: string[]; error?: string; seen: boolean }

export const BOXES: BoxName[] = ['components', 'rules', 'data']
export const idOf = (x: Entry) => ('id' in x ? x.id : x.name!)
const componentKey = (app: string, id: string) => `${normalizePrompt(app)} » #${id}`

export class ScreenCache extends ScreenCacheBase {
  /** The change running (see group), and the change each box last kept a state for. */
  private change: number | null = null
  private kept = new Map<string, number>()
  /** What each change is, in words, for a box's Past changes; the outermost group names it. */
  private whats = new Map<number, string>()

  noteVisit(app: string, v: Visit) {
    const b = this.own(app)
    b.visits = [...(b.visits ?? []), v].slice(-VISITS_KEPT)
    this.save()
  }

  /** Run `fn` as one change (or go on with `change`), `what` in words: each box it changes keeps one state for its Undo. */
  group<T>(fn: (change: number) => T, change?: number, what?: string): T {
    const outer = this.change
    this.change = change ?? outer ?? ++this.clock
    if (what && !this.whats.has(this.change)) this.whats.set(this.change, what)
    // A visit's redraws come back to its change later; older names are not needed.
    if (this.whats.size > 50) this.whats.delete(this.whats.keys().next().value!)
    try { return fn(this.change) } finally { this.change = outer }
  }

  /** Keep a box's state before it changes (`what`, unless a group names it), once a change, the last BOX_STATES of them. */
  protected keep(app: string, box: BoxName, what = '') {
    const root = normalizePrompt(app), k = `${root} ${box}`, change = this.change ?? ++this.clock
    if (this.kept.get(k) === change) return
    this.kept.set(k, change)
    const s = this.states.get(root) ?? {}
    this.states.set(root, s)
    s[box] = [...s[box] ?? [], structuredClone({ list: this.list(app, box), gone: this.boxesOf(app).gone[box], what: this.whats.get(change) ?? what, at: new Date().toISOString() })].slice(-BOX_STATES)
  }

  /** Each box's changes that Undo can take back, oldest first: what each was and when. */
  past(app: string): Record<BoxName, Past[]> {
    const s = this.states.get(normalizePrompt(app))
    return Object.fromEntries(BOXES.map((b) => [b, (s?.[b] ?? []).map((x) => ({ what: x.what ?? 'A change', at: x.at }))])) as Record<BoxName, Past[]>
  }

  /** Put a box back as it was before its last change; a component it drops leaves its HTML in place, its ID stays used. Why not, or null. */
  undoBox(app: string, box: BoxName): string | null {
    const st = this.states.get(normalizePrompt(app))?.[box]?.pop()
    if (!st) return 'nothing to undo'
    const b = this.own(app), then = new Set(st.list.map(idOf)), gone = new Set([...st.gone, ...b.gone[box]])
    for (const x of this.list(app, box)) {
      if (!then.has(idOf(x))) { gone.add(idOf(x)); if (box === 'components') this.inline(app, x as CacheEntry) }
      if (box === 'components') this.entries.delete((x as CacheEntry).key)
    }
    if (box === 'components') for (const e of st.list as CacheEntry[]) this.entries.set(e.key, e)
    else b[box] = st.list as Rule[] & Table[]
    b.gone[box] = [...gone].filter((x) => !then.has(x))
    this.save()
    return null
  }

  /** Undo every change of the newest visit not undone yet, skipping (and naming) what cannot be; the next goes to the visit before. */
  undoVisit(app: string): string | null {
    const v = this.boxesOf(app).visits?.findLast((x) => !x.undone && x.changes.some((c) => c.undo && !c.undone))
    if (!v) return 'nothing to undo'
    v.undone = true
    // The last change first, so a change made on top of another is undone before it.
    const whys = this.group(() => [...v.changes.keys()].reverse().map((i) => this.undoChange(app, v.at, i)), undefined, 'You undid a visit')
    this.save()
    return whys.find((why) => why && why !== 'nothing to undo') ?? null
  }

  /** Undo change `i` of the visit that started `at`. Returns why not, or null. */
  undoChange(app: string, at: string, i: number): string | null {
    return this.group(() => this.undoOne(app, at, i), undefined, 'You undid a change of the fixer')
  }

  private undoOne(app: string, at: string, i: number): string | null {
    const b = this.own(app), c = b.visits?.find((v) => v.at === at)?.changes[i], u = c?.undo
    if (!c || !u || c.undone) return 'nothing to undo'
    // An entry already back, or one changed and gone since, counts as undone; so does a version the user already undid.
    if ('put' in u) {
      // A merge, a remove or a change (`over`): the entry comes back where it was, with its ID.
      const e = u.entry, id = idOf(e), list = this.list(app, u.put), here = list.findIndex((x) => idOf(x) === id)
      if ((here >= 0) === !u.over) { /* nothing left to undo */ }
      else if (u.over && list[here]!.by !== 'fixer') return `you changed ${id} since`
      else if (!u.over && list.length >= LIMITS[u.put]) return `${u.put} is full (${LIMITS[u.put]})`
      else {
        this.keep(app, u.put)
        if (u.put === 'components') {
          const all = [...this.entries.values()], at = all.indexOf(all.filter(isComponent)[u.index]!)
          if (here < 0) all.splice(at < 0 ? all.length : at, 0, e as CacheEntry)
          this.entries = new Map(all.map((x) => [x.key, x.key === (e as CacheEntry).key ? e as CacheEntry : x]))
        } else (b[u.put] as (Rule | Table)[]).splice(here < 0 ? u.index : here, here < 0 ? 0 : 1, e as Rule & Table)
        b.gone[u.put] = b.gone[u.put].filter((x) => x !== id)
      }
    } else if ('drop' in u) {
      const now = this.list(app, u.drop).find((x) => idOf(x) === u.id)
      if (now?.by === 'user') return `you changed ${u.id} since`
      const why = !now ? null : u.drop === 'components' ? this.removeComponent(app, u.id) : this.setBox(app, 'delete', u.drop, { id: u.id }, 'user')
      if (why) return why
    } else {
      const e = this.entries.get(u.key), n = e?.versions.findIndex((v) => v.createdAt === u.createdAt) ?? -1
      if (e && n >= 0 && e.versions.length > 1) {
        if (isComponent(e)) this.keep(e.app, 'components')
        e.versions.splice(n, 1)
      }
    }
    c.undone = true
    this.save()
    return null
  }

  /** Remove a component, leaving its HTML where it was pasted. Returns why not, or null. */
  removeComponent(app: string, id: string): string | null {
    const c = this.component(app, id)
    if (!c) return `components has no ${id}`
    this.inline(app, c)
    this.delete(c.key)
    return null
  }

  /** Each screen that pastes component `c` gets its HTML in its place. */
  private inline(app: string, c: CacheEntry) {
    const html = c.versions.at(-1)?.html
    for (const e of this.mockup(app)) { const v = e.versions.at(-1); if (v && html != null) v.html = pasteComponents(v.html, { [c.name!]: html }, 1) }
  }

  /** The paper every model call reads: the screens' titles and lines, and the three boxes in full. */
  paper(app: string, device?: Device): Paper {
    const all = this.mockup(app), b = this.boxesOf(app)
    const screens = all.filter((e) => !isComponent(e) && e.versions.length)
    const components = all.filter((e) => isComponent(e) && e.versions.length).map((e) => ({ id: e.name!, where: e.action ?? '', html: e.versions.at(-1)!.html, by: e.by,
      on: screens.filter((s) => s.versions.at(-1)!.html.includes(`data-component="${e.name}"`)).map((s) => s.name ?? HOME_NAME) }))
    return { app, device, ...screenList(all), components, rules: b.rules, data: b.data }
  }

  map(app: string): { root: string; entries: CacheEntry[]; boxes: Boxes } {
    const root = normalizePrompt(app)
    return { root, entries: this.mockup(root), boxes: this.boxesOf(app) }
  }

  /** A box's entries, oldest first. */
  list(app: string, box: BoxName): Entry[] {
    return box === 'components' ? this.mockup(app).filter(isComponent) : this.boxesOf(app)[box]
  }

  private ids(app: string, box: BoxName): string[] {
    return this.list(app, box).map(idOf)
  }

  /** A free ID for a new entry, from its words: up to 3 of them, then -2, -3… if taken or used before. */
  freeId(app: string, box: BoxName, words: string): string {
    return uniqueName(nameFrom(words).split('-').slice(0, 3).join('-'), new Set([...this.ids(app, box), ...this.boxesOf(app).gone[box]]))
  }

  /** Why an ID cannot be a new entry of a box (a bad ID, one in use or used before, a full box), or null. */
  private refuseNew(app: string, box: BoxName, id: string): string | null {
    const have = this.ids(app, box)
    if (!isId(id)) return `"${id}" is no ID (1 to 4 lowercase words joined by dashes)`
    if (have.includes(id) || this.boxesOf(app).gone[box].includes(id)) return `${box} already has or had ${id}`
    return have.length >= LIMITS[box] ? `${box} is full (${LIMITS[box]})` : null
  }

  /** Add a component taken from a screen (`from`), or by the user. Returns the entry, or why not. */
  addComponent(app: string, id: string, where: string, version: Version, by: Mark['by'], from: Parent | null = null): CacheEntry | string {
    const why = this.refuseNew(app, 'components', id) ?? refuseLine(where)
    if (why) return why
    this.keep(app, 'components', `Added ${id}`)
    const e: CacheEntry = { key: componentKey(app, id), app, action: where.trim(), name: id, parent: from, versions: [version], kind: 'component', ...mark(by) }
    this.entries.set(e.key, e)
    this.save()
    return e
  }

  component(app: string, id: string): CacheEntry | undefined {
    return this.entries.get(componentKey(app, id))
  }

  /** Add, change or delete a rule or a table within the manual's limits. Returns why not, or null. */
  setBox(app: string, op: 'add' | 'set' | 'delete', box: 'rules' | 'data', entry: EntryBody, by: Mark['by']): string | null {
    const b = this.own(app), list: (Rule | Table)[] = b[box]
    const i = list.findIndex((x) => x.id === entry.id)
    const why = op === 'add' ? this.refuseNew(app, box, entry.id) : i < 0 ? `${box} has no ${entry.id}` : null
    const body = op === 'delete' ? null : box === 'rules' ? ruleBody(entry.text) : tableBody(entry.columns, entry.rows)
    if (why || typeof body === 'string') return why ?? (body as string)
    this.keep(app, box, `${by === 'user' ? 'You' : by === 'fixer' ? 'The fixer' : 'Filing'} ${op === 'add' ? 'added' : op === 'set' ? 'changed' : 'deleted'} ${entry.id}`)
    if (!body) {
      list.splice(i, 1)
      b.gone[box].push(entry.id)
    } else {
      const x = { id: entry.id, ...body, ...mark(by) } as Rule & Table
      if (op === 'add') list.push(x); else list[i] = x
    }
    this.save()
    return null
  }

  /** The user looked at a box: its entries (or those with `ids`; a visit's is `at`) are no longer new. */
  markSeen(app: string, box: BoxName | 'notes', ids?: string[]) {
    const list = (box === 'notes' ? this.own(app).visits ?? [] : this.list(app, box)) as { seen?: boolean; id?: string; name?: string; at?: string }[]
    for (const x of list) if (!ids || ids.includes(x.id ?? x.name ?? x.at ?? '')) x.seen = true
    this.save()
  }
}

const mark = (by: Mark['by']): Mark => ({ by, at: new Date().toISOString(), seen: by === 'user' })

/** Why a line (a rule, where a component belongs) cannot be stored, or null. */
export function refuseLine(text: unknown): string | null {
  if (typeof text !== 'string' || !text.trim() || /\n/.test(text.trim())) return 'a line must be one line of text'
  return text.trim().length > LIMITS.line ? `a line must be at most ${LIMITS.line} characters` : null
}

const ruleBody = (text: unknown) => refuseLine(text) ?? { text: (text as string).trim() }

function tableBody(columns: unknown, rows: unknown): { columns: string[]; rows: string[][] } | string {
  const ok = (r: unknown): r is string[] => Array.isArray(r) && r.every((c) => typeof c === 'string')
  if ([columns, ...(Array.isArray(rows) ? rows : [])].some((r) => ok(r) && r.some((c) => c.length > LIMITS.line))) return `a value must be at most ${LIMITS.line} characters`
  if (!ok(columns) || !columns.length || columns.length > LIMITS.columns || columns.some((c) => !c.trim())) return `a table has 1 to ${LIMITS.columns} named columns`
  if (!Array.isArray(rows) || rows.length > LIMITS.rows) return `a table has at most ${LIMITS.rows} rows`
  if (!rows.every((r) => ok(r) && r.length === columns.length)) return 'each row has one value per column'
  return { columns: columns.map((c) => c.trim()), rows: rows.map((r: string[]) => r.map((c) => c.trim())) }
}
