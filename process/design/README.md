# Design variants: UX Woz as a game

This folder holds seven looks for the app around the screens, so the user can pick one by trying it.
On 2026-11-09 the user kept C, dropped the sticker book, the sketchbook and an Oz-book variant (git
history has them), and asked for the wizard theme in four readings next to C.
It does not change the app: the mockup screens stay wobbly sketches, and no file here is loaded by `src/`.

## Try them

Open each file in a browser, then:

1. Hover **Pick A**: the signature animation plays as a preview.
2. Click a design: the animation plays for real, with its sound, and the other design goes away.
   The ↺ button under the pair brings both back.
3. Click ✎ under Nights: the drawer opens with its own sound.
4. Click the speaker to mute. Sounds start only after a first click; the browser makes them on the
   fly with the Web Audio API, so there are no audio files.

Every file is one self-contained HTML page of 26 to 28 KB, a design sheet included: the *Design sheet ↓*
button in the chrome scrolls below the canvas to the logo at five sizes, every colour token in light and
dark with its role, the type, the controls, the surfaces, and the motion and sounds with a ▶ per sound. The only outside request is a Google Font,
which a real build would copy into `themes/`. All three follow the system's light or dark mode, slow
their motion for `prefers-reduced-motion`, and fit a 375 px phone.

## A: Wizard (`variant-a.html`)

A wizard video game. The canvas is a night sky in both modes and the white screens glow on it like lit
windows; light mode puts the chrome on parchment, dark mode makes it deep indigo.

- **Palette, light:** sky `#0b1030` to `#1b2160`, parchment `#f6ecd2`, ink `#2a1f3d`, blue `#2f5bff`, green `#17a364`, ember `#ff6a2b`, gold `#f5c542`.
- **Palette, dark:** the same sky, chrome `#1a1f4a`, text `#e6e4ff`, blue `#6f8cff`, green `#34d38a`, ember `#ff7a3d`, gold `#ffd166`.
- **Logo:** a wizard hat redrawn on 2026-11-09 evening (the first looked like a shark's tail): a wide oval brim,
  a tall cone bent at the tip, a green band, a gold star. Wordmark in Cinzel Decorative, *Woz* in ember. The top
  right shows the hat as a favicon at 16 and 32 px, and the 🧙 emoji as the other candidate.
- **Layout:** tools in a spellbook rail on the left (a bottom bar on a phone), the trail as a blue ribbon banner,
  boxes as spell cards with a glowing edge, the drawer as a scroll that unrolls between gold rods.
- **Animation:** the chosen screen glows gold, levitates and throws star sparks; the other dissolves into green motes.
- **Sounds:** a rising chime on pick, a tinkle on the hover preview, a whoosh when the scroll opens.
- **Cost:** about +4 KB on `shell.css`: the rail, the glow borders and the sky.

## B: Wizard's card game (`variant-b.html`)

A and C as one look: a card game played at night. From A, the night sky in both modes, the glowing edges, the
gold glow, the sparks and the chime on pick. From C, the screens as playing cards dealt from a deck and flipped,
the floating command bar with the deck, the pinned index cards, the drawer as a card in your hand, the thwip.

- **Palette, light:** sky `#1b2160` to `#0b1030`, parchment `#f6ecd2`, ink `#2a1f3d`, blue `#2f5bff`, card back `#2b4c9b`, ember `#ff6a2b`, gold `#f5c542`, wood `#6b4430`.
- **Palette, dark:** the same sky, indigo chrome `#1a1f4a`, text `#e6e4ff`, ember `#ff7a3d`, gold `#ffd166`, obsidian bar `#2a2350`.
- **Logo:** a new hat (oval brim, cone bent at the tip, ember band, gold star) sitting on two fanned cards; the
  favicon is the hat alone, and the hat is on every card back. Wordmark in Fredoka, *Woz* in ember.
- **Layout:** C's layout: no toolbar, the command bar at the bottom as dark wood by day and obsidian by night
  with gold inlay, the deck at its left, index cards pinned to the sky with a glowing edge.
- **Animation:** the chosen card lifts and throws sparks; the other flips face down and slides back to the deck.
- **Sounds:** a card thwip on deal, a chime on pick, a tinkle on hover.
- **Cost:** about +6 KB: the 3D cards and the command bar from C plus the glow and the sky from A.

## C: Tabletop (`variant-c.html`)

The canvas is a game table, a picnic cloth by day and green felt by night, and every screen is a playing card.

- **Palette, light:** cloth `#f6efe0` with red checks, card ivory `#fffdf6`, ink `#2a2420`, red `#d94b3d`, gold `#e0a020`, card back `#2b4c9b`, wood `#a8714b`.
- **Palette, dark:** felt `#1e4d3a` to `#123326`, sticky note `#f3d65f`, gold `#f0b429`, wood `#6b4430`.
- **Logo:** two fanned cards, the front one marked with a red W and a gold star, on a tilted box lid; wordmark in Fredoka.
- **Layout:** no toolbar. A wooden command bar floats at the bottom with the deck (+ New) at its left;
  the drawer is a big card held in your hand. Rules and Data are pinned index cards, the fixer's note a sticky note.
- **Animation:** the two designs are dealt from the deck and flip face up; the one you lose flips face
  down and slides back.
- **Sounds:** a card thwip on deal and on opening the drawer, a wooden knock on pick.
- **Cost:** about +5 KB, the most: 3D card faces, the command bar and the cloth pattern are all new.

## D: Companion (`variant-d.html`)

The wizard theme in 2026: a cute AI companion. No serif, no drawings, no ornament; one rounded sans, soft
shapes, pills, glows instead of borders.

- **Palette:** canvas ink `#0f1230` to `#1a1f4d` in both modes. Light chrome white `#ffffff` and `#f2f3fb`, text `#1c1d3a`; dark chrome charcoal `#23242e` and `#2e303c`, text `#ecedf7`. Violet `#7c5cff` to blue `#3b82f6`, mint `#2ecc9a`, coral `#ff6b6b` for Pick.
- **Logo:** a round violet-to-blue mascot with two eyes, a blush and a tiny mint hat; the same at 16 and 32 px as
  the favicon. It is the fixer's avatar on the fixer's note and bobs and winks on a pick. Wordmark in Nunito.
- **Layout:** a segmented pill toolbar at the top, a round wand button bottom right for New, the drawer as a
  bottom sheet with a grab handle, boxes as white cards with a coloured left edge.
- **Animation:** the chosen screen gets a soft halo and pops; the other shrinks away with tiny stars.
- **Sounds:** a marimba-like pop on pick, a tick on hover, a swipe for the sheet.
- **Cost:** about +4 KB. The pill toolbar replaces today's bar, the rest is tokens and radii.

## E: Sleek glyph (`variant-e.html`)

The wizard theme in 2026: sleek and arcane. Frosted glass on a dark canvas with a slow aurora, thin glowing
lines, one clean sans.

- **Palette, light:** canvas `#1d2457` to `#0d1030`, glass `#f3f4ffd9`, text `#15172e`. **Dark:** canvas `#080a1f` to `#030414`, glass `#141834cc`, text `#e9eaff`. Accents: violet `#7c4dff` / `#a78bfa`, cyan `#00a5c8` / `#22d3ee`, ember `#ff6b2c` / `#ff7a3d` for Pick.
- **Logo:** a geometric hat glyph, a violet-to-cyan cone on a deeper brim with one ember spark, the kind an app
  icon is made of; the same glyph is the favicon. Wordmark in Space Grotesk.
- **Layout:** a slim glass top bar with the trail as a glowing line with a dot per level, a glass tool rail on the
  left (a bottom bar on a phone), glass boxes with a violet-to-cyan top line, the drawer a glass panel from the right.
- **Animation:** two violet-cyan rings expand and fade from the chosen screen (a cast spell), then a steady glow;
  the other greys out and sinks.
- **Sounds:** a synth shimmer on pick, a blip on hover, a filtered whoosh for the panels.
- **Cost:** about +5 KB: backdrop blur, the aurora and the rail.

## F and G: the blend (`variant-f.html`, `variant-g.html`)

The user's pick of parts from A to E, on B as the base. G is the first cut with D's dot background; F went
through a second round on 2026-11-10 and is the one to judge.

- **From B:** the night sky in both modes, the gold OR, the ember Pick, the pinned index cards, the drawer as a
  card in your hand, the generate panel, the sheet, Fredoka.
- **From C:** the wooden command bar at the bottom, with the deck as New, gold badges, text 15 px at weight 500,
  the arrows pointing up. (G still has D's pill bar.)
- **From D:** the violet and green corner glows.
- **From A:** the pick: gold glow, levitation, star sparks, the loser dissolves into motes; the chime and the hover tinkle.
- **From E:** the filtered whoosh, on deal and when the drawer opens.
- **New:** the hat alone as the logo, shaded (a gradient on the cone, a dark brim underside, a thin gold rim, no
  highlight line), and as the favicon. Both Pick buttons and the "pick one" hint go after a pick. The tool buttons
  (Edit, Info, Undo and so on) sit in a column to the right of a screen. IDs like `snore-count` are in ink on a
  faint chip, not blue. The boxes sit right of the tree, or below it when narrow.
- **Connecting lines** (F): none before a pick; after it, 4 px S-curves from the bottom of the chosen screen to the
  top of each child, drawn as a rope: tan with a twisted dash (the user chose it over a dotted and a glow
  style on 2026-11-10). An SVG inside the board, so they zoom; redrawn on resize, pick and ↺. G still has the first cut: a faint lane line from under the OR.
- **Zoom** (F): the 100 % item in the bar cycles 50 to 150 % (also ⌘+ and ⌘−), scaling the board from the top left.
- **F's background:** B's stars on three hand-placed tiles of 547, 443 and 389 px with 6 to 11 stars each, so no
  repeat shows, in a layer inside the zoomed board so the stars scale with it and reach the page bottom (each
  tile needs both sizes in `background-size`: with the width alone the SVG tile stretched to the layer's height
  and the stars stopped after 550 px); D's corner glows stay on the stage, unzoomed. At 50 % the stars shrink to a pixel and nearly vanish.
- **G's background:** D's 22 px dot grid and its corner glows, on B's sky.
- **Cost:** about +7 KB on `shell.css`, plus the line drawing, which the real app already has in `canvas.ts`.

## Two rules for AGENTS.md

These go under a new heading **Design**:

- **`shell.css` stays under 300 lines and 24 KB.** Today it is 234 lines and 18 KB; the cap leaves room
  for one of these variants and little else. A change that crosses it removes something first.
- **No design tweak without a request.** Change colours, spacing, fonts, motion or sounds only when the
  user asked for that change. A fix for a bug keeps the look as it is.

## Judge's notes, 2026-11-09 late evening

I (the lead agent) opened all five in the browser pane at 800 px, light and dark, clicked Pick A and the sheet
button in each, and read each console: no errors. Screenshots in `shots/`: `<letter>-light.jpg`,
`<letter>-dark.jpg` and `<letter>-sheet.jpg` for A, B, C, D, E, plus `current-app.jpg`. The user had put C
first among the earlier set; the four others are readings of the wizard theme.

- **A, Wizard.** The new hat reads as a hat at every size. Still the classic, with Cinzel Decorative on the
  headings; the sheet shows it best. The weak spot stays: "light mode" is a dark app.
- **B, Wizard's card game.** The blend works better than I expected: the cards and the deck give the sky
  something to do, and the wooden bar carries the gold well. The hat on fanned cards is the richest logo of
  the five, but the busiest at 16 px (the favicon is the hat alone, which is fine). Biggest file.
- **C, Tabletop.** Unchanged, now with a sheet. The command bar overflows at 800 px: it scrolls sideways, and
  the speaker is off the right edge until you scroll it.
- **D, Companion.** The most 2026 and the friendliest: the mascot is a real asset (it can wink on the fixer's
  note, nod on a pick, be the app icon). White cards on the ink canvas are the most readable of the five. At a
  tall viewport the bottom sheet's handle row shows at the top left over the logo (in `d-sheet.jpg`); a
  small bug for the pick, not the design.
- **E, Sleek glyph.** The most "product": glass, aurora, a rune trail, a glyph that would sit well in a dock.
  Light mode's glass is pale enough to read, dark mode is handsome. The risk is coldness: without the mascot
  it is any 2026 AI tool until the hat glyph reminds you.

My order: D, E, B, A, C for the wizard brief, with C as the user's earlier pick kept for comparison. D and E
are the two that answer "modern"; B is the one to choose if the game feel matters more than the modern feel.
Not checked by ear: the sounds, in any of them.

## Judge's notes, 2026-11-10: F and G

Opened both at 800 px, light and dark, picked A in F: the Pick buttons go, the chosen screen glows and the line
runs from under it to Nights and Settings (`shots/f-picked.jpg`). No console errors. Screenshots: `f-light.jpg`,
`f-dark.jpg`, `g-light.jpg`, `g-dark.jpg`. The screens blur in with a "summon" animation on load; in a hidden
browser pane it pauses, which is a quirk of the pane, not the page.

- **F, stars.** The sky reads as a sky now: no visible repeat at 800 px. The corner glows are subtle enough to
  miss at a glance, which is right.
- **G, dots.** Calmer and more "tool" than F; the dot grid reads as a canvas you can place things on. The dots
  are faint in light mode's parchment chrome areas, fine on the sky.
- Both: the shaded hat is the best logo so far, and the bottom pill bar frees the top of the canvas. One thing
  to look at on a real screen: after a pick the page scrolls so the chosen screen slides under the logo.

Not checked by ear: the sounds.

## Judge's notes, 2026-11-10 afternoon: F's second round

Checked at 1000 px, light and dark: the pick removes both buttons and the hint, the rope, dotted and glow lines
curve from the chosen screen into Nights and Settings with no stubs, zoom cycles and the stars and lines scale
with it, the stars reach the bottom of the sheet, no console errors. A jump of the page after a pick that I saw
earlier was the browser tool scrolling the button into view, not the page. Not checked by ear: the sounds.

