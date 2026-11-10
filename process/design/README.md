# Design: UX Woz as a game

This folder holds the chosen look for the app around the screens, `variant-f.html`: one self-contained page
that shows the chrome (bar, canvas, boxes, drawer, generate panel) with faked content, plus a design sheet.
It does not change the app: the mockup screens stay wobbly sketches, and no file here is loaded by `src/`.
How it gets into the app is the subject of
[the integration prompt](../plans/2026-11-10-design-integration-prompt.md).

Seven variants were made on 2026-11-09 and 2026-11-10 (a sticker book, a sketchbook, an Oz book, a classic
wizard, a tabletop card game, a cute companion, a sleek glyph, and two blends); the user chose F and the
others were deleted on 2026-11-10. Git history has them all.

## Try it

Open the file in a browser, or serve the folder (`python3 -m http.server 3002 --directory process/design`),
then:

1. Hover **Pick A**: the signature animation plays as a preview.
2. Click a design: the animation plays for real, with its sound, the other design goes away, and a rope
   line runs from the chosen screen to its children. The ↺ button brings both back.
3. Click ✎ beside a screen: the drawer opens with its own sound. Click 100 % in the bar to zoom.
4. Click the speaker to mute. Sounds start only after a first click; the browser makes them on the fly
   with the Web Audio API, so there are no audio files.
5. *Design sheet ↓* scrolls below the canvas to the logo at five sizes, every colour token in light and
   dark with its role, the type, the controls, the surfaces, and the motion and sounds with a ▶ per sound.

The page is 31 KB. The only outside request is a Google Font, which a real build copies into `themes/`. It
follows the system's light or dark mode, slows its motion for `prefers-reduced-motion`, and fits a 375 px
phone. Screenshots: `shots/f-light.jpg`, `shots/f-dark.jpg`, `shots/f-picked.jpg`, and `shots/current-app.jpg`
for the look before.

## F (`variant-f.html`)

The user's pick of parts from the earlier variants A to E (git history has them), on B as the base, with a
second round of fixes on 2026-11-10.

- **From B:** the night sky in both modes, the gold OR, the ember Pick, the pinned index cards, the drawer as a
  card in your hand, the generate panel, the sheet, Fredoka.
- **From C:** the wooden command bar at the bottom, with the deck as New, gold badges, text 15 px at weight 500,
  the arrows pointing up.
- **From D:** the violet and green corner glows.
- **From A:** the pick: gold glow, levitation, star sparks, the loser dissolves into motes; the chime and the hover tinkle.
- **From E:** the filtered whoosh, on deal and when the drawer opens.
- **New:** the hat alone as the logo, shaded (a gradient on the cone, a dark brim underside, a thin gold rim, no
  highlight line), and as the favicon. Both Pick buttons and the "pick one" hint go after a pick. The tool buttons
  (Edit, Info, Undo and so on) sit in a column to the right of a screen. IDs like `snore-count` are in ink on a
  faint chip, not blue. The boxes sit right of the tree, or below it when narrow.
- **Connecting lines:** none before a pick; after it, 4 px S-curves from the bottom of the chosen screen to the
  top of each child, drawn as a rope: tan with a twisted dash (the user chose it over a dotted and a glow
  style on 2026-11-10). An SVG inside the board, so they zoom; redrawn on resize, pick and ↺.
- **Zoom:** the 100 % item in the bar cycles 50 to 150 % (also ⌘+ and ⌘−), scaling the board from the top left.
- **Background:** B's stars on three hand-placed tiles of 547, 443 and 389 px with 6 to 11 stars each, so no
  repeat shows, in a layer inside the zoomed board so the stars scale with it and reach the page bottom (each
  tile needs both sizes in `background-size`: with the width alone the SVG tile stretched to the layer's height
  and the stars stopped after 550 px); D's corner glows stay on the stage, unzoomed. At 50 % the stars shrink to a pixel and nearly vanish.
- **Cost:** about +7 KB on `shell.css`, plus the line drawing, which the real app already has in `canvas.ts`.

## Two rules for AGENTS.md

These are in `AGENTS.md` under **Design** since 2026-11-09:

- **`shell.css` stays under 300 lines and 24 KB.** Today it is 234 lines and 18 KB; the cap leaves room
  for one of these variants and little else. A change that crosses it removes something first.
- **No design tweak without a request.** Change colours, spacing, fonts, motion or sounds only when the
  user asked for that change. A fix for a bug keeps the look as it is.
