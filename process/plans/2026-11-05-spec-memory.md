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

1. **Plan.** A strong model writes the main path and the things this app has to decide. The rows
   here are from a real plan in the planner test, shortened:
   ```
   product.core-flow   @home → @recording → @morning-report → @remedy-compare
   ui.nav              ?  how recording, history and remedy log share navigation
   ui.back             ?  where Back appears and how it behaves during a recording
   ui.lists            ?  how nights and remedy entries share row layout
   ui.colors           ?  which colors mean recording, paused and complete
   data.score          ?  what the snore score measures and whether higher means worse
   ```
2. **Pick.** Both Home designs get the plan, and each shows under its idea the lines it would add.
   The user picks A, so A's lines go in. The flow steps and the tabs are planned screens from now on.
   ```
   ui.nav              Tabs: Tonight @home, History @night-history, Remedies @remedy-log, Settings @settings
   data.score          Snore score 0-100, higher is better; last night 72
   ```
3. **A later pick.** Night details is the first screen with a Back, so its pick fills
   `ui.back  "‹ Back", top left`.
4. **Edit.** On Settings the user types *"use switches, not checkboxes"*. The plan has no row for
   that, so the Edit adds `ui.toggles  Switches`, and the drawer shows the line with a ✕ to take
   it back.

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
- **Facts** (`data.`): at most 8, for what two screens could get wrong. The plan opens them as
  questions (what a score means, which units). A design answers an open one and adds none: when
  designs could add facts, 7 screens filled the spec with one screen's content.
- **A line** is plain text of at most 120 characters; a longer one is refused. The whole spec is at
  most 24 lines, about 1 KB.
- **`@names`** in `ui.nav` and `product.core-flow` are planned screens. The flow is a chain from
  `@home`, each step under the one before. The names in `ui.nav` are tabs only when the line
  starts with `Tabs:`; any other navigation gets no tab markup and no tab check.
- **Undo** of an Edit removes the values it added, so the value before counts again. Deleting a
  screen leaves the spec alone. Start over and Delete clear it.

## Who writes what

A model proposes; a line counts only after the user saw it. No model changes a filled row.

| Who | When | May |
|---|---|---|
| The plan (strong model, Sol) | once, before Home | write the core flow and up to 8 open rows, facts among them |
| A picked design | each new screen | fill open rows that this screen decides; most screens fill none |
| An Edit | the user types a change | set any key, new ones included |
| The review pass (strong model) | every 5 picked screens, in the background | add open rows; suggest merges and rewording |
| The user | any time, in the spec panel | add, change or delete anything; accept a suggestion |

- **Reply.** A design writes its lines after its name and idea, one per line:
  `<meta name="spec" content="ui.nav = Tabs: ...">`. Code reads each tag up to its closing `">`, so a
  quote inside the text is safe, and takes the tag out of the stored screen. It refuses a value
  with `<` in it. (Reading to the end of the line swallowed whatever followed on that line.)
- **Request.** The spec goes in the user message after the tree, open rows with their questions.
- **Shown.** A design's lines sit under its idea before the pick. An Edit's lines sit in the
  drawer, old value beside new, with a ✕. The panel lists open rows (*Map zoom: not decided yet*).
- **Dropped.** Lines for a key with no open row, lines of the design not picked, lines of a
  Regenerate.
- **A OR B.** Two designs may differ on an open row, and the pick decides it. After that both
  follow it, so the request for a different design asks for another layout of this screen's content
  (today it asks to change "the structure, grouping or navigation").
- **Old screens.** A changed line applies to screens made after it. Older ones keep their design
  until the user regenerates them, except tabs and Back, which code redraws everywhere.
- **The plan's input and limits.** The planner gets the app prompt and the kind of device, never
  its width: size is code's, and a width in the request ends up in the rows. Code keeps the first
  8 rows, drops a line over 120 characters, and cuts the flow at the first repeated name.
- **Wait.** The plan takes about 2 seconds before Home (4.6 at worst) and costs about 2 cents. If
  the wait hurts, the plan runs after the Home pick, from the picked Home. A plan that fails or
  takes over 6 seconds does not hold Home up: the spec starts with `ui.nav` and `ui.back` open.

## What code does instead

Anything code can guarantee stays out of the spec.

- **Size.** Every screen of a device gets the same width (phone 390 px) and at least one device
  screen of height. This reverses the earlier "only as wide as its content".
- **Markup.** With `ui.nav`, `ui.back` or `ui.toggles` in the spec, the request names one markup
  for each and the theme styles it. The spec says which tabs; the theme says how tabs look.
- **Code draws tabs and Back.** Each time a screen shows, the frame redraws its tab bar from
  `ui.nav` and its Back label from `ui.back`, and hides Back on a tab screen. Every screen then
  has the same tabs and Back, and an old screen follows a changed line at once. Asking the models
  was not enough: Luna dropped a tab on 2 of 6 screens and Haiku wrote Back two ways.
- **Shapes.** `ui.nav` starts with `Tabs:` when the app has tabs, `ui.back` starts with its label
  in quotes (`"‹ Back", top left`), and the core flow is a chain of `@names`. Code refuses a line
  of another shape, so it can always read the tabs and the label.
- **A check, no retry.** A finished flow screen must link to its next step, and no screen opens
  more than 2 new kinds of screen. Misses show in
  Info. When a reply holds the screen twice, as Luna's sometimes do, code keeps the first copy.
- **Colors.** A line can say what a color means (*red: over budget*). The palette is the theme's.
- **The flow.** The request for a screen on the core flow names the next step and asks that the
  control that finishes this screen's task opens it, by its own link and not by script. A general rule did not get Stop recording to the morning report.
- **The current tab.** Code marks it; the model's own mark is removed.
- **Prompt rules.** Besides tabs, Back and the main path, a screen that lists or shows items
  opens 1 or 2 new kinds of screen (an item's details, a form to add or edit); the details of a
  list's items are one kind. A form or a screen that ends a task opens none. With a cap and no floor, mockups ended at 6 to 9
  screens. Show the phone's own screens (mail, share targets) as plain buttons. A control that finishes a task goes
  to the next step of the core flow, else to a real screen or back. Tabs and Back count toward "at
  least 3 controls with data-action".

## Build order

Models following the spec is the risky half and the cheap one to test, so it goes first.

1. **Reading test: done, passed.** Haiku and Luna got NiceSnore's five example lines, written by
   hand, in two runs of 45 and 92 screens ([report](../journal/2026-11-05-spec-reading-test.md)).
   - Lines that name a label, a screen or a number hold on nearly every screen.
   - A fixed markup for switches took Luna from 8 screens with wrong checkboxes to none.
   - Asking for no Back on tab screens failed (Back on 20 of 30), so code hides it.
   - With the rule for finishing controls, Stop recording reaches the morning report 5 times in 5
     for Haiku and 3 in 5 for Luna. Still to try: name the control in the flow,
     `@recording (Stop) → @morning-report`.
2. **Planner test: done, passed.** Sol and Haiku each planned six apps three times (phone app,
   dashboard, map, game, desktop tool, kiosk; [report](../journal/2026-11-05-planner-test.md)).
   - Every app got rows for its own conventions: what colors mean, map zoom and pins, game chrome.
   - The plan stays on Sol. Haiku is no faster, fills the menu of known names, and never asked
     whether a higher snore score is worse; Sol asked it 3 times in 3.
   - A few rows ask about one screen or about the back end. The user sees them and can delete them.
3. **In the app: built** ([report](../journal/2026-11-05-spec-build.md)). The plan, the spec in
   every request, lines shown at the pick, Edits with their ✕ and Undo all work. Two critics
   found 24 faults, all fixed. Three remakes of NiceSnore changed the design above: designs only
   fill open rows (the spec stays at 9 rows), Stop recording opens the morning report, and code
   draws tabs and Back. Still short: clicking reaches 12 screens with Haiku and 6 with Luna.
4. The review pass, the spec panel and Export.

It works when a remade NiceSnore, clicked through 15 screens, has a miss on at most 1 screen in 10
(the second run had about 1 in 7 for Haiku and 1 in 14 for Luna, Back on tab screens left out),
has a morning report, and has a spec a person reads in two minutes; when a dashboard and a map app get rows for their
own conventions; and when the first screen comes at most two seconds later than today.

## Weak spots, accepted

- The plan can be wrong, and it steers every screen. It is short, the user sees it, and the review
  pass fills gaps.
- A made-up row gets no help from code: screens can follow it and still differ in looks.
- Code cannot check that a line matches the design it came with. The user seeing it is the guard.
- One pick takes a design's layout and its facts together. The panel fixes it after.
