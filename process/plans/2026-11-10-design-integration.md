# Plan: bring design F into the app

This plan owns how the look of [variant F](../design/variant-f.html) gets into UX Woz: which files hold it,
what it changes in each part of the app, and the five build phases. It does not own the mockup screens
(`themes/mockup.css` stays), the prompt (no cassette changes) or any behavior beyond what the look forces.

Status: a plan, revised after three critics (their findings are quoted near the end). No code is written
until the user says go. The decisions the user must make are in the next section but one.

## Example: three changes after the integration

The look lives in one folder, `src/packages/web/src/look/`, and the feature files do not know about it.

1. *"Make the Pick button green."* The agent opens `look/tokens.css`, finds `--pick: var(--ember)`, writes
   `--pick: #2e9d5b`. One file. The app, the player and `/design` all change, because all three read that
   token.
2. *"The drawer swings in too slowly."* `look/motion.css`, the `hand` keyframes. One file.
3. *"Add a Duplicate button to the rail."* The agent edits `canvas.ts` (the `RAIL` list) and
   `screens.ts`, as today. The button gets the rail's look for free, since `look/canvas.css` styles
   `.rail .tool`. The agent never opens `look/`.

## Decisions for you

Each has my pick first. Say "all as picked" or name the numbers to change.

1. **No raw look; a still look instead.** The feature files gain 4 lines and lose about 8 (table below),
   so the reason for a second, plain skin is gone, and a second skin would cost more than it saves: every
   new control would need its CSS twice. I propose `?look=still`: the same F with no animation, no sound
   and no tilt, so browser checks and screenshots do not depend on timing. Default stays full F.
2. **Ropes keep today's start and end points; only their shape changes.** A rope drops straight to the
   bottom of its row, then makes one S-curve in the gap to its child, ending above the child's name as
   today. Every screen keeps its line, an open A OR B too. The staggered heights for elbows go: curves of
   one shape whose ends keep their order do not cross.
3. **The logo sits at the left of the bar's strip**, not at the top left as in F. A logo floating over the
   canvas covers the first screen's name after every fit. Alternative: top left as in F.
4. **Pick stays "click anywhere on a finished side"**, with *Pick this design* shown on hover as the ember
   pill. F's two always-visible Pick A and Pick B buttons would need new markup in `canvas.ts` for no
   gain: the sides have no A and B (the different design is on a random side).
5. **The app's words stay**: *Generate*, *What should we mock up?*, *Mockup* and *Clean*. F's *Deal the
   first screen* and *What shall we conjure?* were filler in the faked page. Say so if you want them.
6. **Two contrast fixes to F's colours.** White on ember (the Pick and Generate text) is 2.9:1, and the
   bar's cream text on the light wood is 3.7:1; both need 4.5:1. I propose dark brown text (`#3a1500`) on
   ember, as on the gold OR, and a darker light-mode wood (`#8f5c3a`). Alternative: keep F's colours.
7. **Tilt only where it costs nothing.** The drawer tilts while it swings in and rests level. Rules, Data
   and Fixer's notes tilt by at most 1.5° and straighten when current; Components never tilts, because it
   holds live screens. F tilts all of them all the time; that breaks the canvas's size maths.
8. **The reviewer's player gets a light F**: the sky without zoom, the hat and the screen's name on a
   parchment strip, the device as an ivory card, the feedback buttons on the wooden bar. No sparks, no
   sounds, no tilt: the mockup is what a customer came to see.
9. **The project menu loses *New mockup…***: the deck button (**+**) at the left of the bar is New, as in
   F. One control for one thing, and no new code.

## Where the look lives

One folder. Its CSS and code are bundled by Bun's HTML import, and so are the files in `look/brand/`,
because every reference to them is a relative path (Bun 1.3.11 refuses an absolute `/brand/x.svg`).

| File | Owns | Estimate, lines |
|---|---|---|
| `brand/logo.svg`, `favicon.svg` | the shaded hat at 48 and at 32 (simpler shapes) | |
| `brand/favicon-32.png`, `apple-touch-icon.png`, `og.png` | Safari's tab, the home screen, the share preview (1200×630) | |
| `brand/stars-1.svg`, `-2`, `-3` | the three star tiles (547, 443, 389 px) | |
| `brand/fredoka.woff2`, `LICENSE-fredoka.md` | Fredoka 500 to 700, one file, OFL | |
| `tokens.css` | every colour, light and dark, as palette (`--ember`) and role (`--pick`, `--current`, `--rope`); radii, shadows, the font face | 70 |
| `base.css` | reset, body, plain buttons and fields, focus rings, disabled, and every rule that spans parts (small headings, the danger hover, cut-off text) | 45 |
| `bar.css` | the wooden bar, its menus, Nav's tree, box buttons and badges, the microphone, the speaker, the logo | 85 |
| `canvas.css` | sky and stars, screens, names and ideas, a side and its Pick pill, the OR, rails, ropes, the pills | 85 |
| `boxes.css` | the four boxes as index cards, rules, tables, notes, *new* | 60 |
| `drawer.css` | the drawer as a card, tabs, Edit, Info, the Share pane, *Sending in 3…* | 65 |
| `panel.css` | the generate panel | 30 |
| `motion.css` | every keyframe and transition, `prefers-reduced-motion`, the still look | 50 |
| `player.css` | the player's layout and dialogs | 45 |
| `index.css` | eight `@import` lines; the app, the player and the sheet link it | 10 |
| `fx.ts` | sparks, the three sounds, the sound setting, the still flag, `pickFx` | 130 |
| `design.html` | the sheet at `/design`: the app's own classes on static markup, its few layout rules inline, and 15 lines of script that list the tokens from `document.styleSheets` and play a sound per ▶ | 110 |

The rule that makes a change a one-file edit: **colours only in `tokens.css`**, shapes and spacing in the
part's file, anything two parts share in `base.css`, movement in `motion.css`, sound in `fx.ts`. A test
fails on a `#hex` or `rgb(` in any other look file, in `index.html` or in `player.html`.

**The cap moves.** `AGENTS.md` today caps `shell.css` at 300 lines and 24 KB (it is 252 lines, 19 KB; the
player has 28 more lines inline). New rule: *all CSS in `look/` together stays under 700 lines and 52 KB,
and no file in `look/` is over 130 lines. A change that crosses a cap removes something first.* My
estimate for F is 560 lines and 40 to 44 KB with the player in, so the cap leaves the same fifth of spare
room `shell.css` has today. `tests/look.test.ts` enforces it, which nothing does today. Bun inlines the
font and the stars into the served CSS (about 55 KB more on the wire, cached with it); the cap counts the
source files, which is what an agent reads.

## What feature code gains

The look needs code in two places only, and the features call one function.

```
look/fx.ts
  pickFx(key, index) -> Promise   the winner glows and rises, the loser dissolves, sparks, the chime;
                                  both sides and the OR's ✕ are locked meanwhile; resolves when the loser
                                  may go (0.8 s; at once when still or reduced); clears its own classes
                                  1.2 s later, so a failed pick leaves both sides as they were
  everything else listens:        animationstart 'summon' and 'hand' -> whoosh; pointerover on a
                                  pickable side -> tinkle and 6 sparks; click on #sound -> the setting
  HOOKS                           the class names it keys on (side, pickable, …); a test checks that
                                  each still appears in the feature file that sets it
```

| File | Lines | What |
|---|---|---|
| `screens.ts` | +1, 1 changed | import `pickFx`; `pick()` awaits it together with the `/api/pick` call |
| `canvas.ts` | about −8 | +1 `data-id` on a card in `render()`, +1 for the rope's second stroke; `elbow` becomes a shorter `curve`; the lane map, its sums and `BEND` go |
| `server.ts` | +3 | import `design.html`, the `/design` route, `/og.png` (outside the owner's gate) |
| `app.ts`, `toolbar.ts`, `drawer.ts`, `boxes.ts`, `nav.ts`, `net.ts`, `voice-ui.ts`, `sharing.ts`, `player.ts` | 0 | |
| `index.html` | about +5 | three icon links, the logo, the speaker; the bar's items move into F's order; `#menuNew` moves out of the menu to be the deck |
| `player.html` | about −25 | its `<style>` goes; a stylesheet link, the icons and the `og:` tags come |
| `AGENTS.md` | about +4 | two code-map lines for `look/` and `look/brand/`; the cap rule rewritten in place |
| `spec/behavior.md` | about +10 | sentences replaced where the look changes them, plus a 5-line *Look* section; the visual detail (parchment, pins, glows) lives on `/design`, not in the spec |

The sky needs no code: the stars are a layer inside `.surface`, which already has CSS `zoom`, so they
scale with the screens. The deal, the hover lift and the drawer's swing are CSS animations on classes the
app already sets (`.card.side`, `.pickable`, the drawer losing `hidden`).

## What F means for each part

- **Toolbar.** It becomes the wooden bar, fixed at the bottom centre, about 58 px tall. The workspace ends
  above it (a 16 px fade at the canvas's lower edge), so every fit still uses the visible area and the
  fits in `canvas.ts` do not change. Order, in the DOM too, so Tab follows the eye: the deck (**+**, New
  mockup), ← Nav →, the project menu, Rules, Fixer, Components, Data, Theme, zoom (−, level, +, Fit
  screen), the speaker, the microphone (still last). Every popup, the folded **Boxes ▾** included, is
  anchored to its button's top edge, opens upward, and is at most as tall as the window above the bar;
  Esc, focus and a press outside work as today. Share, Feedback, both Exports, Start over and Delete stay
  in the project menu. The box numbers are gold badges. Under 1,200 px the boxes fold into Boxes ▾ as
  today; under 900 px the three zoom icons go and the mockup's name is cut at 12 characters; under 720 px
  the bar has two rows (deck, ← Nav → above; the rest below) and menus span the window's width. The bar
  never scrolls sideways, because a scrolling bar would clip its menus. Disabled buttons use a muted
  colour that passes 3:1 on wood, not today's 45% opacity.
- **Trail and Nav.** Unchanged in behavior. The path to the current screen is ember, planned screens muted.
- **Generate panel.** A parchment card with a gold border and a blue glow. With a mockup open, the canvas
  behind it is dimmed; the bar is not, and the deck behaves as *New mockup…* does today.
- **Canvas.** Night sky in both modes: a gradient with a violet and a green corner glow on the stage,
  stars on the surface. The dot grid goes. Far out (under 50%) the stars shrink to nothing. A screen sits
  in a 7 px ivory frame with a soft halo, drawn as a shadow so no size in `canvas.ts` changes. A name is a
  parchment chip whose padding and corners divide by the zoom like its text, inside today's label height;
  the idea is light text on the sky, and an idea opened with *more* lies on an indigo plate. A streaming
  screen is dimmed as today. Zoom, pan and the fit keys are as today (10% to 200%; F's click-to-cycle
  zoom was a stand-in). The error and hint pills keep their place, 14 px above the canvas's lower edge,
  which is now above the bar.
- **Lines.** See decision 2. Two strokes on one route: tan 4 px, and a dark dash for the twist, in canvas
  pixels, so they zoom.
- **A OR B.** Both designs appear out of a blur with a whoosh, the second a beat later. The OR is the gold
  coin, its ✕ under it as today. Hovering a finished side lifts it with a gold glow, six sparks and a
  tinkle, and shows the Pick pill. A click plays the pick: the other side stops streaming at once (as
  today), both sides and the ✕ are locked, and for 0.8 s the winner rises and the loser dissolves. Then
  the app does what it does today: the loser is deleted, the zoom and scroll come back. The winner ends
  where it started, not F's 6 px higher, so its rail and rope fit. The server call runs during the
  animation, so a pick is at most 0.8 s slower than today, and no slower in the still look.
- **Rail.** Round parchment buttons, 40 px, in the same 60 px column. Hover and current rules as today.
- **Drawer.** A card held in your hand: rounded, a double gold line inside its edge. It swings in over
  0.45 s with a whoosh and rests level, 360 px wide and docked, so the canvas narrows and the screen stays
  visible exactly as today. It closes at once. Under 700 px it lies over the canvas, as today.
- **Boxes.** Index cards with ruled lines, a gold pin and a glowing edge: blue for Rules, ember for
  Fixer's notes, gold for Components, green for Data. Same place, size, scrolling and wheel rule as
  today. Tilt as in decision 7. IDs are ink on a faint chip.
- **Voice.** The microphone is gold when on (orange on wood is hard to see), with the same pulsing dot.
  No sound plays while the microphone is on, so a whoosh is never heard as speech.
- **Player `/s/<token>`.** See decision 8. Its dialogs (comment, Done, the dead-control question) are
  parchment cards; *Pick a part* keeps its highlight. An edit link shows the full app, so the full F.
- **What F never drew** keeps its shape on the new tokens: a failed side's error box, *more* and *less*,
  the Share pane, `kbd` hints in menus, struck-through undone lines, *· showing* in Past changes.
- **Colours**, each use of today's orange:

  | Today orange | Becomes |
  |---|---|
  | Generate, Make the change, the Pick pill | ember (`--pick`) |
  | the current screen's outline and name, the current box's border, a side's hover outline | gold ring and glow (`--current`) |
  | lines | rope (`--rope`, `--rope-twist`) |
  | the OR, the badges, the microphone when on | gold |
  | Nav's path, *new*, *more*, a card's note, *· showing* | ember (`--mark`) |

  Blue stays the colour of a control in a mockup that opens a screen.
- **Export zip.** Unchanged: it carries the screens' own theme and reads nothing from `look/`.
- **Light and dark.** The sky is dark in both. By day the chrome is parchment with ink text, by night
  indigo with pale text. Screens stay white.
- **Phone, 375 px.** The two-row bar, the drawer over the canvas, the logo as the hat alone.
- **Reduced motion.** No sparks; every animation jumps to its end; `pickFx` resolves at once.
- **Sounds.** Off by default. The speaker in the bar turns them on, kept in this browser. They are made
  with the Web Audio API, so there are no audio files.
- **Font.** `brand/fredoka.woff2`, loaded by `@font-face` with `font-display: swap`. No outside request;
  a test fails if `fonts.googleapis.com` appears in `src/`.
- **Accessibility.** A test computes contrast from `tokens.css` for the pairs that carry text (ink and
  muted on parchment and on indigo, Pick's text, the bar's text, badge text, idea text on the sky and on
  its plate: 4.5:1; disabled text on wood and parchment: 3:1). Focus rings are 2 px and two-tone, so they
  show on parchment, wood and sky. The 16 px favicon is checked by eye in the tab, zoomed.

## Critics

Three Opus critics read the first draft, each with one question. What they found, and what changed.

**Agent speed: "which feature change gets slower, and by how many files read?"**

- *"Any toolbar or canvas CSS change starts at the cap… the agent has to read other look files to find
  something to delete. Extra reads: 2 to 4."* Changed: per-file budgets became estimates; the cap is the
  total, set a fifth above the estimate.
- *"The toolbar cannot reach F's order by CSS alone… the menus are anchored to `.tb-left`, `.tb-mid` and
  `.tb-right`."* Changed: phase 2 reorders the markup; the brief no longer says "only CSS moves it".
- *"Renaming a class set by feature code: files today 2, under the plan 5… a broken sound or spark goes
  unnoticed."* Changed: `fx.ts` lists its hook classes in `HOOKS` and a test checks each against the
  feature file that sets it.
- *"The no-hex test catches code outside the look"* (`frame.ts`, `export.ts`). Changed: it scans `look/`,
  `index.html` and `player.html` only. *"The 'every token used' test turns any CSS removal into an extra
  `tokens.css` edit."* Dropped that check.
- *"When `/api/pick` fails… a pickable card stays dissolved"*, and Drop both stays open for 0.8 s longer.
  Changed: `pickFx` locks both sides and the ✕ and clears its own classes.
- *"Shared selectors have no obvious home."* Changed: `base.css` owns every rule that spans parts.
- Not changed: a new card state reads `canvas.css` plus `tokens.css` where it read `shell.css`, and a
  player change reads `player.css`. One extra file each is the price of shared colours.

**UX: "which part of behavior.md does this plan break or leave unspecified?"**

- *"Lines: 'no two lines cross or run together'. BROKEN… centre-to-centre brings the problem back. 'Top
  centre' also lands inside the name."* and *"an open A OR B… would float with no sign of which screen it
  came from."* Changed: decision 2 was rewritten; ropes keep today's ends and every screen keeps its line.
- *"Drawer… BROKEN by the 1.5° tilt"* and *"a tilted Components box rotates its iframes; in-frame zoom
  works out a scale from getBoundingClientRect's width, which rotation inflates."* Changed: new decision 7.
- *"F's `won` keyframe… would leave the picked screen 6 px off its rail, rope and outline"*, both shields
  stay clickable. Changed: the pick's steps are spelled out under A OR B.
- *"Every popup, `#boxNav` included, [needs] a bottom anchor and a max height."* Added to Toolbar.
- Unspecified and now said: where the pills sit, the name chip at any zoom and the open idea's plate, the
  table for each use of orange, disabled buttons on wood, the parts F never drew, no sound while the
  microphone is on, which labels go under 900 px, the dimmed panel and the deck.
- Stale spec sentences it named (*dot grid*, *the icon in orange*) are in the phases' Spec column now.

**Code size: "where does this plan add bytes to files agents read for features?"**

- *"Bun cannot resolve absolute `/brand/x.svg` paths… the page does not bundle."* (Checked on 1.3.11 in a
  scratch copy.) Changed: `brand/` moved inside `look/`, all paths relative, `look/routes.ts` dropped;
  `server.ts` gains 3 lines for `/design` and `/og.png`.
- *"`canvas.ts`: plan about 0, mine about −12… Without lanes, lines do not cross: two S-curves of the same
  shape whose ends keep their order never cross."* Taken, less the anchors decision 2 keeps: about −8.
- *"`toolbar.ts`: +1, but it names the wrong file… Moving `#menuNew` into the bar makes it 0."* Taken; it
  became decision 9. *"The `fx.ts` script tag isn't needed."* Taken.
- *"The 560 lines are believable; the 36 KB are not… I expect 40 to 44 KB."* Taken; the cap follows.
- *"`behavior.md`… change sentences in place and leave the visual detail to the `/design` sheet: about
  +10"* and a two-line code-map block for `AGENTS.md`. Both taken into the table above.
- *"`import … with { type: 'text' }`… the file disappeared from the CSS bundle. Prefer
  `document.styleSheets`."* Taken: `sheet.ts` and `sheet.css` folded into `design.html`, 12 look files.
- Verified by the critic: `@import` from an HTML import bundles in dev and production; relative `url()`
  in CSS is inlined; `<link rel=icon>` with a relative path is rewritten to a hashed file.

## Phases

Each phase is one Opus builder in a worktree, one Opus critic, fixes, and the lead merges after looking at
the running app. `bun test` and `bun run typecheck` are green at every merge. The spec line lands in the
same commit as the code, written first.

| # | Phase | Files | Spec | Test | Browser check |
|---|---|---|---|---|---|
| 1 | **Split, same look** | `shell.css` cut into `look/*.css` with today's values as tokens; `look/brand/`; `AGENTS.md` cap and code map; `code-contract.md` | none (nothing visible) | `look.test.ts`: the cap, colours only in tokens, every `var()` defined | before and after screenshots of the canvas, a menu, the drawer, at 1,400 and 375 px: the same |
| 2 | **Bar and sky** | `tokens.css` to F's values, `bar.css`, `base.css`, `panel.css`, the sky in `canvas.css`, `index.html` reordered, the font and icons | Toolbar (order, upward menus, the deck, breakpoints), Canvas (*dot grid* twice), Colours | contrast pairs; no Google request; `index.html` has no `data:` and no `<style>` | bar at 1,400, 1,000, 800, 375 px; every menu open, Nav with 20 screens; Tab order; light and dark; `bun run start` |
| 3 | **Canvas, boxes, drawer** | `canvas.css`, `boxes.css`, `drawer.css`; ropes in `canvas.ts` | Canvas (Lines, Names, Current screen), Rail, Drawer, Boxes | a pure `curve()` test: stays in the gap, ends where `elbow` ended | a 6-screen tree with a short parent beside a tall one and an open A OR B, at 25%, 100%, 200%; an edit in a box; wheel zoom over a component |
| 4 | **Motion and sound** | `motion.css`, `fx.ts`, the speaker in `index.html`, the two lines in `screens.ts` | A OR B (hover, the pick), Drawer, Voice (*gold*, no sound while on), a new 5-line *Look* section | `fx.ts`'s pure parts: sound off by default, still and reduced resolve at once; `HOOKS` against the feature files | a pick filmed frame by frame; with `?look=still`; while the other side streams; a pick the server refuses; ✕ during a pick |
| 5 | **Player and sheet** | `player.html`, `look/player.css`, `look/design.html`, `og.png`, 3 lines in `server.ts` | Sharing (the player), a line for `/design` in `code-contract.md` | `/design` and `/og.png` 200; every class in `design.html` has a rule in `look/`; `player.html` has no `<style>` | the player on a phone and a desktop screen, each dialog; `/design` beside `variant-f.html`'s sheet |

Briefs, three lines each:

1. *Cut `shell.css` into the files of the plan's table without changing one pixel. Pull every colour into
   `tokens.css` as palette and role; rules that span parts go to `base.css`. Add `look/brand/`,
   `look.test.ts` and the new cap in `AGENTS.md`.*
2. *Give `tokens.css` F's values and build the bar and the sky from `variant-f.html`. Reorder the bar's
   markup, keep every id, move `#menuNew` out as the deck; anchor every popup to open upward. No transform
   on the bar (it would capture fixed children); check `bun run start`.*
3. *Restyle screens, names, rails, boxes and the drawer in their look files. In `canvas.ts` swap `elbow`
   for a `curve` that drops to the row's bottom and bends in the gap, drawn twice, and delete the lanes.
   Keep `LINE_X`, `ENTRY_X`, the end above the name and every size constant.*
4. *Write `motion.css` and `fx.ts` from the script in `variant-f.html`. `pickFx` is the only export the
   features call; it locks, animates, resolves and cleans up after itself. Sounds off by default, none
   while the microphone is on; `?look=still` and reduced motion skip all of it.*
5. *Move the player's CSS to `look/player.css` on the shared tokens, in the light F of decision 8. Build
   `design.html` from the app's own classes, its colour table read from `document.styleSheets`. Add
   `/og.png` outside the owner's gate and the `og:` tags in `player.html`.*

After phase 5 the lead opens `/design` and the app beside `variant-f.html`, lists what differs, and shows
the user. When the user says they match, `variant-f.html` is deleted (git keeps it), `process/design/README.md`
points to `/design`, and the `design` launch config goes.

Cost, from the night's numbers: five phases at 6 to 14 minutes and about 3% of a 5-hour window each, so
under an hour of building and about 15% of a window. The three critics of this plan took 2 to 3 minutes each.
