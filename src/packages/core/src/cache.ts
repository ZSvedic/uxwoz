// The screen cache: each screen under its name, its open A OR B until a pick, then its versions,
// and the click that first made it (the tree is worked out in tree.ts). Each mockup also has its
// boxes (components are entries of their own kind), the last filing and the fixer's notes.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { LIMITS, canonicalAction, isId, nameWords, normalizePrompt, screenKey, screenRef } from './keys.ts'
import type { Device } from './frame.ts'
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
  /** Milliseconds from request to first text chunk, and to the end of the stream. */
  firstChunkMs: number | null
  totalMs: number
  finishReason: string | null
  /** The device the screen was designed for; absent on screens made before devices existed. */
  device?: Device
  /** A short name the model gave the screen, e.g. "Planning sync". */
  name?: string
  /** One sentence naming the design idea, e.g. "Common actions as buttons on top". */
  idea?: string
  /** The Edit request that made this version; `by` is 'fixer' when a visit of the fixer asked for it. */
  feedback?: string
  by?: 'fixer'
}

/** The screen and click that first made a screen. */
export interface Parent { key: string; label: string }

export interface CacheEntry {
  key: string
  app: string
  action: string | null
  /** The name links use (`@sleep-report`): the one in the link that opened it, `home` for the first screen. */
  name?: string
  /** The screen and click that first made it; null for the first screen (and screens made without a click). */
  parent: Parent | null
  /** Oldest first; the last one shows. Empty while the A OR B is open. */
  versions: Version[]
  /** The open A OR B, by side; a side is null until it finishes (or if it failed). Gone after a pick. */
  proposals?: (Version | null)[]
  /** A component: its ID is `name`, where it belongs is `action`, parent is the screen it came from. */
  kind?: 'component'
  by?: Mark['by']
  at?: string
  seen?: boolean
}

/** Who last wrote a box entry and when, and whether the user has looked at its box since. */
export interface Mark { by: 'filing' | 'fixer' | 'user'; at: string; seen: boolean }
export interface Rule extends Mark { id: string; text: string }
export interface Table extends Mark { id: string; columns: string[]; rows: string[][] }
export type BoxName = 'components' | 'rules' | 'data'
/** A mockup's Rules and Data (its components are entries), and the IDs each box used and deleted. */
export interface Boxes {
  rules: Rule[]
  data: Table[]
  gone: Record<BoxName, string[]>
  /** The last filing: when, on which screen, what it added, changed and refused, its time and cost. */
  filed?: { at: string; screen: string; ms: number; costUsd: number | null; added: string[]; changed: string[]; refused: string[]; error?: string }
  /** The fixer's notes, oldest first (the last 20), and the number of picks so far (a visit comes every 5). */
  visits?: Visit[]
  picks?: number
}

/** How to undo one change of the fixer: put an entry back, drop an entry it added, or drop a version it drew. */
export type Undo = { put: BoxName; entry: Rule | Table | CacheEntry; index: number } | { drop: BoxName; id: string } | { key: string; createdAt: string }
/** One change of a visit, in words (`merged a into b`), with the fixer's note on why. */
export interface Change { text: string; note?: string; undo?: Undo; undone?: boolean }
/** One visit of the fixer: when it started, how many screens it read, what it changed and refused, its time and cost. */
export interface Visit { at: string; ms: number; costUsd: number | null; screens: number; changes: Change[]; refused: string[]; error?: string; seen: boolean }

const emptyBoxes = (): Boxes => ({ rules: [], data: [], gone: { components: [], rules: [], data: [] } })
const componentKey = (app: string, id: string) => `${normalizePrompt(app)} » #${id}`

export const PROPOSALS = 2

// Format 5 adds the boxes. Files of format 3 and 4 load with empty boxes; the spec feature's fields
// stay in the file, unread.
const FORMAT = 5

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()
  private boxes = new Map<string, Boxes>()
  /** When each key was last deleted, on a counter, so a design still streaming cannot bring it back. */
  private removed = new Map<string, number>()
  private clock = 0
  /** Why the cache does not write its file, when it does not: the file is from a newer version of the app. */
  readonly warning: string | null = null

  constructor(private file: string | null = null) {
    if (!file || !existsSync(file)) return
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof data?.version === 'number' && data.version > FORMAT) {
        // A newer app wrote it: leave it alone, and keep this session's screens in memory only.
        this.warning = `The screen cache ${file} is from a newer version of UX Woz (format ${data.version}); it is left as it is, and nothing made now is saved.`
        console.warn(this.warning)
        this.file = null
        return
      }
      if (!(data?.version >= 3)) throw new Error('it is from before names')
      for (const e of data.entries as CacheEntry[]) this.entries.set(e.key, e)
      for (const [root, b] of Object.entries(data.boxes ?? {})) this.boxes.set(root, b as Boxes)
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

  /** The screen an action opens, if the mockup has it: the first screen, or the screen with the name in `@name`. */
  find(app: string, action: string | null): CacheEntry | undefined {
    const ref = canonicalAction(action) && screenRef(action!)
    return ref ? this.mockup(normalizePrompt(app)).find((e) => e.name === ref.name && !isComponent(e)) : this.entries.get(normalizePrompt(app))
  }

  now(): number {
    return this.clock
  }

  /** True when `key` was deleted after `since` (a value of now()), even if it did not exist then. */
  removedSince(key: string, since: number): boolean {
    return (this.removed.get(key) ?? -1) > since
  }

  /** True when the mockup, or any screen or component of it, was deleted after `since`. */
  removedIn(root: string, since: number): boolean {
    return [...this.removed].some(([k, t]) => t > since && (k === root || k.startsWith(`${root} » `)))
  }

  private tomb(key: string) {
    this.removed.set(key, ++this.clock)
  }

  /**
   * Store one finished side of a new screen's A OR B; the first side makes the screen, named by its
   * `@name: prompt`. Undefined when a side was already picked.
   */
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
    entry.versions.push(version)
    this.save()
    return entry
  }

  /** Filing put a paste placeholder where a part was: no new version, as the screen looks the same. */
  setNewestHtml(key: string, html: string) {
    const v = this.entries.get(key)?.versions.at(-1)
    if (v) { v.html = html; this.save() }
  }

  noteFiling(app: string, run: Boxes['filed']) {
    this.own(app).filed = run
    this.save()
  }

  noteVisit(app: string, v: Visit) {
    const b = this.own(app)
    b.visits = [...(b.visits ?? []), v].slice(-20)
    this.save()
  }

  /** Undo change `i` of the visit that started `at`. Returns why not, or null. */
  undoChange(app: string, at: string, i: number): string | null {
    const b = this.own(app), c = b.visits?.find((v) => v.at === at)?.changes[i], u = c?.undo
    if (!c || !u || c.undone) return 'nothing to undo'
    if ('put' in u) {
      // A merge or a remove: the entry comes back where it was, with its ID.
      const id = 'id' in u.entry ? u.entry.id : u.entry.name!
      if (this.ids(app, u.put).length >= LIMITS[u.put]) return `${u.put} is full (${LIMITS[u.put]})`
      if (u.put === 'components') this.entries.set((u.entry as CacheEntry).key, u.entry as CacheEntry)
      else (b[u.put] as (Rule | Table)[]).splice(u.index, 0, u.entry as Rule & Table)
      b.gone[u.put] = b.gone[u.put].filter((x) => x !== id)
    } else if ('drop' in u) {
      const why = u.drop === 'components' ? (this.delete(componentKey(app, u.id)) ? null : `components has no ${u.id}`) : this.setBox(app, 'delete', u.drop as 'rules', { id: u.id }, 'user')
      if (why) return why
    } else {
      const e = this.entries.get(u.key), n = e?.versions.findIndex((v) => v.createdAt === u.createdAt) ?? -1
      if (!e || n < 0 || e.versions.length < 2) return 'that version is gone'
      e.versions.splice(n, 1)
    }
    c.undone = true
    this.save()
    return null
  }

  undo(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry || entry.versions.length < 2) return undefined
    entry.versions.pop()
    this.save()
    return entry
  }

  /** The paper every model call reads: the screens' titles and lines, and the three boxes in full. */
  paper(app: string, device?: Device): Paper {
    const all = this.mockup(normalizePrompt(app)), b = this.boxesOf(app)
    const components = all.filter((e) => isComponent(e) && e.versions.length).map((e) => ({ id: e.name!, where: e.action ?? '', html: e.versions.at(-1)!.html, by: e.by }))
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

  private ids(app: string, box: BoxName): string[] {
    return box === 'components' ? this.mockup(normalizePrompt(app)).filter(isComponent).map((e) => e.name!) : this.boxesOf(app)[box].map((x) => x.id)
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
    const e: CacheEntry = { key: componentKey(app, id), app, action: where.trim(), name: id, parent: from, versions: [version], kind: 'component', ...mark(by) }
    this.entries.set(e.key, e)
    this.save()
    return e
  }

  component(app: string, id: string): CacheEntry | undefined {
    return this.entries.get(componentKey(app, id))
  }

  /** Add, change or delete a rule or a table within the manual's limits. Returns why not, or null. */
  setBox(app: string, op: 'add' | 'set' | 'delete', box: 'rules' | 'data', entry: { id: string; text?: string; columns?: string[]; rows?: string[][] }, by: Mark['by']): string | null {
    const b = this.own(app), list: (Rule | Table)[] = b[box]
    const i = list.findIndex((x) => x.id === entry.id)
    const why = op === 'add' ? this.refuseNew(app, box, entry.id) : i < 0 ? `${box} has no ${entry.id}` : null
    if (why) return why
    if (op === 'delete') {
      list.splice(i, 1)
      b.gone[box].push(entry.id)
    } else {
      const body = box === 'rules' ? ruleBody(entry.text) : tableBody(entry.columns, entry.rows)
      if (typeof body === 'string') return body
      const x = { id: entry.id, ...body, ...mark(by) } as Rule & Table
      if (op === 'add') list.push(x); else list[i] = x
    }
    this.save()
    return null
  }

  /** The user looked at a box: its entries (those with `ids`, when given; a visit's ID is when it started) are no longer marked new. */
  markSeen(app: string, box: BoxName | 'notes', ids?: string[]) {
    const list: { seen?: boolean; id?: string; name?: string; at?: string }[] = box === 'components' ? this.mockup(normalizePrompt(app)).filter(isComponent) : box === 'notes' ? this.own(app).visits ?? [] : this.own(app)[box]
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

  /** Delete a screen and every screen the first screen no longer reaches without it; the first screen takes the mockup. The keys removed. */
  delete(key: string): string[] | undefined {
    const entry = this.entries.get(key)
    // Even an unknown key is marked: an A OR B dropped before its first side finished stays dropped.
    this.tomb(key)
    if (!entry) return undefined
    const root = normalizePrompt(entry.app)
    if (isComponent(entry)) {
      // Screens that paste it show nothing in its place; no screen goes with it.
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
    if (gone.length || boxes) this.save()
    return gone.filter((e) => !isComponent(e)).length
  }

  get size(): number {
    return this.entries.size
  }

  /** One mockup's screens, oldest first: the order the tree uses for children. */
  private mockup(root: string): CacheEntry[] {
    return [...this.entries.values()].filter((e) => normalizePrompt(e.app) === root)
  }

  save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    // Write a temp file, then rename, so a crash never leaves half a cache file.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: FORMAT, entries: [...this.entries.values()], boxes: Object.fromEntries(this.boxes) }, null, 1))
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
