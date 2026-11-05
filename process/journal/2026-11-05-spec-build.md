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
