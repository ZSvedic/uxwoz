// Cached generative exploration: every screen is stored under its normalized prompt.
// A new screen first holds two proposals (the A OR B); a pick keeps one as the screen's first
// version and drops the other, and gives the screen its fixed name for links (`@sleep-report`).
// Edit and Regenerate add versions; Undo drops the newest. Each screen remembers the screen and
// click that first made it; levels and the tree are worked out from the screens (see tree.ts).
// Each mockup has a spec (see spec.ts): a pick fills its open rows, an Edit sets rows, Undo takes
// an Edit's values back.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { canonicalAction, nameWords, normalizePrompt, screenKey, screenRef } from './keys.ts'
import { screenName, type Device } from './frame.ts'
import { HOME_NAME, nameFrom, screenTree, treeLines, uniqueName } from './tree.ts'
import type { ModelId } from './models.ts'
import { MAX_ROWS, applyEdit, applyPick, dropValues, fits, removeLine, removeRow, setUserLine, untie, type Spec, type SpecLine, type SpecRefusal } from './spec.ts'
import { KEPT_ROWS, stillHolds, type ReviewInfo, type Suggestion } from './review.ts'

/**
 * What the review pass left for a mockup: suggestions waiting for the user, a log of its runs, the
 * highest count of picked screens it has read (so one count is read once), and the rows the user
 * deleted (so no review adds them again).
 */
export interface SpecReview { suggestions: Suggestion[]; reviews: ReviewInfo[]; lastCount?: number; deleted?: string[] }

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
  /** The spec lines the design proposed (`<meta name="spec">`), taken out of `html`. */
  spec?: SpecLine[]
  /** An Edit's lines that were not taken, and why (shown in the drawer). */
  specRefused?: SpecRefusal[]
  /** What the screen misses against the spec it was made with (checkScreen); absent when made without one. */
  misses?: string[]
  /** On a first screen's designs: how the plan before it went (its time and cost, or why it failed). */
  plan?: PlanInfo
}

/** How a mockup's plan went: rows it opened, time and cost, or the error that left the fallback spec. */
export interface PlanInfo { rows: number; ms: number; costUsd: number | null; error?: string }

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
}

/** How many designs a new screen offers. */
export const PROPOSALS = 2

const FORMAT = 4

export class ScreenCache {
  private entries = new Map<string, CacheEntry>()
  /** Each mockup's spec, by its root (the normalized app prompt). */
  private specs = new Map<string, Spec>()
  /** Each mockup's review suggestions and runs, by its root. */
  private reviewsOf = new Map<string, SpecReview>()
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
      if (data?.version === FORMAT || data?.version === 3 || data?.version === 2) {
        for (const e of data.entries as CacheEntry[]) this.entries.set(e.key, e)
        // Files from before specs (version 3 and older): every mockup starts with an empty spec.
        for (const [root, spec] of Object.entries((data.specs ?? {}) as Record<string, Spec>)) this.specs.set(root, spec)
        for (const [root, r] of Object.entries((data.reviews ?? {}) as Record<string, SpecReview>)) this.reviewsOf.set(root, r)
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
    if (ref && canonicalAction(app, action)) return this.mockup(normalizePrompt(app)).find((e) => e.name === ref.name)
    const hit = this.entries.get(screenKey(app, action))
    if (hit || !action) return hit
    const a = normalizePrompt(action)
    return this.mockup(normalizePrompt(app)).find((e) => e.action != null && normalizePrompt(e.action) === a)
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
    // The picked design's lines fill open rows; the other design's lines go with it.
    if (v.spec?.length) applyPick(this.specOf(entry.app), v.spec, key, v.createdAt)
    this.save()
    return entry
  }

  /** A mockup's spec; an empty one when it has none (an old mockup, or a plan that failed). */
  spec(app: string): Spec {
    return this.specs.get(normalizePrompt(app)) ?? {}
  }

  /** True once a mockup has a spec, even an empty one: its plan ran. */
  hasSpec(app: string): boolean {
    return this.specs.has(normalizePrompt(app))
  }

  /** Set a mockup's spec (the plan's). */
  setSpec(app: string, spec: Spec) {
    this.specs.set(normalizePrompt(app), spec)
    this.save()
  }

  /** A mockup's review suggestions and runs. */
  review(app: string): SpecReview {
    const r = this.reviewsOf.get(normalizePrompt(app)) ?? { suggestions: [], reviews: [] }
    // A suggestion made against values that changed since (the user's line, a deleted row) is stale and does not show.
    const spec = this.spec(app)
    return { ...r, suggestions: r.suggestions.filter((s) => stillHolds(spec, s)) }
  }

  /** True when a mockup with this many picked screens is due a review: it has a spec, and that count was not read yet. */
  dueReview(app: string, picked: number, every: number): boolean {
    if (!picked || picked % every || !Object.keys(this.spec(app)).length) return false
    return picked > (this.review(app).lastCount ?? 0)
  }

  /**
   * Store one review: its new open rows go in (only keys the spec still does not have, within the
   * limits), its suggestions wait for the user, and its run is logged. A filled row is never touched.
   */
  addReview(app: string, adds: { key: string; ask: string }[], suggestions: Suggestion[], info: ReviewInfo) {
    const spec = this.specOf(app)
    const r = this.review(app)
    const added = adds.filter((a) => !Object.hasOwn(spec, a.key) && !r.deleted?.includes(a.key) && Object.keys(spec).length < MAX_ROWS && fits(spec, a.key))
      .map((a) => { spec[a.key] = { ask: a.ask, from: 'review', values: [] }; return a.key })
    // A new run replaces the suggestions the user has not settled, so they do not pile up.
    const fresh = suggestions.filter((s) => stillHolds(spec, s))
    this.reviewsOf.set(normalizePrompt(app), {
      ...r, suggestions: fresh, reviews: [...r.reviews, { ...info, added, suggested: fresh.length }], lastCount: Math.max(r.lastCount ?? 0, info.screens),
    })
    this.save()
  }

  /** The user's own line for a row. Returns why it was refused, or null. */
  setLine(app: string, key: string, text: string): string | null {
    const why = setUserLine(this.specOf(app), key, text)
    if (why) return why
    // A row the user writes again is no longer one they deleted.
    const r = this.reviewsOf.get(normalizePrompt(app))
    if (r?.deleted?.length) r.deleted = r.deleted.filter((k) => k !== key.trim())
    this.save()
    return null
  }

  /** Delete a row's newest line (`line`) or the whole row. False when there was nothing to delete. */
  remove(app: string, key: string, what: 'line' | 'row'): boolean {
    const spec = this.specOf(app)
    const done = what === 'row' ? removeRow(spec, key) : removeLine(spec, key)
    if (!done) return false
    // A row the user deleted stays deleted: no review adds it again.
    if (what === 'row' || !Object.hasOwn(spec, key)) {
      const root = normalizePrompt(app), r = this.reviewsOf.get(root) ?? { suggestions: [], reviews: [] }
      this.reviewsOf.set(root, { ...r, deleted: [...new Set([...(r.deleted ?? []), key])] })
    }
    this.save()
    return true
  }

  /**
   * Accept a review suggestion (it becomes the user's line; a merge also removes its second row) or
   * dismiss it. Returns why accepting failed, or null; undefined when there is no such suggestion.
   */
  settle(app: string, id: string, accept: boolean): string | null | undefined {
    const root = normalizePrompt(app)
    const r = this.reviewsOf.get(root)
    const s = r?.suggestions.find((x) => x.id === id)
    if (!r || !s) return undefined
    const spec = this.specOf(app)
    const drop = () => this.reviewsOf.set(root, { ...r, suggestions: r.suggestions.filter((x) => x.id !== id) })
    let why: string | null = null
    // A suggestion made against values that changed since would put an old decision over a newer one.
    if (accept && !stillHolds(spec, s)) why = 'the rows changed since this suggestion; it was dropped'
    else if (accept && s.kind === 'merge' && KEPT_ROWS.includes(s.keys[1]!)) why = `a merge may not remove ${s.keys[1]}`
    else if (accept) {
      why = setUserLine(spec, s.keys[0]!, s.text)
      if (!why && s.kind === 'merge') removeRow(spec, s.keys[1]!)
    }
    if (!why || !stillHolds(spec, s)) drop()
    this.save()
    return why
  }

  /**
   * Take back the line that the version made at `at` (its createdAt) of a screen set on row `row`
   * (the ✕ in the drawer). Not by index: after an Undo and a new Edit, a second browser's ✕ for the
   * first Edit would take back the second. Returns the spec, or undefined if there was no such line.
   */
  dropLine(key: string, at: string, row: string): Spec | undefined {
    const entry = this.entries.get(key)
    if (!entry?.versions.some((v) => v.createdAt === at)) return undefined
    const spec = this.specOf(entry.app)
    if (!dropValues(spec, key, at, row)) return undefined
    this.save()
    return spec
  }

  private specOf(app: string): Spec {
    const root = normalizePrompt(app)
    let s = this.specs.get(root)
    if (!s) this.specs.set(root, s = {})
    return s
  }

  /** Give a picked screen opened by a plain prompt its fixed name, once: home for the first screen, else from its title. */
  private name(e: CacheEntry) {
    if (e.name || !e.versions.length) return
    const taken = new Set(this.mockup(normalizePrompt(e.app)).map((x) => x.name).filter((n): n is string => !!n))
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
    // An Edit's lines set rows at once; a Regenerate's are dropped.
    if (version.feedback) {
      const refused = [...(version.specRefused ?? [])]
      if (version.spec?.length) applyEdit(this.specOf(entry.app), version.spec, key, version.createdAt, refused)
      if (refused.length) version.specRefused = refused
      else delete version.specRefused
    } else { delete version.spec; delete version.specRefused }
    entry.versions.push(version)
    this.save()
    return entry
  }

  /** Drop the newest version, so the one before shows again. Never the last one. */
  undo(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry || entry.versions.length < 2) return undefined
    // The values the version set go, so the values before count again.
    dropValues(this.specOf(entry.app), key, entry.versions.at(-1)!.createdAt)
    entry.versions.pop()
    this.save()
    return entry
  }

  /** This mockup's screens as the indented tree the model links to, `self` (a name) marked as the screen being made (see treeLines). */
  existingScreens(app: string, self?: string): string[] {
    return treeLines(this.mockup(normalizePrompt(app)), undefined, self, this.spec(app))
  }

  /** One mockup: its screens, oldest first. */
  map(app: string): { root: string; entries: CacheEntry[]; spec: Spec; review: SpecReview } {
    const root = normalizePrompt(app)
    return { root, entries: this.mockup(root), spec: this.spec(app), review: this.review(app) }
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
   * Delete a screen, and every screen the first screen no longer reaches without it (through the
   * clicks that made screens and the buttons in each screen). A screen still reached another way
   * stays. The first screen takes the whole mockup with it. Returns the keys removed.
   */
  delete(key: string): string[] | undefined {
    const entry = this.entries.get(key)
    // Even an unknown key is marked: an A OR B dropped before its first side finished stays dropped.
    // A first screen dropped that early takes its plan with it, so the next try plans again.
    this.tomb(key)
    if (!entry) {
      if (!key.includes(' » ') && this.specs.delete(key)) { this.reviewsOf.delete(key); this.save() }
      return undefined
    }
    const root = normalizePrompt(entry.app)
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
    // Their values stay in the spec, no longer tied to a screen that a remade one could take them back through.
    const spec = this.specs.get(root)
    if (spec) for (const k of removed) untie(spec, k)
    this.save()
    return removed
  }

  /** Delete a whole mockup: all its screens. Returns how many screens went. */
  deleteApp(app: string): number {
    const root = normalizePrompt(app)
    const gone = this.mockup(root)
    this.tomb(root)
    // Start over and Delete clear the spec too, and what the review pass left.
    const had = this.specs.delete(root)
    this.reviewsOf.delete(root)
    for (const e of gone) { this.entries.delete(e.key); this.tomb(e.key) }
    if (gone.length || had) this.save()
    return gone.length
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
    writeFileSync(tmp, JSON.stringify({ version: FORMAT, entries: [...this.entries.values()], specs: Object.fromEntries(this.specs), reviews: Object.fromEntries(this.reviewsOf) }, null, 1))
    renameSync(tmp, this.file)
  }
}
