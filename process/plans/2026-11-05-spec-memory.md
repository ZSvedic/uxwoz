# Design note: a spec that grows one decision at a time

This note proposes the shared state every new screen is made from: a short spec per mockup that
records what the user decided. It owns what the spec holds, who may write to it and what code
checks. It does not plan the code step by step, and the reasons behind each choice are in
[the review record](../journal/2026-11-05-spec-review.md).

## Why

Today the only shared state is the screen tree, and each screen is made alone. NiceSnore (22
screens) shows the cost:

- Navigation differs per screen: no tabs, 4 tabs, 3 tabs; one tab is History, Nights or Past nights.
- Back is written four ways and sits in different places.
- Facts disagree: Home treats a high snore score as good, Profile's goal is "under 20".
- Side branches sprawl (7 export screens) while Stop recording leads nowhere, so the morning
  report, the reason for the app, does not exist.
- Screens differ in width, and some do not fill a phone.

## Example

The user types *NiceSnore: a snore app with recording, score, remedy log*.

1. **Plan.** A strong model writes the main path and the things this app has to decide:
   ```
   product.core-flow   @home → @recording → @morning-report → @remedy-compare
   ui.nav              ?  main navigation
   ui.back             ?  how Back looks and where it sits
   ui.charts           ?  how a night of snoring is drawn
   ui.toggles          ?  switches or checkboxes
   ```
2. **Pick.** Both Home designs get the plan, and each shows under its idea the lines it would add.
   The user picks A, so A's lines go in. The flow steps and the tabs are planned screens from now on.
   ```
   ui.nav              Tabs: Tonight @home, History @night-history, Remedies @remedy-log, Settings @settings
   data.score          Snore score 0-100, higher is better; last night 72
   ```
3. **A later pick.** Night details is the first screen with a Back, so its pick fills
   `ui.back  ‹ Back, first in the header`.
4. **Edit.** On Settings the user types *"use switches, not checkboxes"*. The Edit sets
   `ui.toggles  Switches`, and the drawer shows that line with a ✕ to take it back.

Every screen made after a line follows it. A dashboard's plan has other rows (`ui.colors`,
`ui.filters`), a map app's has `ui.map`, a game's `ui.hud`.

## Shape

The spec is a list of rows per mockup, saved in the screen cache file. A row is a key, the
question it settles and its values, newest last. A row with no value is open.

```
"ui.nav": { ask: "main navigation", values: [ { text, from: plan | pick | edit | user, version } ] }
```

- **Rows** (`product.`, `ui.`): at most 12, each a rule other screens must match.
- **Known names**: the planner uses `ui.nav`, `ui.back`, `ui.forms`, `ui.lists`, `ui.toggles`,
  `ui.colors`, `ui.charts`, `ui.map`, `ui.hud` when they fit, and makes up a name when none does.
- **Facts** (`data.`): free keys, at most 8, for what two screens could get wrong.
- **A line** is plain text of at most 120 characters; a longer one is refused. The whole spec is at
  most 24 lines, about 1 KB.
- **`@names`** in `ui.nav` and `product.core-flow` are planned screens. The flow is a chain from
  `@home`, each step under the one before.
- **Undo** of an Edit removes the values it added, so the value before counts again. Deleting a
  screen leaves the spec alone. Start over and Delete clear it.

## Who writes what

A model proposes; a line counts only after the user saw it. No model changes a filled row.

| Who | When | May |
|---|---|---|
| The plan (strong model, Sol) | once, before Home | write the core flow and up to 8 open rows |
| A picked design | each new screen | fill up to 3 open rows or new facts, for what that screen shows |
| An Edit | the user types a change | set any key, new ones included |
| The review pass (strong model) | every 5 picked screens, in the background | add open rows; suggest merges and rewording |
| The user | any time, in the spec panel | add, change or delete anything; accept a suggestion |

- **Reply.** A design writes its lines after its name and idea, one per line:
  `<meta name="spec" content="ui.nav = Tabs: ...">`. Code reads each to the end of the line and
  takes them out of the stored screen.
- **Request.** The spec goes in the user message after the tree, open rows with their questions.
- **Shown.** A design's lines sit under its idea before the pick. An Edit's lines sit in the
  drawer, old value beside new, with a ✕. The panel lists open rows (*Map zoom: not decided yet*).
- **Dropped.** Lines for rows already filled, lines of the design not picked, lines of a Regenerate.
- **A OR B.** Two designs may differ on an open row, and the pick decides it. After that both
  follow it, so the request for a different design asks for another layout of this screen's content
  (today it asks to change "the structure, grouping or navigation").
- **Old screens.** A changed line applies to screens made after it. Older ones keep their design
  until the user regenerates them.
- **Wait.** The plan should cost a cent or two and a second or two before Home. If the wait hurts,
  the plan runs after the Home pick, from the picked Home.

## What code does instead

Anything code can guarantee stays out of the spec.

- **Size.** Every screen of a device gets the same width (phone 390 px) and at least one device
  screen of height. This reverses the earlier "only as wide as its content".
- **Markup.** With `ui.nav` or `ui.back` in the spec, the prompt names one markup for each and the
  theme styles it. The spec says which tabs; the theme says how tabs look.
- **A check, no retry.** A finished screen must link to every name in `ui.nav` and carry the Back
  label of `ui.back`. Misses show in Info.
- **Colors.** A line can say what a color means (*red: over budget*). The palette is the theme's.
- **Prompt rules.** Link only what serves the core flow or what the user asked for. Show the
  phone's own screens (mail, share targets) as plain buttons. A control that finishes a task goes
  to a real screen or back. Tabs and Back count toward "at least 3 controls with data-action".

## Build order

Models following the spec is the risky half and the cheap one to test, so it goes first.

1. **Reading test.** Write NiceSnore's spec by hand: the five filled lines of the example. Send it
   with every request and add the size and markup rules. Make 15 screens each with Haiku and Luna,
   and count per model the screens that miss a tab, write Back another way, use checkboxes or read
   the score the wrong way. Report the counts in a journal entry. If a model does not follow five
   hand-written lines, stop and rethink.
2. **Planner test.** Run the planner on six app prompts (phone app, dashboard, map, game, desktop
   tool, kiosk) and read the checklists. This needs no screens.
3. Lines from designs, shown at the pick; Edits with their ✕; Undo.
4. The review pass, the spec panel and Export.

It works when a remade NiceSnore, clicked through 15 screens, has no misses, has a morning report,
and has a spec a person reads in two minutes; when a dashboard and a map app get rows for their
own conventions; and when the first screen comes at most two seconds later than today.

## Weak spots, accepted

- The plan can be wrong, and it steers every screen. It is short, the user sees it, and the review
  pass fills gaps.
- A made-up row gets no help from code: screens can follow it and still differ in looks.
- Code cannot check that a line matches the design it came with. The user seeing it is the guard.
- One pick takes a design's layout and its facts together. The panel fixes it after.
