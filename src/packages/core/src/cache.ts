// The screen cache: each screen, its open A OR B until a pick, then its versions, and the click that
// made it. Each mockup has its boxes (components are entries), their last states and the fixer's notes.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BOX_STATES, LIMITS, VISITS_KEPT, canonicalAction, isId, nameWords, normalizePrompt, screenKey, screenRef } from './keys.ts'
import { pasteComponents, type Device } from './frame.ts'
import { HOME_NAME, isComponent, nameFrom, screenList, screenTree, uniqueName } from './tree.ts'
import type { ModelId } from './models.ts'
import type { Paper } from './prompt.ts'

export interface Version {
  html: string
  model: ModelId
  servedModel: string | null
  createdAt: string
  costUsd: number | null
  costEstimated: boolean
  /** Milliseconds to the first text chunk, and to the end. */
  firstChunkMs: number | null
  totalMs: number
  finishReason: string | null
  /** Absent on screens made before devices. */
  device?: Device
  /** The model's short name for the screen, and its design idea in one sentence. */
  name?: string
  idea?: string
  /** The Edit request that made this version; `by` is 'fixer' when a visit asked for it. */
  feedback?: string
  by?: 'fixer'
}

/** The screen and click that first made a screen. */
interface Parent { key: string; label: string }

export interface CacheEntry {
  key: string
  app: string
  action: string | null
  /** The name links use (`@sleep-report`); `home` for the first screen. */
  name?: string
  /** Null for the first screen (and screens made without a click). */
  parent: Parent | null
  /** Oldest first; the last one shows. Empty while the A OR B is open. */
  versions: Version[]
  /** The open A OR B, by side; null until a side finishes (or if it failed). */
  proposals?: (Version | null)[]
  /** A component: its ID is `name`, where it belongs is `action`, parent is the screen it came from. */
  kind?: 'component'
  filed?: Filing
  by?: Mark['by']
  at?: string
  seen?: boolean
}

/** Who last wrote a box entry and when, and whether the user has looked at it since. */
interface Mark { by: 'filing' | 'fixer' | 'user'; at: string; seen: boolean }
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
interface BoxState { list: Entry[]; gone: string[]; what?: string; at?: string }
/** A change Undo can take back: what it was, when. */
export type Past = { what: string; at?: string }

/** How to undo one change of the fixer: put an entry back (`over` the one it changed), drop an entry it added, or drop a version it drew. */
export type Undo = { put: BoxName; entry: Entry; index: number; over?: true } | { drop: BoxName; id: string } | { key: string; createdAt: string }
/** One change of a visit, in words (`merged a into b`), with the fixer's note on why. */
export interface Change { text: string; note?: string; undo?: Undo; undone?: boolean }
/** One visit of the fixer; `ask`: the user's request, for an Edit of a box. */
export interface Visit { at: string; ask?: string; undone?: boolean; ms: number; costUsd: number | null; screens: number; changes: Change[]; refused: string[]; error?: string; seen: boolean }

/** A share link of a mockup: its role, its cap on the screens and changes it may ask for (edit links), and how much it was used. */
export interface Share { token: string; role: 'view' | 'comment' | 'edit'; createdAt: string; cap?: number; used: number; opens: number }
/** What a visitor of a share link said: a comment (`about` a part), a thumb, the answer at a dead control, or the closing answer. */
export interface Feedback { at: string; visitor: string; name: string; screen: string; title: string; kind: 'comment' | 'thumb' | 'dead' | 'done'; text?: string; about?: string; up?: boolean; label?: string }
/** One visit of a share link: the screens seen in order and the dead controls clicked. */
export interface Trip { id: string; visitor: string; name: string; at: string; screens: string[]; dead: string[] }
/** A mockup's share links and what came back through them. */
export interface Shared { shares: Share[]; feedback: Feedback[]; trips: Trip[] }

export const BOXES: BoxName[] = ['components', 'rules', 'data']
export const idOf = (x: Entry) => ('id' in x ? x.id : x.name!)
const emptyBoxes = (): Boxes => ({ rules: [], data: [], gone: { components: [], rules: [], data: [] } })
const componentKey = (app: string, id: string) => `${normalizePrompt(app)} » #${id}`

export const PROPOSALS = 2

// Format 5 adds the boxes (and later their states). Files of format 3 and 4 load with empty boxes.
const FORMAT = 5

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()
  private boxes = new Map<string, Boxes>()
  private states = new Map<string, Partial<Record<BoxName, BoxState[]>>>()
  private shared = new Map<string, Shared>()
  /** The change running (see group), and the change each box last kept a state for. */
  private change: number | null = null
  private kept = new Map<string, number>()
  /** What each change is, in words, for a box's Past changes; the outermost group names it. */
  private whats = new Map<number, string>()
  /** When each key was last deleted, on a counter, so a design still streaming cannot bring it back. */
  private removed = new Map<string, number>()
  private clock = 0
  /** Why the cache does not write its file: it is from a newer app. */
  readonly warning: string | null = null

  constructor(private file: string | null = null) {
    if (!file || !existsSync(file)) return
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof data?.version === 'number' && data.version > FORMAT) {
        this.warning = `The screen cache ${file} is from a newer version of UX Woz (format ${data.version}); it is left as it is, and nothing made now is saved.`
        console.warn(this.warning)
        this.file = null
        return
      }
      if (!(data?.version >= 3)) throw new Error('it is from before names')
      // A screen from before names with no name yet (an old A OR B) goes; the first screen is home.
      for (const e of data.entries as CacheEntry[]) if (e.name || e.key === normalizePrompt(e.app)) this.entries.set(e.key, { name: HOME_NAME, ...e })
      for (const [root, b] of Object.entries(data.boxes ?? {})) this.boxes.set(root, b as Boxes)
      for (const [root, s] of Object.entries(data.states ?? {})) this.states.set(root, s as Record<BoxName, BoxState[]>)
      for (const [root, s] of Object.entries(data.shared ?? {})) this.shared.set(root, s as Shared)
    } catch (err) {
      this.entries.clear()
      const aside = `${file}.corrupt-${Date.now()}`
      renameSync(file, aside)
      console.warn(`screen cache ${file} was unreadable (${err}); moved it to ${aside} and started empty`)
    }
  }

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key)
  }

  /** The screen an action opens, if the mockup has it: the first screen, or the one named by `@name`. */
  find(app: string, action: string | null): CacheEntry | undefined {
    const ref = canonicalAction(action) && screenRef(action!)
    return ref ? this.mockup(app).find((e) => e.name === ref.name && !isComponent(e)) : this.entries.get(normalizePrompt(app))
  }

  now(): number {
    return this.clock
  }

  /** True when `key` was deleted after `since` (a value of now()), even if it did not exist then. */
  removedSince(key: string, since: number): boolean {
    return (this.removed.get(key) ?? -1) > since
  }

  private tomb(key: string) {
    this.removed.set(key, ++this.clock)
  }

  /** Store one finished side of a new screen's A OR B; the first side makes the screen. Undefined once picked. */
  propose(app: string, action: string | null, side: number, version: Version, parent: Parent | null = null): CacheEntry | undefined {
    action = canonicalAction(action)
    let entry = this.find(app, action)
    if (!entry) {
      const key = screenKey(app, action)
      const ref = action ? screenRef(action) : null
      if (action && !ref) return undefined
      // A parent must be a picked screen of this mockup; a click that raced a delete makes no parent.
      const from = parent && this.entries.get(parent.key)
      const ok = action && parent && from?.versions.length && normalizePrompt(from.app) === normalizePrompt(app)
      entry = {
        key, app, action: ref ? ref.prompt || nameWords(ref.name) : null, name: ref ? ref.name : HOME_NAME,
        parent: ok ? { key: parent!.key, label: parent!.label } : null, versions: [], proposals: Array(PROPOSALS).fill(null),
      }
      this.entries.set(key, entry)
    }
    if (!entry.proposals || !Number.isInteger(side) || side < 0 || side >= entry.proposals.length) return undefined
    entry.proposals[side] = version
    this.save()
    return entry
  }

  pick(key: string, side: number): CacheEntry | undefined {
    const entry = this.entries.get(key)
    const v = Number.isInteger(side) ? entry?.proposals?.[side] : null
    if (!entry || !v) return undefined
    entry.versions = [v]
    delete entry.proposals
    const b = this.own(entry.app)
    b.picks = (b.picks ?? 0) + 1
    this.save()
    return entry
  }

  addVersion(key: string, version: Version): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry?.versions.length) return undefined
    if (isComponent(entry)) this.keep(entry.app, 'components', version.feedback ? `Edit of ${entry.name}: ${version.feedback}` : `A new design of ${entry.name}`)
    entry.versions.push(version)
    this.save()
    return entry
  }

  /** Filing put a paste placeholder where a part was: no new version, as the screen looks the same. */
  setNewestHtml(key: string, html: string) {
    const v = this.entries.get(key)?.versions.at(-1)
    if (v) { v.html = html; this.save() }
  }

  noteFiling(key: string, run: Filing) {
    const e = this.entries.get(key)
    if (e) { e.filed = run; this.save() }
  }

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
  private keep(app: string, box: BoxName, what = '') {
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

  undo(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry || entry.versions.length < 2) return undefined
    if (isComponent(entry)) this.keep(entry.app, 'components', `You undid a version of ${entry.name}`)
    entry.versions.pop()
    this.save()
    return entry
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

  /** A mockup's boxes, to read: empty ones for a mockup that has none yet. */
  boxesOf(app: string): Boxes {
    return this.boxes.get(normalizePrompt(app)) ?? emptyBoxes()
  }

  /** A mockup's boxes, to change: stored from now on. */
  private own(app: string): Boxes {
    const root = normalizePrompt(app)
    let b = this.boxes.get(root)
    if (!b) this.boxes.set(root, (b = emptyBoxes()))
    return b
  }

  /** A mockup's share links, feedback and trips, to read or change; stored once changed and saved. */
  sharedOf(app: string): Shared {
    const root = normalizePrompt(app)
    let s = this.shared.get(root)
    if (!s) this.shared.set(root, (s = { shares: [], feedback: [], trips: [] }))
    return s
  }

  /** The share link with this token, and the mockup's first screen key. */
  share(token: string): { root: string; share: Share } | undefined {
    for (const [root, s] of this.shared) for (const share of s.shares) if (share.token === token) return { root, share }
    return undefined
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

  /** Every mockup once, as first typed, with its number of screens; most recently changed first. */
  apps(): { app: string; screens: number; updatedAt: string }[] {
    const byRoot = new Map<string, { app: string; screens: number; updatedAt: string }>()
    for (const e of this.entries.values()) {
      const root = normalizePrompt(e.app)
      const a = byRoot.get(root) ?? { app: e.app, screens: 0, updatedAt: '' }
      if (!isComponent(e)) a.screens++
      for (const v of [...e.versions, ...(e.proposals ?? [])]) if (v && v.createdAt > a.updatedAt) a.updatedAt = v.createdAt
      byRoot.set(root, a)
    }
    return [...byRoot.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** Delete a screen and the screens only it reaches (the first screen takes the mockup); the keys removed. */
  delete(key: string): string[] | undefined {
    const entry = this.entries.get(key)
    // Even an unknown key is marked: an A OR B dropped before its first side finished stays dropped.
    this.tomb(key)
    if (!entry) return undefined
    const root = normalizePrompt(entry.app)
    if (isComponent(entry)) {
      // Screens that paste it show nothing in its place; no screen goes with it.
      this.keep(entry.app, 'components', `You deleted ${entry.name}`)
      this.entries.delete(key)
      this.own(entry.app).gone.components.push(entry.name!)
      this.save()
      return [key]
    }
    if (key === root) {
      const gone = this.mockup(root).map((e) => e.key)
      this.deleteApp(entry.app)
      return gone
    }
    const before = screenTree(this.mockup(root))
    this.entries.delete(key)
    const after = screenTree(this.mockup(root))
    const removed = [key]
    for (const k of before.keys()) if (!after.has(k) && this.entries.delete(k)) removed.push(k)
    // A screen first made from a screen that is gone now hangs under the one that reaches it.
    for (const e of this.mockup(root)) {
      const node = after.get(e.key)
      if (e.parent && !this.entries.has(e.parent.key)) e.parent = node?.parent && this.entries.has(node.parent) ? { key: node.parent, label: node.label } : null
    }
    for (const k of removed) this.tomb(k)
    this.save()
    return removed
  }

  deleteApp(app: string): number {
    const root = normalizePrompt(app)
    const gone = this.mockup(root)
    this.tomb(root)
    for (const e of gone) { this.entries.delete(e.key); this.tomb(e.key) }
    const boxes = this.boxes.delete(root)
    this.states.delete(root)
    const shared = this.shared.delete(root)
    if (gone.length || boxes || shared) this.save()
    return gone.filter((e) => !isComponent(e)).length
  }

  get size(): number {
    return this.entries.size
  }

  /** One mockup's screens, oldest first: the order the tree uses for children. */
  private mockup(app: string): CacheEntry[] {
    const root = normalizePrompt(app)
    return [...this.entries.values()].filter((e) => normalizePrompt(e.app) === root)
  }

  save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    // Write a temp file, then rename, so a crash never leaves half a cache file.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: FORMAT, entries: [...this.entries.values()], boxes: Object.fromEntries(this.boxes), states: Object.fromEntries(this.states), shared: Object.fromEntries(this.shared) }, null, 1))
    renameSync(tmp, this.file)
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
