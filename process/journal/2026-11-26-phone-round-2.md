# 2026-11-26, phone round 2

Zel tested the deploy of the first phone round on an iPhone 15 Plus and a Pixel 2. Two fingers now
work on both. Five points came back; all are fixed here.

## What changed for a person

- **The canvas's edges.** The sky left of and above the tree is only as wide as Home needs to come
  to the middle. A flick to the top left corner ends on Home, not in 600 px of stars. Right and
  below keep room for any mock to come to the middle (`edges` in canvas.ts).
- **Bill** in the tour's first and last mocks: his picture is cropped to the figure (its viewBox
  had a third blank on each side) and his column is 52 px, so the text wraps close to him at the
  same size.
- **A tap on a box that is not current** only makes it current. Before, the same tap also put a rule
  in edit mode. The next tap edits. From the keyboard, Tab to an entry of the current box, or
  Enter on one, edits it. The hover look shows only with a real mouse: on iOS a tap left it behind
  and it looked like edit mode.
- **A box's Edit** runs as a fixer visit in the background. Until the visit ends, the box's title
  line says *Making the change…* and Fixer's says *Visiting…*, breathing.

## Why two fingers jerked, and how it hid

Over a mock, the frame told the canvas where the fingers were in the frame's own pixels. Each step
the canvas moved and zoomed that frame, so the next step's numbers had moved too, though the fingers
had not. The canvas chased its own moves, and the zoom swung back and forth. The fix (0cbc65c)
measures the fingers on the screen, which does not move.

It shipped because nothing checked it the way a phone does:

- the unit tests fed made-up points to `touchStep`, with a frame that never moved;
- the pane cannot touch with two fingers;
- the iOS simulator was smooth on the broken build too (checked today, at 50 ms and 16 ms steps);
- headless Chrome showed it, but only over a mock and only at full speed, and the first fix was
  checked over the sky.

Now `bun run touch:check` runs pan and pinch over a mock and over the sky at full speed, and says
PASS or FAIL. It fails on 39346a1 (before the fix) and passes now. AGENTS.md makes it a step before
any commit that touches touch, pinch, the wheel or the canvas's zoom math. It found a bug of its own
on the way: in one Chrome page, a second two-finger gesture never zooms, so each gesture gets a
Chrome of its own.

## Critics

A code critic found five, all fixed:

1. A navigation that changes the zoom jumped first, because the left and top edges now follow the
   zoom. `reveal` and `setScale` now share `zoomAround`, which follows the nearest mock.
2. The box entries had lost Tab. Fields have `tabindex=0`, and keyboard focus opens them.
3. A keyboard that shrinks the page could move the canvas. The edges keep the stage's height while
   a field has the focus.
4. *Making the change…* could carry over into another project. Opening a project or the tour clears it.
5. The line's breathing restarted on every redraw. The title line is rebuilt only when its words change.

A critic in the app found two more, both fixed:

6. Bill's first fix did nothing on the tour's 360 px mock (25% was already under 90 px). Now cropped.
7. A zoom in near the top left corner could not keep the point still: the view would need to be
   left of the canvas. `zoomAround` adds that much room (`slack`), and `trimSlack` takes it back as
   the view leaves it, so a flick to the corner still ends on Home. Measured: 0.500 → 0.495 of Home's
   width over 25% → 200%, where it drifted 384 px before.

## Open

Still waiting for Zel, from the first round's Hacker News critic: rules as components, the jargon
(*filed*, *Link ID*), → in the tour, and saying that Share needs an account.
