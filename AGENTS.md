## Canonical docs by purpose

| Need | Go to |
|---|---|
| What the user sees, what the system does | [spec/behavior.md](spec/behavior.md) |
| How a screen is generated: HTML + Pico format, rendering, models | [spec/ui-generation.md](spec/ui-generation.md) |
| Packages, HTTP API, frame messages, types, env vars, tests | [spec/code-contract.md](spec/code-contract.md) |
| The public: people, the meter, sign-up, the admin's routes, recordings | [spec/public.md](spec/public.md) |
| The LLM prompt | [spec/prompt-screen.md](spec/prompt-screen.md) |
| How to run, test, re-record | [README.md](README.md) |
| How to write any markdown you add | [process/writing-style.md](process/writing-style.md) |
| The product idea | [process/uxwoz-product-brief.md](process/uxwoz-product-brief.md) |
| Past decisions and status reports | [process/journal/](process/journal/): read, don't rewrite |

Start a session with the latest file in `process/journal/`: it says where the work stands.

**Words.** A person reads *mock* (one screen), *project* (the whole thing) and *UXWoz*. Code, routes
and types keep the older names: a mock is a `screen`, a project an `app` or `mockup`.

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

One line a file: what it owns. Keep it that short; details belong in the file's own header comment.

```
src/packages/core/src/       engine; frame.ts, keys.ts and tree.ts also run in the browser
  models.ts      the 3 screen models and Terra (filing, the fixer), call settings, prices
  prompt.ts      the system prompt and the user messages (the paper, then Draw, Edit, File, Visit); a copy of
                 spec/prompt-screen.md, kept equal by a test
  providers.ts   streaming clients (OpenRouter, OpenAI); `allow` before a live call, `spent` after, record and replay
  generate.ts    one design: stream, 20 s deadline, cost, name and idea, refuse cut-off replies
  starters.ts    the seven examples: id, label, prompt (data only)
  recordings.ts  recordings/<id>.<device>.json: a recorded mock's two designs, Home's filing, promptHash
  filing.ts      filing: number a screen's parts, ask Terra, parse its lines, apply them to the boxes
  fixer.ts       the fixer's visit: its paper, parse its lines, apply them with an Undo per change
  keys.ts        cache keys, @names, normalize, `back`; box limits and IDs; how many states, versions, visits are kept
  tree.ts        the tree worked out: links, planned screens, shortest-path levels, the paper's titles and lines
  cache.ts       the screens: entries and versions, Undo and Redo, draws, settle, rename, delete, the JSON file (v6), IDs
  cache-boxes.ts the boxes: components as entries, rules, tables, a box's states and Undo, the fixer's notes, the paper
  frame.ts       the page inside a mock's frame and its script (clicks, scroll, pinch, parts for comments); the sizes
  zip.ts         a zip of stored entries, for Export project
src/packages/web/src/        the server
  server.ts      Bun.serve and every route's entry; request checks; each route works on the request's desk
  drawing.ts     the work behind the routes: one design a stream, settle, filing and visits in one chain, replays
  desks.ts       a desk per person: their cache and drawing, opened on demand, closed when idle
  public.ts      public mode: who a request is, the gate (roles, the meter, one at a time), /api/me, steps
  people.ts      people and money over bun:sqlite: sessions, the meter, codes, caps, steps, share index; no routes
  account.ts     /api/signin, verify, signout, delete-account, ask; the owner's mail of requests
  admin.ts       /api/admin, /admin, /privacy
  mail.ts        mail through Resend and the emails' texts
  share.ts       share links per role, the player's map, feedback and trips, an edit link's scope and budget,
                 the owner's gate; `guard` wraps every route
  export.ts      /api/export: a project as a zip for a coding agent
  tour.ts        the tour read from tour/ at each request; `isTour`, refused by every changing route
src/packages/web/src/        the page
  app.ts         entry: builds the canvas, opens a project or the tour, what `/` opens, Start over, Delete
  state.ts       the shared state, local storage, elements by id
  canvas.ts      the canvas: tree layout and ropes, cards, the boxes' place and size, 100% and zoom, the glide, touch
  screens.ts     a mock's life: draw and stream, clicks in a mock, Another, Edit, Undo, delete; `labelOf`
  nav.ts         the current mock or box, ← → steps, the address followed, the map after filing
  address.ts     the address read and written (/m/…, box-…, /tour/…), the steps (no DOM, tested)
  bar.ts         the top bar, the name's dropdown, the zoom menu and keys; `treeRows`, `sizeFor` (no DOM, tested)
  menu.ts        the menu panel and New project; Export project
  cards.ts       the cards a mock, box or component flips to (Edit, History, Info, Describe it differently); `boxOp`
  flip.ts        what the cards say (no DOM, tested)
  boxes.ts       the four boxes: their entries, editing in place
  voice.ts       hold to talk: `Talk` (no DOM, tested), the speech recognition, the 🎙️ button
  net.ts         fetches and NDJSON streams, theme CSS, the red pill, hints, the note while drawing
  account-ui.ts  the public's account line and card; what each shows as functions (no DOM, tested)
  sharing.ts     the menu's Share and Feedback pages, an edit link's token on every call
  comments.ts    the owner's comments: pins on the canvas, the list in Info, the jump to one
  pins.ts        anchors, pin numbers, the pin layer, the player's frame size and trail (no DOM, tested)
  player.html, player.ts       the player at /s/<token>
  admin.html, admin-page.ts    the admin's page
  index.html, privacy.html     the app's page, the privacy page
  design/        the look: tokens.css (every colour), base.css, one file per part, motion.css, index.css;
                 fx.ts (sound); player.css and admin.css apart; sheet.html and sheet.ts (/design); brand/ (logo, icons)
src/packages/web/themes/     pico.css (vendored), mockup.css (the sketch theme)
src/tests/                   bun tests; cassette.ts replays cassettes/, no-network.ts blocks the rest;
                             fixtures/demo-cache.json is the demo project
src/scripts/                 demo.ts (`bun run demo`), make-demo-cache.ts, record-starters.ts
                             (`bun run starters:record [id…] [--device <id>]`), backup.sh
recordings/                  the examples' recordings, 28 files; copied into the image
tour/                        the tour's four mocks and boxes, edited by hand; copied into the image
```

## Do not read (large or generated)

`cassettes/*.json`, `recordings/*.json`, `src/packages/web/themes/pico.css`, `src/bun.lock`, `temp/`,
`backups/`, `process/plans/` (finished plans), and `process/journal/` beyond its latest file. Search
them with grep if you must.

## Layout rules

The repo is organized by lifecycle; the tree is in [README.md](README.md#find-your-way).

- **`src/` is the deployable unit**: `package.json` sits there, and module resolution walks up, so
  all code that imports packages (app and tests) lives under it. Its root files (`package.json`,
  `bun.lock`, `bunfig.toml`, `tsconfig.json`) are permanent; versions live in `bun.lock` only.
- **`spec/` says what, `src/` says how.** Tests read `spec/` by plain path (the prompt test does).
- **`cassettes/` is recorded data**: the model replies the tests replay, one JSON per test file.
  The prompt bytes are part of every key, so a prompt change means `bun run test:record` (live
  calls, a few cents) and `bun run starters:record` (20 cents). Never delete casually.
- **`temp/`** is git-ignored scratch; the dev server's screen cache lives there.
- **The image takes only what `.dockerignore` lets in** (`src`, `recordings`, `tour`). A new top-level
  folder the server reads must be added there and in the `Dockerfile`, or the deploy fails.

## Before you commit

From `src/`: `bun run check` (`bun test`, offline and quick, then the typecheck). In a fresh worktree
run `bun install --frozen-lockfile` from `src/` first. For UI changes, also look at the running app.

**Look at the app.** `PORT=3131 bun run demo` (3100 if no PORT) starts the app on a fresh temporary
copy of a made-up project, a habit tracker, and prints four URLs: the app, and the view, comment and
edit links. Start it in the background and stop it with `kill $(lsof -ti tcp:3131)`. Open the printed
`127.0.0.1` URLs in a browser tab of your own and pass its tabId on every call: other agents share
the pane. Close your tab when you are done: the pane holds about nine.

- It reads no `.env` and clears the model keys, so a model call is impossible: a new mock, Edit,
  Another, Draw again, filing and a fixer visit fail by design.
- You can exercise the tree, the boxes (add, change, delete, Undo), the cards (Edit, History with
  Undo and Redo on Habit detail, Info), the fixer's Undo, the tour at `/tour`, Delete, Share,
  Feedback, Export, and the player (walking, thumbs, a new comment, Done).
- For live calls use the launch entry `uxwoz-rework` (port 3210, its own cache in `temp/`).
- **A server started before your edit serves the old page.** Restart it, then look.
- The pane cannot click inside a frame the canvas has scaled (send the frame's message by script, or
  zoom to 100% first), pinch, show `confirm()` or `prompt()`, or save a download. A background tab
  paints frames white and pauses animation: front the tab, or check by script.
- The demo project is `src/tests/fixtures/demo-cache.json`; to change it, edit
  `src/scripts/make-demo-cache.ts` and run it.

## Design

- **All CSS in `src/packages/web/src/design/` together stays under 700 lines and 52 KB, no file there over
  130 lines, colours only in `tokens.css`.** A change that crosses a cap removes something first.
  `tests/design.test.ts` checks it. To find the file for a look change: a colour is in `tokens.css`, a
  shape in the part's file, a rule two parts share in `base.css`, movement in `motion.css`.
- **One look.** There is no night look: nothing may depend on `prefers-color-scheme`.
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
| Server | web: `server`, `drawing`, `desks`, `public`, `export`, `people`, `mail`, `admin`, `account`, `tour`; core: `filing`, `fixer`, `zip` | `server`, `races`, `fixer`, `export`, `desks`, `public`, `people`, `mail`, `admin`, `account`, `signin`, `replay`, `journey`, `bursts`, `tour` | contract: HTTP API, `public.md` |
| Canvas | web: `app`, `state`, `screens`, `nav`, `address`, `canvas`, `bar`, `menu`, `net`, `account-ui`; core: `frame` | `ropes`, `frame`, `bar`, `address`, `account-ui` | behavior: Top bar to A mock, Navigation |
| Boxes and cards | web: `boxes`, `cards`, `flip`, `voice` | `boxes`, `cards`, `voice` | behavior: The buttons under a mock, Voice, Boxes |
| Sharing | web: `share`, `sharing`, `comments`, `pins`, `player.*` | `share`, `comments`, `pins` | behavior: Sharing |
| Design | web: `design/` | `design`, `fx` | **Design** above |

Facts that cost builders a search:

- On a canvas card `note` is the status line (*Making the change…*), and "notes" is the fixer's box.
- The last of an entry's `versions` is the one showing; versions undone wait in `redo`.
- The player's map (`playerMap` in `share.ts`) lists drawn screens only, each with its `parent`, in no
  promised order. Share tokens are hex.
- `guard` in `share.ts` wraps every `/api` route: a route that takes `key`, `app` or `from` is already
  limited to an edit link's own project, view and comment links get 403, and the tour is refused.
- Components are cache entries. The player's map and the paper the models get copy named fields, so a
  new field on an entry stays private until you add it there.
- A click inside a mock's frame never reaches the page around it. The frame posts messages (see
  Frame messages in the contract); of the keys, only Escape and the zoom keys are passed on.
- In the tour (`state.tour`) the page sends no request that changes anything.
- To look at the public app: the launch entry `uxwoz-public` (port 3200, a temporary folder). With no
  `RESEND_API_KEY` the sign-in code is in the server's log. The owner's cookie is per host: be the
  owner on `localhost/?owner=letmein`, visitors on `127.0.0.1` and `<any>.localhost`.

## How a request is built

The lead sizes the request, then runs builders (Opus, each in its own worktree). A small feature
takes a builder 2 minutes, a medium one 3 to 5, a part's rewrite 10 to 15.

- **Small** (one part, about 50 lines): the lead does it, or one builder with no critic. `bun run
  check`, a look, merge.
- **Medium** (crosses parts, or a new route, or stored data): one builder, then one critic on the
  diff while the lead looks at the app. Fixes go back to the same builder.
- **Large**: cut it into medium steps by part. Steps in different parts run together, three at most;
  one critic reads two steps' diffs at once. Write a plan file only when the user must choose
  something first.

Rules that held on 2026-11-24, when ten builders rebuilt the app in an hour and a half:

- A builder's worktree can start behind: its first command is `git merge --ff-only <the lead's branch>`.
- Builders correct their lines in the code map and leave the Parts table to the lead.
- When two builders' steps overlap, merge the first, then send the second back to merge the lead's
  branch into its own and resolve: it knows its changes.
- A critic gets the diff and the spec section, looks for behaviour that is wrong with a failing case
  each, and says so plainly when it finds nothing. Never skip it: builders report green on work with
  real defects.
- Critics' findings go to one fix builder as numbered lists; it reports per number.
- When the work is merged, remove the worktrees and their branches.

Pictures are slow to read. A builder checks the page by its text and by script, and takes two
screenshots at most; the lead looks once before merging. Design work is the exception.

The brief, under 1,500 characters:

```
You are a builder on UX Woz. First run `git merge --ff-only <branch>`, then read AGENTS.md and follow it. Part: <part>.
Feature: <what the user sees, in the user's words; the edge cases that matter; what must not change>.
Done means: the code; tests for <what>; the sentences in spec/<file>; the code map if a line is no
longer true; `bun run check` green; looked at with `PORT=<own port> bun run demo`; committed on your
worktree's branch (do not merge, do not push).
Rules: do not touch <files another builder has>; no design change beyond <x>; no prompt byte changes.
Report, short: what changed (files, lines), what you could not check, what slowed you down.
```
