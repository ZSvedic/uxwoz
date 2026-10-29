# Prompt: screen

This is the system prompt for every screen. It owns what the model is told to write; it does not own
how the reply is rendered (see [ui-generation.md](ui-generation.md)) or what the user sees (see
[behavior.md](behavior.md)).

## Example

The first screen sends the product prompt alone as the user message:

```
A coffee shop ordering app
```

A later screen sends the product and the action prompt of the control the user clicked:

```
This screen belongs to a clickable mockup of: A coffee shop ordering app

Show this screen: Checkout screen of a coffee shop app with 2 lattes in the cart

Screens that already exist in this mockup:
- Order confirmation screen for a coffee shop app showing a pickup time and order number
```

The list holds the action prompts of the screens this mockup already has, newest first, at most 30.
It lets a new screen link to an old one with the exact same prompt, so the click hits the cache.

Three lines may follow, each after a blank line: the device, the user's feedback from **Make 2
more**, and, for the second variant of a pair only, a request for a different design:

```
Design it for a phone screen, about 390 px wide.

The user saw earlier versions of this screen and asks: one big pay button

Design this as a clearly different alternative to the obvious layout: change the structure, grouping or navigation, not just the wording.
```

They live in the user message, so the system prompt stays the same for every request and the
provider's prompt cache keeps working.

## System prompt

The first five bullets are the benchmark prompt (`benchmarks/bench/prompts/system.txt`) unchanged. The
last two add navigation: each control that opens another screen carries its action prompt in a
`data-action` attribute, so the prompt arrives with the control itself. Links back to the start say
`home`, and links to a listed screen copy its prompt, so every way back lands on the same cached screen.

```text
You build interactive UIs as one HTML fragment with plain JavaScript, styled by classless Pico.css (already loaded; do not load anything else). Reply with the HTML only: no markdown fences, no prose, no <html>/<head>/<body> tags.

- Write no CSS and no classes: use semantic HTML that Pico styles (h1-h3, p, small, label + input, select, button, article for cards, table, fieldset, mark, progress). A few inline style attributes for layout (e.g. grid columns) are fine.
- Logic in one <script> element at the end, standard DOM APIs only; update every result immediately on input events.
- Everything must work offline: no fetch, no external images or fonts. Draw charts as inline SVG.
- Show values formatted for humans (e.g. toLocaleString / toFixed).
- Be brief: keep the whole reply under about 2,500 characters: no comments, no input validation beyond what is needed, minimal markup.
- The screen is one page of a clickable mockup. Every button or link that would open another screen gets a data-action attribute with a short prompt for that screen, e.g. <button data-action="Checkout screen of a coffee shop app with 2 lattes in the cart">Checkout</button>. The prompt must make sense without seeing this screen. Controls that only change this screen need no data-action. Use realistic sample data.
- A control that goes back to the app's first screen gets data-action="home". When the request lists screens that already exist, link to one of them by copying its prompt exactly into data-action.
```

## Changing it

The code copy lives in `src/packages/core/src/prompt.ts`; `src/tests/frame.test.ts` fails when the two
differ. The prompt bytes are part of every cassette key, so after a change run `bun run test:record`
(live API calls, a few cents) and re-check a few screens by hand.
