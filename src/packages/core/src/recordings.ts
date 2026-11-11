// The starters' recordings (spec/public.md, Recordings): what the models said for each starter, read
// from recordings/<id>.json, and which recorded call answers a design or Home's filing. Server only:
// it reads files, so it is not in the browser's imports.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { extractFragment } from './frame.ts'
import { normalizePrompt, screenRef } from './keys.ts'
import { SYSTEM_PROMPT } from './prompt.ts'
import type { Recorded } from './providers.ts'
import { STARTERS, type Starter } from './starters.ts'
import { HOME_NAME, linksIn } from './tree.ts'

/** Recordings live at the repo's root, beside cassettes/ (in the image too). */
export const RECORDINGS_DIR = resolve(import.meta.dir, '../../../../recordings')

/** How many designs a recorded screen has: A, B and two Regenerates. */
export const RECORDED_DESIGNS = 4

export interface Recording {
  starter: string
  prompt: string
  promptHash: string
  recordedAt: string
  /** Home (as `home`) and every @name any Home design links to, by name. `action` is the screen's stored action, null for Home. */
  screens: Record<string, { action: string | null; designs: Recorded[] }>
  /** Home's filing when A was picked, when B was. */
  filings: Recorded[]
}

/** A short hash of the system prompt: a recording made with another prompt is out of date. */
export const promptHash = (system = SYSTEM_PROMPT) => createHash('sha256').update(system).digest('hex').slice(0, 16)

/** The screen a recorded design draws. */
export const recordedHtml = (r: Recorded) => extractFragment(r.events.map(([, text]) => text).join(''))

/** The names a screen links to by @name, home left out, in order. */
export function linkedNames(html: string): string[] {
  const names = linksIn(html).map((l) => screenRef(l.action)?.name).filter((n): n is string => !!n && n !== HOME_NAME)
  return [...new Set(names)]
}

/** Every recording in `dir` by its starter's normalized prompt; a file of no starter, or unreadable, is left out with a log line. */
export function loadRecordings(dir = RECORDINGS_DIR, log: (m: string) => void = console.warn): Map<string, Recording> {
  const out = new Map<string, Recording>()
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const rec = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recording
      const starter = STARTERS.find((s) => s.id === rec.starter)
      if (!starter || normalizePrompt(starter.prompt) !== normalizePrompt(rec.prompt)) { log(`recording ${f} is for no starter: left out`); continue }
      out.set(normalizePrompt(rec.prompt), rec)
    } catch (err) {
      log(`recording ${f} is unreadable (${err}): left out`)
    }
  }
  return out
}

let loaded: Map<string, Recording> | null = null
/** The recordings in recordings/, read once. */
export const recordings = () => (loaded ??= loadRecordings())

/** The recording for a mockup whose normalized prompt is a starter's, else null. */
export const recordingFor = (prompt: string, all = recordings()): Recording | null => all.get(normalizePrompt(prompt)) ?? null

/** The design that answers the `nth` draw of a screen (0 for A, 1 for B, then each Regenerate: 2, 3, then 0 again); null when it has no recording. */
export function recordedDesign(rec: Recording, name: string | null, nth: number): Recorded | null {
  const designs = rec.screens[(name ?? HOME_NAME).toLowerCase()]?.designs
  return designs?.length ? designs[((nth % designs.length) + designs.length) % designs.length]! : null
}

/** Home's filing after side `side` (0: A, 1: B) was picked. */
export const recordedFiling = (rec: Recording, side: number): Recorded | null => rec.filings[side] ?? null

/** False when a recording was made with another system prompt than today's. */
export const startersCurrent = (all = recordings()) => [...all.values()].every((r) => r.promptHash === promptHash())

/** What a recording lacks against the spec, one line each; empty when it is complete. */
export function recordingProblems(rec: Recording, starter: Starter | undefined = STARTERS.find((s) => s.id === rec.starter)): string[] {
  const out: string[] = []
  if (!starter) return [`no starter ${rec.starter}`]
  if (rec.prompt !== starter.prompt) out.push('the prompt is not the starter\'s')
  if (!/^[0-9a-f]{16}$/.test(rec.promptHash ?? '')) out.push('no promptHash')
  if (Number.isNaN(Date.parse(rec.recordedAt))) out.push('no recordedAt')
  const complete = (r: Recorded | undefined, what: string) => {
    if (!r || !Array.isArray(r.events) || !r.events.length) return void out.push(`${what}: no events`)
    if (r.events.some(([ms, text], i) => typeof ms !== 'number' || typeof text !== 'string' || (i > 0 && ms < r.events[i - 1]![0]))) out.push(`${what}: events out of order`)
    if (r.final?.type !== 'final' || r.final.finishReason !== 'stop') out.push(`${what}: not finished`)
  }
  const home = rec.screens?.[HOME_NAME]
  if (!home) out.push('no home')
  for (const [name, s] of Object.entries(rec.screens ?? {})) {
    if (s.designs?.length !== RECORDED_DESIGNS) out.push(`${name}: ${s.designs?.length ?? 0} designs, not ${RECORDED_DESIGNS}`)
    s.designs?.forEach((d, i) => { complete(d, `${name} design ${i}`); if (d?.events?.length && !recordedHtml(d).trim()) out.push(`${name} design ${i}: empty`) })
    if (name !== HOME_NAME && !screenRef(s.action ?? '')) out.push(`${name}: action is not an @name`)
  }
  for (const n of new Set(home?.designs.flatMap((d) => (d?.events ? linkedNames(recordedHtml(d)) : [])) ?? [])) if (!rec.screens[n]) out.push(`home links to @${n}, which has no recording`)
  if (rec.filings?.length !== 2) out.push(`${rec.filings?.length ?? 0} filings, not 2`)
  rec.filings?.forEach((f, i) => complete(f, `filing ${i}`))
  return out
}
