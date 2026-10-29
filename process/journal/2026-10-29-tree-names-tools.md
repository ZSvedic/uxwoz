# 2026-10-29 (night): names, a tree of screens, variant tools, more screens per mockup

Feedback round a-o on the feed. One commit per step; the specs follow in the last one.

## What changed

- **Rows follow the pick (a).** A row used to stay when its parent row picked another variant,
  so a line could point from a variant that has no such button. Each screen now stores the variant
  and click that first made it, each link the variant it was clicked in. A new pick drops the rows
  it does not reach and brings back its own newest path.
- **Names (b, e, l).** Every variant is *L{level}-{letter} {name}*, e.g. *L2-B Planning sync*.
  Letters run across all variants of a level in a mockup and are never reused, so a name stays
  true after deletes. The model names the screen in a `<title>` in the same reply. Model and cost
  moved to the bar's tooltip and Info.
- **Picked variant first (c),** with CSS `order`, so no frame reloads. The flow line now runs
  straight down the left. A press inside a screen waits until the row is left, so the screen
  never jumps from under the pointer.
- **Blue (f)** for controls that open a screen, in both themes. The mockup's grey filter moved
  from `main` to each topmost part without such a control.
- **Variant tools (o)** in place of Neither: Change (edit the prompt, one new variant of the same
  screen), Regenerate (one more), Delete (asks; takes the screens only it reached), Info.
- **Tree (d, i)** left of the feed: every screen, one line per variant, children under the click
  that made them. The feed shows only the main flow; a click in the tree makes a path the flow.
- **Zoom (h):** pinch, Ctrl/Cmd + scroll (also over a screen), slider with Fit and 100%.
- **Start over and Delete (k)** for the open mockup.
- **More screens (g, j).** The prompt now says details, forms, settings and tab-bar sections are
  screens of their own, at least three per screen. First screens went from 1.3 such controls on
  average (6 of 20 with none) to 4-10; later screens 3-4. Two new examples name their screens.

## Decisions

- **l:** kept the user's L{level}-{letter} scheme, with two rules that make it stable: level and
  letter are fixed when a variant is made, and letters count every variant of a level.
- **o:** Change makes one variant of the same screen (same cache key), so the click that led here
  still lands here; the edited prompt is stored on the variant. Delete prunes screens that become
  unreachable, and reparents a screen another click still reaches.

## Lessons

- Bun's `--hot` dev server kept serving an old `feed.ts` after edits (`app.ts` reloaded fine),
  and `touch` did not help. Restart the server after editing `feed.ts`.
- Viewport emulation larger than the browser pane scales the page, and then clicks inside a
  screen's frame do nothing; reset the viewport before testing clicks.
- The old cache migrated by link order. A pair's second variant often finishes first, so letters
  sort by "made no later than the variants after it in the same screen", or B comes before A.

## Open

- The arcs for back links still need the feed's rows; the tree does not show back links yet.
- A "More detail" button to grow a screen's fidelity on request.
- Export for a coding agent (brief steps 3-4).
