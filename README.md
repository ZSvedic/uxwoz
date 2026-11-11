## UX Woz

*UX Woz* stands for *UX Wizard of Oz*, inspired by the [Wizard of Oz prototyping technique](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment), where a human secretly simulates a system's behavior. UXWoz replaces the human wizard with AI, generating interactive user interfaces on demand as users explore them.

## Run it

You need [bun](https://bun.sh) and a root `.env` with `OPENROUTER_API_KEY` (Claude Haiku, the
default) and `OPENAI_API_KEY` (the two GPT models, and GPT-6.1 Terra, which files every decision
into the boxes and tidies them as the fixer). All `bun` commands run from `src/`.

```bash
cd src && bun install && bun run dev
```

Open http://127.0.0.1:3000, type a product idea (or pick a template), and click around: each new
screen comes as two designs side by side, A OR B; click the one you like to keep it. A click on a
blue control inside a screen makes the next screen below it. Change a screen with the buttons to
its right: ✎ Edit, ↻ Regenerate, ↶ Undo, ⓘ Info, ✕ Delete. `PORT=3001 bun run dev` picks another port.

To look around without keys or your own mockups, `bun run demo` starts the app on a temporary copy
of a made-up mockup at http://127.0.0.1:3100 (`PORT` picks another) and prints its share links. It
reads no `.env`, so anything that needs a model fails there.

Right of the first screen, side by side, are four boxes: **Rules**, **Fixer's notes**,
**Components** (parts that look the same on every screen that has them; screens paste them by ID)
and **Data**. Every model call reads Components, Rules and Data. After each pick or Edit, filing
adds what the decision settled, in the background; the screen's Info says what it filed. Edit a
rule or a table cell by clicking it; the toolbar's Rules, Fixer, Components and Data buttons move
the view to each box, and **Export the boxes** in the project menu writes them as markdown. Every 5
picks the fixer visits: it merges doubles, removes what no screen needs and redraws up to 5
screens, and Fixer's notes lists each change with an Undo. Each box has a rail like a screen's: **+ Rule**
(in place), **▶ Visit now** or **+ Table** (in place), then **✎ Edit** (the drawer: ask the fixer for
a change in that box, and its past changes), **↶ Undo** (the box as it was before its last change)
and **ⓘ Info**. The Theme menu is in the toolbar.

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

`bun run check` runs the tests and then the typecheck.

The tests replay recorded model replies from `cassettes/` and make no API calls. After changing the
prompt or the request shape, re-record them (live calls, a few cents):

```bash
cd src && bun run test:record
```

`bun run typecheck` checks the types.

## Check voice

`bun test` cannot check voice input: that needs a microphone. A script checks it by hand on a Mac,
with the app running and a mockup with a screen in it:

```bash
cd src && bun scripts/voice-check.ts --url http://localhost:3000 --say "Hey Woz, use switches." --voice Samantha
```

It makes the clip with macOS `say`, starts a separate Google Chrome with its own profile (yours is
never touched), opens the app, turns the microphone on and plays the clip through the speakers
(`--player`, `afplay` by default). It prints what Chrome heard, what the label showed and the Edit
field, then `PASS: the Edit was sent: "…"` or `FAIL:` with the link that broke. It stops every POST to
`/api/` (the Edit, a new screen, the warm-up) before it reaches the server, so a run costs nothing. It
closes its Chrome and deletes the profile even on Ctrl-C; `--keep` keeps the clip and the profile.

It needs a quiet room and speakers the microphone can hear. Chrome sends the audio to Google, as its
voice input always does. The clip plays through the speakers because Chrome's fake microphone
(`--use-file-for-fake-audio-capture`) does not reach speech recognition in Chrome 157.

## Put it on GitHub

The repo has no remote yet. Git history holds no key (checked on 2026-11-11), `.env` and `temp/` are
ignored, and the tracked files come to about 2 MB. With the `gh` CLI signed in, from the repo root:

```bash
gh repo create uxwoz --private --source=. --remote=origin --push
```

That makes a private repo under your account, adds it as `origin` and pushes `main`. Later pushes are
`git push`. To make it public, first choose a licence for the code (the font's OFL and Pico's MIT
licence files are already in the tree) and decide whether `process/` and `cassettes/` go with it.

## Host it

The app is one Bun process that writes one JSON file, so it needs one always-on machine with a disk:
[Fly.io](https://fly.io) with a 1 GB volume, about $4 a month. `Dockerfile` and `fly.toml` are in the
repo root. Hosts with no disk (Vercel, Cloudflare Workers) cannot keep the cache file.

```bash
brew install flyctl
```

```bash
fly auth login
```

```bash
fly apps create uxwoz
```

If the name is taken, pick another and change `app` in `fly.toml` to match.

```bash
fly volumes create uxwoz_data --region fra --size 1
```

```bash
fly secrets set --stage OPENROUTER_API_KEY=... OPENAI_API_KEY=... UXWOZ_OWNER=...
```

Take the two keys from `.env`. `UXWOZ_OWNER` is a long password you make up: only a browser that
opened `/?owner=<that password>` once can use the app and spend model credits.

```bash
fly deploy --ha=false
```

Open `https://uxwoz.fly.dev/?owner=<that password>`. Share links then start with that address. To
bring your local mockups along, copy the cache up before you make anything on the host (the upload may
refuse to replace a file that is already there), then restart:

```bash
fly ssh sftp put temp/screen-cache.json /data/screen-cache.json
```

```bash
fly apps restart uxwoz
```

Fly keeps a daily snapshot of the volume for five days. A deploy restarts the one machine, so the app
is away for a few seconds. `GET /healthz` answers `ok` for the host's check.

## Project layout

```
spec/        what the app does: behavior, UI generation, code contract, prompts
src/         the app (bun workspace): packages/core (engine), packages/web (server + page), tests/, scripts/ (run by hand)
cassettes/   recorded model replies the tests replay
process/     product brief, writing style, journal
temp/        local scratch, ignored by git (the screen cache lives here)
```
