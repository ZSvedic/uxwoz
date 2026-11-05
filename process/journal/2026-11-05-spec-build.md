# 2026-11-05: the spec, built (step 3)

Step 3 of [the spec note](../plans/2026-11-05-spec-memory.md) is in the app, in three commits:
the reading side, lines from designs, and Edits with Undo. A remade NiceSnore keeps one tab bar
and one Back on 6 of its 7 screens, and reads the score one way everywhere. Two problems are
new: the spec fills up with one-screen facts, and following links ends after 7 screens.

## What was built

1. **Reading side** (b327cb0). Each mockup has a spec in the screen cache (file version 4; a
   version 3 file loads with empty specs). Before Home, Sol plans the core flow and up to 8 open
   rows. On the screens below that took 1.4 to 1.9 s; after 6 s or an error, Home goes on with an
   empty spec. Every request carries the spec after the tree, with one markup each for tabs, Back
   and switches. The flow and the tabs are planned screens. Every screen is its device's width and
   at least one device screen tall. Code hides Back on tab screens. Info shows the check.
2. **Lines from designs** (2afc302). Each side of an A OR B lists its lines under its idea: the
   ones its pick would add, and, struck through, the ones it would drop.
3. **Edits and Undo** (5c71156). Past changes lists each version's lines, old value beside new;
   an Edit's lines have a ✕. Undo takes an Edit's lines back.

## Where the note was silent

- **What a pick may add.** It fills open rows, adds a known `ui.` name or a new `data.` fact,
  and drops made-up rules. Known names count so that a mockup whose plan failed still gets `ui.nav`.
- **Who opened a row.** Each row records it (`from`), so Undo also removes a row an Edit added.
- **The 120-character limit** counts the value, not `key = value`. Edits get 3 lines, like picks.
- **The check is stored with each version**, against the spec it was made with. A later line does
  not flag older screens. Back's label passes when it appears in the `ui.back` line.
- **The markup text also says how to write the line**: tabs by label and `@name`, Back's label
  first. Without that, the first `ui.nav` lines named no screens, so code could not find the tabs.
- **A key one letter off a known name** is the known name: an Edit wrote `ui.toggle`.
- **Device heights** are 844 px (phone) and 768 px (desktop). The tab bar sits at the bottom of
  a phone and the top of a desktop screen.
- **The Edit request** took two rewrites. The first made Haiku read the change as the line's
  value (*"The request as given contains no change instructions"*). The second gave no line for
  *use switches*. The third names what counts as a rule and gives an example.

## The remade NiceSnore, by hand and by script

Home and Recording were clicked in the app; a script made the rest through the same HTTP calls,
picking A and B in turn. The walk ended at 7 screens: no screen linked anywhere new. Counted by
code and by reading the HTML:

| Miss | Screens |
|---|---|
| A tab missing or pointing elsewhere (check) | 1 of 7: Recording's own tab opens `@record` |
| Back missing or labelled otherwise (reading) | 1 of 7: Recording has none; `ui.back` was still open |
| Score read the other way (reading) | 0 of 7 |
| Stop recording reaches the report (reading) | no: Stop is a script button |
| Current tab marked on a non-tab screen (reading) | 1 of 7: the event detail marks Remedies |

Misses are on 2 of 7 screens, or 1 (Recording) leaving out the marked tab; the note's target is
1 in 10. The
Edit in the drawer, its ✕, and Undo bringing back `‹ Back, first in the header` all worked. A
dashboard on Desktop was also checked: tabs on top, full width, fitted after the pick.

## Still open

- **The spec fills with one-screen facts.** After 7 screens it had 12 rows: 5 facts, most of them
  one screen's content (`data.remedy-entry`, `data.history-chip`). Each design writes lines
  because it may. The limits will refuse later rows that matter. The pick needs a stricter rule,
  or the review pass of step 4 has to prune.
- **The walk ends at 7 screens.** Linking only what serves the core flow stopped the sprawl, but
  the note's goal of 15 screens cannot be reached by clicking. The user can Edit links in.
- **The example Back line is copied**: every design proposed `‹ Back, first in the header`.
- **Stop still leads nowhere**, as in the reading test. Naming the control in the flow line is
  untried, and not in this step.
- **Prose before `<title>`** goes into the stored screen; nothing strips it yet.
- The remade NiceSnore is in `temp/screen-cache-spec.json` (the second dev server, port 3001).
  `temp/screen-cache.backup-2026-11-05-before-spec.json` backs up the main cache from before.

## Fix round, after the note took the findings

The note changed in 38aa71c; commits a303940 and b90121f build it. NiceSnore was remade with
Haiku (Home and Recording clicked in the app, the rest by the script) and once with Luna.

- **Designs only fill open rows.** No key of its own, `data.` included. The prompt says a design
  answers an open row only when its screen decides it; code keeps 3 at most. A failed plan
  leaves `ui.nav` and `ui.back` open.
- **At most 2 new screens per screen**, each for this screen's task. The check counts them; the
  flow, the spec's tabs and a design's own `ui.nav` tabs are not new (b90121f: Home was flagged
  for linking its own tabs).
- **The flow step.** A screen of the core flow with a next step gets a line of its own: one
  control must open `@next`. The check flags a flow step with no link to it.
- **The current tab** is marked by code, the model's marks removed. The cause of Recording's tab
  opening `@record` was ours: the markup text asked for `aria-current` on "this screen's own tab",
  and Recording took the Record tab for its own and pointed it at itself.
- **Prose before `<title>`** is cut. **The examples** in the prompt and the Edit request are from
  a made-up app (`ui.seat-map`); the ready Back line is gone.

| | Before: Haiku, 7 screens | After: Haiku, 9 screens | After: Luna, 6 screens |
|---|---|---|---|
| A tab missing or pointing elsewhere | 1 | 0 | 0 |
| Back missing or labelled otherwise, off the tabs | 1 | 0 | 0 |
| A wrong tab marked current | 1 | 0 | 0 |
| Score read the other way | 0 | 0 | 0 |
| Stop recording opens the morning report | no | yes | no: a script button |
| A screen opening more than 2 new screens | not checked | 1 (Remedy log, 4) | 0 |
| The screen written twice | 0 | 0 | 1 (Home) |
| Screens with any miss | 2 of 7 | 1 of 9 | 2 of 6 |
| Rows in the spec at the end | 12, 3 added by picks | 9, all from the plan | 9, all from the plan |
| Rows that are one screen's content | 3 | 0 | 0 |
| Spec lines a picked screen put in | 1 to 3 on all 7 | 1 to 3 on the first 4, then none | 1 to 3 on 5 of 6 |

Tabs, Back and the score were counted by reading the HTML; the rest by code. "New screens" are
screens a screen was the first to link to: Haiku's Home 4 (its flow and tabs, not new by the
rule), Remedy log 4, the rest 0; Luna's Remedy log 1, the rest 0.

What the round leaves open:

- **The walks still end early**: 9 screens for Haiku, 6 for Luna, against the note's 15. Screens
  now link almost only to screens the mockup has; the cap of 2 does not invite new ones. Reaching
  15 by clicking needs a nudge for 1 or 2 new screens on screens that have none, or a different
  goal.
- **Luna's Stop is still a script button.** Its Recording links the summary with another control,
  so the flow check passes: code cannot tell which control is Stop. Naming the control in the
  flow line (`@recording (Stop) → …`) is still untried.
- **Luna wrote Home twice** (1 of 6, against 3 of 21 in the reading test); the check shows it, and
  nothing repairs it.
- **Lines that describe a screen**: Recording's other design proposed `ui.back = No Back on this
  tab screen`. Open rows can still be answered badly; the user sees the line before the pick.
- The Haiku mockup is in `temp/screen-cache-spec.json` (port 3001, the first remake kept as
  `screen-cache-spec.run1.json`), Luna's in `temp/screen-cache-luna.json` (port 3002).

## Review of slices 1 and 2: what was fixed

A critic read the slice commits and confirmed 13 findings, 2 more as plausible. All are fixed in
a79289c, each with a test in `src/tests/spec-review.test.ts` (numbered as in the review):

1. **The plan runs again** while a mockup has no first screen: a key that was missing no longer
   leaves a mockup unplanned for good. ✕ under the OR before either side finishes clears the
   plan. Info on Home shows the plan's rows, time and cost, or why it failed.
2. **The tab bar's place is `!important`**: one recorded Home's inline style had put it mid-screen.
3. **Spec tags are read one tag at a time**, either attribute first, the rest of the line kept;
   a value with `<` is refused. Reading to the end of the line could store a blank screen.
4. **An Edit line equal to the row's value** adds nothing.
5. **Tabs only when `ui.nav` starts with `Tabs:`**, and the request now asks for that prefix. The
   two remakes' `ui.nav` lines had none, so those mockups now count no screen as a tab and show
   Back on Recording.
6. **Back labels** decode entities and must be how `ui.back` starts; a `<button>` Back counts.
7. **One plan per new mockup**, shared by concurrent requests, never stored over a picked Home.
8. **No reload when a screen becomes a tab**: the frame gets a message instead of new CSS. A
   tab screen's first build hides Back (seen in the app); the message path was not observed there.
9. Already gone in the fix round: designs only fill open rows.
10. **Nav lists the spec's screens** only once Home is picked.
11. **Edit values are keyed by `createdAt`**, so a remade screen's Undo cannot take another's back.
12. **"Written twice"** ignores titles inside SVG; no check runs for a mockup with no spec rows.
13. **Tests** for the planner request and for a delete during the plan wait.
14. **Docs** match the code on fit sizes, card width, the delete and drop routes, and the plan in Info.
15. **A cache file from a newer app** is left alone: the app says so and saves nothing.

Nothing was left out. A second critic is reading slice 3.

## Review of slice 3, and three design changes

The second critic's nine findings on slice 3 are fixed in 8d9d342, with tests in
`src/tests/spec-review-3.test.ts`:

1. Spec values belong to a version's `createdAt`; `/api/spec/drop` takes `at`. A deleted screen's
   values stay in the spec, untied from it.
2. A core flow or a `Tabs:` line, from an Edit or a pick, needs the plan's shape or is refused.
3. The Edit request says its line may replace a row that has a value. A recorded Edit moves Back
   and Undo brings the old line back.
4. An Edit's lines that were not taken are kept on the version with why; the drawer lists them.
5. An Edit is checked against the spec with its own lines in.
6. A line a later Edit replaced says *(replaced later)* and has no ✕.
7. A ✕ whose line is gone shows the server's spec; one ✕ runs at a time.
8. The planned-screen server test asserts without an `if`.
9. ✕ and Undo are tested through the server with a fake provider.

The note's three changes (866a393):

- **A floor on new screens**: a screen that lists or shows items opens 1 or 2, a form none. The
  "at least 3 controls" rule is gone.
- **Stop**: the flow line asks that the control finishing the task opens the next step by its own
  `data-action`. Five Luna Recording screens from the same spec and tree: 4 of 5 Stops opened the
  summary themselves; the fifth had no Stop that opened anything. That met the bar of 4, so the
  flow does not name the control.
- **A doubled reply keeps its first copy.** Luna doubled all 5 of those Recording replies (screen,
  `</final>`, junk, screen again); each kept its first copy.

### NiceSnore again: Haiku to 15, Luna to 10

| | Haiku before (9) | Haiku after (12) | Luna before (6) | Luna after (6) |
|---|---|---|---|---|
| Screens before the walk ran out of links | 9 | 12 | 6 | 6 |
| A tab missing or pointing elsewhere | 0 | 1 (Home, made before `ui.nav` was set) | 0 | 2 |
| Back labelled two ways | no | yes, off the tabs: `‹ Back` on 5, `Back` on 3 | no | no |
| A wrong tab marked current | 0 | 0 | 0 | 0 |
| Score read the other way | 0 | 0 | 0 | 0 |
| Stop opens the morning report | yes | yes | no | yes |
| A screen opening more than 2 new screens | 1 | 1 (Remedies, 5) | 0 | 0 |
| The screen written twice | 0 | 0 | 1 | 1 (Home; first copy kept) |
| Screens with any miss | 1 of 9 | 6 of 12 | 2 of 6 | 3 of 6 |
| Rows at the end: filled of 9, all from the plan | 9 | 6 | 9 | 9 |
| Rows that are one screen's content | 0 | 0 | 0 | 0 |
| Picks that put in a line | 4 of 9 | 3 of 12 | 5 of 6 | 4 of 6 |

Counted by code, then read: tabs, Back labels and the score from the HTML. Four of Haiku's misses
are the check flagging `‹ Back` against a `ui.back` line with no label; the fifth `‹ Back` screen
was made before `ui.back` was set.

What this round shows:

- **The floor helped Haiku only**: 12 screens, not 15; Luna still stopped at 6. Most screens open
  nothing new; Remedies, a list of 4 remedies, opened 5 (a details screen per item plus a form),
  so "one screen per item" and the cap of 2 pull against each other.
- **`ui.back` was filled without a label** (*Back sits top-left as a text link*): the plan's
  question asks where Back sits, the pick took a line with no label, and screens then chose
  `‹ Back` or `Back`. The check, which wants the line to start with the label, flagged the `‹`
  ones. A `ui.back` line could need the same kind of shape check as `Tabs:`.
- **A fact answered in the wrong row**: Haiku's `ui.colors` line holds the score's direction
  (*higher means more snoring*), and `data.snore-score` stayed open. Screens still agreed.
- **Luna's tab bars drop a tab** on 2 of 6 screens; the check caught one, because the other
  screen linked the missing tab elsewhere.
- **Stop works for both** in these walks, and 4 of 5 in Luna's separate test.

The mockups are in `temp/screen-cache-spec.json` (port 3001) and `temp/screen-cache-luna.json`
(port 3002); the previous runs are kept as `screen-cache-spec.run2.json` and `screen-cache-luna.run1.json`.

## Round C: code draws tabs and Back

Built in 12ad028, after the note changed in a6b93f9:

- **Code draws tabs and Back.** Each time a screen shows, `drawChrome` redraws its tab bar from
  `ui.nav` (labels, names, the current tab) and Back's label from `ui.back`. A screen with no tab
  bar gets one; a screen with no Back is left alone. It works on the stored screen plus the spec
  as it is now, so nothing stored changes and an old screen follows a changed line. The tree counts
  the drawn tabs as links from every screen. The tab and Back checks are gone. One cost: a change
  to `ui.nav` or `ui.back` now reloads the frames whose drawn tabs or Back change, the Home pick
  that fills `ui.nav` included.
- **Shapes.** `ui.back` starts with its label in double quotes; a `ui.nav` that speaks of tabs
  without `Tabs:` is refused. The request and the planner ask for that shape.
- **New kinds of screen.** The check groups new names by their last word when it says what the
  screen does (details, edit, add…), else by their first word, and flags more than 2 kinds.

| | Haiku before (12) | Haiku after (9) | Luna before (6) | Luna after (6) |
|---|---|---|---|---|
| Screens before the walk ran out of links | 12 | 9 | 6 | 6 |
| A tab missing or pointing elsewhere, as drawn | 1 | 0 | 2 | 0 |
| Back labelled two ways, off the tabs | yes | yes: `Back` 2, `Settings` 1 | no | no |
| Stop opens the morning report | yes | yes | yes | yes |
| More than 2 new kinds of screen | 1 (as screens) | 0 | 0 | 0 |
| The screen written twice | 0 | 0 | 1 | 0 |
| Rows filled, of 9 | 6 | 5 | 9 | 9 |

Tab misses are zero by construction. Back is not, for Haiku: its only `ui.back` line came without
a quoted label (*Back sits top-left*), was refused, and the row stayed open; with no label to draw,
the screens chose `Back`, `Settings` or none. Luna filled `ui.back` with `"Back", top left`, and
every Back reads the same. A Back label code could draw while the row is open, or a plan question
that asks for the quoted label, would close that gap.

The walks still end early (9 and 6). Haiku's floor reached 12 last round and 9 now, so the length
moves with the screens the walk happens to open, not with the rule.
