# 2026-11-07: paper test

Build step 1 of [the paper canvas plan](../plans/2026-11-06-paper-canvas.md): can the cheap
models follow [the canvas manual](../plans/2026-11-06-canvas-manual.md), and which mid-priced
model tidies a paper? Haiku 5.5 and Luna can draw by it. Only GPT-6.1 Terra files and fixes
well enough, and Terra also repaired 10 of 10 mistakes on a paper the manual was never tuned on.

## Verdicts

| Part | Haiku 5.5 | Luna | Terra | Gemini 3.8 Flash |
|---|---|---|---|---|
| Draw | pass on components in round 3 only; leaves buttons dead | pass, before and after the rewrite | not tested | not tested |
| File | fail, with or without reasoning | fail; near pass with low reasoning | pass | not tested |
| Fix | fail | not tested | pass, also on the held-out paper | fail on the held-out paper |

What this changes in the plan:

- **Filing runs on Terra**, about 0.1 cents a filing. Luna with low reasoning kept 7 of 8 entries
  and is worth a larger test as a cheaper filer; without reasoning it keeps half.
- **The fixer runs on Terra**, under a cent a visit with the manual cached. Gemini costs the same
  today, doubles its price on 1 January 2027, and repaired 7 of 10 on the held-out paper.
- **A OR B stays two calls**, one per side, as today. Asked for both in one reply, Haiku sent one
  in 18 of 60 calls in round 3, and Luna wrote the pair twice in 7 of 60.
- **A rule with a number is weak on Haiku.** *Stock under 10 units is low and shows in red* held on
  11 of 15 Haiku screens (it misses the 9) and 16 of 16 Luna screens.
- **Drawing seldom adds screens.** Both models link to screens already on the paper, so every
  walk ran out of undrawn screens after 4 to 9 draws.

## Part 1: Draw

Three hand-made papers (NiceSnore, a sales dashboard, the space mining game), each with 2 drawn
screens, 5 titles, 2 or 3 components, 5 rules and 2 tables. A walk draws the first undrawn screen
a drawn one links to, puts the side picked in turn on the paper, and starts over from the hand-made
paper when nothing is left. 10 draws per paper and model, two variants each.

| Round | Model | Needed components pasted | Pasted where not needed | Rules held (code) | Low stock held | One variant only | Dead controls |
|---|---|---|---|---|---|---|---|
| 1 | Haiku | 80 of 96 (83%) | 6 | 102 of 109 | 2 of 8 | 1 of 30 | 37 |
| 1 | Luna | 96 of 104 (92%) | 8 | 111 of 114 | 5 of 7 | 0 of 30 | 15 |
| 2 | Haiku | 76 of 91 (84%) | 6 | 93 of 96 | 4 of 7 | 6 of 30 | 44 |
| 2 | Luna | 84 of 104 (81%) | 6 | 104 of 105 | 6 of 7 | 0 of 30 | 16 |
| 3, 2 runs | Haiku | 158 of 168 (94%) | 26 | 172 of 181 | 5 of 13 | 18 of 60 | 109 |
| 3, 2 runs | Luna | 186 of 202 (92%) | 18 | 231 of 233 | 15 of 15 | 1 of 60 | 29 |
| 4, dashboard | Haiku | 56 of 56 | 2 | 73 of 77 | 11 of 15 | 4 of 20 | 19 |
| 4, dashboard | Luna | 60 of 64 (94%) | 4 | 90 of 91 | 16 of 16 | 0 of 20 | 13 |

- **Round 4 is a fix to my paper**, not a manual round. The dashboard's hand-drawn overview said
  *Low stock 2* while its table had 3 products under 10, and Haiku followed the overview. With
  *3* and the final manual, Haiku's low-stock misses fell from 8 of 13 to 4 of 15.
- **The rewrite's effect is unclear.** Luna passed in round 1 already. Haiku's jump to 94% came
  with walks that stayed near the top of the paper, while round 2's misses were one deep chain
  (account, password) copying a hand-drawn tab bar. Round 3 also pasted more where not needed,
  mostly `back` on tab screens.
- **Code counts** pastes, hand-drawn copies, missing components, the rules code can test, table
  rows used, dead controls and lists whose rows open different screens. Reading checked the score
  direction, red and every count I doubted.
- **The score was never read the wrong way.** Rows of some table appear on 66 of 102 Haiku and 74
  of 119 Luna variants in round 3, and code found no made-up night or order.
- **Haiku leaves buttons dead**: 98 of its 109 dead controls in round 3 sit on screens with no
  script (*Sell*, *Buy*, *Save changes*, *Upgrade · 600 cr*). Luna's are all such, 29.
- **One purpose, one screen held**, except Haiku's upgrades list: in round 2, 5 variants opened
  `laser`, `cargo-hold`, `hull-plating`, `engine`, one screen each. In round 3, 4 variants linked
  `hangar-laser` and the like without `@`, so they open nothing and count as dead.

## Part 2: File

20 pairs from Draw round 1, each picked by hand with a one-word reason (*cards*, *timeline*,
*weekly*…), 5 with a typed change instead: *use switches, not checkboxes* (twice), *Back reads ‹
Back at the top left*, *show the customer's total spent next to their name everywhere*, *ore names
start with a capital letter*. Four decisions need an entry: the customers table and the last three
changes. A table and its rows count as one entry. Terra runs with low reasoning; Haiku and Luna
ran without until the last two rows.

| Round | Model | Entries | Keep | Junk | Double | Prose lines | Missed |
|---|---|---|---|---|---|---|---|
| 1 | Haiku | 25 | 5 | 16 | 4 | 15 | 0 of 4 |
| 1 | Luna | 10 | 5 | 3 | 2 | 0 | 0 of 4 |
| 1 | Terra | 6 | 5 | 1 | 0 | 0 | 0 of 4 |
| 2 | Haiku | 31 | 3 | 5 | 23 | 22 | 2 of 4 |
| 2 | Luna | 2 | 1 | 0 | 1 | 0 | 3 of 4 |
| 2 | Terra | 3 | 3 | 0 | 0 | 0 | 1 of 4 |
| 3, 2 runs | Haiku | 80 | 6 | 39 | 35 | 68 | 3 of 8 |
| 3, 2 runs | Luna | 12 | 6 | 4 | 2 | 0 | 2 of 8 |
| 3, 2 runs | Terra | 12 | 10 | 2 | 0 | 0 | 0 of 8 |
| 3, low reasoning | Haiku | 13 | 9 | 4 | 0 | 5 | 2 of 8 |
| 3, low reasoning | Luna | 8 | 7 | 0 | 1 | 6 | 1 of 8 |

- **Terra files what a person would**: `rule switches: Use switches instead of checkboxes.`, the
  customers table, and nothing for most picks. Its junk turns one screen's options into a rule.
- **Luna adds one screen's facts** (`rule report-grouping: Reports default to weekly revenue`).
  Round 1: `change component close … except home, asteroid-field and settings`, which takes Close
  off a screen nobody asked about. With reasoning it stops that and slips on the format instead.
- **Haiku cannot keep the format** without reasoning. It copies the placeholders (`component ID
  from part N: where it belongs`), writes its reasoning as lines, and re-files what the boxes hold
  (`component side-nav from part 1`, six times in round 2). With reasoning it files cleanly but
  drops *use switches* both times.
- Round 2's *when unsure, file nothing* made Luna and Terra skip typed changes; round 3 fixed it.

## Part 3: Fix

Two papers with the same ten kinds of planted mistake: a doubled rule, a rule about one screen,
a component one screen uses, a navigation drawn by hand, two screens that disagree on a fact, a
dead button, an unused table, two rules that contradict, a card drawn by hand on three screens,
and a doubled Back component. NiceSnore has 12 screens from Draw round 1, cleaned by hand. The
dashboard has 10 and is held out: no manual change was tried on it. Each visit starts afresh.

| Round | Paper | Model | Repaired, 3 visits | New damage | Time | Cost per visit |
|---|---|---|---|---|---|---|
| 1 | NiceSnore, first form | Terra | 8, 8, 8 | 0 | 5 to 6 s | $0.006 |
| 1 | NiceSnore, first form | Gemini | 8, 8, 8 | 0 | 4 to 5 s | $0.005 |
| 1 | NiceSnore, first form | Haiku | 4, 5, 6 | 1 | 4 to 8 s | $0.001 |
| 2 | NiceSnore, first form | Terra | 9, 9, 9 | 0 | 6 s | $0.002 to $0.007 |
| 2 | NiceSnore, first form | Gemini | 10, 8, 8 | 1 | 4 s | $0.005 |
| 2 | NiceSnore, first form | Haiku | 6, 4, 8 | 1 | 5 to 10 s | $0.001 |
| 3 | NiceSnore | Terra | 9, 9, 9 | 0 | 6 s | $0.003 to $0.006 |
| 3 | NiceSnore | Gemini | 8, 8, 8 | 0 | 4 s | $0.005 |
| 3 | NiceSnore | Haiku | 4, 3, 3 | 0 | 5 s | $0.001 |
| 3 | dashboard | Terra | 10, 10, 10 | 0 | 6 s | $0.002 to $0.006 |
| 3 | dashboard | Gemini | 7, 7, 7 | 1, by reading | 4 s | $0.005 |
| 3 | dashboard | Haiku | 1, 2, 6 | 1 | 4 to 5 s | $0.001 |

- **The first form of NiceSnore was planted wrong.** Its contradiction had the newer rule as the
  wrong one (*Settings use checkboxes*, while every screen has switches), but the manual says the
  later rule wins. So every model kept it, and Terra redrew Settings with checkboxes on all six
  visits. Rounds 1 and 2 count either rule's removal as the repair. Round 3 moved that rule up
  the list; Terra then removed it and left Settings alone.
- **Terra's one miss** on NiceSnore is the unused table `devices`. It also caught two mistakes
  I made by accident: two nights on `remedy-details` with no remedy in `nights`, and an order
  whose items do not add up to its total.
- **Gemini's damage**: `merge durations into time-lengths` (keeps the newer ID), and on the
  dashboard `redraw product-details: mark 6 in stock as normal rather than low`.
- **Haiku** contradicts itself inside a visit (*"Redraw of edit-name not needed"*, then `redraw
  edit-name`) and suggests deleting the recording card from two screens.

## Manual changes

1. Draw, round 2: *paste every component that belongs on this screen*, *a button that saves or
   buys leads somewhere too*, and a last step, *check both variants*. Neither model got better.
2. Draw, round 3: the check step went. One bullet says a component goes on every screen its line
   names, *even where the screen the click came from drew it by hand. Never copy its drawing.*
3. File, round 2: tests for a component (*exactly as it is, words and all*; a list or a form is
   none) and a rule (*two other screens*), and *when unsure, file nothing*, *in any words*.
4. File, round 3: *Most picks add nothing. What the user types usually adds a rule.*
5. Fix, round 2: *Of two rules that disagree, remove the older one. Remove an entry that one
   screen or no screen needs.* A dead control is a reason to redraw.

## What the critic found

A critic subagent read the scripts, the counts and the raw outputs. Fixed or now in this entry:

- The NiceSnore contradiction ran against the manual, and Terra's redraw of Settings went
  uncounted. Round 3 turned the plant and counts a redraw that makes a screen wrong as damage.
- The manual was tuned on the same Fix paper, and its example holds NiceSnore's score answer.
  The dashboard paper is the held-out answer.
- My dashboard overview contradicted its own table (*Low stock 2*). Round 4 fixed it.
- Haiku and Luna ran File with no reasoning while Terra had some. The low-reasoning rows answer it.
- The rewrite's Draw effect was overstated, and wrong pastes went up. Said above.
- Counting bugs: the cargo and hull checks hit upgrade text, a link to `#x` passed with no `x` on
  the page, and the data, dead-control and upgrade-list numbers counted the wrong unit. Fixed.
- One hand verdict: Luna's capitalised `ore-prices` under its own ID is a keep, since the format
  has no form for changing a table. The verdicts are mine and not blind.
- Still open: Draw walks redraw the same top screens, so 60 variants hold about 15 distinct
  screens per model, and my File wording leans toward the typed changes in the set.

## How it ran

Scripts `paper-draw-test.ts`, `paper-file-test.ts` and `paper-fix-test.ts` in `src/scripts/`
(`run <model>`, then `check`), with the papers in `paper-test-papers.ts` and `paper-fix-paper.ts`.
Output, my verdicts and each round's manual are in `temp/paper-test/`. The user message opens
with the reply format: two variants as HTML, `data-action` links, the paste markup
`<div data-component="ID">`, and for File and Fix the plain line forms with numbered parts.

Prices, per million tokens, standard tier, read on the vendors' pages today: Haiku 5.5 $0.10 in
and $0.50 out, Luna $0.10 and $0.50 ($0.20 and $1.00 fast, used for Draw as `models.ts` has it),
Terra $1.00 and $5.00 ($0.05 cached), Gemini 3.8 Flash $0.75 and $3.75 until 31 December. The whole
test cost $0.67. OpenAI refused two dashboard requests as a policy violation; the retry passed.
