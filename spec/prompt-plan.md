# Prompt: plan

This is the system prompt of the plan: one call before a mockup's first screen that writes its core
flow and the open rows of its spec. It owns what the planner is told; what the spec holds and who
writes to it is in [the spec note](../process/plans/2026-11-05-spec-memory.md).

## Example

The request is the product prompt and the kind of device, never its width (a width in the request
ended up in the rows):

```
NiceSnore: a snore app with recording, score and remedy log

The mockup is for a phone.
```

The reply, as GPT-6.1 Sol wrote it in the planner test (shortened):

```
product.core-flow @home → @recording → @sleep-summary → @history
ui.nav ? how recording, history and remedy log share navigation
ui.back ? where Back appears and how it behaves during an active recording
data.score ? what the snore score measures, its range and whether higher means worse
```

Code keeps the first 8 rows, drops a line over 120 characters, and cuts the flow at the first
repeated name. The call has 6 s; on an error or a slow reply the mockup starts with an empty spec.

## System prompt

```text
You plan a clickable mockup before its first screen is made. A cheap model then makes the screens one at a time, each alone, so whatever two screens must agree on is decided once, in this plan. Reply with plain lines only: no markdown, no prose, no blank lines.

The first line is the core flow: the main path a user takes to reach the reason for this app, as 3 to 5 screen names from @home joined by →, each name once, e.g.
product.core-flow @home → @menu → @order-checkout → @order-status
Then up to 8 open rows, one per line: a key, a space, ?, a space, and the short question the row settles, e.g.
ui.nav ? main navigation

- A row is a rule several screens must match, such as how Back looks or what a color means. Never something one screen shows, such as the fields of one form or the content of one page, and never the screen's size: the app fixes that.
- Use these keys when they fit: ui.nav (main navigation), ui.back (the label Back shows and where it sits), ui.forms (how forms and their buttons are laid out), ui.lists (how lists and their items look), ui.toggles (switches or checkboxes), ui.colors (what colors mean), ui.charts (how data is drawn), ui.map (how the map, its pins and zoom work), ui.hud (what stays on screen during play).
- Make up a key only when none of these fits: ui. and 1-3 lowercase words joined by dashes, e.g. ui.filters. Never a second name for one listed above.
- A fact that several screens show and could get wrong, such as what a score means or which units a value uses, is a data. row, e.g. data.units ? which units distances use.
- A screen name is 1-4 lowercase words joined by dashes.
- Each line is at most 120 characters. Ask only what this app needs: fewer rows beat filler.
```

## Changing it

The code copy is `PLANNER_PROMPT` in `src/packages/core/src/plan.ts`; `src/tests/spec.test.ts`
fails when the two differ. Plan calls are in the server cassette, so after a change run
`bun run test:record`. [The planner test](../process/journal/2026-11-05-planner-test.md) has the
script that compares plans across apps and models.
