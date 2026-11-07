# Plan: the paper canvas

This plan replaces the spec of [the spec note](2026-11-05-spec-memory.md) with a mockup that works
like one large sheet of paper: screens plus three boxes that everyone can see. It owns what the
user sees, what each model call does and the build order. The rules a designer follows are in
[the manual](2026-11-06-canvas-manual.md), and what the build deletes is in
[the cleanup list](2026-11-06-cleanup.md).

## Example

1. The user types the NiceSnore prompt and picks one of two Home variants. No plan runs before
   them, so they come about 2 seconds sooner than today.
2. Filing runs in the background. Left of Home, Components gets `tab-bar`, Rules gets
   `score-direction: A higher snore score is worse.`, Data gets the table `nights`, five rows.
3. The user taps *Nights*. Both variants paste `tab-bar` and show the same five nights.
4. On Settings the user types *use switches*. The Edit redraws Settings, and filing adds
   `on-off-settings: On/off settings are switches.`
5. After the fifth pick the fixer visits. Its note reads *merged `score-meaning` into
   `score-direction`; redrew `history` to paste `tab-bar`; 6 s, under 1 cent*, with an Undo beside
   each change.
6. The user renames a tab in the `tab-bar` card. Every screen that pastes it shows the new name.

## Why

The spec fixed NiceSnore's drift and went wrong in two ways.

- **It sat out of sight.** Rules lived in a panel under keys like `ui.nav`, and each design
  proposed lines in a format the user had to learn.
- **It fitted one kind of app.** Code learned tabs, Back, switches, flow steps and kinds of screen.
  A dashboard, a map or a game gets nothing from that.

This version follows one principle: when a cheap model fails, make the manual simpler and the
mistake cheap to undo. Code and prompts get no special case for one kind of app or one failure.
The manual also names what models already know: a wireflow, a design system's component library,
and an architect's sheet with its legend, general notes, schedules and revision block.

## What the user sees

The canvas is the only place: the tree of screens as today, and four boxes left of the first screen.

- **Components**: small cards with Edit, versions, Undo and Delete, like screens. They also list
  with the screens, under a Components parent.
- **Rules**: one line each, an ID and a sentence. **Data**: small tables, each with an ID and
  named columns. The user edits both in place.
- **Fixer's notes**: one entry per visit with what changed, time, cost and an Undo per change.
- Toolbar buttons move the view to each box. An entry added since the user last looked is marked.

## Three jobs

| Job | When | Model | Reads | Writes |
|---|---|---|---|---|
| Draw | a click opens a new screen | Haiku 5.5 or Luna, as today | the manual, titles and lines, the boxes, the screen the click came from | two variants |
| File | after a pick or an Edit, in the background | GPT-6.1 Terra, low reasoning (the test's only pass) | the chosen variant, the other one or the typed change, the boxes | new or changed box entries |
| Fix | every 5 picks, in the background, at standard speed | GPT-6.1 Terra (10 of 10 on the held-out paper) | the boxes, the titles, the text of screens new since the last visit | tidied boxes, redrawn screens, a note |

- A click made while filing runs waits for it, at most 5 seconds.
- The boxes go whole into every Draw. The manual's limits (20 components, 20 rules, 10 tables)
  keep them small, and code refuses an entry for a full box. A hundred more screens add a hundred
  title lines.
- Filing reads the box before it adds, so most doubles never get in. The fixer merges the rest.
- A fixer's redraw is an Edit with the fixer's sentence as the change, so it gets a version and
  an Undo. A visit redraws at most 5 screens.

## What code does

Code keeps three small mechanisms. None of them knows what a tab or a Back button is.

- **Paste by ID.** A screen holds an empty element with a component's ID, and the app puts the
  component there when it shows the screen. A changed component changes every screen that pastes it.
- **Point at a part.** For filing, code numbers the parts of the chosen variant and the reply
  names a number. That part moves to Components, and the screen keeps its ID.
- **Current link.** A link to the screen it sits on is marked current.

Fixed device size, A OR B, versions, Undo and the tree stay as they are. An old mockup starts with
empty boxes, and the fixer's first visit fills them from its screens. Export writes the boxes as
markdown.

## Build order

The manual is the risky part and the cheap one to test, so it goes first. Each step's report
gives the size of the code before and after.

1. **Paper test: done** ([report](../journal/2026-11-07-paper-test.md)). Haiku and Luna draw by the
   manual; only Terra files and fixes. The whole test cost $0.67.
   - *Draw*: Haiku 5.5 and Luna draw 10 screens each on three hand-made papers (phone app,
     dashboard, game). Count components pasted, redrawn or missing, rules followed, Data rows used.
   - *File*: Haiku 5.5, Luna and GPT-6.1 Terra file 20 real picks. Count the entries a person
     would keep against junk and doubles.
   - *Fix*: GPT-6.1 Terra ($1 in, $5 out per million tokens) and Gemini 3.8 Flash ($0.75, $3.75)
     tidy a paper with 10 planted mistakes, and Haiku 5.5 does too, as the cheapest. Count mistakes
     repaired, new damage, time and cost. Sol and Sonnet 5.5 ($2, $10) cost flagship prices and
     stay out. The test confirms each price on its vendor's page.
2. **Cleanup: done** ([report](../journal/2026-11-07-cleanup.md)). The spec feature is deleted as
   [the cleanup list](2026-11-06-cleanup.md) says: app code 249 to 163 KB, tests 125 to 53 KB.
3. **Boxes in the app: done** ([report](../journal/2026-11-07-boxes.md)). Filing on Terra takes 1
   to 5 s and under half a cent a decision; app code 163 to 215 KB.
4. **The fixer: done** ([report](../journal/2026-11-07-fixer.md)). A visit takes 9 to 12 s and about a
   cent; on a real NiceSnore it repaired 2 of 5 plants, screens before boxes; app code 214.8 to 219.0 KB.
5. **Remake: done** ([report](../journal/2026-11-07-remakes.md)). Two sentences in the fixer
   section took a planted NiceSnore from 9 to 23 of 25 repairs and the held-out dashboard to 50 of
   50. Three remakes of 15 screens: boxes of 5 to 16 entries, components pasted on 54 of 79
   screens that need them (all misses the late Back), first side in 2.4 to 2.8 s, app code 218.5
   KB on `main`. The 10-plant visit did not run (no OpenAI credits); the manual's change waits on
   the branch `paper-fixer-wording` for one `bun run test:record`.

It works when a person reads each remake's boxes in two minutes, a component is pasted on 9 of 10
screens that need it, a fixer's visit repairs 8 of 10 planted mistakes and changes nothing the
user wrote, the first screen comes no later than today, and the app's code is under 220 KB (249
KB today).

## Weak spots, accepted

- A component is pasted as it is. A part whose content changes per screen stays a rule.
- Between two visits of the fixer the paper can hold a mistake.
- Nothing plans the main path ahead. A dead end waits for the fixer or the user.
- A fixer's redraw can undo something the user liked. Undo brings it back.
