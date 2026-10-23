## Canonical docs by purpose

| Need | Go to |
|---|---|
| What the user sees, what the system does | [spec/behavior.md](spec/behavior.md) |
| How a screen is generated: HTML + Pico format, rendering, models | [spec/ui-generation.md](spec/ui-generation.md) |
| Types, env vars, exit codes | [spec/code-contract.md](spec/code-contract.md) |
| LLM prompts | `spec/prompt-{*}.md` |
| How to run anything (CLI / web / tests) | [README.md](README.md) |
| How to write any markdown you add | [process/writing-style.md](process/writing-style.md) |
| Past decisions and status reports | [process/journal/](process/journal/): read, don't rewrite |

## Explaining things in chat: KISS

When you answer the user in chat (status updates, failure reports, "why did X happen"), keep it simple:

- Lead with the one-sentence answer. Details only if they change what the user does next.
- Plain words, no developer jargon. If a mechanism needs explaining, use an everyday analogy ("the run got a guest badge, not the house key").
- For "what happened" questions, give a numbered timeline: one short line per event.
- Answer the question asked, then stop. No extra context, no side findings unless asked.

## Stack

- **TypeScript everywhere** (CLI, core, web).
- **Runtime + package manager: bun**, always. All `bun` commands run from `src/` (that's where `package.json` lives). Bun executes TypeScript natively (no separate compile step).
- **Monorepo** via bun workspaces; packages live under `src/packages/`.
- **Dependency stability**: `minimumReleaseAge = 604800` (7 days) in `src/bunfig.toml`.

## Layout, stack & process

The repo is organized by **lifecycle**, not by file type: see the tree in [README.md](README.md#project-layout). Why the boundaries fall where they do:

- **`src/` holds the JS config** because `package.json` is coupled to the code it builds, and Node module resolution walks *up*, so anything importing dependencies (app code *and* step defs) must live under the dir that holds `node_modules/`. That makes `src/` a single deployable unit you can copy and run.
- **`.feature` files live in `spec/`; app step defs in `src/tests/`, package step defs in the package**: the same spec/implementation split as `spec/behavior.md` + `spec/code-contract.md` ↔ `src/packages/`. Step defs read fixtures from `spec/test-cases/` by plain file path (data reads, unlike imports, cross directories freely).
- **`src/` root files are permanent** (`package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `cucumber.js`) (not regenerable from `spec/`, not deletable. Only `src/`'s *subdirs* (`packages/`, `tests/`) are regenerable. `bun.lock` *is* the spec of the dependency tree) versions are never duplicated into `spec/`; when a specific pin is load-bearing, `spec/code-contract.md` records *that* it is pinned and why, not the number.
- **`cassettes/` (root) is recorded data, never code**: the LLM responses the test suite replays, one JSON per feature. Machine-recorded, so not `spec/`; not regenerable from spec (re-recording needs a live API key, costs money, and fresh outputs can stop matching committed goldens), so not `src/` either. Refresh deliberately with `bun run test:record`; never delete casually.
- **`benchmarks/` (root) is data + outputs, never importing code**: the model & batch-size benchmark's pricing table, ground truth, sweep results, and generated charts. Its runner is a workspace package (`src/packages/bench`, `@tamedtable/bench`) because it imports the engine and so must live under `src/` (the module-resolution rule above); the runner reads `benchmarks/` by plain path, the same way step defs read `spec/` fixtures. Keeping the data at the root: like `process/` and `marketing/`. Keeps `src/` a clean deployable unit.
- **Exception: the UI generation benchmark** in `benchmarks/` is a self-contained Python tool (FastAPI + Playwright, run with `uv`), not a workspace package: it imports no app code, and its checks were validated against the archived full benchmark. See [benchmarks/README.md](benchmarks/README.md).
