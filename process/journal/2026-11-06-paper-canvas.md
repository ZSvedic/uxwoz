# 2026-11-06: from the spec to the paper canvas

The user reviewed the spec feature built on 2026-11-05 and set a new direction for the next major
version. Nothing is built yet: [the plan](../plans/2026-11-06-paper-canvas.md) and
[the canvas manual](../plans/2026-11-06-canvas-manual.md) are written and wait for the user's
review. The spec code stays in the app until build step 2 of the plan.

## What the user said

- UX Woz has to be generic, "as Figma, as Canva, as a piece of paper". The spec iteration kept
  adding fixes for one phone app: tabs, Back, kinds of screen.
- The spec was too complicated for the user: rules under cryptic keys, in a store behind a panel.
- The model to follow is a designer at a large sheet of paper. Screens go on it, and so do a box
  of reusable components, a flat table of rules and a table of sample data, all visible.
- After each pick the designer asks what to file in the three boxes. Now and then an "overnight
  fixer" tidies what makes no sense.
- Rules simple enough for a junior designer are simple enough for Haiku and Luna. Mistakes that a
  later sweep can repair are fine. A model that fails means the rules get simpler, and code and
  prompts get no special case.
- A designer gets the general picture at a glance and looks closely only where needed. Sending a
  model too little is wrong, and sending it every screen is wrong too.
- Rows of one list open one screen: nobody draws the same screen three times for other data.

## Decisions I made in the plan, for the user to confirm

- I read "a table for states" as the sample data table.
- A component is pasted as it is, by name. A part whose content changes per screen is a rule.
- The fixer changes things itself and logs each change with an Undo, with no Accept step.
- No call plans the main path: filing after the first pick takes the plan's place.
