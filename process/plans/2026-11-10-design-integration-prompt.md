# Prompt: plan the integration of design F into UX Woz

Paste everything below the line into a new Claude Code session (Fable 5.2) opened on this repo.

---

You are the lead of a design integration for UX Woz. Read `AGENTS.md` first (it is short and it names the
docs), then `process/design/README.md` and `process/design/variant-f.html`, which is the chosen design: a
self-contained page that shows the app's chrome in the new look with faked content. Then `spec/behavior.md`
(the sections Toolbar, Canvas, A OR B, Rail, Drawer, Boxes, Navigation, Colours) and
`src/packages/web/src/shell.css`, `index.html`, `player.html`. Do not read the journal beyond its latest file,
and do not read `cassettes/` or `themes/pico.css`.

Your job is a **plan**, not code: how to bring F into the app so that the app looks like F and the work of
agents on the app does not get slower. Write it to `process/plans/2026-11-10-design-integration.md` in the
style of `process/writing-style.md`, then stop and wait for the user to read it. Only after their go-ahead
does anyone write code.

## What F is

The chrome around the mockup screens: a night sky with stars that zoom with the canvas, a shaded wizard hat
as the logo and the favicon, C's wooden command bar at the bottom with menus that open upward, the gold OR
and the ember Pick, parchment index cards for the boxes with a glowing edge, the drawer as a card held in
your hand, rope-textured connecting lines from a picked screen to its children, tool buttons in a column to
the right of a screen, A's pick animation (glow, levitation, sparks, the loser dissolves), a whoosh when
screens appear and when the drawer opens, a chime on pick, one Google Font (Fredoka), light and dark modes
that both keep the dark sky, a 375 px phone layout, and a design sheet below the canvas with the logo at
five sizes, every colour token with its role, the type, the controls, the surfaces, the motion and sounds.

The mockup screens themselves (`themes/mockup.css`, the wobbly sketches) are not part of the design and do
not change. Neither does the prompt (a prompt change re-records the cassettes).

## What the plan must deliver

1. **Modular.** The design lands as parts an agent can change one at a time without reading the rest:
   tokens (colours, radii, shadows, fonts) in one file; the chrome's rules per component (bar, cards, drawer,
   canvas sky, lines, buttons) in small files or clearly fenced sections; motion and sound apart from
   layout. Say which file owns what, and how a later agent finds the one file for a change ("make the
   Pick button green" must be a one-file edit). Name the files and their size budget.
2. **The design sheet is a standalone file**, served by the app (say at `/design`), built from the same
   tokens and components as the app so it never drifts: when a token changes, the sheet changes. Decide
   whether it is a static HTML page in `src/packages/web/` that links the app's CSS, or a route that renders
   it. It is what a reviewer or an agent opens to see the look without running a mockup.
3. **Logo and favicons are standalone files** (`logo.svg`, `favicon.svg`, and whatever the app's `<head>`
   and the player's need, plus a PNG set if the browser or the share preview needs one), referenced by
   path, never inlined in HTML or CSS. Say where they live and who serves them.
4. **Agent speed.** The design must not push CSS, markup and sound code into the files agents edit for
   features (`app.ts`, `screens.ts`, `canvas.ts`, `drawer.ts`, `toolbar.ts`, `server.ts`). Measure: for each
   of those files, how many lines the integration adds, and keep it near zero by keeping the look in CSS
   and in a small `design/` or `look/` area. Where the look needs code (the sky that zooms, the rope lines,
   the sparks, the sounds), put it behind one small interface the feature code calls. If the look cannot stay
   out of the feature code, propose a **raw look** switch: an env var or a query flag (say `?look=raw` or
   `UXWOZ_LOOK=raw`) under which the app loads only the plain base CSS of today, so an agent working on a
   feature sees and reads less. Say what the raw look includes, how tests and the browser checks use it,
   and that the default stays F.
5. **Consequences everywhere.** Go through every part of UX Woz the chrome touches and say what F means for
   it: the toolbar's menus (now at the bottom, opening upward; the project menu, Share, Feedback, Export, Theme,
   the voice button, zoom), the trail and Nav, the generate panel, the canvas (lines are in `canvas.ts` today:
   how the rope texture lands there, zoom and the star layer, the fit keys), A OR B (the pick animation, the
   disappearing Pick buttons, the hint), the rail and the tool column, the drawer (Edit, Info, Share pane, the
   voice words and countdown), the boxes (Components, Rules, Data, Fixer's notes, their rails, editing in
   place, Export), the player page `/s/<token>` (does the reviewer see F's chrome, a lighter version, or only
   the device frame?), the export zip (unchanged: the screens' own theme), light and dark, the 375 px phone,
   `prefers-reduced-motion`, sounds (off by default, a setting), the Google Font (copied into `themes/`, no
   outside request), the `shell.css` cap in `AGENTS.md` (300 lines, 24 KB: say where the cap moves if the look
   is split into files, and what the new rule is), accessibility (contrast of parchment on the sky, focus
   rings, the hat as a 16 px favicon).
6. **Critics.** Before you hand the plan to the user, run three read-only critic subagents on it, each with
   one question, and fold their findings in: (a) an agent-speed critic: "which feature change gets slower
   under this plan, and by how many files read?"; (b) a UX critic: "which part of behavior.md does this plan
   break or leave unspecified?"; (c) a code-size critic: "where does this plan add bytes to files agents read
   for features, and what is the smallest alternative?". Quote each critic's findings in a section of the
   plan with what you changed because of them. Use Opus for the critics. Check the usage card before each
   subagent; start none past 85 % of the 5-hour window.
7. **Phases.** Split the work into phases that each leave the app working and tested: tokens and files
   first, then the chrome, then motion and sound, then the player and the sheet. For each phase: the files,
   the spec section to update, the test to add, what the browser check looks at, the builder's brief in
   three lines. The build loop is the one in the latest journal: one Opus builder in a worktree, one Opus
   critic, fixes, the lead merges.

## Rules that stand

- TypeScript, no runtime dependencies, bun from `src/`; `bun test` and `bun run typecheck` stay green.
- The two design rules in `AGENTS.md`: a size cap on the chrome's CSS, and no design tweak without a request.
  Your plan may move the cap; it may not drop it.
- `spec/` says what, `src/` says how: every visible change gets a line in `spec/behavior.md` first.
- Keep `variant-f.html` as the reference until the app matches it, then say in the plan when it can go.
- Write nothing to `src/` in this session. The plan is the deliverable.
