// Cache keys: how a screen's prompts become the key it is stored under.
// Runs in the browser as well as on the server, so it uses no Node or Bun APIs.

/** Lowercase, Unicode-normalized, single-spaced, without trailing punctuation. » becomes >, as it separates key parts. */
export function normalizePrompt(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/»/g, '>').replace(/\s+/g, ' ').trim().replace(/[\s.!?;:,]+$/, '')
}

/** The action prompt that means "the first screen" (the model writes `@home`, which means the same). */
export const HOME_ACTION = 'home'

/** The action as stored: null for the first screen, whether asked for as no action, "home", "@home", or the product prompt. */
export function canonicalAction(app: string, action: string | null): string | null {
  if (!action) return null
  const a = normalizePrompt(action)
  return a === '' || a === HOME_ACTION || a === `@${HOME_ACTION}` || a === normalizePrompt(app) ? null : action
}

/** The cache key: the normalized product prompt, plus the normalized action prompt for later screens. */
export function screenKey(app: string, action: string | null): string {
  const root = normalizePrompt(app)
  const a = canonicalAction(app, action)
  return a ? `${root} » ${normalizePrompt(a)}` : root
}

/** Labels (after icons and arrows) that mean "the first screen", and "the screen before". */
const HOME_LABEL = /^(?:home|go home|back home|main menu|(?:back|go back|return) to (?:the )?(?:home|start|main)(?: (?:screen|page|menu))?)$/
const BACK_LABEL = /^(?:back|go back|return)(?: to .+)?$/

/**
 * Whether a click goes back to the screen that opened this one ("back": the model's action prompt
 * `back`, a label like "← Back" or "Back to cats", or an arrow alone), to the first screen ("home":
 * a label like "🏠 Home" or "Back to home"), or to the screen its action prompt names (null). The
 * label wins over the prompt: models sometimes give Back a long prompt for the home screen.
 */
export function wayBack(action: string, label: string): 'back' | 'home' | null {
  const raw = label.trim().toLowerCase().replace(/\s+/g, ' ')
  // Icons and arrows in front go, and so do icon-font names like "arrow_back" or "home".
  const said = raw.replace(/^[^\p{L}]+/u, '').replace(/^(?:arrow_back(?:_ios(?:_new)?)?|chevron_left|navigate_before)\s*/, '')
  if (HOME_LABEL.test(said) || /^home\s+home$/.test(said)) return 'home'
  if (normalizePrompt(action) === 'back' || BACK_LABEL.test(said) || (raw !== '' && said === '' && /^[←‹<«◀⬅❮]+$/u.test(raw))) return 'back'
  return null
}
