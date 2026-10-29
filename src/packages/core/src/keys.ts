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
