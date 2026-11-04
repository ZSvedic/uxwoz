// Cached generative exploration: every screen is stored under its normalized prompt.
// A new screen first holds two proposals (the A OR B); a pick keeps one as the screen's first
// version and drops the other. Edit and Regenerate add versions; Undo drops the newest. Screens
// form a tree: each one remembers the screen and click that first made it.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { canonicalAction, normalizePrompt, screenKey } from './keys.ts'
import { screenIdea, type Device } from './frame.ts'
import type { ModelId } from './models.ts'

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
  /** 1 for the first screen, one more than its parent's for the others. */
  level: number
  /** Null for the first screen (and for screens made without a click). */
  parent: Parent | null
  /** Oldest first; the last one shows. Empty while the A OR B is open. */
  versions: Version[]
  /** The open A OR B, by side; a side is null until it finishes (or if it failed). Gone after a pick. */
  proposals?: (Version | null)[]
}

/** One click that led from one screen to another. */
export interface Link {
  from: string
  to: string
  /** The text of the control that was clicked, e.g. "Checkout". */
  label: string
  createdAt: string
}

/** How many designs a new screen offers. */
export const PROPOSALS = 2

const FORMAT = 2
const linkId = (l: { from: string; to: string }) => `${l.from}\n${l.to}`

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()
  /** Keyed by "from\nto": the first click between two screens names it. */
  private links = new Map<string, Link>()
  /** When each key was last deleted, on a counter, so a design still streaming cannot bring it back. */
  private removed = new Map<string, number>()
  private clock = 0

  /** With a file, the cache loads it now and rewrites it after every change. */
  constructor(private file: string | null = null) {
    if (!file || !existsSync(file)) return
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data?.version === FORMAT) {
        for (const e of data.entries as CacheEntry[]) this.entries.set(e.key, e)
        for (const l of data.links as Link[]) this.links.set(linkId(l), l)
      } else {
        // A file from before versions: keep it on disk, and carry over each screen's pick.
        copyFileSync(file, `${file}.before-versions`)
        this.migrate(Array.isArray(data) ? { entries: data, links: [] } : data)
        this.save()
      }
    } catch (err) {
      this.entries.clear()
      this.links.clear()
      const aside = `${file}.corrupt-${Date.now()}`
      renameSync(file, aside)
      console.warn(`screen cache ${file} was unreadable (${err}); moved it to ${aside} and started empty`)
    }
  }

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key)
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
   * with the click as its parent. Returns the screen, or undefined when a side was already picked
   * (the other one is dropped).
   */
  propose(app: string, action: string | null, side: number, version: Version, parent: Parent | null = null): CacheEntry | undefined {
    action = canonicalAction(app, action)
    const key = screenKey(app, action)
    let entry = this.entries.get(key)
    if (!entry) {
      // A parent must be a picked screen of this mockup; a click that raced a delete makes no parent.
      const from = parent && this.entries.get(parent.key)
      const ok = action && parent && from?.versions.length && normalizePrompt(from.app) === normalizePrompt(app)
      entry = { key, app, action, level: action ? (ok ? from!.level + 1 : 2) : 1, parent: ok ? { key: parent!.key, label: parent!.label } : null, versions: [], proposals: Array(PROPOSALS).fill(null) }
      this.entries.set(key, entry)
    }
    if (!entry.proposals || !Number.isInteger(side) || side < 0 || side >= entry.proposals.length) return undefined
    entry.proposals[side] = version
    this.save()
    return entry
  }

  /** Keep one side of the open A OR B as the screen's first version; the other is gone. */
  pick(key: string, side: number): CacheEntry | undefined {
    const entry = this.entries.get(key)
    const v = Number.isInteger(side) ? entry?.proposals?.[side] : null
    if (!entry || !v) return undefined
    entry.versions = [v]
    delete entry.proposals
    this.save()
    return entry
  }

  /** Add a version to a picked screen (an Edit or a Regenerate); it shows from now on. */
  addVersion(key: string, version: Version): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry?.versions.length) return undefined
    entry.versions.push(version)
    this.save()
    return entry
  }

  /** Drop the newest version, so the one before shows again. Never the last one. */
  undo(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry || entry.versions.length < 2) return undefined
    entry.versions.pop()
    this.save()
    return entry
  }

  /** The action prompts of this mockup's later screens, newest first. */
  existingScreens(app: string): string[] {
    const root = normalizePrompt(app)
    return [...this.entries.values()]
      .filter((e) => e.action && normalizePrompt(e.app) === root)
      .map((e) => e.action!)
      .reverse()
  }

  /** Record that a click in `from` led to `to`. Both must be screens of the same mockup, and `from` picked. */
  link(from: string, to: string, label: string): Link | undefined {
    const a = this.entries.get(from), b = this.entries.get(to)
    if (!a || !b || from === to || !a.versions.length || normalizePrompt(a.app) !== normalizePrompt(b.app)) return undefined
    const id = linkId({ from, to })
    const existing = this.links.get(id)
    if (existing) return existing
    const l: Link = { from, to, label: label.trim().replace(/\s+/g, ' ').slice(0, 80), createdAt: new Date().toISOString() }
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
      for (const v of [...e.versions, ...(e.proposals ?? [])]) if (v && v.createdAt > a.updatedAt) a.updatedAt = v.createdAt
      byRoot.set(root, a)
    }
    return [...byRoot.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /**
   * Delete a screen, and every screen the first screen no longer reaches without it. A screen still
   * reached by another click takes that click as its new parent. The first screen takes the whole
   * mockup with it. Returns the keys removed.
   */
  delete(key: string): string[] | undefined {
    const entry = this.entries.get(key)
    // Even an unknown key is marked: an A OR B dropped before its first side finished stays dropped.
    this.tomb(key)
    if (!entry) return undefined
    const root = normalizePrompt(entry.app)
    if (key === root) {
      const gone = this.mockup(root).map((e) => e.key)
      this.deleteApp(entry.app)
      return gone
    }
    const before = this.reach(root)
    this.entries.delete(key)
    const removed = [key, ...this.prune(root, before)]
    for (const k of removed) this.tomb(k)
    this.save()
    return removed
  }

  /** Delete a whole mockup: all its screens and links. Returns how many screens went. */
  deleteApp(app: string): number {
    const root = normalizePrompt(app)
    const gone = this.mockup(root)
    this.tomb(root)
    for (const e of gone) { this.entries.delete(e.key); this.tomb(e.key) }
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
   * The screens of a mockup the first screen reaches, following parents first and then other
   * clicks, each with the click that reached it first (null for the first screen).
   */
  private reach(root: string): Map<string, Parent | null> {
    const entries = this.mockup(root)
    const reached = new Map<string, Parent | null>()
    if (this.entries.has(root)) reached.set(root, null)
    const queue = [...reached.keys()]
    while (queue.length) {
      const from = queue.shift()!
      const edges: Parent[] = []
      for (const e of entries) if (e.parent?.key === from) edges.push({ key: e.key, label: e.parent.label })
      for (const l of this.links.values()) if (l.from === from) edges.push({ key: l.to, label: l.label })
      for (const { key, label } of edges) {
        if (reached.has(key) || !this.entries.has(key)) continue
        reached.set(key, { key: from, label })
        queue.push(key)
      }
    }
    return reached
  }

  /**
   * After a delete: remove the screens the first screen reached `before` and no longer reaches.
   * Screens it never reached are left alone. Then every parent chain leads to the first screen
   * again, and levels follow the parents. Returns the keys removed.
   */
  private prune(root: string, before: Map<string, Parent | null>): string[] {
    const reached = this.reach(root)
    const removed: string[] = []
    for (const key of before.keys()) {
      if (reached.has(key) || !this.entries.has(key)) continue
      this.entries.delete(key)
      removed.push(key)
    }
    this.dropLinks()
    this.settle(root, reached)
    return removed
  }

  /** Point each reached screen whose parent chain does not lead home at the click that reaches it; then fix levels. */
  private settle(root: string, reached: Map<string, Parent | null>) {
    const leadsHome = (e: CacheEntry) => {
      const seen = new Set<string>()
      for (let x: CacheEntry | undefined = e; x; x = x.parent ? this.entries.get(x.parent.key) : undefined) {
        if (x.key === root) return true
        if (seen.has(x.key)) return false
        seen.add(x.key)
      }
      return false
    }
    // Repeat until stable: each fix points a screen at one the search found earlier, so it ends.
    for (let changed = true; changed;) {
      changed = false
      for (const [key, via] of reached) {
        const e = this.entries.get(key)
        if (!e || key === root || leadsHome(e)) continue
        e.parent = via
        changed = true
      }
    }
    const level = (e: CacheEntry, depth = 0): number => {
      const p = e.parent && this.entries.get(e.parent.key)
      return e.key === root ? 1 : p && depth < 1000 ? level(p, depth + 1) + 1 : e.level
    }
    for (const e of this.mockup(root)) e.level = level(e)
  }

  /**
   * Carry over a file from before versions: each screen keeps only its picked variant. Links and
   * parents from other variants go, and so do the screens no picked screen reaches any more.
   */
  private migrate(data: { entries: OldEntry[]; links?: OldLink[] }) {
    const chosen = new Map<string, number>()
    for (const o of data.entries) {
      const live = (i: number) => o.candidates[i] && !o.candidates[i]!.deleted
      const i = live(o.chosen) ? o.chosen : o.candidates.findIndex((_, j) => live(j))
      if (i < 0) continue
      chosen.set(o.key, i)
      const { html, model, servedModel, createdAt, costUsd, costEstimated, firstChunkMs, totalMs, finishReason, device, name, feedback } = o.candidates[i]!
      const idea = screenIdea(html)
      const version: Version = { html, model, servedModel, createdAt, costUsd, costEstimated, firstChunkMs, totalMs, finishReason,
        ...(device && { device }), ...(name && { name }), ...(idea && { idea }), ...(feedback && { feedback }) }
      this.entries.set(o.key, { key: o.key, app: o.app, action: o.action, level: o.level ?? (o.action ? 2 : 1), parent: null, versions: [version] })
    }
    const fromPick = (key: string, variant: number | undefined) => chosen.has(key) && (variant == null || variant === chosen.get(key))
    for (const o of data.entries) {
      const p = o.parent, e = this.entries.get(o.key)
      if (e && p && fromPick(p.key, p.variant)) e.parent = { key: p.key, label: p.label }
    }
    for (const l of data.links ?? []) {
      if (fromPick(l.from, l.variant) && this.entries.has(l.to) && !this.links.has(linkId(l)))
        this.links.set(linkId(l), { from: l.from, to: l.to, label: l.label, createdAt: l.createdAt })
    }
    for (const root of new Set([...this.entries.values()].map((e) => normalizePrompt(e.app)))) {
      const reached = this.reach(root)
      for (const e of this.mockup(root)) if (!reached.has(e.key)) this.entries.delete(e.key)
      this.settle(root, reached)
    }
    this.dropLinks()
  }

  private save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    // Write a temp file, then rename, so a crash never leaves half a cache file.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: FORMAT, entries: [...this.entries.values()], links: [...this.links.values()] }, null, 1))
    renameSync(tmp, this.file)
  }
}

/** A screen in a file from before versions: variants ("candidates") and the one picked. */
interface OldEntry {
  key: string; app: string; action: string | null; chosen: number; level?: number
  parent?: { key: string; variant?: number; label: string } | null
  candidates: (Version & { deleted?: boolean })[]
}
interface OldLink { from: string; variant?: number; to: string; label: string; createdAt: string }
