# 2026-11-26: fixes from the phone test round

Zel tried the app on an iPhone 15 Plus, a Pixel 2, a 10-year-old iPad and desktop Chrome, and
listed 13 points (a to o, no m or n). Three builders fixed them in parallel. Two critics followed:
one checked each point, one played a Hacker News reader seeing the app for the first time. A fix
builder then took the critics' clear findings. 419 tests green.

## Your checklist (on the phones; the browser pane cannot touch or pinch)

1. **Two fingers on the iPhone**: the canvas pans smoothly and zooms only once the fingers spread
   or pinch clearly (h).
2. **One finger at a mock's end** moves the canvas on, so the buttons show (g). If it stutters or
   moves at half speed, the finger is measured with `screenX`; the fix is to measure as the pinch
   does.
3. **Hold 🎙️ in Edit on the iPhone**: no text selection, and it records (e).
4. **100% on both phones** shows the buttons under the mock (a).
5. **The old iPad** shows the "too old" notice (j).

## What changed for a person

- **Phones**: the page is as tall as what the browser shows (`100dvh`), so 100% fits above the
  browser's bars. A swipe at a mock's end moves the canvas. Two fingers pan before they zoom, and
  iOS no longer zooms twice.
- **The bar**: the right-hand ⛶ (Fit all) is now ⌖ 100%, drawn as an SVG. Fit all stays in the zoom
  menu and on ⇧1.
- **Navigation** (the dropdown, ← →, a box in the bar) ends no further out than 75%.
- **Cards and boxes** that scroll get the mocks' flat corners and fade. ✕ is a 40 px disc. In Edit,
  the main button comes first and never wraps; the mic shortens from *Hold to talk* to *Hold* to
  🎙️ alone.
- **Boxes** are in the bar's order with Fixer last, and are called Fixer everywhere.
- **The tour** has bold numbers, italic punchlines, and its button at the foot of each mock.
- **Mocks** use Comic Neue, embedded (26 KB for two weights), so Android no longer falls back to a
  script font.
- **Too old a browser** gets a one-line notice instead of a broken page.
- **Words**: the meter and its emails say *mocks*, not *screens*. A free design's Info says *free*;
  the Fixer counts *1 visit*.

## Open, from the Hacker News critic (not changed, Zel to decide)

1. A rule added by hand ("every mock has a bottom tab bar") did not show in the next Another.
2. Jargon reaches the visitor: *filed*, *Link ID @home*, *Filing takes them from your mocks*.
3. → in the tour looks like "next page"; only the button inside the mock moves on.
4. Share and Feedback need an account, and nothing says so before the click; the code card keeps
   coming back once open.
