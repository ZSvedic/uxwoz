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
  providers.ts   streaming clients: OpenRouter (Haiku), OpenAI Responses (Luna, Sol, Terra)
  generate.ts    one design: stream, 20 s deadline, cost, name and idea, keep the first copy of a doubled reply,
                 cut prose before the title, refuse cut-off replies
  filing.ts      filing: number a screen's parts, ask Terra, parse its lines, apply them to the boxes with refusals
  keys.ts        cache keys: a link by @name, normalize a prompt, "home" means the first screen, `back`; box limits and IDs
  tree.ts        the tree, worked out: links in each screen (components pasted), @names, planned screens,
                 shortest-path levels, the titles and lines of the paper
  cache.ts       screen cache: find by name, proposals (the open A OR B) and pick, names, versions and undo, parents,
                 delete with pruning, the boxes (components as entries, rules, tables, limits, IDs), migration, JSON file
  frame.ts       srcdoc page for a screen + our in-frame script (clicks, height, scroll, vh fix); devices and their size;
                 name, idea; paste by ID and the current link
src/packages/web/src/
  server.ts      Bun.serve: /api/config, /api/screen (NDJSON, A OR B at once), /api/pick, /api/revise, /api/undo,
                 /api/map (wait=1 for filing), /api/apps, /api/delete, /api/delete-app, /api/box, /api/warmup, themes;
                 filing in the background, one per mockup, a click waits for it
  app.ts         browser: generate panel, A OR B streaming, refit and pick, clicks (@names, back), rail tools, drawer
                 (Edit, Info), the boxes' data and filing's result, toolbar menus and box buttons, ← → trail, errors
  canvas.ts      browser: the boxes column, the tree layout (packed rows, line lanes), cards and frames, A OR B sides,
                 rail, pan and zoom, fits
  boxes.ts       browser: the Components, Rules and Data boxes, editing in place, Export as markdown
  index.html, shell.css   the page around the canvas
src/packages/web/themes/     pico.css (vendored), mockup.css (default theme, loaded after Pico)
src/tests/                   bun tests; cassette.ts replays cassettes/, no-network.ts blocks the rest
src/scripts/                 live experiments, run by hand: paper-*.ts (the paper test, build step 1 of the paper canvas plan)
```

## Do not read (large or generated)

`cassettes/*.json`, `benchmarks/data/`, `src/packages/web/themes/pico.css`, `src/bun.lock`,
`temp/`. Search them with grep if you must.

## Layout rules

The repo is organized by lifecycle; the tree is in [README.md](README.md#project-layout).

- **`src/` is the deployable unit**: `package.json` sits there, and module resolution walks up, so
  all code that imports packages (app and tests) lives under it. Its root files (`package.json`,
  `bun.lock`, `bunfig.toml`, `tsconfig.json`) are permanent; versions live in `bun.lock` only.
- **`spec/` says what, `src/` says how.** Tests read `spec/` by plain path (the prompt test does).
- **`cassettes/` is recorded data**: the model replies the tests replay, one JSON per test file.
  The prompt bytes are part of every key, so a prompt change means `bun run test:record` (live
  calls, a few cents). Never delete casually.
- **`benchmarks/`** is a self-contained Python tool (FastAPI + Playwright, `uv`) that imports no app
  code; see [benchmarks/README.md](benchmarks/README.md).
- **`temp/`** is git-ignored scratch; the dev server's screen cache lives there.

## Before you commit

From `src/`: `bun test` (offline, under a second) and `bun run typecheck`. For UI changes, also look
at the running app. Bun's `--hot` dev server cannot pick up a newly added frontend file: restart
`bun run dev` after adding one.
