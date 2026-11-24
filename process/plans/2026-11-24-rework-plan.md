# Rework plan: tests, deletions, steps

This plan says how the rework in [2026-11-24-rework-gaps.md](2026-11-24-rework-gaps.md) gets built:
what is still open, which tests go, change and come, and the steps by part with rough line counts.
The spec on this branch (`rework-spec`) already describes the new app; no code and no prompt byte
has changed.

Status: Zel approved the spec and this plan on 2026-11-24, with the open points as written. The build
is under way on `rework-spec`. `onboarding.test.ts` is red until wave 1 lands, which deletes it with the
hints it checks.

## In one picture

```
today      10,700 lines of code    6,000 lines of tests    2 designs a mock, a drawer, a bottom bar
after       9,600 lines of code    5,300 lines of tests    1 design a mock, cards that flip, a top bar
```

About 1,900 lines go and 800 come. Most of what goes is voice's wake phrase, the hint chain, A OR B
on the canvas and the bar's fitting rules.

## Open points: answer by number

The gap list and the mocks left these open. Each has the answer I wrote into the spec. Anything you
skip, I build as written. The numbers carry on from the gap list.

32. **100% in a roomy window.** A phone-size mock on a laptop would sit small in the middle. In the
    spec 100% scales a mock up to fit, at most 1.5 times its real size.
33. **⛶ on a wide bar** is Fit all. *Fit screen* and *Fit screen width* go: 100% is that view now.
34. **Undo and Redo walk History by time.** Undo shows the version before the one showing, Redo the
    one after. A new version always goes to the end of the list. So after you tap an old version and
    Edit it, Undo shows the newest older one, which may not be the one you edited from.
35. **A box's History has Undo and the list, no Redo**, and no tap on an old state. Redo for boxes
    is about 60 lines more; the tour only promises *edit and undo*. Components are mocks inside, so
    they get Redo for free.
36. **Home's Edit card has no Delete.** Deleting Home deletes the project, and that is in the menu.
37. **A design that fails** shows the red pill and the canvas glides back; the mock stays planned
    and the same link draws it again. The **Try again** button goes with the A OR B sides.
38. **The tour is one set of four small-phone mocks** on every device, shown larger in a larger
    window (point 32). Four sizes of the tour would be 16 files to keep in step by hand.
39. **The tour's fixer's note** is `tour/notes.md`, one change a line.
40. **The owner's Model picker** moves to the menu, in the private app only.
41. **Addresses.** A box gets one, so ← → and the browser's Back agree: `/m/<project>/box-rules`.
    The tour's is `/tour/<mock>`.
42. **A new step on the admin's page**: *finished the tour* (the last tour mock came into view).
43. **A sentence change on Home** (the third 🎲) renames the project. It is refused when you already
    have a project with that sentence.
44. **Delete of the open project** opens the newest other project, or the tour when there is none.
45. **Sounds**: one whoosh is left, for a mock drawn and a card flipped. The chime (pick) and the
    tinkle (hover on a side) go with what they belonged to.
46. **Info loses** time to first text, finish reason, size, the count and cost of all versions, and
    the lines filing refused (they stay in the server's log). It keeps what picture 6 shows.
47. **A mock you rolled again after clicking on from it** is filed again at the next click on. One
    more filing, about $0.002, and the boxes follow the design you kept.
48. **Routes and files keep their old names** (`/api/screen`, `app`, `screens.ts`). Only what a
    person reads says *mock* and *project*. A rename is a day of churn and buys nothing.

## The prompt changes, all in one go

The build changes the prompt once, then records everything once.

- **The Device line** names the frame: *a phone screen, 360 × 500 px; the screen scrolls inside it,
  and a bar pinned to its bottom stays in view* (four such lines).
- **File** is sent one design, not the chosen one and the other.
- **Another** uses the sentence one A OR B side gets today (*Design this as a clearly different
  alternative…*), unchanged.
- `spec/prompt-screen.md` and `prompt.ts` change together; the test that keeps them equal stays.

Recording after it: the two cassettes (a few cents), 28 example recordings (about $5), the tour's
four mocks through Haiku (under a cent, by a throwaway script that is not kept).

## Tests

No test code is written yet. 34 files today, 33 after.

**Go**

| File | Tests | Why |
|---|---:|---|
| `onboarding.test.ts` | 17 | the chain of five hints is gone; the one hint left gets two cases in `account-ui.test.ts` |
| `voice.test.ts`, most of it | 27 → 6 | wake phrase, countdown, stop and cancel phrases, *Heard* label |
| `races.test.ts`, two of three | 3 → 1 | a side finishing after a pick; the case *finished after its mock was deleted* stays |

**Change**

| File | What changes |
|---|---|
| `server.test.ts` | one design a stream; `/api/settle` in place of `/api/pick`; Another, Draw again, Undo and Redo by `at`; cassette recorded again |
| `cache.test.ts` | `proposals` and pick go; `redo`, `draws`, `settled`, the 10 kept, a project renamed, a version 5 file's open A OR B loading as two versions |
| `boxes.test.ts`, `fixer.test.ts` | filing starts at a settle; a visit every 5 settled mocks; *being drawn* in place of *open A OR B* |
| `recordings.test.ts`, `replay.test.ts` | a file per example and size, two designs a mock, Another replayed once |
| `journey.test.ts`, `public.test.ts`, `bursts.test.ts`, `desks.test.ts`, `cut-off.test.ts` | one design a request, so the sums change; settle is never refused; the step `toured` |
| `share.test.ts`, `export.test.ts` | the budget counts settle; the player and the zip read the version showing; size names |
| `address.test.ts` | a box's address, the tour's; the A OR B rule goes |
| `ropes.test.ts` | rows of equal height; the 100% scale for a window and a size; where a glide ends |
| `frame.test.ts` | four sizes, `scroll` and `open` messages; no `size`, no vh fix, no one-finger pan |
| `pins.test.ts`, `comments.test.ts` | a pin hides when its part is outside the frame; comments as a part of Info |
| `account-ui.test.ts` | the account as a line of the menu; no refused side; the *drawn fresh* hint |
| `fx.test.ts`, `design.test.ts` | no pick effect; the new brand files; the same size caps |
| `demo-cache.test.ts`, `generate-screen.test.ts`, `tree.test.ts` | the demo's open A OR B becomes a mock with two versions; device names |

Unchanged: `account`, `admin` (one label), `mail`, `people` (one step name), `signin`.

**New**

| File | Checks |
|---|---|
| `tour.test.ts` | `tour/` reads as a project of four mocks in a chain, with its boxes; every button leads to a file that exists; every route that changes something refuses it |
| `cards.test.ts` | with no DOM: what History lists and marks, when Undo and Redo are live, when 🎲 opens *Describe it differently*, what Info shows, each box's buttons |
| `bar.test.ts` | with no DOM: the dropdown's rows (indent, planned), the size a window is offered, when the boxes fit the bar |

New cases in files that stay: settle and `/api/tour` in `server.test.ts`, hold-to-talk in `voice.test.ts`.

## What goes, what changes, what is new

**Deleted outright** (about 1,150 lines of code)

- Voice's wake machine, countdown and *Heard* label: `voice.ts` 288 → 70, `voice-ui.ts` (97) gone,
  `scripts/voice-check.ts` (147) gone.
- `onboarding.ts` (157): the hint chain.
- The *How UX Woz works* starter and its recording; the seven old recordings.
- `design/fx.ts` 137 → 60: sparks, the chime, the tinkle, the pick effect.
- On the canvas: A OR B sides and their fit, the rail, ideas with *more*, the narrow-window
  special cases, *Fit screen* and *Fit screen width*, frames that grow with their content.
- In the frame script: the size report, the vh fix, the one-finger pan.
- The bar's fitting rules (about 100 lines of `toolbar.ts` and `bar.css`).

**Refactored**

| File | Today | After | What |
|---|---:|---:|---|
| `canvas.ts` | 832 | 600 | fixed frames, equal rows, the glide, 100%, buttons under the current card, scroll corners |
| `screens.ts` | 386 | 260 | one design a stream; Another, Draw again, show a version |
| `toolbar.ts` → `bar.ts` + `menu.ts` | 273 | 270 | the top bar and its dropdown; the left panel, New project, Theme, Sound, Export |
| `drawer.ts` → `cards.ts` | 206 | 200 | the flip; Edit, History, Info, Describe it differently, for a mock, a box, a component |
| `drawing.ts` | 354 | 300 | one design; settle starts filing; replay by size |
| `cache.ts` | 398 | 390 | `proposals` out; `redo`, `draws`, `settled`, rename, the version 6 load |
| `frame.ts` | 320 | 280 | four sizes, `scroll` and `open` |
| `account-ui.ts` | 371 | 320 | a line in the menu; no refused side |
| `nav.ts`, `address.ts`, `boxes.ts`, `comments.ts`, `sharing.ts` | 725 | 700 | boxes as steps and addresses; buttons for rails; comments in Info; Share and Feedback as pages of the panel |
| `server.ts`, `public.ts`, `share.ts`, `people.ts`, `export.ts` | 1,536 | 1,530 | `/api/settle`, `/api/tour`, `/tour`, Undo by `at`, the step |
| design CSS | 700 cap | 700 cap | `drawer.css` → `cards.css`; `bar.css` shrinks, pays for the flip, the panel and the corners |

**New**

- `web/src/tour.ts` (70): reads `tour/` into a project.
- `tour/`: four mocks, `rules.md`, `data.md`, one component, `notes.md`. Content, not code.
- The C2 logo: `logo.svg`, the favicons, the home-screen icon, `og.png`.
- 28 recordings in `recordings/<id>.<size>.json`.

## Steps

Each step is a builder (Opus) in its own worktree off `rework-spec`, sized as AGENTS.md says, with
`bun run check` green at its end. Steps in one wave are in different parts and run together. A
critic reads each wave's diffs against the spec while I look at the app. The app does not work
between waves 2 and 4; that is fine on a branch.

| Wave | Step | Part | Does | Lines − / + |
|---|---|---|---|---:|
| 1 | Delete | all, by me | voice's wake machine, the hint chain, the *How* starter, the pick effect, `voice-check.ts`, and their tests | −1,400 / +80 |
| 2 | Cache | Cache | one design a mock: `redo`, `draws`, `settled`, rename, version 6, the demo project | −90 / +100 |
| 2 | Engine | Engine | four sizes, the prompt changes, starters without kind, recordings by size; cassettes recorded | −60 / +60 |
| 2 | Logo | Design | the C2 mark and wordmark, favicons, `og.png`, the names *UXWoz*, *mock*, *project* in every page and email | −30 / +40 |
| 3 | Server | Server | one design a stream, settle, Another and Draw again, Undo by `at`, `tour.ts` and its routes, the step, the recording script | −180 / +200 |
| 3 | Frame | Canvas (`frame.ts` only) | the fixed frame: `scroll`, `open`, no size report | −70 / +30 |
| 4 | Canvas | Canvas | `canvas.ts`, `screens.ts`, `nav.ts`: fixed cards, the glide, 100%, the buttons, touch | −450 / +200 |
| 5 | Bar and menu | Canvas | `bar.ts`, `menu.ts`, `index.html`, the account line, the tour opening first | −300 / +270 |
| 5 | Cards and boxes | Boxes and drawer | `cards.ts`, `boxes.ts`: the flip, the four cards, box buttons, hold-to-talk in every field | −230 / +220 |
| 6 | Sharing | Sharing | Share and Feedback in the panel, comments in Info, pins that follow a scroll, the player's logo | −60 / +50 |
| 6 | Tour and recordings | by me | the tour's files through Haiku, the 28 recordings, AGENTS.md's code map, README | content |
| 7 | Critics | | four walks as in the last test round (a phone visitor, a laptop visitor, the owner, a reviewer), then the fixes | |

Then I run the local app and give you the exact steps to test. Nothing goes to `main` until you say.

## Risks

- **Scroll and touch inside a frame** is the part emulation cannot prove. A real phone has to try
  it: one finger scrolls the mock, two move the canvas.
- **Haiku and the fixed frame.** Told the frame is 360 × 500, it may still draw long pages. They
  scroll, so nothing breaks, but I look at 20 designs before recording all 28 files.
- **The flip on a laptop-size mock** turns a 1280 px card. If it looks heavy, it becomes a fade.
  That would be a design change, so I ask first.
