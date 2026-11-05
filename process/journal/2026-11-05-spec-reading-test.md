# 2026-11-05: spec reading test

Build step 1 of [the spec note](../plans/2026-11-05-spec-memory.md): do Haiku and Luna follow
five hand-written spec lines? Mostly yes. Tabs, Back's label, the score and the named flow steps
held on all 45 screens; switches (Luna) and the Stop button's target did not.

## Result

45 NiceSnore screens: Haiku 24 in two walks (14 and 10 screens), Luna 21 in three walks of 7.
A walk ends when no screen links to a new one; every Luna walk ended at 7, because its screens
link only to the screens the spec names.

| Miss | Counted by | Haiku (24) | Luna (21) |
|---|---|---|---|
| A tab missing or labelled differently | code | 0 | 0 |
| Back's label other than `‹ Back` | code, then reading | 0 | 0 |
| Back first on the screen, but not in a `<header>` | code | 1 | 2 |
| Back on a tab screen (History, Remedies, Settings) | code | 6 | 9 |
| An on/off option as a checkbox | code finds, reading judges | 1 | 8 |
| The score read the wrong way | reading | 0 | 0 |
| Stop recording does not reach `@morning-report` | code 2, reading 1 | 1 of 2 | 2 of 3 |
| Home → `@recording`, report → `@remedy-compare` missing | code | 0 | 0 |

Notes on the counting:

- Code flagged 3 checkbox screens for Haiku; reading kept 1. The other two pick what to show
  or export (*Include remedy log*), where a checkbox is right. Luna's 8 are all on/off settings,
  and its Settings screen used checkboxes in 3 of 3 walks, the screen `ui.toggles` exists for.
- Code flagged *Cancel* on Haiku's remedy form as a second Back. Reading: it is a Cancel, kept.
- Every screen that showed last night's score said 72, higher is better.

Three misses, quoted:

- Luna, Settings, every walk: `<label><input type="checkbox" checked> Record snoring</label>`
- Haiku, Recording, walk 2: `<button data-action="@home">Stop recording</button>`
- Luna, Recording, walk 1: no Stop at all, only `<button id="toggle">Pause recording</button>`
  and a separate `<a data-action="@morning-report">View morning report</a>`. Code passes it.

## How it ran

[src/scripts/spec-reading-test.ts](../../src/scripts/spec-reading-test.ts) makes the screens
(`make <model>`) and counts them (`check`). Output is in `temp/spec-reading-test/`, one HTML
gallery per model and walk.

- **The shipped prompt is unchanged.** A new optional `spec` field in the request puts the spec
  after the tree; requests without it are byte for byte the same, so no cassette changed.
- **The spec block**, the five lines of the note's example, then two markup rules:
  ```
  Every screen ends with the tabs of ui.nav, in this markup, one link per tab with its label
    and @name, and aria-current="page" on this screen's own tab: <nav data-ui="tabs"><a data-action="@name">Label</a>…</nav>
  A screen that is not one of the tabs has Back where ui.back says, with its label, in this
    markup: <a data-ui="back" data-action="back">Label</a>
  ```
  The labels come from the spec lines, so the markup does not give the answers away.
- **Size** is code the model never sees: the gallery draws every screen 390 px wide and at least
  844 px tall. The app's frame CSS is unchanged.
- **One design per screen**, phone, no A OR B: today's request for a different design asks to
  change the navigation, and the note rewrites it.
- **The walk** clicks like a user: Home, the flow steps as far as links reach, the tabs, then
  other new links nearest first.
- **Cost**: Haiku $0.015 for 24 screens, Luna $0.020 (estimated) for 21, 3 to 4 s a screen.

## Verdict

Yes: build the rest. Five lines steer both models where a line names a label, a name or a
number. Fix three things first, all small:

- **Switches get a fixed markup**, like tabs and Back, or a code check. A one-word line did not
  reach Luna.
- **The flow needs the note's prompt rule** "a control that finishes a task goes to a real
  screen". This test left the system prompt alone, so that rule was not in it; the flow line
  names screens, not the button that moves between them.
- **The markup rule says the tabs have no Back.** Both models put one on every tab screen.

Side finding: Luna sent 3 of its 21 screens twice in one reply, the whole screen doubled. Not
yet known whether the spec causes it; a check for two tab bars or two titles would catch it.

## Second run, with the three fixes

The note took the three fixes (commit 82c33e9), and the test ran again with them in the spec
block. Switches worked, the Stop rule worked for Haiku and only partly for Luna, and the
"no Back on tab screens" rule did not work.

The block gained three sentences after the Back markup (`make <model> 10 fix-N 2`):

```
… The tab screens have no Back.
An on/off setting follows ui.toggles; a switch is this markup: <label><input type="checkbox"
  role="switch"> Label</label>. A plain checkbox is only for picking items, like what to include or export.
A control that finishes a task (Stop, Save, Send) goes to the next step of product.core-flow,
  else to a real screen or back.
```

The shipped prompt and the cassettes are unchanged. Each model ran 5 walks capped at 10 screens,
so there are 5 Recording screens each: Haiku 50 screens, Luna 42 (walks of 7, 8, 7, 10, 10).
Cost: $0.032 per model. Code now also flags a reply that holds two titles or two tab bars, and a
Recording screen whose Stop does not open `@morning-report`.

| Miss | Counted by | Haiku before → after | Luna before → after |
|---|---|---|---|
| A tab missing or pointing elsewhere | code, then reading | 0/24 → 2/50 | 0/21 → 0/42 |
| Back's label other than `‹ Back` | code, then reading | 0 → 3 | 0 → 0 |
| Back first on the screen, but not in a `<header>` | code | 1 → 15 | 2 → 17 |
| Back on a tab screen | code | 6/6 → 13/15 | 9/9 → 7/15 |
| An on/off option as a checkbox | code finds, reading judges | 1 → 1 | 8 → 0 |
| The score read the wrong way | reading | 0 → 1 | 0 → 0 |
| Stop recording does not reach `@morning-report` | code | 1/2 → 0/5 | 2/3 → 2/5 |
| Another core-flow link missing | code | 0 → 0 | 0 → 1 |
| The screen written twice in one reply | code | 0 → 0 | 3 → 0 |

How reading changed the code's counts:

- Code flagged 8 Haiku screens with checkboxes; 7 pick remedies, nights or fields to compare or
  export, which is right. It kept *Include nights with alcohol* on Compare remedies.
- Code flagged 5 Haiku screens for Back's label. *Cancel* and *Save* that go back are finishing
  controls, which the new rule allows; the 3 misses are Back labelled `‹ Settings`.
- Code flagged 3 Haiku tab bars. On 2 Recording screens the Tonight tab opens `@recording`; the
  third is a Settings tab with no link because it is the current one, which is fine.
- Luna drew switches on Settings in 5 of 5 walks; Settings had checkboxes in 3 of 3 before.

New misses, quoted:

- Luna, Recording, walks 1 and 3: `<button id="stop">Stop recording</button>`, a script button
  with no `data-action`, so Stop opens nothing.
- Haiku, Remedy log, walk 4: "Lower score change is better", with the low-scoring remedies
  filed under *Helped*.
- Luna, Morning report, walk 2: `<a data-action="@home">Done</a>` and no link to Compare remedies.

### Verdict per fix

- **Switches: worked.** Luna went from 8 screens with on/off checkboxes to none.
- **No Back on tab screens: did not work.** Haiku got worse (13 of 15), Luna partly better
  (7 of 15). Both models put Back on a tab screen opened from a link on Home. Code knows which
  screens are tabs, so it should hide `data-ui="back"` there instead of asking the model.
- **Finishing controls: partly.** Haiku's Stop reached the morning report 5 times in 5. Luna's
  did 3 times in 5; both misses are a Stop button that only runs script. The flow line names
  screens, not the button that moves between them: `@recording (Stop) → @morning-report` might
  close the gap, untested.

Back sits first on the screen in every case; most screens just have no `<header>` around it. That
is a wrapper, not a miss a user sees, once the theme styles `data-ui="back"` wherever it is.

**Doubled screens are gone:** 0 of 42 Luna screens, against 3 of 21 before. Both runs carried a
spec, so the spec being there does not cause them. What did is unknown; the check stays.
