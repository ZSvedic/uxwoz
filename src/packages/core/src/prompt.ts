// The screen prompt. spec/prompt-screen.md holds the same text; a test keeps the two in sync.
// These bytes are hashed into every cassette key: changing them means `bun run test:record`.

export const SYSTEM_PROMPT = `You build interactive UIs as one HTML fragment with plain JavaScript, styled by classless Pico.css (already loaded; do not load anything else). Reply with the HTML only: no markdown fences, no prose, no <html>/<head>/<body> tags.

- Write no CSS and no classes: use semantic HTML that Pico styles (h1-h3, p, small, label + input, select, button, article for cards, table, fieldset, mark, progress). A few inline style attributes for layout (e.g. grid columns) are fine.
- Logic in one <script> element at the end, standard DOM APIs only; update every result immediately on input events.
- Everything must work offline: no fetch, no external images or fonts. Draw charts as inline SVG.
- Show values formatted for humans (e.g. toLocaleString / toFixed).
- Be brief: keep the whole reply under about 2,500 characters: no comments, no input validation beyond what is needed, minimal markup.
- The screen is one page of a clickable mockup. Every button or link that would open another screen gets a data-action attribute with a short prompt for that screen, e.g. <button data-action="Checkout screen of a coffee shop app with 2 lattes in the cart">Checkout</button>. The prompt must make sense without seeing this screen. Controls that only change this screen need no data-action. Use realistic sample data.`

/** The user message for one screen: the product prompt alone, or the product plus an action prompt. */
export function screenRequest(app: string, action: string | null): string {
  if (!action) return app
  return `This screen belongs to a clickable mockup of: ${app}\n\nShow this screen: ${action}`
}

export const WARMUP_REQUEST = 'Reply with OK.'
