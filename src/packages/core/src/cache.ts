// Cached generative exploration: every screen is stored under its normalized prompt.
// Each screen has variants (candidates); regenerating adds more, and only an explicit choose()
// changes which one revisits show.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { canonicalAction, normalizePrompt, screenKey } from './keys.ts'
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
  /** What the user asked to change when they regenerated, if anything. */
  feedback?: string
}

export interface CacheEntry {
  key: string
  app: string
  action: string | null
  /** Index of the candidate a revisit shows. */
  chosen: number
  candidates: Candidate[]
}

/** One click that led from one screen to another. */
export interface Link {
  from: string
  to: string
  /** The text of the control that was clicked, e.g. "Checkout". */
  label: string
  createdAt: string
}

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()
  /** Keyed by "from\nto": the first click between two screens names the arrow. */
  private links = new Map<string, Link>()

  /** With a file, the cache loads it now and rewrites it after every change. */
  constructor(private file: string | null = null) {
    if (file && existsSync(file)) {
      try {
        // The first file format was a bare list of entries.
        const data = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry[] | { entries: CacheEntry[]; links: Link[] }
        const { entries, links } = Array.isArray(data) ? { entries: data, links: [] } : data
        for (const e of entries) this.entries.set(e.key, e)
        for (const l of links) this.links.set(`${l.from}\n${l.to}`, l)
      } catch (err) {
        const aside = `${file}.corrupt-${Date.now()}`
        renameSync(file, aside)
        console.warn(`screen cache ${file} was unreadable (${err}); moved it to ${aside} and started empty`)
      }
    }
  }

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key)
  }

  /**
   * Store new candidates, in order. The first candidate of a key becomes the chosen one; later ones
   * do not. Returns the index of the first one added.
   */
  add(app: string, action: string | null, ...candidates: Candidate[]): { entry: CacheEntry; index: number } {
    action = canonicalAction(app, action)
    const key = screenKey(app, action)
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { key, app, action, chosen: 0, candidates: [] }
      this.entries.set(key, entry)
    }
    const index = entry.candidates.length
    entry.candidates.push(...candidates)
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

  /** Record that a click on `from` led to `to`. Both must be screens of the same mockup. */
  link(from: string, to: string, label: string): Link | undefined {
    const a = this.entries.get(from), b = this.entries.get(to)
    if (!a || !b || from === to || normalizePrompt(a.app) !== normalizePrompt(b.app)) return undefined
    const id = `${from}\n${to}`
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
    const entries = [...this.entries.values()].filter((e) => normalizePrompt(e.app) === root)
    const keys = new Set(entries.map((e) => e.key))
    const links = [...this.links.values()].filter((l) => keys.has(l.from) && keys.has(l.to))
    return { root, entries, links }
  }

  choose(key: string, index: number): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry || !Number.isInteger(index) || index < 0 || index >= entry.candidates.length) return undefined
    entry.chosen = index
    this.save()
    return entry
  }

  get size(): number {
    return this.entries.size
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
