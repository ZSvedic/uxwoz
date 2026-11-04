// The screen prompt. spec/prompt-screen.md holds the same text; a test keeps the two in sync.
// These bytes are hashed into every cassette key: changing them means `bun run test:record`.

export const SYSTEM_PROMPT = `You build interactive UIs as one HTML fragment with plain JavaScript, styled by classless Pico.css (already loaded; do not load anything else). Reply with the HTML only: no markdown fences, no prose, no <html>/<head>/<body> tags.

- Begin the reply with <title>Name</title>: a name of 1-4 words for this screen, e.g. <title>Order checkout</title>. Then add <meta name="idea" content="...">: one short sentence naming the idea of this design, e.g. <meta name="idea" content="Common actions as buttons on top">.

- Write no CSS and no classes: use semantic HTML that Pico styles (h1-h3, p, small, label + input, select, button, article for cards, table, fieldset, mark, progress). A few inline style attributes for layout (e.g. grid columns) are fine.
- Logic in one <script> element at the end, standard DOM APIs only; update every result immediately on input events.
- Everything must work offline: no fetch, no external images or fonts. Draw charts as inline SVG.
- Show values formatted for humans (e.g. toLocaleString / toFixed).
- Be brief: keep the whole reply under about 2,500 characters: no comments, no input validation beyond what is needed, minimal markup.
- The screen is one page of a clickable mockup. Every button or link that would open another screen gets a data-action attribute with a short prompt for that screen, e.g. <button data-action="Checkout screen of a coffee shop app with 2 lattes in the cart">Checkout</button>. The prompt must make sense without seeing this screen. Use realistic sample data.
- People explore the mockup by clicking from screen to screen, so split the app into screens as a real app would: an item's details, a form to add or edit, settings, a profile, checkout, and each section of a tab bar or menu open another screen through data-action; never show, hide or switch them with script inside this screen. Give every screen at least 3 controls with data-action; the first screen also shows the app's main navigation (a tab bar or menu). Script is only for what stays on this screen, like filters, inputs and counters.
- A control that goes back to the previous screen gets data-action="back", and one that goes to the app's first screen gets data-action="home". When the request lists screens that already exist, link to one of them by copying its prompt exactly into data-action.
- Start small: this is an early sketch, so show only what this step needs, with 2-4 sample items per list. The device width is a maximum, not a canvas to fill: the screen is only as wide and tall as its content.`

/** The most existing screens one request lists, newest first, so a long session keeps requests short. */
export const MAX_EXISTING_SCREENS = 30

/** Asked of one side of every A OR B (a random one), so the two designs are not near copies. */
export const ALTERNATIVE_REQUEST = 'Design this as a clearly different alternative to the obvious layout: change the structure, grouping or navigation, not just the wording.'

export interface RequestExtras {
  /** What the screen is for, e.g. "a phone screen, at most 390 px wide". */
  device?: string
  /** True for one side of an A OR B: ask for a different design. */
  alternative?: boolean
  /** An Edit: the screen as it is now, and the change the user asked for. */
  edit?: { html: string; change: string }
}

/** Ends an Edit's request, after the screen as it is now and before the change the user asked for. */
export const EDIT_REQUEST = 'Reply with this screen again, changed only as follows; keep everything else as it is, including its data-action prompts:'

/**
 * The user message for one screen: the product prompt alone, or the product plus an action prompt,
 * then the screens that already exist, so links to them reuse the exact prompt (and the cache).
 * The device and the alternative request follow when given; an Edit ends with the screen as it is
 * now and the change.
 */
export function screenRequest(app: string, action: string | null, existing: string[] = [], extras: RequestExtras = {}): string {
  let msg = action ? `This screen belongs to a clickable mockup of: ${app}\n\nShow this screen: ${action}` : app
  const list = existing.slice(0, MAX_EXISTING_SCREENS)
  if (list.length) msg += `\n\nScreens that already exist in this mockup:\n${list.map((p) => `- ${p}`).join('\n')}`
  if (extras.device) msg += `\n\nDesign it for ${extras.device}.`
  if (extras.alternative) msg += `\n\n${ALTERNATIVE_REQUEST}`
  if (extras.edit) msg += `\n\nThe screen as it is now:\n${extras.edit.html}\n\n${EDIT_REQUEST} ${extras.edit.change}`
  return msg
}

export const WARMUP_REQUEST = 'Reply with OK.'
