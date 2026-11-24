// The starters' recordings (spec/public.md, Recordings): what the models said for each starter at each size,
// read from recordings/<id>.<device>.json, and which recorded call answers a design or Home's filing. Server
// only: it reads files, so it is not in the browser's imports.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { extractFragment, isDevice, type Device } from './frame.ts'
import { normalizePrompt, screenRef } from './keys.ts'
import { SYSTEM_PROMPT } from './prompt.ts'
import type { Recorded } from './providers.ts'
import { STARTERS, type Starter } from './starters.ts'
import { HOME_NAME, linksIn } from './tree.ts'

/** Recordings live at the repo's root, beside cassettes/ (in the image too). */
export const RECORDINGS_DIR = resolve(import.meta.dir, '../../../../recordings')

/** How many designs a recorded screen has: the first, and Another on it. */
export const RECORDED_DESIGNS = 2

export interface Recording {
  starter: string
  device: Device
  prompt: string
  promptHash: string
  recordedAt: string
  /** Home (as `home`) and every @name either Home design links to, by name. `action` is the screen's stored action, null for Home. */
  screens: Record<string, { action: string | null; designs: Recorded[] }>
  /** Home's filing with its first design showing, with its second. */
  filings: Recorded[]
}

/** A recording's file name. */
export const recordingFile = (starter: string, device: Device) => `${starter}.${device}.json`
/** A recording's place in the map: its normalized prompt and its device. */
const slot = (prompt: string, device: Device) => `${normalizePrompt(prompt)}\n${device}`

/** A short hash of the system prompt: a recording made with another prompt is out of date. */
export const promptHash = (system = SYSTEM_PROMPT) => createHash('sha256').update(system).digest('hex').slice(0, 16)

/** The screen a recorded design draws. */
export const recordedHtml = (r: Recorded) => extractFragment(r.events.map(([, text]) => text).join(''))

/** The names a screen links to by @name, home left out, in order. */
export function linkedNames(html: string): string[] {
  const names = linksIn(html).map((l) => screenRef(l.action)?.name).filter((n): n is string => !!n && n !== HOME_NAME)
  return [...new Set(names)]
}

/** Every recording in `dir` by its starter's prompt and device; a file of no starter, misnamed or unreadable is left out with a log line. */
export function loadRecordings(dir = RECORDINGS_DIR, log: (m: string) => void = console.warn): Map<string, Recording> {
  const out = new Map<string, Recording>()
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const rec = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recording
      const starter = STARTERS.find((s) => s.id === rec.starter)
      if (!starter || normalizePrompt(starter.prompt) !== normalizePrompt(rec.prompt)) { log(`recording ${f} is for no starter: left out`); continue }
      if (!isDevice(rec.device) || f !== recordingFile(rec.starter, rec.device)) { log(`recording ${f} is not named <starter>.<device>.json: left out`); continue }
      out.set(slot(rec.prompt, rec.device), rec)
    } catch (err) {
      log(`recording ${f} is unreadable (${err}): left out`)
    }
  }
  return out
}

let loaded: Map<string, Recording> | null = null
/** The recordings in recordings/, read once. */
export const recordings = () => (loaded ??= loadRecordings())
/** Use these recordings instead of the files (the recording script uses none, so it never replays an old one). */
export const setRecordings = (all: Map<string, Recording>) => { loaded = all }

/** The recording for a mockup whose normalized prompt is a starter's, at its device; else null. */
export const recordingFor = (prompt: string, device: Device | undefined, all = recordings()): Recording | null =>
  (device && all.get(slot(prompt, device))) || null

/** A recorded screen's design: 0 its first, 1 Another on it; null when there is none. */
export const recordedDesign = (rec: Recording, name: string | null, nth: number): Recorded | null =>
  rec.screens[(name ?? HOME_NAME).toLowerCase()]?.designs[nth] ?? null

/** Home's first filing with its design `n` (0 or 1) showing. */
export const recordedFiling = (rec: Recording, n: number): Recorded | null => rec.filings[n] ?? null

/** False when a recording was made with another system prompt than today's. */
export const startersCurrent = (all = recordings()) => [...all.values()].every((r) => r.promptHash === promptHash())

/** What a recording lacks against the spec, one line each; empty when it is complete. */
export function recordingProblems(rec: Recording, starter: Starter | undefined = STARTERS.find((s) => s.id === rec.starter)): string[] {
  const out: string[] = []
  if (!starter) return [`no starter ${rec.starter}`]
  if (rec.prompt !== starter.prompt) out.push('the prompt is not the starter\'s')
  if (!isDevice(rec.device)) out.push(`no device ${rec.device}`)
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
