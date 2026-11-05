## UX Woz

*UX Woz* stands for *UX Wizard of Oz*, inspired by the [Wizard of Oz prototyping technique](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment), where a human secretly simulates a system's behavior. UXWoz replaces the human wizard with AI, generating interactive user interfaces on demand as users explore them.

## Run it

You need [bun](https://bun.sh) and a root `.env` with `OPENROUTER_API_KEY` (Claude Haiku, the
default) and `OPENAI_API_KEY` (the two GPT models). All `bun` commands run from `src/`.

```bash
cd src && bun install && bun run dev
```

Open http://127.0.0.1:3000, type a product idea (or pick a template), and click around: each new
screen comes as two designs side by side, A OR B; click the one you like to keep it. A click on a
blue control inside a screen makes the next screen below it. Change a screen with the buttons to
its right: ✎ Edit, ↻ Regenerate, ↶ Undo, ⓘ Info, ✕ Delete. `PORT=3001 bun run dev` picks another port.

Generated screens are cached in `temp/screen-cache.json`. To make a mockup again from scratch,
open it and choose **Start over** in the project menu (top left); **Delete** removes it. To clear the whole cache, stop the server,
move the file aside, and start it again: a running server keeps its cache in memory and writes it
back.

If an edit to `canvas.ts` does not show up after a reload, restart `bun run dev`: the live reload
sometimes keeps an old copy of it.

If the page shows "Failed to load bundled module" after new code arrives, restart `bun run dev`:
the live reload cannot add a new frontend file.

## Test it

```bash
cd src && bun test
```

The tests replay recorded model replies from `cassettes/` and make no API calls. After changing the
prompt or the request shape, re-record them (live calls, a few cents):

```bash
cd src && bun run test:record
```

`bun run typecheck` checks the types. The Python UI generation benchmark has its own instructions in
[benchmarks/README.md](benchmarks/README.md).

## Project layout

```
spec/        what the app does: behavior, UI generation, code contract, prompts
src/         the app (bun workspace): packages/core (engine), packages/web (server + page), tests/, scripts/ (live experiments)
cassettes/   recorded model replies the tests replay
benchmarks/  the lite UI generation benchmark (Python) and its data
process/     product brief, writing style, journal
temp/        local scratch, ignored by git (the screen cache lives here)
```
