// Cached generative exploration: every screen is stored under its normalized prompt.
// Each screen has variants (candidates); regenerating adds more, and only an explicit choose()
// changes which one revisits show. Screens form a tree: each one remembers the variant and click
// that first made it, and each variant gets a fixed name like "L2-B" when it is made.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { canonicalAction, letterAt, normalizePrompt, screenKey } from './keys.ts'
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
  /** What the user asked to change, on variants made before Change replaced it. */
  feedback?: string
  /** Deleted by the user: its markup is gone, its letter stays taken. */
  deleted?: boolean
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

  /** With a file, the cache loads it now and rewrites it after every change. */
  constructor(private file: string | null = null) {
    if (file && existsSync(file)) {
      try {
        // The first file format was a bare list of entries.
        const data = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry[] | { entries: CacheEntry[]; links: Link[] }
        const { entries, links } = Array.isArray(data) ? { entries: data, links: [] } : data
        for (const e of entries) this.entries.set(e.key, e)
        for (const l of links) this.links.set(linkId(l), l)
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
    if (!entry) {
      const parent = action && opts.parent && this.entries.has(opts.parent.key) ? opts.parent : null
      const level = action ? (parent ? this.entries.get(parent.key)!.level + 1 : 2) : 1
      entry = { key, app, action, chosen: 0, candidates: [], level, parent }
      this.entries.set(key, entry)
    }
    const index = entry.candidates.length
    let n = this.lettersAt(app, entry.level)
    entry.candidates.push(...candidates.map((c) => ({ ...c, letter: letterAt(n++) })))
    this.save()
    return { entry, index }
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
    const c = entry.candidates[index]!
    entry.candidates[index] = { ...c, html: '', deleted: true }
    for (const [id, l] of this.links) if (l.from === key && l.variant === index) this.links.delete(id)
    if (entry.chosen === index) {
      const live = entry.candidates.findIndex((x) => !x.deleted)
      if (live >= 0) entry.chosen = live
    }
    const removed = this.prune(normalizePrompt(entry.app))
    this.save()
    return { entry: this.entries.get(key), removed }
  }

  /** Delete a whole mockup: all its screens and links. Returns how many screens went. */
  deleteApp(app: string): number {
    const root = normalizePrompt(app)
    const gone = this.mockup(root)
    for (const e of gone) this.entries.delete(e.key)
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

  /** How many letters are taken at a level of a mockup, deleted variants included. */
  private lettersAt(app: string, level: number): number {
    return this.mockup(normalizePrompt(app)).filter((e) => e.level === level).reduce((n, e) => n + e.candidates.length, 0)
  }

  private dropLinks() {
    for (const [id, l] of this.links) if (!this.entries.has(l.from) || !this.entries.has(l.to)) this.links.delete(id)
  }

  /**
   * Remove the screens of a mockup that the first screen no longer reaches through live variants,
   * following both parents and other clicks. A screen still reached by another click takes that
   * click as its new parent. Returns the keys removed.
   */
  private prune(root: string): string[] {
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
    const removed: string[] = []
    for (const e of entries) {
      if (!reached.has(e.key)) { this.entries.delete(e.key); removed.push(e.key); continue }
      const p = e.parent
      if (p && !(reached.has(p.key) && isLive(this.entries.get(p.key), p.variant))) e.parent = reached.get(e.key) ?? null
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
    return changed
  }

  private save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    // Write a temp file, then rename, so a crash never leaves half a cache file.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ entries: [...this.entries.values()], links: [...this.links.values()] }, null, 1))
    renameSync(tmp, this.file)
  }
}
