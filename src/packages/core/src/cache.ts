// Cached generative exploration: every screen is stored under its normalized prompt.
// A new screen first holds two proposals (the A OR B); a pick keeps one as the screen's first
// version and drops the other, and gives the screen its fixed name for links (`@sleep-report`).
// Edit and Regenerate add versions; Undo drops the newest. Each screen remembers the screen and
// click that first made it; levels and the tree are worked out from the screens (see tree.ts).
// Each mockup also has three boxes: Components (entries of their own kind, with versions like a
// screen), Rules and Data. An entry's ID is unique in its box and never used again.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { LIMITS, canonicalAction, isId, nameWords, normalizePrompt, screenKey, screenRef } from './keys.ts'
import { screenName, type Device } from './frame.ts'
import { HOME_NAME, isComponent, nameFrom, screenList, screenTree, uniqueName } from './tree.ts'
import type { ModelId } from './models.ts'
import type { Paper } from './prompt.ts'

/** One design of a screen, as the model made it. */
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
  /** The Edit request that made this version. */
  feedback?: string
}

/** The screen and click that first made a screen. */
export interface Parent { key: string; label: string }

export interface CacheEntry {
  key: string
  app: string
  action: string | null
  /**
   * The name links use (`@sleep-report`): the one in the link that opened it, `home` for the first
   * screen; a screen opened by a plain prompt gets one from its title at the pick.
   */
  name?: string
  /** The screen and click that first made it; null for the first screen (and screens made without a click). */
  parent: Parent | null
  /** Oldest first; the last one shows. Empty while the A OR B is open. */
  versions: Version[]
  /** The open A OR B, by side; a side is null until it finishes (or if it failed). Gone after a pick. */
  proposals?: (Version | null)[]
  /**
   * A component: its ID is `name`, the line that says where it belongs is `action`, parent is the
   * screen it was taken from. It has versions like a screen and no place in the tree.
   */
  kind?: 'component'
  by?: Mark['by']
  at?: string
  seen?: boolean
}

/** Who last wrote a box entry and when, and whether the user has looked at its box since. */
export interface Mark { by: 'filing' | 'user'; at: string; seen: boolean }
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
}

const emptyBoxes = (): Boxes => ({ rules: [], data: [], gone: { components: [], rules: [], data: [] } })
const componentKey = (app: string, id: string) => `${normalizePrompt(app)} » #${id}`

/** How many designs a new screen offers. */
export const PROPOSALS = 2

// Format 5 adds the boxes. Files of format 2 to 4 load with empty boxes; the spec feature's fields
// (`specs`, `reviews`, and `spec`, `misses`, `plan`, `specRefused` in versions) are dropped.
const FORMAT = 5

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()
  /** Each mockup's boxes, by its root key. */
  private boxes = new Map<string, Boxes>()
  /** When each key was last deleted, on a counter, so a design still streaming cannot bring it back. */
  private removed = new Map<string, number>()
  private clock = 0
  /** Why the cache does not write its file, when it does not: the file is from a newer version of the app. */
  readonly warning: string | null = null

  /** With a file, the cache loads it now and rewrites it after every change. */
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
      if (data?.version >= 2 && data.version <= FORMAT) {
        for (const e of data.entries as CacheEntry[]) this.entries.set(e.key, e)
        for (const [root, b] of Object.entries(data.boxes ?? {})) this.boxes.set(root, b as Boxes)
        if (data.version < FORMAT) for (const e of this.entries.values()) for (const v of [...e.versions, ...(e.proposals ?? [])])
          if (v) for (const k of ['spec', 'misses', 'plan', 'specRefused']) delete (v as unknown as Record<string, unknown>)[k]
        if (data.version === 2) this.migrate()
      } else {
        // A file from before versions: it stays on disk, and the cache starts empty.
        renameSync(file, `${file}.before-versions`)
        console.warn(`screen cache ${file} is from before versions; moved it to ${file}.before-versions and started empty`)
      }
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

  /**
   * The screen an action opens, if the mockup has it: by name for `@name`; for a plain prompt (a
   * link from before names), the screen made from that prompt, else a named one with that prompt.
   */
  find(app: string, action: string | null): CacheEntry | undefined {
    const ref = action ? screenRef(action) : null
    if (ref && canonicalAction(app, action)) return this.mockup(normalizePrompt(app)).find((e) => e.name === ref.name && !isComponent(e))
    const hit = this.entries.get(screenKey(app, action))
    if (hit || !action) return hit
    const a = normalizePrompt(action)
    return this.mockup(normalizePrompt(app)).find((e) => e.action != null && !isComponent(e) && normalizePrompt(e.action) === a)
  }

  /** A moment to compare deletes against: see removedSince. */
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

  /**
   * Store one finished side of a new screen's A OR B. The first side to finish makes the screen,
   * with the click as its parent; `@name: prompt` gives it its name and prompt. Returns the screen,
   * or undefined when a side was already picked (the other one is dropped).
   */
  propose(app: string, action: string | null, side: number, version: Version, parent: Parent | null = null): CacheEntry | undefined {
    action = canonicalAction(app, action)
    let entry = this.find(app, action)
    if (!entry) {
      const key = screenKey(app, action)
      const ref = action ? screenRef(action) : null
      // A parent must be a picked screen of this mockup; a click that raced a delete makes no parent.
      const from = parent && this.entries.get(parent.key)
      const ok = action && parent && from?.versions.length && normalizePrompt(from.app) === normalizePrompt(app)
      entry = {
        key, app, action: ref ? ref.prompt || nameWords(ref.name) : action, ...(ref && { name: ref.name }),
        parent: ok ? { key: parent!.key, label: parent!.label } : null, versions: [], proposals: Array(PROPOSALS).fill(null),
      }
      this.entries.set(key, entry)
    }
    if (!entry.proposals || !Number.isInteger(side) || side < 0 || side >= entry.proposals.length) return undefined
    entry.proposals[side] = version
    this.save()
    return entry
  }

  /** Keep one side of the open A OR B as the screen's first version; the other is gone. The screen gets its name for links. */
  pick(key: string, side: number): CacheEntry | undefined {
    const entry = this.entries.get(key)
    const v = Number.isInteger(side) ? entry?.proposals?.[side] : null
    if (!entry || !v) return undefined
    entry.versions = [v]
    delete entry.proposals
    this.name(entry)
    this.save()
    return entry
  }

  /** Give a picked screen opened by a plain prompt its fixed name, once: home for the first screen, else from its title. */
  private name(e: CacheEntry) {
    if (e.name || !e.versions.length) return
    const taken = new Set(this.mockup(normalizePrompt(e.app)).filter((x) => !isComponent(x)).map((x) => x.name).filter((n): n is string => !!n))
    const v = e.versions[0]!
    // Screens made before titles: their first heading, else the start of their prompt.
    const words = (t: string) => (/[a-z]{3,}/i.test(t) && !/[${}]/.test(t) ? t : '') // not text a script fills in
    const heading = v.html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1]?.replace(/<[^>]*>/g, '') ?? ''
    e.name = e.action ? uniqueName(nameFrom(v.name || words(screenName(v.html)) || words(heading) || e.action), new Set([...taken, HOME_NAME]), e.action) : HOME_NAME
  }

  /** Add a version to a picked screen (an Edit or a Regenerate); it shows from now on. */
  addVersion(key: string, version: Version): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry?.versions.length) return undefined
    entry.versions.push(version)
    this.save()
    return entry
  }

  /** Filing put a paste placeholder where a part was: the newest version's HTML changes in place, as the screen looks the same. */
  setNewestHtml(key: string, html: string) {
    const v = this.entries.get(key)?.versions.at(-1)
    if (v) { v.html = html; this.save() }
  }

  /** The last filing run of a mockup, for the line under its boxes. */
  noteFiling(app: string, run: Boxes['filed']) {
    this.boxesOf(app).filed = run
    this.save()
  }

  /** Drop the newest version, so the one before shows again. Never the last one. */
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
    const components = all.filter((e) => isComponent(e) && e.versions.length).map((e) => ({ id: e.name!, where: e.action ?? '', html: e.versions.at(-1)!.html }))
    return { app, device, ...screenList(all), components, rules: b.rules, data: b.data }
  }

  /** One mockup: its screens and components, oldest first, and its boxes. */
  map(app: string): { root: string; entries: CacheEntry[]; boxes: Boxes } {
    const root = normalizePrompt(app)
    return { root, entries: this.mockup(root), boxes: this.boxesOf(app) }
  }

  boxesOf(app: string): Boxes {
    const root = normalizePrompt(app)
    let b = this.boxes.get(root)
    if (!b) this.boxes.set(root, (b = emptyBoxes()))
    return b
  }

  /** A free ID for a new entry, from its words: up to 3 of them, then -2, -3… if taken or used before. */
  freeId(app: string, box: BoxName, words: string): string {
    const b = this.boxesOf(app)
    const have = box === 'components' ? this.mockup(normalizePrompt(app)).filter(isComponent).map((e) => e.name!) : b[box].map((x) => x.id)
    return uniqueName(nameFrom(words).split('-').slice(0, 3).join('-'), new Set([...have, ...b.gone[box]]))
  }

  /** Why an ID cannot be a new entry of a box (a bad ID, one in use or used before, a full box), or null. */
  private refuseNew(app: string, box: BoxName, id: string): string | null {
    const b = this.boxesOf(app)
    const have = box === 'components' ? this.mockup(normalizePrompt(app)).filter(isComponent).map((e) => e.name) : b[box].map((x) => x.id)
    if (!isId(id)) return `"${id}" is no ID (1 to 4 lowercase words joined by dashes)`
    if (have.includes(id) || b.gone[box].includes(id)) return `${box} already has or had ${id}`
    if (have.length >= LIMITS[box]) return `${box} is full (${LIMITS[box]})`
    return null
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

  /** The component with this ID, if the mockup has it. */
  component(app: string, id: string): CacheEntry | undefined {
    return this.entries.get(componentKey(app, id))
  }

  /**
   * Add, change or delete a rule or a table. A rule is one sentence of at most 120 characters; a
   * table has 1 to 6 columns and at most 8 rows, each as long as the columns. Returns why not, or null.
   */
  setBox(app: string, op: 'add' | 'set' | 'delete', box: 'rules' | 'data', entry: { id: string; text?: string; columns?: string[]; rows?: string[][] }, by: Mark['by']): string | null {
    const b = this.boxesOf(app), list: (Rule | Table)[] = b[box]
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

  /** The user looked at a box: its entries are no longer marked new. */
  markSeen(app: string, box: BoxName) {
    const list: { seen?: boolean }[] = box === 'components' ? this.mockup(normalizePrompt(app)).filter(isComponent) : this.boxesOf(app)[box]
    for (const x of list) x.seen = true
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

  /**
   * Delete a screen, and every screen the first screen no longer reaches without it (through the
   * clicks that made screens and the buttons in each screen). A screen still reached another way
   * stays. The first screen takes the whole mockup with it. Returns the keys removed.
   */
  delete(key: string): string[] | undefined {
    const entry = this.entries.get(key)
    // Even an unknown key is marked: an A OR B dropped before its first side finished stays dropped.
    this.tomb(key)
    if (!entry) return undefined
    const root = normalizePrompt(entry.app)
    if (isComponent(entry)) {
      // Screens that paste it show nothing in its place; no screen goes with it.
      this.entries.delete(key)
      this.boxesOf(entry.app).gone.components.push(entry.name!)
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

  /** Delete a whole mockup: all its screens. Returns how many screens went. */
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

  /** A file from before names: stored levels and recorded clicks go (levels are worked out now), and picked screens get names. */
  private migrate() {
    for (const e of this.entries.values()) delete (e as CacheEntry & { level?: number }).level
    for (const e of this.entries.values()) this.name(e)
    this.save()
  }

  private save() {
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
function refuseLine(text: unknown): string | null {
  if (typeof text !== 'string' || !text.trim() || /\n/.test(text.trim())) return 'a line must be one line of text'
  return text.trim().length > LIMITS.line ? `a line must be at most ${LIMITS.line} characters` : null
}

const ruleBody = (text: unknown) => refuseLine(text) ?? { text: (text as string).trim() }

function tableBody(columns: unknown, rows: unknown): { columns: string[]; rows: string[][] } | string {
  const ok = (r: unknown): r is string[] => Array.isArray(r) && r.every((c) => typeof c === 'string' && c.length <= LIMITS.line)
  if (!ok(columns) || !columns.length || columns.length > LIMITS.columns || columns.some((c) => !c.trim())) return `a table has 1 to ${LIMITS.columns} named columns`
  if (!Array.isArray(rows) || rows.length > LIMITS.rows) return `a table has at most ${LIMITS.rows} rows`
  if (!rows.every((r) => ok(r) && r.length === columns.length)) return 'each row has one value per column'
  return { columns: columns.map((c) => c.trim()), rows: rows.map((r: string[]) => r.map((c) => c.trim())) }
}
