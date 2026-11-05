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
