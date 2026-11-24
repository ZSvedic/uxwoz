// The address in the browser (spec/behavior.md, The address): `/m/<project>/<mock>`, a box's `/m/<project>/box-rules`,
// the tour's `/tour/<mock>`: read, written, and what it names (no DOM, tested). nav.ts keeps it in step and follows
// Back and Forward.

import { normalizePrompt } from '@uxwoz/core/keys'
import type { CacheEntry } from '@uxwoz/core'
import type { Box } from './boxes.ts'

/** A project by its ID (`mid`), or the tour (`mid` null); `at` a mock's ID (the tour's: its name), or a box. */
export interface Address { mid: string | null; at: string | null; box: Box | null }
type Entries = Map<string, CacheEntry>

/** Each box's last part of the address. */
export const BOX_PATHS: Record<Box, string> = { rules: 'box-rules', components: 'box-components', data: 'box-data', notes: 'box-fixer' }
const boxOf = (part: string | undefined): Box | null => (Object.entries(BOX_PATHS).find(([, p]) => p === part)?.[0] as Box | undefined) ?? null

/** What an address names; null for any other path (`/`). */
export function readAddress(path: string): Address | null {
  const m = path.match(/^\/m\/([a-z0-9]{1,16})(?:\/([a-z0-9-]{1,16}))?\/?$/)
  const t = path.match(/^\/tour(?:\/([a-z0-9-]{1,40}))?\/?$/)
  const part = m ? m[2] : t?.[1]
  if (!m && !t) return null
  const box = boxOf(part)
  if (m && part && !box && !/^[a-z0-9]{1,8}$/.test(part)) return null
  return { mid: m ? m[1]! : null, at: box ? null : part ?? null, box }
}

/**
 * The address of what shows: a box, else a mock, of a project or the tour; `/` with none open; null while a new
 * project's Home is not stored yet (the address stays as it is).
 */
export function addressOf(app: string | null, entries: Entries, key: string | null, box: Box | null = null, tour = false): string | null {
  if (!app) return '/'
  if (tour) return `/tour/${box ? BOX_PATHS[box] : (key && entries.get(key)?.name) || 'home'}`
  const mid = entries.get(normalizePrompt(app))?.mid
  if (!mid) return null
  if (box) return `/m/${mid}/${BOX_PATHS[box]}`
  if (!key) return `/m/${mid}`
  // A new mock's address comes once its first design is stored.
  const sid = entries.get(key)?.versions.length ? entries.get(key)!.sid : undefined
  return sid ? `/m/${mid}/${sid}` : null
}

/** The entry an address's `at` names: a mock's ID (the tour's: its name); none is Home. */
export function entryAt(app: string, entries: Entries, at: string | null, tour = false): CacheEntry | undefined {
  if (!at) return entries.get(normalizePrompt(app))
  for (const e of entries.values()) if (e.kind !== 'component' && (tour ? e.name === at : e.sid === at)) return e
  return undefined
}

/** Where an address lands: the mock it names, else (deleted since) Home and a word why; null with no Home. */
export function landing(app: string, entries: Entries, at: string | null, tour = false): { entry: CacheEntry; why: string | null } | null {
  const named = entryAt(app, entries, at, tour)
  if (named) return { entry: named, why: null }
  const root = entries.get(normalizePrompt(app))
  return root ? { entry: root, why: 'That mock is not here.' } : null
}

/** How the address changes: not at all, in place of this step (a reload, Back and Forward), or as a new step. */
export function addressStep(now: string, want: string | null, inPlace: boolean): 'push' | 'replace' | null {
  if (want == null || want === now) return null
  return inPlace ? 'replace' : 'push'
}
