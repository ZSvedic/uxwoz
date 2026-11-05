# 2026-11-05: planner test

Build step 2 of [the spec note](../plans/2026-11-05-spec-memory.md): does one small call write a
good plan, the core flow and the open rows, for any kind of app? Yes, with Sol. Haiku is just as
fast, so it would not shorten the wait, and it asks generic questions where Sol asks the ones
that make screens disagree.

## Result

Six app prompts, each planned 3 times by Sol and 3 times by Haiku: 36 plans. Every reply kept
the format, every line was under 120 characters, and every app got rows for its own conventions:
`ui.colors` and the date range for the dashboard, `ui.map` for the trail app, `ui.hud` for the game.

| | Sol (`gpt-6.1-sol-ultrafast`) | Haiku (`claude-haiku-5.5`) |
|---|---|---|
| Time to the full reply, median / max | 2.1 s / 4.6 s | 2.0 s / 2.6 s |
| Cost per plan, average | $0.019 (estimated) | $0.0002 |
| Rows per plan | 5 to 8 | 6 to 10, twice over the limit of 8 |
| Rows: known / made-up / `data.` | 75 / 12 / 44 | 104 / 4 / 35 |
| Flow steps | 3 to 5, the same flow in 3 of 3 runs for 2 apps | always 4, names vary per run |
| Keys in all 3 runs / all keys, per app | 5/12, 8/8, 6/10, 6/10, 3/8, 4/10 | 7/11, 6/9, 8/8, 6/11, 6/11, 4/10 |
| Rows that repeat the device width (390 or 1024 px) | 18 of 131 | 0 of 143 |
| Rows that copy the menu's wording for `ui.back` | 0 | 10 |

Code counts rows, line length, known against made-up names, keys shared across runs and the
device width. The rest of this entry is reading: whether a row fits, whether it belongs to one
screen, and whether the flow reaches the reason for the app.

Apps are NiceSnore, then the dashboard, map, game, desktop tool and kiosk, in the order above.
Unstable keys are mostly one question under two names (`data.score`, `data.snore-score`), so
the plans agree more than the key counts say.

## What reading found

- **Sol asks about the facts screens get wrong.** NiceSnore's score direction, the reason for
  the note, comes up in 3 of 3 Sol plans (*"is a higher score worse?"*) and 0 of 3 Haiku plans,
  which ask about range and bands. The dashboard gets what revenue includes, the kiosk whether
  the deposit is a hold, the game how upgrades change ship stats (`data.ship-state`).
- **Sol's made-up names are good, except `ui.layout`** (5 of its 12, see below). The rest:
  `ui.session` (kiosk timeouts, 3 of 3), `ui.search` and `ui.tags` (notes app), and one that
  doubles a known name: `ui.favourites` in map run 1, where runs 2 and 3 use `ui.toggles` for
  the same control.
- **Haiku fills the menu.** It writes `ui.back` and `ui.forms` for almost every app, often in the
  menu's own words (*"how Back looks and where it sits"*), and runs to the limit or past it.
- **The flows reach the point in 3 to 5 screens**, for both models. Sol's game flow loops back:
  `@home → @asteroid-field → @ore-market → @ship-upgrades → @asteroid-field`, which is the game's
  real loop but not a chain where each step sits under the one before.
- **Sol does not pick up NiceSnore's charts and toggles** (1 of 3 and 0 of 3) and spends rows on
  `data.` instead. A later pick or the review pass can add those rows.

Weak rows, quoted:

- Sol, dashboard: `ui.layout ? how the desktop layout stays within 1024 px across screens`. Size
  is code's; 5 Sol plans have `ui.layout`, and 18 rows repeat the width given in the request.
- Sol, kiosk: `data.progress ? when payment and room key issuance count as complete and retries
  avoid duplicates`. Back-end behavior, nothing a mockup shows.
- Sol, map: `data.location ? how is the nearby search location chosen and shared when location
  access is unavailable`. One screen's edge case.
- Haiku, kiosk: `ui.lists ? how matching bookings are listed when a name returns more than one
  reservation`. One screen's content.
- Haiku, game: `ui.toggles ? which switches exist in settings and how they look`. One screen.

## One plan per app (Sol, run 1)

```
product.core-flow @home → @recording → @sleep-summary → @history
ui.nav ? how recording, history and remedy log share navigation on phones up to 390 px wide
ui.back ? where Back appears and how it behaves during an active recording
ui.lists ? how sleep sessions and remedy entries share row layout and tap targets
ui.colors ? which colors mean recording, paused, complete and microphone unavailable
data.recording ? which recording states and start, pause and stop actions phone and watch share
data.score ? what the snore score measures, its range and whether higher means worse
data.units ? how dates, overnight sessions, durations and snoring time are displayed consistently
data.device-sync ? how phone and watch identify the recording source and show sync status without duplicate sessions

product.core-flow @home → @sales-report → @top-products → @inventory
ui.nav ? Which persistent desktop navigation links connect dashboard, sales, products and inventory?
ui.layout ? How do shared page widths, spacing and grids fit a desktop window no wider than 1024 px?
ui.charts ? How are revenue and order trends, axes, tooltips and empty states drawn consistently?
ui.lists ? How do shared tables handle column alignment, sorting and clickable rows?
ui.colors ? Which colors consistently mean revenue growth, decline and low stock?
data.reporting ? Which date range, timezone and comparison period apply across all screens?
data.revenue ? Which currency is used, and does revenue exclude discounts, refunds, tax and shipping?
data.stock ? Does stock mean available-to-sell units, and what threshold triggers a low stock alert?

product.core-flow @home → @nearby-trails → @trail-details → @route-map
ui.nav ? how users move between nearby trails and favourites on a phone no wider than 390 px
ui.back ? where Back sits and how it returns while preserving trail selection and map position
ui.lists ? how trail rows show name, distance, difficulty and saved state
ui.map ? how maps show trails, current location, selected routes, recentering and zoom
ui.colors ? which colors consistently identify route difficulty, selected routes and current location
ui.favourites ? how the save control looks and keeps favourite state consistent across screens
data.units ? which units distances and elevation use, and how trail length differs from distance to the trailhead

product.core-flow @home → @asteroid-field → @ore-market → @ship-upgrades → @asteroid-field
ui.nav ? how flight, ore sales and ship upgrades connect within a phone layout at most 390 px wide
ui.back ? where Back sits in menus and how it returns to flight without losing progress
ui.hud ? where credits, cargo capacity, hull health and touch flight controls stay during play
ui.lists ? how ore sale rows and ship upgrade rows show prices, quantities and action buttons
ui.colors ? which colors mean ore types, credits, damage and unavailable actions
data.units ? which units ore quantities, cargo capacity, prices and ship stats use
data.economy ? how ore sale prices and upgrade costs affect the shared credit balance
data.ship-state ? how cargo, hull health and purchased upgrades persist between flight and station screens

product.core-flow @home → @search-results → @note-editor
ui.nav ? how folder navigation, quick search and note opening work within a desktop window up to 1024 px wide
ui.lists ? how note rows show titles, snippets, folders, tags and selection
ui.tags ? how tag chips look and open filtered note lists
data.organization ? whether each note belongs to one folder and can have multiple tags
data.search ? whether quick search matches note titles, Markdown content, folders and tags

product.core-flow @home → @find-booking → @confirm-booking → @pay-deposit → @get-room-key
ui.nav ? how users see check-in progress without skipping required steps
ui.back ? where Back sits and when returning to a previous step is allowed
ui.forms ? how large inputs, touch targets, keyboards, errors, and primary buttons are arranged
ui.layout ? how screens share a desktop layout capped at 1024 px wide
ui.session ? how inactivity warnings, timeouts, and restarting protect guest information
data.booking ? which guest, stay, and booking details stay consistent across steps
data.payment ? which currency and deposit amount appear, and whether the deposit is a hold or a charge
```

## How it ran

[src/scripts/planner-test.ts](../../src/scripts/planner-test.ts) calls `streamModel` directly
with its own system prompt (`run <model> <times>`, then `check`). The screen prompt, the app and
the cassettes are untouched. The request is the app prompt and the app's device line, e.g.
*"Design it for a phone screen, at most 390 px wide."* The five new app prompts:

- *A sales dashboard for a small online shop: revenue, orders, top products and low stock alerts* (desktop)
- *A trail map app for hikers: find trails near me, follow the route on a map, save favourites* (phone)
- *A space mining game where you fly a small ship between asteroids, upgrade it and sell the ore* (phone)
- *A markdown notes app for my desktop with folders, tags and quick search* (desktop)
- *A self check-in kiosk for a hotel lobby: find your booking, pay the deposit, get your room key* (desktop)

The planner prompt, as sent:

```
You plan a clickable mockup before its first screen is made. A cheap model then makes the screens one at a time, each alone, so whatever two screens must agree on is decided once, in this plan. Reply with plain lines only: no markdown, no prose, no blank lines.

The first line is the core flow: the main path a user takes to reach the reason for this app, as 3 to 5 screen names from @home joined by →, e.g.
product.core-flow @home → @menu → @order-checkout → @order-status
Then up to 8 open rows, one per line: a key, a space, ?, a space, and the short question the row settles, e.g.
ui.nav ? main navigation

- A row is a rule several screens must match, such as how Back looks or what a color means. Never something one screen shows, such as the fields of one form or the content of one page.
- Use these keys when they fit: ui.nav (main navigation), ui.back (how Back looks and where it sits), ui.forms (how forms and their buttons are laid out), ui.lists (how lists and their items look), ui.toggles (switches or checkboxes), ui.colors (what colors mean), ui.charts (how data is drawn), ui.map (how the map, its pins and zoom work), ui.hud (what stays on screen during play).
- Make up a key only when none of these fits: ui. and 1-3 lowercase words joined by dashes, e.g. ui.filters. Never a second name for one listed above.
- A fact that several screens show and could get wrong, such as what a score means or which units a value uses, is a data. row, e.g. data.units ? which units distances use.
- A screen name is 1-4 lowercase words joined by dashes.
- Each line is at most 120 characters. Ask only what this app needs: fewer rows beat filler.
```

## Verdict

Yes: the plan is good enough to build on, and it should stay on Sol. Haiku takes the same 2
seconds, so it would not make the first screen wait less. It costs a hundredth as much, but
it fills the menu and misses the facts that make screens disagree. Sol costs about 2 cents and
takes 2 seconds, as the note expected, with one call at 4.6 s.

Changes the note needs:

- **The plan gets the device by kind, not its width**, and the prompt says size is code's. Sol
  turned the width into `ui.layout` rows and wrote it into 18 questions.
- **The core flow has no repeated name.** Code cuts the chain at the first repeat.
- **Code keeps the first 8 rows** and drops the rest, as it does for long lines.
- **The Example's plan** shows `ui.charts` and `ui.toggles`; Sol's real NiceSnore plan asks
  `data.score` and the recording states instead. The example could quote a real plan.
