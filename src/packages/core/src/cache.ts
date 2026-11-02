// Cached generative exploration: every screen is stored under its normalized prompt.
// Each screen has variants (candidates); regenerating adds more, and only an explicit choose()
// changes which one revisits show. Screens form a tree: each one remembers the variant and click
// that first made it, and each variant gets a fixed name like "L2-B" when it is made.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { canonicalAction, letterAt, letterIndex, normalizePrompt, screenKey } from './keys.ts'
import type { Device } from './frame.ts'
import type { ModelId } from './models.ts'

export interface Candidate {
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
  /** This variant's letter at its screen's level, set by the cache: "B" in "L2-B". */
  letter?: string
  /** The prompt it was made with, when the user changed it; else the screen's action prompt. */
  prompt?: string
  /** What the user asked to change: an Edit's request (on old variants, feedback from before Change). */
  feedback?: string
  /** The variant an Edit changed to make this one. */
  editOf?: number
  /** Deleted by the user: its markup is gone, its letter stays taken. */
  deleted?: boolean
  /** Asked for as a clearly different design (the second of a pair); a refresh asks again. */
  alternative?: boolean
  /** The variant this one replaced by a refresh: it shows in that variant's place. */
  replaces?: number
}

/** The variant and click that first made a screen. */
export interface Parent { key: string; variant: number; label: string }

export interface CacheEntry {
  key: string
  app: string
  action: string | null
  /** Index of the candidate a revisit shows. */
  chosen: number
  candidates: Candidate[]
  /** 1 for the first screen, one more than its parent's for the others. */
  level: number
  /** Null for the first screen (and for screens made without a click). */
  parent: Parent | null
}

/** One click that led from one screen to another. */
export interface Link {
  from: string
  /** The variant of `from` the click was made in. */
  variant: number
  to: string
  /** The text of the control that was clicked, e.g. "Checkout". */
  label: string
  createdAt: string
}

/** Where new variants come from: the click that asked for a new screen. */
export interface AddOptions { parent?: Parent | null }

const isLive = (e: CacheEntry | undefined, v: number) => !!e?.candidates[v] && !e.candidates[v]!.deleted
const linkId = (l: { from: string; variant: number; to: string }) => `${l.from}#${l.variant}\n${l.to}`

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()
  /** Keyed by "from#variant\nto": the first click between two screens names the arrow. */
  private links = new Map<string, Link>()
  /**
   * The next letter at each level of each mockup, keyed by "root\nlevel". Kept apart from the
   * screens, so a letter stays taken after its screen is deleted.
   */
  private letters = new Map<string, number>()

  /** With a file, the cache loads it now and rewrites it after every change. */
  constructor(private file: string | null = null) {
    if (file && existsSync(file)) {
      try {
        // The first file format was a bare list of entries.
        const data = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry[] | { entries: CacheEntry[]; links: Link[]; letters?: Record<string, number> }
        const { entries, links, letters = {} } = Array.isArray(data) ? { entries: data, links: [] } : data
        for (const e of entries) this.entries.set(e.key, e)
        for (const l of links) this.links.set(linkId(l), l)
        for (const [k, n] of Object.entries(letters)) this.letters.set(k, n)
      } catch (err) {
        const aside = `${file}.corrupt-${Date.now()}`
        renameSync(file, aside)
        console.warn(`screen cache ${file} was unreadable (${err}); moved it to ${aside} and started empty`)
      }
      if (this.migrate()) this.save()
    }
  }

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key)
  }

  /**
   * Store new candidates, in order, each with the next free letter at its screen's level. The first
   * candidate of a key becomes the chosen one; later ones do not. A new screen made by a click
   * remembers that click as its parent. Returns the index of the first one added.
   */
  add(app: string, action: string | null, candidates: Candidate[], opts: AddOptions = {}): { entry: CacheEntry; index: number } {
    action = canonicalAction(app, action)
    const key = screenKey(app, action)
    let entry = this.entries.get(key)
    const root = normalizePrompt(app)
    if (!entry) {
      // A parent must be a live variant of this mockup; a click that raced a delete makes no parent.
      const p = opts.parent, from = p && this.entries.get(p.key)
      const parent = action && p && from && normalizePrompt(from.app) === root && isLive(from, p.variant) ? p : null
      const level = action ? (parent ? this.entries.get(parent.key)!.level + 1 : 2) : 1
      entry = { key, app, action, chosen: 0, candidates: [], level, parent }
      this.entries.set(key, entry)
    }
    const index = entry.candidates.length
    const at = `${root}\n${entry.level}`
    let n = this.letters.get(at) ?? 0
    entry.candidates.push(...candidates.map((c) => ({ ...c, letter: letterAt(n++) })))
    this.letters.set(at, n)
    this.save()
    return { entry, index }
  }

  /**
   * Refresh a variant: the new version gets the next letter and shows in the old one's place (and
   * is picked if the old one was), and the old one is deleted like deleteVariant does, with the
   * screens only it led to. Returns the screen, the new index and the keys removed.
   */
  replace(key: string, index: number, candidate: Candidate): { entry: CacheEntry; index: number; removed: string[] } | undefined {
    const entry = this.entries.get(key)
    if (!entry || !Number.isInteger(index) || !isLive(entry, index)) return undefined
    const old = entry.candidates[index]!
    const { index: next } = this.add(entry.app, entry.action, [{ ...candidate, replaces: index, ...(old.prompt && { prompt: old.prompt }) }])
    if (entry.chosen === index) entry.chosen = next
    const { removed } = this.deleteVariant(key, index)!
    return { entry, index: next, removed }
  }

  /** The action prompts of this mockup's later screens, newest first. */
  existingScreens(app: string): string[] {
    const root = normalizePrompt(app)
    return [...this.entries.values()]
      .filter((e) => e.action && normalizePrompt(e.app) === root)
      .map((e) => e.action!)
      .reverse()
  }

  /** Record that a click in variant `variant` of `from` led to `to`. Both must be screens of the same mockup. */
  link(from: string, variant: number, to: string, label: string): Link | undefined {
    const a = this.entries.get(from), b = this.entries.get(to)
    if (!a || !b || from === to || !isLive(a, variant) || normalizePrompt(a.app) !== normalizePrompt(b.app)) return undefined
    const id = linkId({ from, variant, to })
    const existing = this.links.get(id)
    if (existing) return existing
    const l: Link = { from, variant, to, label: label.trim().replace(/\s+/g, ' ').slice(0, 80), createdAt: new Date().toISOString() }
    this.links.set(id, l)
    this.save()
    return l
  }

  /** One mockup: its screens (oldest first) and the clicks between them. */
  map(app: string): { root: string; entries: CacheEntry[]; links: Link[] } {
    const root = normalizePrompt(app)
    const entries = this.mockup(root)
    const keys = new Set(entries.map((e) => e.key))
    const links = [...this.links.values()].filter((l) => keys.has(l.from) && keys.has(l.to))
    return { root, entries, links }
  }

  /** Every mockup once, as first typed, with its number of screens; most recently changed first. */
  apps(): { app: string; screens: number; updatedAt: string }[] {
    const byRoot = new Map<string, { app: string; screens: number; updatedAt: string }>()
    for (const e of this.entries.values()) {
      const root = normalizePrompt(e.app)
      const a = byRoot.get(root) ?? { app: e.app, screens: 0, updatedAt: '' }
      a.screens++
      for (const c of e.candidates) if (c.createdAt > a.updatedAt) a.updatedAt = c.createdAt
      byRoot.set(root, a)
    }
    return [...byRoot.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  choose(key: string, index: number): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry || !Number.isInteger(index) || !isLive(entry, index)) return undefined
    entry.chosen = index
    this.save()
    return entry
  }

  /**
   * Delete one variant: its markup goes, its letter stays taken. A screen with no variant left goes
   * too, and so does every screen that can no longer be reached from the first one. Returns the
   * screen (undefined once it is gone) and the keys of the screens removed.
   */
  deleteVariant(key: string, index: number): { entry: CacheEntry | undefined; removed: string[] } | undefined {
    const entry = this.entries.get(key)
    if (!entry || !Number.isInteger(index) || !isLive(entry, index)) return undefined
    const root = normalizePrompt(entry.app)
    const before = this.reach(root)
    const c = entry.candidates[index]!
    entry.candidates[index] = { ...c, html: '', deleted: true }
    for (const [id, l] of this.links) if (l.from === key && l.variant === index) this.links.delete(id)
    if (entry.chosen === index) {
      const live = entry.candidates.findIndex((x) => !x.deleted)
      if (live >= 0) entry.chosen = live
    }
    const removed = this.prune(root, before)
    this.save()
    return { entry: this.entries.get(key), removed }
  }

  /** Delete a whole mockup: all its screens and links. Returns how many screens went. */
  deleteApp(app: string): number {
    const root = normalizePrompt(app)
    const gone = this.mockup(root)
    for (const e of gone) this.entries.delete(e.key)
    // A mockup made again from its prompt starts over at L1-A.
    for (const k of this.letters.keys()) if (k.startsWith(`${root}\n`)) this.letters.delete(k)
    this.dropLinks()
    if (gone.length) this.save()
    return gone.length
  }

  get size(): number {
    return this.entries.size
  }

  private mockup(root: string): CacheEntry[] {
    return [...this.entries.values()].filter((e) => normalizePrompt(e.app) === root)
  }


  private dropLinks() {
    for (const [id, l] of this.links) if (!this.entries.has(l.from) || !this.entries.has(l.to)) this.links.delete(id)
  }

  /**
   * The screens of a mockup the first screen reaches through live variants, following both parents
   * and other clicks, each with the click that reached it first (null for the first screen).
   */
  private reach(root: string): Map<string, Parent | null> {
    const entries = this.mockup(root)
    const first = this.entries.get(root)
    const reached = new Map<string, Parent | null>()
    if (first && first.candidates.some((c) => !c.deleted)) reached.set(root, null)
    const queue = [...reached.keys()]
    while (queue.length) {
      const from = this.entries.get(queue.shift()!)!
      const edges: Parent[] = []
      for (const e of entries) if (e.parent?.key === from.key) edges.push({ ...e.parent, key: e.key })
      for (const l of this.links.values()) if (l.from === from.key) edges.push({ key: l.to, variant: l.variant, label: l.label })
      for (const { key, variant, label } of edges) {
        const to = this.entries.get(key)
        if (!to || reached.has(key) || !isLive(from, variant) || !to.candidates.some((c) => !c.deleted)) continue
        reached.set(key, { key: from.key, variant, label })
        queue.push(key)
      }
    }
    return reached
  }

  /**
   * After a delete: remove the screens the first screen reached `before` and no longer reaches.
   * Screens it never reached (from old files without links) are left alone. A screen still reached
   * whose parent chain no longer leads to the first screen takes the click that reaches it now.
   * Returns the keys removed.
   */
  private prune(root: string, before: Map<string, Parent | null>): string[] {
    const reached = this.reach(root)
    const removed: string[] = []
    for (const key of before.keys()) {
      if (reached.has(key) || !this.entries.has(key)) continue
      this.entries.delete(key)
      removed.push(key)
    }
    // Repeat until stable: each fix points a screen at one the search found earlier, so it ends.
    const leadsHome = (e: CacheEntry) => {
      const seen = new Set<string>()
      for (let x: CacheEntry | undefined = e; x; x = x.parent ? this.entries.get(x.parent.key) : undefined) {
        if (x.key === root) return true
        if (seen.has(x.key) || (x.parent && !isLive(this.entries.get(x.parent.key), x.parent.variant))) return false
        seen.add(x.key)
      }
      return false
    }
    for (let changed = true; changed;) {
      changed = false
      for (const [key, via] of reached) {
        const e = this.entries.get(key)!
        if (key === root || leadsHome(e)) continue
        e.parent = via
        changed = true
      }
    }
    this.dropLinks()
    return removed
  }

  /**
   * Fill in what files from before the tree lack: each link's variant (the screen's pick), each
   * screen's level and parent (the earliest click into it, walking out from the first screen), and
   * each variant's letter (in the order made). Returns true if anything changed.
   */
  private migrate(): boolean {
    let changed = false
    for (const l of this.links.values()) {
      if (l.variant != null) continue
      l.variant = this.entries.get(l.from)?.chosen ?? 0
      changed = true
    }
    // Links stored before variants existed were keyed without one.
    this.links = new Map([...this.links.values()].map((l) => [linkId(l), l]))
    const roots = new Set([...this.entries.values()].map((e) => normalizePrompt(e.app)))
    for (const root of roots) {
      const entries = this.mockup(root)
      if (entries.every((e) => e.level != null && e.candidates.every((c) => c.letter))) continue
      changed = true
      const links = [...this.links.values()].filter((l) => entries.some((e) => e.key === l.from)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const queue = entries.filter((e) => !e.action)
      for (const e of queue) { e.level ??= 1; e.parent ??= null }
      while (queue.length) {
        const from = queue.shift()!
        for (const l of links) {
          const to = this.entries.get(l.to)
          if (l.from !== from.key || !to || to.level != null) continue
          to.level = from.level + 1
          to.parent = { key: from.key, variant: l.variant, label: l.label }
          queue.push(to)
        }
      }
      for (const e of entries) { e.level ??= 2; e.parent ??= null }
      // A pair is stored in slot order, but its second variant may have finished first: within a
      // screen, a variant counts as made no later than the ones after it, so A stays before B.
      const byLevel = new Map<number, { c: Candidate; at: string }[]>()
      for (const e of entries) {
        let at = '￿'
        const timed = e.candidates.map((c) => ({ c, at: '' })).reverse()
        for (const t of timed) t.at = at = t.c.createdAt < at ? t.c.createdAt : at
        byLevel.set(e.level, [...(byLevel.get(e.level) ?? []), ...timed.reverse()])
      }
      for (const list of byLevel.values()) {
        let n = list.filter((t) => t.c.letter).length
        for (const t of [...list].sort((a, b) => a.at.localeCompare(b.at))) t.c.letter ??= letterAt(n++)
      }
    }
    // Letter counters start after the highest letter in use at each level.
    for (const e of this.entries.values()) {
      const at = `${normalizePrompt(e.app)}\n${e.level}`
      for (const c of e.candidates) {
        const next = letterIndex(c.letter ?? '') + 1
        if (next > (this.letters.get(at) ?? 0)) { this.letters.set(at, next); changed = true }
      }
    }
    return changed
  }

  private save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    // Write a temp file, then rename, so a crash never leaves half a cache file.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ entries: [...this.entries.values()], links: [...this.links.values()], letters: Object.fromEntries(this.letters) }, null, 1))
    renameSync(tmp, this.file)
  }
}
