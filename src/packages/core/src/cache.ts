// Cached generative exploration: every screen is stored under its normalized prompt.
// Regenerating adds a candidate; only an explicit choose() changes which one revisits show.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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
}

export interface CacheEntry {
  key: string
  app: string
  action: string | null
  /** Index of the candidate a revisit shows. */
  chosen: number
  candidates: Candidate[]
}

/** Lowercase, Unicode-normalized, single-spaced, without trailing punctuation. » becomes >, as it separates key parts. */
export function normalizePrompt(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/»/g, '>').replace(/\s+/g, ' ').trim().replace(/[\s.!?;:,]+$/, '')
}

/** The action prompt that means "the first screen"; the model writes it on back-to-start links. */
export const HOME_ACTION = 'home'

/** The action as stored: null for the first screen, whether asked for as no action, "home", or the product prompt. */
export function canonicalAction(app: string, action: string | null): string | null {
  if (!action) return null
  const a = normalizePrompt(action)
  return a === '' || a === HOME_ACTION || a === normalizePrompt(app) ? null : action
}

/** The cache key: the normalized product prompt, plus the normalized action prompt for later screens. */
export function screenKey(app: string, action: string | null): string {
  const root = normalizePrompt(app)
  const a = canonicalAction(app, action)
  return a ? `${root} » ${normalizePrompt(a)}` : root
}

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()

  /** With a file, the cache loads it now and rewrites it after every change. */
  constructor(private file: string | null = null) {
    if (file && existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry[]
        for (const e of data) this.entries.set(e.key, e)
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

  /** Store a new candidate. The first candidate of a key becomes the chosen one; later ones do not. */
  add(app: string, action: string | null, candidate: Candidate): { entry: CacheEntry; index: number } {
    action = canonicalAction(app, action)
    const key = screenKey(app, action)
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { key, app, action, chosen: 0, candidates: [] }
      this.entries.set(key, entry)
    }
    entry.candidates.push(candidate)
    this.save()
    return { entry, index: entry.candidates.length - 1 }
  }

  /** The action prompts of this mockup's later screens, newest first. */
  existingScreens(app: string): string[] {
    const root = normalizePrompt(app)
    return [...this.entries.values()]
      .filter((e) => e.action && normalizePrompt(e.app) === root)
      .map((e) => e.action!)
      .reverse()
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
    writeFileSync(tmp, JSON.stringify([...this.entries.values()], null, 1))
    renameSync(tmp, this.file)
  }
}
