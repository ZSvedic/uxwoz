# 2026-11-12: a test round as four visitors, then the fixes

Four Opus critics walked the local public app as people (the owner, a developer, a designer, a phone
visitor). The owner made a list of his own without seeing theirs. Both lists were built the same day:
37 commits on `main`, 377 tests pass, nothing pushed.

## Your checklist

1. **Choose the AI line's wording.** It is the one open decision; see *The AI line* below.
2. **Look at the toolbar at 980 px.** The boxes are back in the row, and names get short to make room.
3. **Try a real phone.** One-finger drag, pinch and the Edit field were checked in emulation only.
4. **Set the caps for launch day on `/admin`.** $3 a day is about 350 engaged visitors.
5. **Say yes to the push** when the first three look right.

## What the two lists had in common

Almost nothing. The critics walked the sign-up funnel and read every word. The owner used the canvas
on a real MacBook. Of his seven items a critic found two. Critics miss what needs real hands (a
trackpad, a resized window), what the app looked like yesterday, and whether a thing is worth making.

## What changed for a visitor

- **The first page says what this is**: *Turn one sentence into a clickable mockup*.
- **Sign-up gives its screens at once.** The 12-hour wait, the Waiting table and two kinds of email
  are gone. Guests stop at 70% of the day's cap, so a flood of guests cannot shut out accounts.
- **A free screen counts as $0.004** (25 for a guest, 37 more for an account).
- **At the limit** the refused side shows a Register button, and after the code whatever was refused
  is sent again. A side that failed shows Try again and draws alone.
- **Hints leave** when the visitor moves on. Delete my account asks in a card and says it is done.
- **Every mockup and screen has an address**, `/m/<mockup>/<screen>` with short IDs kept in the cache.
  Reload, paste, Back and Forward work.
- **The canvas** keeps the current screen in view through a zoom, refits on a real window resize,
  wraps a screen's text the same at every zoom, and lets a part inside a screen scroll first.
- **The toolbar** has New mockup right of the logo, folds the boxes only when they do not fit, and is
  two fixed rows on a phone.
- **On a phone** A sits above B, a picked screen fits the width, the rail is a row at the bottom,
  the Edit drawer fits, and one finger moves the canvas.
- **The player's** bottom bar no longer covers a card's buttons; the Share pane reads its list again.
- **The guide** has eight lessons: the sketch look has no colour, a mockup is named by its sentence,
  data can differ between screens.

## The AI line

The owner asked for designs that show AI. His sentence did nothing in the system prompt (0 of 140
designs). In each Draw message the same words work every time, and too well: six of seven starters
put AI on nearly every screen, some twice, some as a box stuck on *Loading…*. That version waits on
branch `worktree-agent-a344744bd00e531d9` (7e243f7), unmerged. `main` has the sentence in the system
prompt, where it changes nothing.

A small test (16 app designs) found a calmer wording: the owner's sentence plus *At most one AI thing
on a screen, its finished result written out, never a loading state.* It gave AI on 10 of 16 screens
and never two. Taking it means recording the cassettes and starters again, about $0.27.

## How it was built

Eight builders and four critics on their diffs (Opus), each builder in a worktree, three or four at a
time, about three hours from the go-ahead. The critics found 17 real defects in work the builders had
reported green; the worst was a click that made the canvas jump under the pointer. A second walk by
the phone visitor and the designer found about twenty more things; eleven are fixed, the rest are
below.

Model money: $0.09 for both test rounds and the lead's walks, $0.62 for recordings and wording tests.

## Not verified

- **A real touch screen**, iOS Safari, Firefox. A phone zooms the page when the 14 px Edit field
  gets focus.
- **Sign-up resending a refused click, and Try again**, with a real model reply. The server test
  covers the path.
- **A window moved to another monitor.** A resize was tried, an unplug was not.

## Left open

- A button in a drawn screen that leads nowhere gives no sign. An image with no source shows the
  browser's broken-image icon.
- Deleting an account and registering the same email again gives the allowance again, bounded by
  3 new accounts a network a day.
- Filing after a pick costs about $0.004, several times the two designs it files.
- A dead share link's page is unstyled; Copy on a share link gives no sign.
- A background tab draws white frames in a tester's screenshots. A designer reported 30 seconds of
  white; in front, a starter shows content after 1 second.
