# 2026-10-29 (later): screens at full size, lineage lines, History

Three changes after the first look at the feed.

## What changed

- **Screens are never shrunk.** Desktop screens were made for 1280 px and shrunk to about a third
  to fit two in a row: text became about 5 px, and the sketch theme's thin, stretched corner curves
  fell apart into gaps. Now one pixel of a screen is one pixel on the page. Desktop is designed for
  1024 px instead of 1280, and a row too wide for the window scrolls sideways. The browser's own
  zoom is the overview tool. The zoom code in `feed.ts` is gone.
- **Lineage lines.** A line with an arrow drops from the picked variant of each row into the next
  row, labelled with the control that was clicked. It replaces the *↓ Checkout* text in the row head.
- **History.** A list next to the examples shows every mockup in the cache, newest first, from the
  new `GET /api/apps`. Choosing one opens it at no cost.

## Lessons

- **3 whys for the zoom bug:** text was tiny because screens were shrunk; they were shrunk because
  a 1280 px design had to fit in about 400 px; that happened because "Desktop" was taken as a real
  monitor width and the mismatch was fixed afterwards by scaling. Fix the size at the source.
- `sed -i` replaces a file with a new one, and Bun's `--hot` watcher can miss that: the dev server
  kept serving the old `feed.ts`. Edit in place, or restart the server.
- A hidden browser pane runs no `requestAnimationFrame`, so the lines never drew there. Show the pane
  to test anything drawn that way.
