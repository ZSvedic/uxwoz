# Design note: a spec that grows one decision at a time

This note proposes the shared state every new screen is made from: a small spec per mockup that
records the user's decisions. It covers what the spec holds, how lines get in, how it stays small,
and what changes in the prompt and the frame. It does not plan the code step by step; a build
session does that after review.

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

The user types *NiceSnore: a snore app with recording (phone + watch), score, remedy log*. Both
Home designs propose spec lines; the user picks A, so A's lines go in:

```
product.purpose     Track snoring and find which remedy helps
product.core-flow   Record tonight → @morning-report → @remedy-compare
ui.nav              Bottom tabs: Tonight, History, Remedies, Settings
ui.back             "‹ Back" at top left; Cancel only inside forms
data.user           Alex Morgan
data.score          Snore score 0-100, higher is better; last night 72
```

Later the user edits Night details: *"use switches, not checkboxes"*. That Edit adds
`ui.toggles  Switches, not checkboxes`, and every screen made after it follows.

## Shape

The spec is a key/value store: one JSON object per mockup, saved in the screen cache file.

```
spec: { "ui.nav": { text: "Bottom tabs: ...", from: "pick" | "edit" | "user", screen: key } }
```

- Keys have a section prefix: `product.`, `ui.`, `data.`. The screen tree stays a fourth part,
  worked out from links as today, not stored.
- Seed keys give the model names to reuse: `ui.nav`, `ui.back`, `ui.home`, `ui.toggles`,
  `ui.forms`, `ui.lists`, `data.user`. Reusing a key is the same rule that stopped duplicate
  screens: the model sees every key and is told to reuse one before inventing one.
- Markdown is only the view: what the model reads, what the spec panel shows, what Export writes.
- `product.core-flow` may name screens by `@name`. Those count as planned screens, so the core
  screens show up on the canvas and in Nav before anyone clicks toward them.

## How lines get in

Each design proposes lines in the same reply, next to its name and idea; there is no extra call:

```
<meta name="spec" content="ui.nav = Bottom tabs: Tonight, History, Remedies, Settings">
<meta name="spec" content="ui.toggles =">      (empty value: remove the key)
```

1. A new screen's two designs each carry up to 3 lines. Nothing enters the spec yet.
2. The pick accepts the winner's lines and drops the other's. A pick may only add keys that do not
   exist; lines for existing keys are dropped. So an L4 design cannot switch the app to a drawer.
3. An Edit (a typed change) may set or remove any key. Only the user's own words change a rule.
4. The user can edit or delete any line in a spec panel, and delete planned screens they do not
   want (new: planned screens cannot be deleted today).

The A OR B also tests conventions: if A has tabs and B a drawer, the pick decides the rule.

## How it stays small

- Lines come only from a pick or an Edit, so every line traces back to a decision.
- A line says what other screens must match. What one screen shows stays in that screen.
- One fixed budget for the whole spec, about 4 KB (roughly 1,000 words), set in one constant. It
  does not grow per screen: that would reward making more screens. When full, picks add nothing
  and the panel says so; Edits can still replace lines. No compacting pass, since compacting is
  where meaning gets lost quietly.
- The prompt gains three rules: link only what serves a core flow or what the user asked for; never
  link to the phone's own screens (mail, drive, share targets), show them as plain buttons; a
  control that finishes a task (Save, Stop, Send) goes to a real screen or back.

## What code enforces instead of the spec

Anything code can guarantee stays out of the spec. Every screen of a device gets the same width
(phone 390 px) and at least one device screen of height, so screens line up on the canvas. Today
the frame makes a screen only as wide as its content, by an earlier decision this reverses.

## Open questions for review

- Is 4 KB right, and is one budget better than one per section?
- Should picks really never change existing keys, or should a pick change a key the screen's own
  topic owns (the Settings design deciding `ui.toggles`)?
- Old mockups like NiceSnore: one call that writes a spec from the existing screens, or start over?
- The watch: the app prompt says phone + watch, but a mockup has one device. Per-screen device now,
  or later?

## How we will know it works

Remake NiceSnore from the same prompt and click through about 15 screens. One navigation style,
one Back style, the morning report exists, the score means one thing everywhere, the spec stays
under budget, and a person reads it in two minutes. Generation time stays about where it is now.
