# Design: how the look was chosen

This folder is the record of how UX Woz got its look. The look itself lives in
`src/packages/web/src/design/` and is shown by the running app at `/design`.

Seven variants were made on 2026-11-09 and 2026-11-10 (a sticker book, a sketchbook, an Oz book, a classic
wizard, a tabletop card game, a cute companion, a sleek glyph, and two blends). The user chose F, a blend
on the card-game base: the night sky, the wooden bar, parchment index cards, the wizard hat, rope lines,
the gold OR and the ember Pick. It was built into the app on 2026-11-10 by
[the integration plan](../plans/2026-11-10-design-integration.md); the
[journal](../journal/2026-11-10-design.md) says where the app differs from F and why.

- `shots/f-light.jpg`, `f-dark.jpg`, `f-picked.jpg`: variant F as a faked page, before it was built.
- `shots/current-app.jpg`: the app before, with its orange and grey look.
- The variant pages themselves, `variant-f.html` last, are in git history
  (`git show 83cf081:process/design/variant-f.html`).

The two design rules are in `AGENTS.md` under **Design**: the size caps on `design/`, and no design tweak
without a request.
