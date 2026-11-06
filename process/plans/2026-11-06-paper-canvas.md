# Plan: the paper canvas

This plan replaces the spec of [the spec note](2026-11-05-spec-memory.md) with a mockup that works
like one large sheet of paper: screens plus three boxes that everyone can see. It owns what the
user sees, what each model call does, what code goes and the build order. The rules a designer
follows are in [the canvas manual](2026-11-06-canvas-manual.md).

## Example

1. The user types the NiceSnore prompt and picks one of two Home designs. No plan runs before
   them, so they come about 2 seconds sooner than today.
2. Filing runs in the background. Left of Home, Components gets `tab-bar`, Rules gets *R1 A higher
   snore score is worse*, Data gets *Nights* with five rows.
3. The user taps *Nights*. Both designs paste `tab-bar` and show the same five nights.
4. On Settings the user types *use switches*. The Edit redraws Settings, and filing adds *R2
   On/off settings are switches*.
5. After the fifth pick the fixer visits. Its note reads *merged R3 into R1; redrew `history` to
   paste `tab-bar`; 9 s, 2 cents*, with an Undo beside each change.
6. The user renames a tab in the `tab-bar` card. Every screen that pastes it shows the new name.

## Why

The spec fixed NiceSnore's drift and went wrong in two ways.

- **It sat out of sight.** Rules lived in a panel under keys like `ui.nav`, and each design
  proposed lines in a format the user had to learn.
- **It fitted one kind of app.** Code learned tabs, Back, switches, flow steps and kinds of screen.
  A dashboard, a map or a game gets nothing from that.

This version follows one principle: when a cheap model fails, make the manual simpler and the
mistake cheap to undo. Code and prompts get no special case for one kind of app or one failure.

## What the user sees

The canvas is the only place: the tree of screens as today, and four boxes left of the first screen.

- **Components**: small cards with Edit, versions, Undo and Delete, like screens. They also list
  with the screens, under a Components parent.
- **Rules**: numbered lines. **Data**: small tables. The user edits both in place.
- **Fixer's notes**: one entry per visit with what changed, time, cost and an Undo per change.
- Toolbar buttons move the view to each box. An entry added since the user last looked is marked.
- The spec panel, the lines under a design and the Accept and Dismiss suggestions go.

## Three jobs

| Job | When | Model | Reads | Writes |
|---|---|---|---|---|
| Draw | a click opens a new screen | Haiku or Luna | the manual, titles and lines, the boxes, the screen the click came from | two variants |
| File | after a pick or an Edit, in the background | the cheapest that passes the test | the chosen screen, the other variant or the typed change, the boxes | new box entries |
| Fix | every 5 picks, in the background, at standard speed | a mid-priced one, chosen by test | the boxes, the titles, the text of screens new since the last visit | tidied boxes, redrawn screens, a note |

- A click made while filing runs waits for it, at most 5 seconds.
- The boxes go whole into every Draw, so the fixer keeps each to about 20 entries. A hundred more
  screens add a hundred title lines.
- A fixer's redraw is an Edit with the fixer's sentence as the change, so it gets a version and
  an Undo. A visit redraws at most 5 screens.

## What code does

Code keeps three small mechanisms. None of them knows what a tab or a Back button is.

- **Paste by name.** A screen holds an empty element with a component's name, and the app puts the
  component there when it shows the screen. A changed component changes every screen that pastes it.
- **Point at a part.** For filing, code numbers the parts of the chosen screen and the reply names
  a number. That part moves to Components, and the screen keeps its name.
- **Current link.** A link to the screen it sits on is marked current.

Fixed device size, A OR B, versions, Undo and the tree stay as they are.

What goes: spec rows, keys, known names, shapes and open rows; spec lines in designs; the plan
call; the code that draws tabs and Back; the fixed markup for tabs, Back and switches; the flow
check and the count of new kinds of screen. The prompt's "the details of two items are two
screens" becomes "one screen". Export writes the boxes as markdown. An old mockup's spec lines
become rules, and the fixer's first visit builds the rest from its screens.

## Build order

The manual is the risky part and the cheap one to test, so it goes first, with scripts and no app
code.

1. **Paper test.** When a model fails a part, the manual gets simpler and the part runs again.
   - *Draw*: Haiku and Luna draw 10 screens each on three hand-made papers (phone app, dashboard,
     game). Count components pasted, redrawn or missing, rules followed and Data rows used.
   - *File*: the same two and one mid-priced model file 20 real picks. Count the entries a person
     would keep against junk.
   - *Fix*: Terra, Sonnet 5.5 and Sol at standard speed tidy a paper with 10 planted mistakes.
     Count mistakes repaired, new damage, time and cost.
2. **Boxes in the app**: storage, the boxes on the canvas, paste by name, filing. The spec goes.
3. **The fixer** and its notes.
4. **Remake** NiceSnore, a dashboard and a game, 15 screens each.

It works when a person reads each remake's boxes in two minutes, a component is pasted on 9 of 10
screens that need it, a fixer's visit repairs 8 of 10 planted mistakes and changes nothing the
user wrote, and the first screen comes no later than today.

## Weak spots, accepted

- A component is pasted as it is. A part whose content changes per screen stays a rule.
- Between two visits of the fixer the paper can hold a mistake.
- Nothing plans the main path ahead. A dead end waits for the fixer or the user.
- A fixer's redraw can undo something the user liked. Undo brings it back.
