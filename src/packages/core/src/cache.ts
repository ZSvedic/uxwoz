// The screen cache: each screen, its versions (the last shows) and those Undo set aside, and the click that
// made it. Each mockup has its boxes (components are entries), their last states and the fixer's notes:
// those are in cache-boxes.ts, whose ScreenCache extends the class here.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { VERSIONS, canonicalAction, nameWords, normalizePrompt, screenKey, screenRef } from './keys.ts'
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
  /** The new words of a Draw again that made this version. */
  prompt?: string
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
  /** Oldest first; the last one shows. */
  versions: Version[]
  /** After an Undo, the versions newer than the one showing, oldest first; `versions` and `redo` keep VERSIONS together. */
  redo?: Version[]
  /** The designs drawn from the current prompt (an Edit is not one). */
  draws?: number
  /** The createdAt of the version filing read when the screen was last settled. */
  settled?: string
  /** The open A OR B of a version 5 file, by side: read at load only (as versions); the browser still names it. */
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

/** A short ID from a seed's hash: the shortest of `lengths` not `taken`, else from the seed again with a count. */
function shortId(seed: string, lengths: number[], taken: Set<string>): string {
  for (let k = 0; ; k++) {
    const h = BigInt.asUintN(64, BigInt(Bun.hash(k ? `${seed}#${k}` : seed))).toString(36).padStart(13, '0')
    for (const n of k ? lengths.slice(-1) : lengths) if (!taken.has(h.slice(-n))) return h.slice(-n)
  }
}

// Format 5 adds the boxes (and later their states); files of format 3 and 4 load with empty boxes. Format 6 has
// no A OR B: a format 5 one loads as versions [B, A] so A shows, and the boxes count `settled` where they had `picks`.
const FORMAT = 6

/** An entry from a file before format 6: its open A OR B becomes its versions (B, then A, which shows), and a picked screen counts as filed. Null when no side finished. */
function fromFormat5(e: CacheEntry): CacheEntry | null {
  if (!e.proposals) {
    if (e.versions.length && !e.kind && !e.settled) e.settled = e.versions[0]!.createdAt
    return e
  }
  const sides = e.proposals.filter((v): v is Version => !!v).reverse()
  delete e.proposals
  return sides.length ? { ...e, versions: sides, draws: sides.length } : null
}

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
      for (const e of data.entries as CacheEntry[]) {
        const kept = !(e.name || e.key === normalizePrompt(e.app)) ? null : data.version < FORMAT ? fromFormat5(e) : e
        if (kept) this.entries.set(kept.key, { name: HOME_NAME, ...kept })
      }
      for (const [root, b] of Object.entries(data.boxes ?? {}) as [string, Boxes & { picks?: number }][]) {
        if (b.picks !== undefined) { b.settled ??= b.picks; delete b.picks }
        this.boxes.set(root, b)
      }
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

  /**
   * A new screen with its first design, shown at once (`draws` 1). A parent must be a drawn screen of this mockup; a
   * click that raced a delete makes no parent. Undefined for an action that names no screen, or a screen there already.
   */
  addScreen(app: string, action: string | null, version: Version, parent: Parent | null = null): CacheEntry | undefined {
    action = canonicalAction(action)
    const ref = action ? screenRef(action) : null
    if ((action && !ref) || this.find(app, action)) return undefined
    const key = screenKey(app, action)
    const from = parent && this.entries.get(parent.key)
    const ok = action && parent && from?.versions.length && normalizePrompt(from.app) === normalizePrompt(app)
    const entry: CacheEntry = {
      key, app, action: ref ? ref.prompt || nameWords(ref.name) : null, name: ref ? ref.name : HOME_NAME,
      parent: ok ? { key: parent!.key, label: parent!.label } : null, versions: [version], draws: 1,
    }
    this.entries.set(key, entry)
    this.save()
    return entry
  }

  /**
   * A new version, shown at once: any `redo` ones go back into `versions` first, and the oldest go past VERSIONS.
   * One with no `feedback` is a design: Another counts one more in `draws`, a Draw again (`prompt`) starts at 1.
   */
  addVersion(key: string, version: Version): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry?.versions.length) return undefined
    if (isComponent(entry)) this.keep(entry.app, 'components', version.feedback ? `Edit of ${entry.name}: ${version.feedback}` : `A new design of ${entry.name}`)
    entry.versions.push(...entry.redo ?? [], version)
    delete entry.redo
    entry.versions.splice(0, Math.max(0, entry.versions.length - VERSIONS))
    if (!version.feedback) entry.draws = version.prompt ? 1 : (entry.draws ?? 1) + 1
    this.save()
    return entry
  }

  /**
   * What settling a screen would do, changing nothing: 'first' the first time, 'again' when the version showing is
   * newer than the one filed and no Edit (which files itself), else null (an Undo or Redo to an older one files nothing).
   */
  wouldSettle(key: string): 'first' | 'again' | null {
    const entry = this.entries.get(key), v = entry?.versions.at(-1)
    if (!entry || !v || isComponent(entry)) return null
    if (!entry.settled) return 'first'
    return v.createdAt > entry.settled && !v.feedback ? 'again' : null
  }

  /**
   * Settle a screen the user clicks on from: the version showing is the one filing reads (see wouldSettle). 'first'
   * the first time (counted in the boxes' `settled`), 'again' after a newer design, null when there is nothing to file.
   */
  settle(key: string): 'first' | 'again' | null {
    const how = this.wouldSettle(key), entry = this.entries.get(key)
    if (!how || !entry) return null
    const first = how === 'first'
    entry.settled = entry.versions.at(-1)!.createdAt
    if (first) { const b = this.own(entry.app); b.settled = (b.settled ?? 0) + 1 }
    this.save()
    return first ? 'first' : 'again'
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

  /**
   * Show another version: with no `at` the one before the one showing, else the one created `at`, forward or back.
   * The versions newer than it move to `redo`, so the last of `versions` shows. Undefined when there is no such version.
   */
  undo(key: string, at?: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry?.versions.length) return undefined
    const all = [...entry.versions, ...entry.redo ?? []], showing = entry.versions.length - 1
    const i = at === undefined ? showing - 1 : all.findIndex((v) => v.createdAt === at)
    if (i < 0) return undefined
    if (i === showing) return entry
    if (isComponent(entry)) this.keep(entry.app, 'components', i < showing ? `You undid a version of ${entry.name}` : `You redid a version of ${entry.name}`)
    entry.versions = all.slice(0, i + 1)
    entry.redo = all.slice(i + 1)
    if (!entry.redo.length) delete entry.redo
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
      for (const v of [...e.versions, ...e.redo ?? []]) if (v.createdAt > a.updatedAt) a.updatedAt = v.createdAt
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
   * Give a mockup a new name: every key of it (its entries and their parents, its boxes, states, share links and
   * feedback, the fixer's Undo) moves to the new one. Its address IDs (`mid`, `sid`) stay. Throws when another
   * mockup has that name already.
   */
  rename(app: string, newApp: string) {
    const from = normalizePrompt(app), to = normalizePrompt(newApp)
    const mine = this.mockup(from)
    if (!mine.length) throw new Error(`no mockup ${app}`)
    if (to !== from && ([...this.entries.values()].some((e) => normalizePrompt(e.app) === to) || this.boxes.has(to) || this.states.has(to) || this.shared.has(to))) throw new Error(`a mockup ${newApp} exists already`)
    const rekey = (k: string) => (k === from || k.startsWith(`${from} » `) ? to + k.slice(from.length) : k)
    const move = (e: CacheEntry) => { e.key = rekey(e.key); e.app = newApp; if (e.parent) e.parent.key = rekey(e.parent.key) }
    // A late design for an old key must not bring the old name back.
    for (const e of mine) if (to !== from) this.tomb(e.key)
    mine.forEach(move)
    this.entries = new Map([...this.entries.values()].map((e) => [e.key, e]))
    const b = this.boxes.get(from), s = this.states.get(from), sh = this.shared.get(from)
    for (const st of Object.values(s ?? {})) for (const x of st) for (const e of x.list) if ('key' in e) move(e)
    for (const v of b?.visits ?? []) for (const c of v.changes) {
      const u = c.undo
      if (u && 'key' in u) u.key = rekey(u.key)
      if (u && 'put' in u && 'key' in u.entry) move(u.entry)
    }
    for (const f of sh?.feedback ?? []) f.screen = rekey(f.screen)
    for (const [m, x] of [[this.boxes, b], [this.states, s], [this.shared, sh]] as [Map<string, unknown>, unknown][]) if (x) { m.delete(from); m.set(to, x) }
    this.save()
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
