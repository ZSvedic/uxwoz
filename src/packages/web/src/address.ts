// A mockup's address in the browser, `/m/<mockup>/<screen>`: read, written, and which screen it names (no DOM, tested).
// nav.ts keeps it in step with the open mockup and follows Back and Forward.

import { normalizePrompt } from '@uxwoz/core/keys'
import type { CacheEntry } from '@uxwoz/core'

export interface Address { mid: string; sid: string | null }
type Entries = Map<string, CacheEntry>

/** The mockup and screen an address names; null for any other path (the start page). */
export function readAddress(path: string): Address | null {
  const m = path.match(/^\/m\/([a-z0-9]{1,16})(?:\/([a-z0-9]{1,8}))?\/?$/)
  return m ? { mid: m[1]!, sid: m[2] ?? null } : null
}

/** The address of a mockup at a screen: `/` with none open, null while its first screen is not stored yet (it stays as it is). */
export function addressOf(app: string | null, entries: Entries, key: string | null): string | null {
  if (!app) return '/'
  const mid = entries.get(normalizePrompt(app))?.mid
  if (!mid) return null
  const sid = key ? entries.get(key)?.sid : undefined
  return sid ? `/m/${mid}/${sid}` : `/m/${mid}`
}

/** The entry a screen ID names in a mockup; no ID is its first screen. */
export function entryAt(app: string, entries: Entries, sid: string | null): CacheEntry | undefined {
  if (!sid) return entries.get(normalizePrompt(app))
  for (const e of entries.values()) if (e.sid === sid) return e
  return undefined
}

/** Where an address lands in its mockup: the screen it names, else (deleted since) the first screen and a word why; null with no first screen. */
export function landing(app: string, entries: Entries, sid: string | null): { entry: CacheEntry; why: string | null } | null {
  const named = entryAt(app, entries, sid)
  if (named) return { entry: named, why: null }
  const root = entries.get(normalizePrompt(app))
  return root ? { entry: root, why: 'That screen is not here.' } : null
}

/** The open A OR B's key: a screen with no version yet. */
export function openChoice(entries: Entries): string | null {
  for (const e of entries.values()) if (!e.versions.length && e.kind !== 'component') return e.key
  return null
}

/**
 * The screen the address shows: whichever came into view last, a screen made current or an A OR B that opened
 * (so while one is open the address is its screen's); Back and Forward set it with `went`.
 */
export class Shown {
  private current: string | null = null
  private choice: string | null = null
  key: string | null = null

  next(current: string | null, entries: Entries): string | null {
    const choice = openChoice(entries)
    if (choice && choice !== this.choice) this.key = choice
    else if (current !== this.current) this.key = current
    this.choice = choice
    this.current = current
    if (!this.key || !entries.has(this.key)) this.key = choice ?? current
    return this.key
  }

  /** Back or Forward went to this screen, which the address already names. */
  went(key: string | null, current: string | null, entries: Entries) {
    this.next(current, entries)
    this.key = key
  }
}

/** How the address changes: not at all, in place of this step (a reload, ← and →, Back and Forward), or as a new step. */
export function addressStep(now: string, want: string | null, inPlace: boolean): 'push' | 'replace' | null {
  if (want == null || want === now) return null
  return inPlace ? 'replace' : 'push'
}
