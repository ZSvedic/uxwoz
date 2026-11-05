# Design note: a spec that grows one decision at a time

This note proposes the shared state every new screen is made from: a small spec per mockup that
records the user's decisions. It covers what the spec holds, how lines get in, how it stays small,
and what changes in the prompt and the frame. It does not plan the code step by step; a build
session does that. Two review passes changed several points: see [Review](#review).

## Why

UX Woz exists to get a person's preferences out of them fast, the lean-startup way: show a screen
in seconds, let them pick or ask for a change, and keep what they decided. Today the only shared
state is the screen tree, and each screen is made alone. The NiceSnore mockup (22 screens) shows
what that costs:

- Every screen invents its own navigation: Home has no tabs, Remedy log has 4, three others have 3
  with different items, and the history tab is History, Nights, Past nights or Night history.
- Back is written four ways and sits in different places; Home moves around too.
- Facts disagree: Home treats a high snore score as good, Profile's goal is "under 20".
- Side branches sprawl (7 export screens, 3 profile screens) while the core flow breaks: Stop
  recording leads nowhere, so the morning report, the reason for the app, does not exist.
- Screens are different widths, some scroll, some do not fill a phone.

At the end, the spec plus the screens is what the user hands to Claude Design or Claude Code.

## Example

The user types *NiceSnore: a snore app with recording (phone + watch), score, remedy log*. A strong
model first writes the plan: the main path, and a checklist of things this app has to decide.

```
product.core-flow   @home → @recording → @morning-report → @remedy-compare
ui.nav              ?  main navigation
ui.back             ?  how Back looks and where it sits
ui.forms            ?  how a form ends
ui.charts           ?  how a night of snoring is drawn
ui.toggles          ?  switches or checkboxes
```

Both Home designs get the plan. Each fills up to 3 open rows that Home shows, written under its
idea, so the user sees what a pick adds. They pick A, and A's lines go in:

```
ui.nav              Tabs: Tonight @home, History @night-history, Remedies @remedy-log, Settings @settings
data.score          Snore score 0-100, higher is better; last night 72
```

The flow steps and the tabs are planned screens from this moment. Night details is the first
screen with a Back, so its pick fills `ui.back  ‹ Back, first in the header`. Later the user edits
Settings: *"use switches, not checkboxes"*. The Edit sets `ui.toggles  Switches`, the drawer shows
that line with a ✕ to take it back, and every screen made after it follows.

A dashboard gets other rows (`ui.colors`, `ui.filters`), a map app `ui.map` for zoom and pins, a
game `ui.hud` and `data.unit-stats`.

## Shape

The spec is a key/value store per mockup, saved in the screen cache file. Each key holds the
question it settles and its history; the newest value counts, and a key with no value is open:

```
spec: { "ui.nav": { ask: "main navigation",
                    values: [ { text: "Tabs: ...", from: "plan" | "pick" | "edit" | "user", version } ] } }
```

- **The checklist is per mockup**: `product.` and `ui.` rows, at most 12. Rows come from the plan,
  the review pass and the user. A design fills an open row and cannot add one.
- **Known names.** The planner's prompt carries a menu of names to use when they fit: `ui.nav`,
  `ui.back`, `ui.forms`, `ui.lists`, `ui.toggles`, `ui.colors`, `ui.charts`, `ui.map`, `ui.hud`.
  It makes up a name only when none fits. Code helps with names it knows (see below); a made-up
  row is text only.
- **`data.` keys are free**, at most 8: facts two screens could get wrong (`data.user`,
  `data.score`, a game's `data.unit-stats`).
- **A line is plain text, at most 120 characters**, and names screens by `@name`. A longer line is
  refused, so nobody meets the limit with long lines. Names in `ui.nav` and `product.core-flow`
  count as planned screens. The flow is a chain from `@home`, each step hung under the one before,
  so the core screens are on the canvas before anyone clicks toward them.
- **Undo** of an Edit removes the values that version added, so the value before counts again.
  Deleting a screen leaves the spec alone: the decision stands. Start over and Delete clear it.
- The screen tree stays its own part, worked out from links as today. Markdown is only the view:
  what the model reads, what the spec panel shows, what Export writes.

## How lines get in

The plan comes from one small call before Home. Everything after it rides on the calls that make
screens, as lines after each design's name and idea:

```
<meta name="spec" content="ui.nav = Tabs: Tonight @home, History @night-history">
```

One line each. The parser reads to the end of the line, so a quote inside the text is safe. Code
takes these lines out of the stored screen, so an Edit does not send them back to the model. The
request carries the spec in the user message, after the tree, with the open rows and their
questions; the system prompt stays the same for every request.

1. **The plan.** The strong model (Sol) gets the app prompt and the device, and replies in plain
   lines: the core flow, then up to 8 rows. About 200 tokens, so a cent or two and, we expect, a
   second or two before Home starts; measure it. If the wait hurts, the plan moves to after the
   Home pick and is written from the picked Home.
2. A new screen's two designs each propose up to 3 lines, for open rows or new `data.` keys, and
   only for what this screen shows. The lines show under each design's idea.
3. The pick keeps the winner's lines for keys that are still empty and drops the rest. So an L4
   design cannot switch the app to a drawer. A Regenerate's lines are dropped: nobody picked them.
4. An Edit (a typed change) may set any key, new ones included. The model decides whether the
   user's words are a rule for every screen or a change to this one, and it will be wrong both
   ways. So the drawer shows every line an Edit set, old value beside new, with a ✕.
5. The user can add, edit or delete any row or line in a spec panel. Open rows show there too
   (*Map zoom: not decided yet*), so the user sees what is left to decide.
6. **The review pass.** After every 5 picked screens the strong model reads the spec and the tree,
   in the background. It may add open rows the app turned out to need. It may suggest merging or
   rewording lines; a suggestion shows in the panel and changes nothing until the user accepts it.
7. A changed line applies to screens made after it. Older screens keep their design until the user
   regenerates them; Regenerate sends the current spec.

The A OR B tests a convention while its row is open: if A has tabs and B a drawer, the pick
decides the rule, and after that both designs follow it. The request for a different design
changes with this. Today it asks one side to change "the structure, grouping or navigation", which
tells it to break `ui.nav`; it will ask for a different layout of this screen's own content.

## How it stays small

- A line comes from the plan, a pick, an Edit or the user, and each one is on screen when it goes
  in. No model changes a filled row by itself.
- A line says what other screens must match. What one screen shows stays in that screen.
- The limit counts lines: 12 rows, 8 data lines and the user's own, 24 in all. That is under 3 KB
  at most and about 1 KB in practice. When `data.` is full, picks add nothing there and the panel
  says so.
- Once the rows are filled the request lists none as open, so later designs carry no lines.
- The prompt gains three rules: link only what serves a core flow or what the user asked for; never
  link to the phone's own screens (mail, drive, share targets), show them as plain buttons; a
  control that finishes a task (Save, Stop, Send) goes to a real screen or back. The rule "at least
  3 controls with data-action" changes too: tabs and Back count toward it.

## What code enforces instead of the spec

Anything code can guarantee stays out of the spec.

- **Size.** Every screen of a device gets the same width (phone 390 px) and at least one device
  screen of height, so screens line up on the canvas. Today the frame makes a screen only as wide
  as its content, by an earlier decision this reverses.
- **Markup for tabs and Back.** When the checklist has `ui.nav` or `ui.back`, the prompt names one
  markup for each, and the theme styles it and pins tabs to the bottom. The spec says which tabs;
  the theme says how tabs look. More known names can get the same help later.
- **A check, no retry.** When a screen finishes, code checks that it links to every name in
  `ui.nav` and that its Back carries the label in `ui.back`. Misses show in Info.
- **Colors.** A line can say what a color means (*red: over budget*). The palette stays the
  theme's; models write no CSS.

If screens still drift, the frame can draw tabs and Back itself from those two lines. That waits
until the count of misses says it is needed.

## Build order

The spec has a reading side (models follow it) and a writing side (lines get in). Reading is the
risky half and the cheap one to test, so it goes first.

1. Write NiceSnore's spec by hand and send it with every request; add the markup and size rules.
   Make 15 screens each with Haiku and Luna and count the misses. If a model does not follow six
   hand-written lines, stop and rethink before building the rest.
2. Run the planner on six app prompts (phone app, dashboard, map, game, desktop tool, kiosk) and
   read the checklists. This needs no screens.
3. Lines from designs, shown at the pick; Edits with their ✕; Undo.
4. The review pass, the spec panel and Export.

## How we will know it works

Remake NiceSnore from the same prompt and click through about 15 screens. The nav and Back check
finds no misses, the morning report exists, the score means one thing everywhere, the spec stays
under 24 lines, and a person reads it in two minutes. Then a dashboard and a map app: the
checklist names their conventions (what colors mean, how zoom works) and the screens follow them.
The first screen appears at most two seconds later than today; later screens take as long as now.

## Review

Two passes on 2026-11-05. The first read the note against the prompt, the code and the NiceSnore
cache (22 screens, all Haiku, all from picks, no Edits). What it changed, and why:

- **A closed checklist replaces seed keys.** "Picks only add new keys" guards keys, and a cheap
  model gets around it with a new key: `ui.menu  Drawer` beside `ui.nav`. A model asked for "up to
  3 lines" also writes 3 on every screen, so 15 screens bring 45 lines, most of them noise.
- **A line limit replaces 4 KB.** 4 KB is 50 or more lines: more than a person reads in two
  minutes, and more rules than a model with reasoning off is likely to apply while it writes a
  screen. One byte budget is also first come, first served, so early data trivia would block later
  rules.
- **Lines show at the pick and after an Edit.** A pick chooses a picture; without the lines on
  screen, "every line traces back to a decision" is false. NiceSnore had no Edits, so picks would
  have written its whole spec unseen. The Edit rule had the same hole: the model, not the user's
  words, decides what becomes a rule.
- **Each key keeps its history.** The note did not say what Undo does. Without history, undoing an
  Edit that changed `ui.nav` leaves the new rule in force with no screen that follows it.
- **The request for a different design changes.** As written it tells one side to break `ui.nav`.
- **Markup for tabs and Back moved to code.** A text rule can be followed and still look different
  every time: NiceSnore's five tab bars use three markups and three button styles, even where the
  labels agree, because each screen makes up its own layout.
- **"At least 3 controls" changes.** It works against the new rule on side branches: NiceSnore's
  share-target screens (mail, files) link to their siblings to reach three.
- **Reading goes first in the build.** Everything rests on a cheap model following a short spec,
  and that can be measured in an hour with a hand-written one.
- **Removed:** `product.purpose` (the app prompt is in every request already); `ui.home` (Home is
  a tab in `ui.nav`); the empty value that removes a key (the ✕ and the panel do that, and an empty
  value is easy to write by accident); deleting planned screens (a planned screen exists because
  buttons link to it, so this means rewriting those screens; a note of its own).

The second pass made the checklist per app. The first pass had six fixed rows, a guess from one
phone app that fits no dashboard, map or game. Four ideas were weighed:

- **Home's call decides the rows.** Kept, in a call of its own. Two Home designs would write two
  lists, and the pick of a layout would choose between them by accident. With one plan, both
  designs also share one core flow.
- **A strong model for the first screen.** Used for the plan only. A few lines cost little time;
  two whole designs would slow the first screen most, and later screens would look weaker than it.
- **A model tidies the spec now and then.** Kept in part: the review pass adds open rows and
  suggests the rest. It covers what a plan made up front misses. Rewriting filled rows by itself
  would end "every line was a decision", and that is where meaning gets lost quietly.
- **Ready-made sets per kind of app.** Became the menu of known names. Apps mix kinds (a map app
  has lists and forms), and four sets would still miss cases.

The open questions, answered:

- **4 KB, one budget or one per section?** Neither: count lines, per section, as above.
- **Should a pick change a key its screen's topic owns?** No. Code cannot tell who owns a key, and
  every design would claim it. Settings still decides `ui.toggles`, because the row stays open
  until a screen shows toggles. To change a filled row the user says so in an Edit.
- **Old mockups?** Start over. Their screens disagree, so a spec written from them picks winners
  nobody chose, and most screens then break it. An old mockup opens with an empty spec and still
  works; the test remakes NiceSnore from its prompt anyway.
- **The watch?** Later. A watch needs its own device size and theme, and a way for a link to say
  which device its screen is for. Nothing here blocks it: each version already stores its device.

Still weak, and accepted:

- The plan can be wrong, and it steers every screen. It is short, the user sees it, and the review
  pass fills gaps.
- A made-up row gets no help from code: screens can follow it and still differ in looks.
- Code cannot check that a line matches the design it came with. The line on screen at the pick is
  the only guard.
- One pick takes a design's layout and its data facts together. The panel fixes it after.
