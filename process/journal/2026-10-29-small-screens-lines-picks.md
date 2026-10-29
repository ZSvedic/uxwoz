# 2026-10-29 (evening): whole sketch borders, small screens, flow lines, one pick rule

Feedback round on the feed. Four commits, one per fix.

## What changed

- **Sketch borders stay whole.** The real cause of the gaps: Pico gives a card's `<header>` a
  filled, square-cornered strip, and it painted over the card's curved corner. Card headers and
  footers are now see-through. Radios stay round, and a count after one (`All <small>(6)</small>`)
  stays on its line: Pico was turning it into help text below the input.
- **Screens start small.** The prompt says to show only what a step needs; the device width is a
  maximum. `main` is only as wide as its content, and the card shows only that width. The frame
  itself keeps the device width, so the screen's layout never changes while it is cut down.
- **Flow lines.** A stepped line joins the pick in each row to the pick in the next. Any other
  click between rows (a back link, a skip ahead) is a dashed arc in a gutter on the left, stored
  with `POST /api/link`. It is an arc diagram: rows on a line, links as arcs beside it.
- **One pick rule.** Any click in a variant picks it; the Pick button is gone.

## Lessons

- **3 whys for the false "fixed" claim:** I checked a different screen, at low detail, and
  confirmed my theory (shrinking) instead of reproducing the circled spots. Reproduce the exact
  spot first, then zoom into it after the fix.
- A sandboxed frame cannot be inspected, but the same srcdoc in a plain iframe can: read computed
  styles there (that is how the square header corner showed up).
- "Start small" made one model wrap the screen in its own narrow `<main>`, and Sol set an action
  prompt from script (`dataset.action`). Both work in the app; the model test accepts both.

## Open

- A map view of a whole mockup (50+ screens) as an indented tree, with back links as tags.
- A "More detail" button to grow a screen's fidelity on request.
