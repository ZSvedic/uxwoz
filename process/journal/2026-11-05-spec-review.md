# 2026-11-05: review of the spec note

Two review passes on [process/plans/2026-11-05-spec-memory.md](../plans/2026-11-05-spec-memory.md),
moved here so the note stays short. No code yet: build step 1 of the note is next.

## First pass: the note against the prompt, the code and NiceSnore

The NiceSnore cache has 22 screens, all Haiku, all from picks, no Edits. What changed, and why:

- **A closed checklist replaces seed keys.** "Picks only add new keys" guards keys, and a cheap
  model gets around it with a new key: `ui.menu  Drawer` beside `ui.nav`. A model asked for "up to
  3 lines" also writes 3 on every screen, so 15 screens bring 45 lines, most of them noise.
- **A line limit replaces 4 KB.** 4 KB is 50 or more lines: more than a person reads in two
  minutes, and more rules than a model with reasoning off is likely to apply while it writes a
  screen. One byte budget is also first come, first served, so early data trivia would block later
  rules. A line over 120 characters is refused, so long lines do not get around the count.
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

## Second pass: a checklist per app

The first pass had six fixed rows, a guess from one phone app that fits no dashboard, map or game.
Four ideas were weighed:

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

## The note's open questions, answered

- **4 KB, one budget or one per section?** Neither: count lines, per section.
- **Should a pick change a key its screen's topic owns?** No. Code cannot tell who owns a key, and
  every design would claim it. Settings still decides `ui.toggles`, because the row stays open
  until a screen shows toggles. To change a filled row the user says so in an Edit.
- **Old mockups?** Start over. Their screens disagree, so a spec written from them picks winners
  nobody chose, and most screens then break it. An old mockup opens with an empty spec and still
  works.
- **The watch?** Later. A watch needs its own device size and theme, and a way for a link to say
  which device its screen is for. Nothing here blocks it: each version already stores its device.
