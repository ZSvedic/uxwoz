// Cache keys: how a screen's prompts become the key it is stored under.
// Runs in the browser as well as on the server, so it uses no Node or Bun APIs.

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

/** The letter of the n-th variant made at a level (0-based): A to Z, then AA, AB, and so on. */
export function letterAt(n: number): string {
  let s = ''
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

/** The inverse of letterAt: 0 for A, 26 for AA; -1 for anything else. */
export function letterIndex(letter: string): number {
  if (!/^[A-Z]+$/.test(letter)) return -1
  let n = 0
  for (const ch of letter) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

/** A variant's canonical name, e.g. "L2-B": the level its screen was made at, and its letter there. */
export const variantId = (level: number, letter: string) => `L${level}-${letter}`
