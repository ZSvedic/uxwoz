# 2026-10-29: two variants per screen, in a feed

The canvas of cards and arrows is gone. The mockup is now a feed: one row per step of the flow,
top to bottom, and each row shows two variants of its screen side by side. See
[behavior.md](../../spec/behavior.md) for the full flow.

## What changed

- **Screens were too large.** Pico grows its text with the window, so an 800 px card had 18 px
  text next to a 14 px toolbar. Screen text is now a fixed 16 px.
- **Two variants per screen**, made at the same time. The second is asked for a clearly different
  design. A click inside a variant picks it and opens the next row; **Pick** picks without moving.
- **Neither?** takes an optional note and makes two more variants; old ones stay.
- **Device picker**: Phone (390 px, default) or Desktop (1280 px). The model is told which one.
  Phone screens show at 100%; desktop screens shrink until two fit.
- **Back links scroll** to the row already in the feed. A new click in an earlier row replaces the
  rows below it; the rows shown are remembered per browser.
- `layout.ts` and `canvas.ts` are deleted; `keys.ts` holds the cache key helpers so the browser
  can use them. The server still records links between screens, for a later map view.

## Lessons

- The browser test tool cannot click inside a frame shrunk with CSS zoom either; test clicks on
  phone-width variants.
- While the browser pane is hidden, its screenshots can be stale; read values with JavaScript.

## Open

- A map view of the whole flow (the links are still recorded).
- Mobile layout: rows already snap one variant per swipe under 700 px, nothing else is tuned.
- Brief steps 3-4: export for a coding agent.
