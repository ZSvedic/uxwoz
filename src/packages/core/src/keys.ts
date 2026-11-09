// Cache keys: how a screen's prompts become the key it is stored under.
// Runs in the browser as well as on the server, so it uses no Node or Bun APIs.

/** Lowercase, Unicode-normalized, single-spaced, without trailing punctuation. » becomes >, as it separates key parts. */
export function normalizePrompt(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/»/g, '>').replace(/\s+/g, ' ').trim().replace(/[\s.!?;:,]+$/, '')
}

/**
 * A link by name: `@sleep-report` for a screen the mockup has (made or planned), or
 * `@sleep-report: what the screen shows` for one it does not have yet. Null for a plain prompt.
 */
export function screenRef(action: string): { name: string; prompt: string } | null {
  const m = action.trim().match(/^@([a-z0-9][a-z0-9_-]*)\s*(?::\s*([\s\S]*))?$/i)
  return m ? { name: m[1]!.toLowerCase(), prompt: (m[2] ?? '').trim() } : null
}

/** A name in words: `sleep-report` becomes "sleep report". */
export const nameWords = (name: string) => name.replace(/[-_]+/g, ' ')

/** The action as stored: null for the first screen, whether asked for as no action, "home" or "@home". */
export const canonicalAction = (action: string | null): string | null => (!action?.trim() || normalizePrompt(action) === 'home' || screenRef(action)?.name === 'home' ? null : action)

/** The cache key: the normalized product prompt, plus `@name` for a screen opened by name. */
export function screenKey(app: string, action: string | null): string {
  const ref = canonicalAction(action) && screenRef(action!)
  return ref ? `${normalizePrompt(app)} » @${ref.name}` : normalizePrompt(app)
}

/** True for the action that goes back to the screen that opened this one: `back`. */
export const isBack = (action: string) => normalizePrompt(action) === 'back'

/** Where a control's action leads in the player: back, a screen by name (`home` too), or nowhere (plain text, as in the app). */
export function linkTarget(action: string): { back: true } | { name: string } | null {
  if (isBack(action)) return { back: true }
  if (!canonicalAction(action)) return { name: 'home' }
  const ref = screenRef(action)
  return ref ? { name: ref.name } : null
}

/** The manual's limits on the boxes: a full box refuses a new entry. A line is a rule, or where a component belongs. */
export const LIMITS = { components: 20, rules: 20, data: 10, columns: 6, rows: 8, line: 120 }

/** Undo of a box goes back this many changes; the fixer visits after every VISIT_EVERY picks, and its notes keep VISITS_KEPT visits. */
export const BOX_STATES = 10
export const VISIT_EVERY = 5
export const VISITS_KEPT = 20

/** The boxes in the order they show, by their titles; `notes` is the fixer's notes. */
export const BOX_TITLES = { rules: 'Rules', notes: 'Fixer\'s notes', components: 'Components', data: 'Data' }

/** A box entry's ID: 1 to 4 lowercase words joined by dashes. */
export const isId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+){0,3}$/.test(s)
