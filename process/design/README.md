# Design variants: UX Woz as a game

This folder holds three looks for the app around the screens, so the user can pick one by trying it.
On 2026-11-09 the user kept C and asked for two Wizard of Oz variants in place of the first A and B
(a sticker book and a sketchbook; git history has them).
It does not change the app: the mockup screens stay wobbly sketches, and no file here is loaded by `src/`.

## Try them

Open each file in a browser, then:

1. Hover **Pick A**: the signature animation plays as a preview.
2. Click a design: the animation plays for real, with its sound, and the other design goes away.
   The ↺ button under the pair brings both back.
3. Click ✎ under Nights: the drawer opens with its own sound.
4. Click the speaker to mute. Sounds start only after a first click; the browser makes them on the
   fly with the Web Audio API, so there are no audio files.

Every file is one self-contained HTML page of about 20 KB. The only outside request is a Google Font,
which a real build would copy into `themes/`. All three follow the system's light or dark mode, slow
their motion for `prefers-reduced-motion`, and fit a 375 px phone.

## A: Wizard (`variant-a.html`)

A wizard video game. The canvas is a night sky in both modes and the white screens glow on it like lit
windows; light mode puts the chrome on parchment, dark mode makes it deep indigo.

- **Palette, light:** sky `#0b1030` to `#1b2160`, parchment `#f6ecd2`, ink `#2a1f3d`, blue `#2f5bff`, green `#17a364`, ember `#ff6a2b`, gold `#f5c542`.
- **Palette, dark:** the same sky, chrome `#1a1f4a`, text `#e6e4ff`, blue `#6f8cff`, green `#34d38a`, ember `#ff7a3d`, gold `#ffd166`.
- **Logo:** a wizard hat with a star, as inline SVG; wordmark in Cinzel Decorative, *Woz* in ember. The top right
  shows the hat as a favicon at 16 and 32 px, and the 🧙 emoji as the other candidate.
- **Layout:** tools in a spellbook rail on the left (a bottom bar on a phone), the trail as a blue ribbon banner,
  boxes as spell cards with a glowing edge, the drawer as a scroll that unrolls between gold rods.
- **Animation:** the chosen screen glows gold, levitates and throws star sparks; the other dissolves into green motes.
- **Sounds:** a rising chime on pick, a tinkle on the hover preview, a whoosh when the scroll opens.
- **Cost:** about +4 KB on `shell.css`: the rail, the glow borders and the sky.

## B: Oz (`variant-b.html`)

Baum's 1900 book drawn like Denslow, in a game: flat colour, heavy black outlines, the Emerald City by day and the
throne room by night. Nothing from the film.

- **Palette, light:** emerald `#2e9e62`, glow `#5cc98c`, gate `#0c5a35`, parchment `#fbf3dc`, ink `#111111`, brick gold `#f2c230`, poppy `#e0302a`, silver `#c7ccd3`.
- **Palette, dark:** marble `#04120b`, glow `#17553a`, gate `#06190f`, parchment `#f1e6c6`, gold `#e3b324`, poppy `#ff4d3d`, silver `#9aa4b1`.
- **Logo:** the great Head of Oz in a parchment arch, as inline SVG; wordmark in Federant, *Woz* in poppy. The
  toolbar shows the Head as a favicon at 16 and 32 px.
- **Layout:** the toolbar is the emerald city gate with a silver trail; a yellow brick road runs down the left with the
  levels as brick signs; screens sit in silver spectacle lenses; boxes are signboards, the fixer's note a scroll, and the
  drawer is the curtain parting on the little man's controls.
- **Animation:** the Head drops above the chosen lens and spotlights it in a gold frame; a curtain falls over the other.
- **Sounds:** a brassy Oz voice with a gong on pick, a curtain swish for the drawer, a glass chime as lenses appear.
- **Cost:** about +5 KB: the brick road, the lenses and the curtain are all new.

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

## Judge's notes, 2026-11-09 evening

I (the lead agent) opened A and B in the browser pane at 800 px, light and dark, and clicked Pick A in each.
Screenshots are in `shots/` (`a-light.jpg`, `a-dark.jpg`, `b-light.jpg`, `b-dark.jpg`, and `c-*.jpg` from the night).
The user had already put C first among the earlier three; these two are the Wizard of Oz answers to it.

- **A, Wizard.** The dark sky does what was asked: the white screens pop, in both modes. The spell cards with a
  glowing edge are readable and the rail keeps the top clear. The hat reads at 16 px because the silhouette is one
  shape with a brim. Weak spot: Cinzel Decorative on headings is a fantasy cliché, and "light mode" is still a dark
  app, so a user who expects a white canvas by day will not get one.
- **B, Oz.** The one with a story: the gate, the brick road, the lenses and the curtain all come from the book, and
  the drawer as the curtain is the best metaphor of the five variants for what UX Woz is. The Head is clear at 32 px
  and still a face at 16 px. Weak spots: the Head in the toolbar is small, the spotlight tints the chosen mockup
  yellow for a moment, and the striped curtain over the lost design is loud.
- **C, Tabletop** stands as in the night's notes: the most "game", the busiest light background, the biggest CSS
  change.

Checked: no console errors, Pick A, ↺ and ✎ in both. Not checked by ear: the sounds. The builders report the
375 px phone layout fine in both.
