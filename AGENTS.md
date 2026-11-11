## Canonical docs by purpose

| Need | Go to |
|---|---|
| What the user sees, what the system does | [spec/behavior.md](spec/behavior.md) |
| How a screen is generated: HTML + Pico format, rendering, models | [spec/ui-generation.md](spec/ui-generation.md) |
| Packages, HTTP API, frame messages, types, env vars, tests | [spec/code-contract.md](spec/code-contract.md) |
| The LLM prompt | [spec/prompt-screen.md](spec/prompt-screen.md) |
| How to run, test, re-record | [README.md](README.md) |
| How to write any markdown you add | [process/writing-style.md](process/writing-style.md) |
| The product idea | [process/uxwoz-product-brief.md](process/uxwoz-product-brief.md) |
| Past decisions and status reports | [process/journal/](process/journal/): read, don't rewrite |

Start a session with the latest file in `process/journal/`: it says where the work stands.

## Explaining things in chat: KISS

When you answer the user in chat (status updates, failure reports, "why did X happen"), keep it simple:

- Lead with the one-sentence answer. Details only if they change what the user does next.
- Plain words, no developer jargon. If a mechanism needs explaining, use an everyday analogy ("the run got a guest badge, not the house key").
- For "what happened" questions, give a numbered timeline: one short line per event.
- Answer the question asked, then stop. No extra context, no side findings unless asked.

## Stack

- **TypeScript everywhere**, no runtime dependencies. **bun** is the runtime, package manager and test runner; run every `bun` command from `src/`.
- **Monorepo** via bun workspaces under `src/packages/`. `minimumReleaseAge = 604800` (7 days) in `src/bunfig.toml`.
- API keys live in the root `.env`, read by the server and by `test:record` (`bun --env-file=../.env`).

## Code map

```
src/packages/core/src/       engine; frame.ts, keys.ts and tree.ts also run in the browser
  models.ts      the 3 screen models and Terra (background, filing), call settings, prices
  prompt.ts      system prompt (the canvas manual verbatim + how to reply) and the user messages: the paper
                 (titles, lines, boxes), then Draw, Edit or File (a copy of spec/prompt-screen.md; a test keeps them equal)
  providers.ts   streaming clients: OpenRouter (Haiku), OpenAI Responses (Luna, Sol, Terra); a call's cost once
                 however it ends (`spent`), a live call captured (`record`), a `recorded` one replayed with its timing
  generate.ts    one design: stream, 20 s deadline, cost, name and idea, refuse cut-off replies
  starters.ts    the eight starters: id, label, kind, device, prompt (data only, also in the browser)
  recordings.ts  server only: recordings/<id>.json read, the design for a screen's nth draw, Home's filing by side,
                 promptHash and startersCurrent, what a recording lacks
  filing.ts      filing: number a screen's parts, ask Terra (also for the fixer), parse its lines, apply them to
                 the boxes with refusals
  fixer.ts       the fixer's visit: the paper and the screens new since the last one, parse its lines, apply them
                 with refusals and an Undo per change; the redraws are left to the server
  keys.ts        cache keys: a link by @name, normalize a prompt, "home" means the first screen, `back`; box limits and IDs,
                 states kept, visits kept and how often; a Data table as markdown
  tree.ts        the tree, worked out: links in each screen (components pasted), @names, planned screens,
                 shortest-path levels, the titles and lines of the paper
  cache.ts       screen cache, the screens (ScreenCacheBase): entry and version types, find by name, proposals
                 (the open A OR B) and pick, versions and undo, parents, delete with pruning, apps, sharing data,
                 the JSON file (load, format, save)
  cache-boxes.ts screen cache, the boxes (ScreenCache extends the base): components as entries, rules, tables,
                 limits, IDs, a box's states, Past and Undo, the fixer's notes and their Undo, markSeen, the paper
  frame.ts       srcdoc page for a screen + our in-frame script (clicks, height, scroll, vh fix, picking and locating
                 a part for a comment); devices and their size;
                 name, idea; paste by ID and the current link
  zip.ts         a zip of stored entries (CRC-32, central directory), for Export project
src/packages/web/src/
  export.ts      GET /api/export: a mockup as a zip for a coding or design agent (handoff, README with the tree,
                 the boxes, one page per drawn screen whose links work from disk)
  server.ts      Bun.serve: /api/config, /api/screen (NDJSON, A OR B at once), /api/pick, /api/revise, /api/undo,
                 /api/map (wait=1 for filing and a visit), /api/apps, /api/delete, /api/delete-app,
                 /api/box (also undo, a box's Undo and Edit, Visit now), /api/warmup, /api/backup, themes; request checks; a visit every 5 picks
  drawing.ts     the work behind the routes: filing and visits in one chain per mockup (a click waits for it), a
                 visit's redraws as Edits; a screen's stream (A OR B at once, a revise) as NDJSON
  app.ts         browser entry: builds the canvas and the boxes, opens, closes and deletes a mockup, init
  state.ts       browser: the shared state, local storage, elements by id, Enter sends a form
  screens.ts     browser: views (a card's name) and draw, A OR B streaming, refit and pick, clicks (@names, back), Regenerate, Edit,
                 Undo, delete
  nav.ts         browser: the current screen, ← → trail, the map after filing, Nav
  drawer.ts      browser: box changes and rail tools, the drawer (Edit, Info, and Comments for a screen) for a screen or a box
  toolbar.ts     browser: generate panel and pickers, toolbar menus (Theme too), Recent, zoom and its keys
  net.ts         browser: fetches and NDJSON streams, a streaming frame, theme CSS, the red pill and the hint
  voice.ts       browser: voice input's state machine (wake phrase as Chrome hears it, what was heard, countdown,
                 stop, cancel; no DOM, tested) and speech recognition that restarts itself and says why it stops
  voice-ui.ts    browser: the microphone button, the label with what was heard, the words in the drawer's Edit
                 field, Sending in 3… and Cancel
  canvas.ts      browser: the boxes right of Home, the tree layout (packed rows, ropes that bend in the gap), cards and frames, A OR B sides,
                 rails at the canvas's scale, pan and zoom, fits
  boxes.ts       browser: the Components, Rules, Data and Fixer's notes boxes and their rails, editing and adding in
                 place, Export
  share.ts       share links per role, the player's map, feedback (a name first; a visitor's own; Resolve) and
                 trips, an edit link's scope and cap, the owner's gate (UXWOZ_OWNER); `guard` wraps server.ts's routes
  sharing.ts     browser: the drawer's Share and feedback pane (a comment jumps to it), a screen's thumbs in Info,
                 an edit link's token on every API call
  comments.ts    browser: the owner's comments: pins over every drawn screen with open ones, the Comments tab with
                 Resolve and Reopen, the jump to a comment from its pin or the Feedback pane
  player.html, player.ts   the player at /s/<token>: one screen in its device frame, Back, the trail, the name card,
                 comments pinned to parts in the margin beside the screen, thumbs, Done, trips
  pins.ts        browser: a comment's anchor, the pin numbers of a screen's comments, the layer of pins over a frame
                 (the player's and the app's), the rows of the owner's Comments tab (no DOM, tested)
  index.html     the page around the canvas; links design/index.css
  design/        the look: tokens.css (every colour), base.css (shared by parts), one file per part (bar,
                 canvas, boxes, drawer, panel), motion.css; index.css imports them all; fx.ts (sparks, sounds, pickFx);
                 player.css (the player's, not in index.css), sheet.html and sheet.ts (the sheet at /design)
  design/brand/  the logo, the favicons (SVG, PNG, home screen), the three star tiles, Fredoka and its licence,
                 og.png (the share preview)
src/packages/web/themes/     pico.css (vendored), mockup.css (default theme, loaded after Pico)
src/tests/                   bun tests; cassette.ts replays cassettes/, no-network.ts blocks the rest
src/tests/fixtures/demo-cache.json   the demo mockup (a habit tracker); made by scripts/make-demo-cache.ts
src/scripts/make-demo-cache.ts   writes the demo mockup through ScreenCache, the same on every run
src/scripts/record-starters.ts   `bun run starters:record [id…]`: live calls through createServer on temporary
                             caches, writes recordings/<id>.json
recordings/                  the starters' recordings (spec/public.md, Recordings); copied into the image
src/scripts/demo.ts          `bun run demo`: the app on a temporary copy of the demo mockup, no keys, prints the URLs
src/scripts/backup.sh        run by hand or weekly by launchd: the host's cache from GET /api/backup into backups/ (git-ignored)
src/scripts/voice-check.ts   run by hand: a macOS voice says an Edit to a separate Chrome; PASS if the Edit was sent
```

## Do not read (large or generated)

`cassettes/*.json`, `recordings/*.json`, `src/packages/web/themes/pico.css`, `src/bun.lock`, `temp/`, and
`process/journal/` beyond its latest file. Search them with grep if you must.

## Layout rules

The repo is organized by lifecycle; the tree is in [README.md](README.md#find-your-way).

- **`src/` is the deployable unit**: `package.json` sits there, and module resolution walks up, so
  all code that imports packages (app and tests) lives under it. Its root files (`package.json`,
  `bun.lock`, `bunfig.toml`, `tsconfig.json`) are permanent; versions live in `bun.lock` only.
- **`spec/` says what, `src/` says how.** Tests read `spec/` by plain path (the prompt test does).
- **`cassettes/` is recorded data**: the model replies the tests replay, one JSON per test file.
  The prompt bytes are part of every key, so a prompt change means `bun run test:record` (live
  calls, a few cents). Never delete casually.
- **`temp/`** is git-ignored scratch; the dev server's screen cache lives there.

## Before you commit

From `src/`: `bun run check` (`bun test`, offline and quick, then the typecheck). In a fresh worktree
run `bun install --frozen-lockfile` from `src/` first. For UI changes, also look at the running app.
Bun's `--hot` server cannot pick up a newly added frontend file: restart it after adding one.

**Look at the app.** `PORT=3131 bun run demo` (3100 if no PORT) starts the app on a fresh temporary
copy of a made-up mockup, a habit tracker, and prints four URLs: the app, and the view, comment and
edit links. Start it in the background (your shell tool's background option, or `nohup … &`) and stop
it with `kill $(lsof -ti tcp:3131)`. Open the printed `127.0.0.1` URLs in a browser tab of your own and
pass its tabId on every call: other agents share the pane. The app opens on Recent: click the mockup.
A field's blur does not fire from script in a hidden pane, so click for real. It reads no `.env` and clears the model keys, so a model call
is impossible: a new screen, Edit, Regenerate, filing after a pick and a fixer visit fail by design.
You can still exercise the tree, the boxes (add, change, delete, Undo), Undo on Habit detail, the
fixer's Undo, picking the open A OR B on History, Delete, Share, Comments, Export, and the player:
walking the screens, thumbs, a new comment, Done. The pinned comment on Habit detail shows in the
player only for its visitor (the demo prints how). Frontend edits show on reload. The mockup is
`src/tests/fixtures/demo-cache.json`; to change it, edit `src/scripts/make-demo-cache.ts` and run it.

## Design

- **All CSS in `src/packages/web/src/design/` together stays under 700 lines and 52 KB, no file there over
  130 lines, colours only in `tokens.css`.** A change that crosses a cap removes something first.
  `tests/design.test.ts` checks it. To find the file for a look change: a colour is in `tokens.css`, a
  shape in the part's file, a rule two parts share in `base.css`, movement in `motion.css`.
- **No design tweak without a request.** Change colours, spacing, fonts, motion or sounds only when the
  user asked for that change. A bug fix keeps the look as it is.

## Before a change

Read the file you change and its line in the code map, plus the section of `spec/behavior.md` or
`spec/code-contract.md` it implements: search for it and read that section, not the whole file. Read
neighbours only when the change crosses into them.

## Parts

Seven parts. A change inside one part reads that part's files and no others; two builders work at the
same time only in different parts.

| Part | Files | Tests | Spec |
|---|---|---|---|
| Engine | core: `models`, `prompt`, `providers`, `generate`, `starters`, `recordings` | `generate-screen`, `cut-off`, `recordings` | `prompt-screen.md`, `ui-generation.md` |
| Cache | core: `cache`, `cache-boxes`, `keys`, `tree` | `cache`, `boxes`, `tree`, `demo-cache` | contract: Types |
| Server | web: `server`, `drawing`, `export`; core: `filing`, `fixer`, `zip` | `server`, `races`, `fixer`, `export` | contract: HTTP API |
| Canvas | web: `app`, `state`, `screens`, `nav`, `canvas`, `toolbar`, `net`; core: `frame` | `ropes`, `frame` | behavior: Toolbar to Rail, Navigation |
| Boxes and drawer | web: `boxes`, `drawer`, `voice`, `voice-ui` | `boxes`, `voice` | behavior: Drawer, Voice, Boxes |
| Sharing | web: `share`, `sharing`, `comments`, `pins`, `player.*` | `share`, `comments`, `pins` | behavior: Sharing |
| Design | web: `design/` | `design`, `fx` | **Design** above |

Facts that cost builders a search:

- On a canvas card `note` is the status line (*Making the change…*), and "notes" is the fixer's box.
- A card's name is `labelOf` in `screens.ts`; Nav, the drawer and Delete use it too.
- The player's map (`playerMap` in `share.ts`) lists drawn screens only, each with its `parent`, in no
  promised order. Share tokens are hex.
- `guard` in `share.ts` wraps every `/api` route: a route that takes `key` or `app` is already limited
  to an edit link's own mockup, view and comment links get 403, and `/api/apps` is cut there too.
- Components are cache entries. The player's map and the paper the models get copy named fields, so a
  new field on an entry stays private until you add it there.
- A click inside a screen's frame never reaches the page around it. The frame posts messages (see
  Frame messages in the contract); of the keys, only Escape and the zoom keys are passed on.

## How a request is built

The lead sizes the request, then runs builders (Opus, each in its own worktree). Measured on
2026-11-11: a small feature takes a builder 2 minutes, a medium one 3 to 5.

- **Small** (one part, about 50 lines): one builder, no plan file, no critic. The lead reads the diff,
  runs `bun run check`, merges.
- **Medium** (crosses parts, or a new route, or stored data): one builder, then one critic on the
  diff while the lead looks at the app. Fixes go back to the same builder.
- **Large**: cut it into medium steps by part. Steps in different parts run together, three at most;
  one critic reads two steps' diffs at once. Write a plan file only when the user must choose
  something first.

A critic gets the diff and the spec section, looks for behaviour that is wrong with a failing case
each, and is told to say so plainly when it finds nothing.

Pictures are slow to read. A builder checks the page by its text and by script, and takes two
screenshots at most; the lead looks once before merging. Design work is the exception.

The brief, under 1,500 characters:

```
You are a builder on UX Woz. Read AGENTS.md first and follow it. Part: <part>.
Feature: <what the user sees, in the user's words; the edge cases that matter; what must not change>.
Done means: the code; tests for <what>; the sentences in spec/<file>; the code map if a line is no
longer true; `bun run check` green; looked at with `PORT=<own port> bun run demo`; committed on your
worktree's branch (do not merge, do not push).
Rules: do not touch <files another builder has>; no design change beyond <x>; no prompt byte changes.
Report, short: what changed (files, lines), what you could not check, what slowed you down.
```
