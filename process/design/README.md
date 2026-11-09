# Design variants: UX Woz as a game

This folder holds three looks for the app around the screens, so the user can pick one by trying it.
It does not change the app: the mockup screens stay wobbly sketches, and no file here is loaded by `src/`.

## Try them

Open each file in a browser, then:

1. Hover **Pick A**: the signature animation plays as a preview.
2. Click a design: the animation plays for real, with its sound, and the other design goes away.
   The ↺ button under the pair brings both back.
3. Click ✎ under Nights: the drawer opens with its own sound.
4. Click the speaker to mute. Sounds start only after a first click; the browser makes them on the
   fly with the Web Audio API, so there are no audio files.

Every file is one self-contained HTML page under 20 KB. The only outside request is a Google Font,
which a real build would copy into `themes/`. All three follow the system's light or dark mode, slow
their motion for `prefers-reduced-motion`, and fit a 375 px phone.

## A: Sticker book (`variant-a.html`)

The app is a page of candy stickers: thick ink outlines, hard offset shadows, buttons that press in.

- **Palette, light:** cream `#fff6e5`, ink `#2b2340`, tomato `#ff5a36`, sun `#ffc531`, teal `#1fb5a8`, grape `#7b5cff`.
- **Palette, dark:** plum `#1d1730`, card `#2a2145`, cream ink `#fff3dc`, tomato `#ff7a59`, sun `#ffd45c`, teal `#3fd3c4`.
- **Logo:** a smiling tilted star; wordmark *UX Woz* in Baloo 2, with *Woz* in tomato.
- **Layout:** today's layout. The top toolbar turns sun yellow; the drawer slides in from the right.
- **Animation:** a red PICKED! starburst slaps onto the chosen design; the other peels off and falls.
- **Sounds:** a two-note coin blip on pick, a rising swoop when the drawer opens.
- **Cost:** about +3 KB on `shell.css`. Mostly new tokens, borders and shadows on rules that already exist.

## B: Sketchbook (`variant-b.html`)

The app is a ruled notebook in blue pen by day and a chalkboard by night, so it matches the sketches it holds.

- **Palette, light:** paper `#fbf8f0`, rules `#d6e2f5`, margin red `#e2574c`, pen blue `#2f5bd3`, graphite `#3b3b3b`, highlighter `#fff275`.
- **Palette, dark:** chalkboard `#1f2b26`, chalk `#eef0e8`, chalk blue `#8fb8ff`, chalk pink `#f5a3b5`, dull highlighter `#6d6526`.
- **Logo:** a pencil drawing a wavy W over a red underline; wordmark in Caveat. Body text in Patrick Hand.
- **Layout:** tools move to a left rail with tooltips, the trail becomes a pencilled label on the page,
  and the drawer becomes a bottom sheet with a grab handle. Boxes are punched index cards.
- **Animation:** a pen draws a circle round the chosen design and scribbles red across the other.
- **Sounds:** a pencil scratch (filtered noise) on pick, a page flip when the sheet opens.
- **Cost:** about +4 KB. The toolbar rules are rewritten as a rail, so part of it is a swap.

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

## Two rules for AGENTS.md

These go under a new heading **Design**:

- **`shell.css` stays under 300 lines and 24 KB.** Today it is 234 lines and 18 KB; the cap leaves room
  for one of these variants and little else. A change that crosses it removes something first.
- **No design tweak without a request.** Change colours, spacing, fonts, motion or sounds only when the
  user asked for that change. A fix for a bug keeps the look as it is.

## Judge's notes, 2026-11-09 night

I (the lead agent) opened all three in the browser pane at 800 px, light and dark, and clicked
Pick in C. Screenshots are in `shots/` (`a-light.jpg`, `a-dark.jpg` and so on, and
`current-app.jpg` for today's look). My order: B, then A, then C.

- **A, Sticker book.** Reads clearly, keeps today's layout, so it is the cheapest to apply and the
  least to relearn. The thick ink outlines and hard shadows compete with the sketch frames: two
  loud things on one canvas. Dark mode is good. Pick if you want colour with no UX change.
- **B, Sketchbook.** The one that fits the product: screens are sketches, the boxes are index cards,
  the fixer "visits the paper", and here the whole app is paper. The left rail frees the top, the
  chalkboard dark mode is calm. The handwritten titles cost legibility on small text; keep the
  hand font for headings only. Pick if you want the app to feel of one piece with the mockups.
- **C, Tabletop.** The most "game": dealt cards, a wooden command bar, pinned notes. The gingham
  light background is busy behind sketches (the green felt is fine). The floating bar hides the
  bottom of the canvas on a phone, and it is the biggest CSS change. Pick if play matters more
  than reading.

What each needs before it is real: fonts copied into `themes/`, the sounds behind a setting that
is off by default, and the `shell.css` cap above.
