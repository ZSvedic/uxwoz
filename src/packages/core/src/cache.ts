// The screen cache: each screen, its open A OR B until a pick, then its versions, and the click that
// made it. Each mockup has its boxes (components are entries), their last states and the fixer's notes:
// those are in cache-boxes.ts, whose ScreenCache extends the class here.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { canonicalAction, nameWords, normalizePrompt, screenKey, screenRef } from './keys.ts'
import type { Device } from './frame.ts'
import { HOME_NAME, isComponent, screenTree } from './tree.ts'
import type { ModelId } from './models.ts'
import type { BoxName, BoxState, Boxes, Filing, Mark } from './cache-boxes.ts'

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
export interface Parent { key: string; label: string }

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
  /** The first screen only: the mockup's ID in its address (`/m/<mid>/<sid>`), 6 letters and digits, unique in the cache. */
  mid?: string
  /** The entry's ID in its address, 2 to 4 letters and digits, unique within its mockup. */
  sid?: string
}

/** A share link of a mockup: its role, its cap on the screens and changes it may ask for (edit links), and how much it was used. */
export interface Share { token: string; role: 'view' | 'comment' | 'edit'; createdAt: string; cap?: number; used: number; opens: number }
/**
 * What a visitor of a share link said: a comment (pinned by `about`, `tag` and `nth` to a part, by `label` to a dead
 * control), a thumb, or the closing answer. Kind `dead` is an answer at a dead control from before names: read, no
 * longer written. `resolved` is when the owner resolved it.
 */
export interface Feedback {
  id: string; at: string; visitor: string; name: string; screen: string; title: string; kind: 'comment' | 'thumb' | 'dead' | 'done'
  text?: string; about?: string; tag?: string; nth?: number; up?: boolean; label?: string; resolved?: string
}
/** A feedback's id: 16 hex characters, from what it is, so an old entry gets the same id on every load. */
export const feedbackId = (seed: string) => Bun.hash(seed).toString(16).padStart(16, '0').slice(-16)
/** One visit of a share link: the screens seen in order and the dead controls clicked. */
export interface Trip { id: string; visitor: string; name: string; at: string; screens: string[]; dead: string[] }
/** A mockup's share links and what came back through them. */
export interface Shared { shares: Share[]; feedback: Feedback[]; trips: Trip[] }

const emptyBoxes = (): Boxes => ({ rules: [], data: [], gone: { components: [], rules: [], data: [] } })

export const PROPOSALS = 2

/** A short ID from a seed's hash: the shortest of `lengths` not `taken`, else from the seed again with a count. */
function shortId(seed: string, lengths: number[], taken: Set<string>): string {
  for (let k = 0; ; k++) {
    const h = BigInt.asUintN(64, BigInt(Bun.hash(k ? `${seed}#${k}` : seed))).toString(36).padStart(13, '0')
    for (const n of k ? lengths.slice(-1) : lengths) if (!taken.has(h.slice(-n))) return h.slice(-n)
  }
}

// Format 5 adds the boxes (and later their states). Files of format 3 and 4 load with empty boxes.
const FORMAT = 5

/** The screens, the file and the state every part of the cache shares; ScreenCache adds the boxes. */
export abstract class ScreenCacheBase {
  protected entries = new Map<string, CacheEntry>()
  protected boxes = new Map<string, Boxes>()
  protected states = new Map<string, Partial<Record<BoxName, BoxState[]>>>()
  private shared = new Map<string, Shared>()
  /** When each key was last deleted, on a counter, so a design still streaming cannot bring it back. */
  private removed = new Map<string, number>()
  protected clock = 0
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
      for (const [root, s] of Object.entries(data.shared ?? {}) as [string, Shared][]) {
        // Feedback from before ids gets one; a second entry with the same words gets its place in the list too.
        const ids = new Set<string>()
        s.feedback?.forEach((f, i) => {
          if (!f.id || ids.has(f.id)) {
            const seed = JSON.stringify([f.at, f.visitor, f.kind, f.screen, f.text])
            f.id = ids.has(feedbackId(seed)) ? feedbackId(seed + i) : feedbackId(seed)
          }
          ids.add(f.id)
        })
        this.shared.set(root, s)
      }
      this.stampIds()
    } catch (err) {
      this.entries.clear()
      const aside = `${file}.corrupt-${Date.now()}`
      renameSync(file, aside)
      console.warn(`screen cache ${file} was unreadable (${err}); moved it to ${aside} and started empty`)
    }
  }

  /**
   * Give each mockup its ID (`mid`, on its first screen) and each entry its own (`sid`) where missing or taken twice.
   * They come from a hash (of the prompt and its first design's time, of the key), so an old cache gets the same
   * IDs on every load before its next save; once saved they stay as they are.
   */
  protected stampIds() {
    const mids = new Set<string>(), sids = new Map<string, Set<string>>(), redo: CacheEntry[] = []
    const sidsOf = (e: CacheEntry) => { const r = normalizePrompt(e.app); let s = sids.get(r); if (!s) sids.set(r, (s = new Set())); return s }
    for (const e of this.entries.values()) {
      const root = e.key === normalizePrompt(e.app)
      if (root && (!e.mid || mids.has(e.mid))) redo.push(e)
      else if (root) mids.add(e.mid!)
      if (e.sid && !sidsOf(e).has(e.sid)) sidsOf(e).add(e.sid)
      else delete e.sid
    }
    for (const e of redo) e.mid = shortId(`${e.key}|${(e.versions[0] ?? e.proposals?.find(Boolean))?.createdAt ?? ''}`, [6], mids), mids.add(e.mid)
    for (const e of this.entries.values()) if (!e.sid) sidsOf(e).add((e.sid = shortId(e.key, [2, 3, 4], sidsOf(e))))
  }

  /** Keep a box's state before it changes (in cache-boxes.ts). */
  protected abstract keep(app: string, box: BoxName, what?: string): void

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

  undo(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry || entry.versions.length < 2) return undefined
    if (isComponent(entry)) this.keep(entry.app, 'components', `You undid a version of ${entry.name}`)
    entry.versions.pop()
    this.save()
    return entry
  }

  /** A mockup's boxes, to read: empty ones for a mockup that has none yet. */
  boxesOf(app: string): Boxes {
    return this.boxes.get(normalizePrompt(app)) ?? emptyBoxes()
  }

  /** A mockup's boxes, to change: stored from now on. */
  protected own(app: string): Boxes {
    const root = normalizePrompt(app)
    let b = this.boxes.get(root)
    if (!b) this.boxes.set(root, (b = emptyBoxes()))
    return b
  }

  /** A mockup's share links, feedback and trips, to read: empty ones for a mockup that has none. */
  sharedOf(app: string): Shared {
    return this.shared.get(normalizePrompt(app)) ?? { shares: [], feedback: [], trips: [] }
  }

  /** A mockup's share links, feedback and trips, to change: stored from now on. */
  ownShared(app: string): Shared {
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

  /** Every mockup once, as first typed, with its number of screens; most recently changed first. */
  apps(): { app: string; id?: string; screens: number; updatedAt: string }[] {
    const byRoot = new Map<string, { app: string; id?: string; screens: number; updatedAt: string }>()
    for (const e of this.entries.values()) {
      const root = normalizePrompt(e.app)
      const a = byRoot.get(root) ?? { app: e.app, screens: 0, updatedAt: '' }
      if (e.key === root && e.mid) a.id = e.mid
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

  /**
   * Take in another cache's mockups (screens, components, boxes, states, share links, feedback), each mockup
   * whole, skipping every mockup whose prompt this cache already has. The prompts taken, as first typed.
   */
  takeIn(other: ScreenCacheBase): string[] {
    const have = new Set([...this.entries.values()].map((e) => normalizePrompt(e.app)))
    for (const m of [this.boxes, this.states, this.shared]) for (const root of m.keys()) have.add(root)
    const roots = new Set([...other.entries.values()].map((e) => normalizePrompt(e.app)))
    for (const m of [other.boxes, other.states, other.shared]) for (const root of m.keys()) roots.add(root)
    const taken: string[] = []
    for (const root of roots) {
      if (have.has(root)) continue
      const all = [...other.entries.values()].filter((e) => normalizePrompt(e.app) === root)
      for (const e of all) { this.entries.set(e.key, structuredClone(e)); this.removed.delete(e.key) }
      this.removed.delete(root)
      const b = other.boxes.get(root), s = other.states.get(root), sh = other.shared.get(root)
      if (b) this.boxes.set(root, structuredClone(b))
      if (s) this.states.set(root, structuredClone(s))
      if (sh) this.shared.set(root, structuredClone(sh))
      taken.push((all.find((e) => e.key === root) ?? all[0])?.app ?? root)
    }
    if (taken.length) this.save()
    return taken
  }

  get size(): number {
    return this.entries.size
  }

  /** One mockup's screens, oldest first: the order the tree uses for children. */
  protected mockup(app: string): CacheEntry[] {
    const root = normalizePrompt(app)
    return [...this.entries.values()].filter((e) => normalizePrompt(e.app) === root)
  }

  /** The cache file's text, as `save()` writes it (also `GET /api/backup`). */
  serialize(): string {
    return JSON.stringify({ version: FORMAT, entries: [...this.entries.values()], boxes: Object.fromEntries(this.boxes), states: Object.fromEntries(this.states), shared: Object.fromEntries(this.shared) }, null, 1)
  }

  /** Stop writing the file: the cache stays in memory, and a save after this writes nothing (a deleted person's). */
  detach() {
    this.file = null
  }

  save() {
    this.stampIds()
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    // Write a temp file, then rename, so a crash never leaves half a cache file.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, this.serialize())
    renameSync(tmp, this.file)
  }
}
