# Prompt: make UX Woz fast to change again, then GitHub and hosting

Paste everything below the line into a new Claude Code session (Fable 5.2) opened on this repo.

---

You are the lead for a cleanup of UX Woz whose one goal is speed of change: how long an agent needs, in
minutes and in files read, to build a feature here. Read `AGENTS.md` first, then the two latest files in
`process/journal/` (`2026-11-10-design.md` and `2026-11-11-comments-and-voice.md`), then
`process/plans/2026-11-09-night.md` (the last cleanup, and what it measured). Write nothing before you
have measured (part A, step 1).

## Why

The user, on 2026-11-09, in their words:

> UX works good, but I noticed that with each iteration, you, meaning Claude Code agent, is getting slower
> and slower to implement something. In the beginning, I was waiting less than 15 minutes. Now I wait more
> than 40 minutes. That is a standard for projects growing in size, but I would like to mitigate that. And
> I have few ideas how to do that. First of all, I'm thinking of deleting all unnecessary or obsolete files
> from the repo, and they will just stay in Git history if I ever need them. The second thing is I'm
> thinking of reducing code size if there is a lot of code duplication and unnecessary code. And third,
> I'm thinking that for agents to work efficiently with this repo, and especially to work in parallel, we
> need to approach with divide and conquer, meaning that the entire UX Woz app should be broken into
> separate components, which can be run and tested independently. So the agent working on a specific
> component doesn't need to change the other components and doesn't need to pollute their context with the
> entire code base. These approaches can be quantified because as you are working on it, you can see how
> much improvement sub-agents do after deleting all files, after reducing code, or after breaking down into
> separate components.

And on 2026-11-11: *"It seems you have slowed down again, with slow iterations."* The numbers agree:

| When | One feature, builder only | Tokens | Tool calls |
|---|---|---|---|
| Night of 11-09, after the first cleanup | 4 to 11 min | 110k to 230k | |
| Design phases, 11-10 | 7, 18, 18, 8, 12 min | 130k to 270k | 54 to 98 |
| Comments and voice, 11-10 | 56 min for the whole job, 6 subagents | | |

Since the first cleanup the repo grew from 104 to 141 tracked files and gained `design/` (17 files),
`comments.ts`, `pins.ts`, a 350-line `player.ts`. `canvas.ts` is 580 lines, `cache.ts` 574, `server.ts`
444, `spec/behavior.md` 538 (it was 449 two days ago).

## Part A: clean up and check that everything is set for fast iteration

1. **Measure first.** Pick three small features of the kind the user asks for (one in the canvas, one in
   the player or sharing, one on the server and its cache; choose them so they are real but can be thrown
   away). Give each to one Opus builder in a worktree with a plain brief, and record: wall time, transcript
   tokens, tool calls, files read (and which), lines changed, and where the time went (reading, building,
   running tests, fixing). Throw the branches away. This is the baseline; put the table in the plan.
2. **Find what costs time.** From those three transcripts, not from guesses: which files were read that
   the change did not need, which docs were read in full, which searches came back noisy, what the builder
   had to work out that one line in `AGENTS.md` would have told it, how long `bun test` and `typecheck`
   take, how often a brief had to be clarified. Also ask: was the builder slow, or was the loop around it
   slow (the brief, the critic, the fixes, the lead's browser check)? Yesterday's phases spent as long in
   critics and fixes as in building.
3. **Write a plan** to `process/plans/2026-11-11-fast-iteration.md` in the style of
   `process/writing-style.md`, with the baseline and, for each change you propose, the minutes or files it
   should save and how you will know. Cover the user's three ideas, in their order:
   - **Delete.** Everything obsolete goes; git history keeps it. Candidates to check, not a verdict:
     `benchmarks/` (the night plan deleted it, and a `benchmarks` folder is at the root again: find out
     what it is), old plans and prompts in `process/plans/` (19 plans and 18 journal files; decide what a
     new session still needs and what is only history), `process/design/shots/`, `src/scripts/`, dead
     exports, dead CSS, dead routes, tests that test nothing, `temp/` (65 MB of old cache backups,
     git-ignored but on disk), the two leftover worktrees in `.claude/worktrees/` (each holds one
     uncommitted file: look, then ask the user), stale launch configs.
   - **Shrink.** Duplicated and unnecessary code, measured before and after in lines per file. Look at the
     pairs that grew side by side: the player and the app (two frame hosts, two pin layers, two feedback
     paths), `share.ts` and `server.ts` (two route tables, the proxy for pages), `cache.ts` (574 lines: the
     boxes, the fixer's notes, versions, sharing data), and the spec: `behavior.md` gained 89 lines in two
     days, and every builder is told to read sections of it.
   - **Divide.** Parts that can be run and tested on their own, so an agent on one part reads only that
     part and its contract. Say what the parts are (candidates: core engine; server and cache; canvas and
     tree; boxes and fixer; drawer and voice; sharing, player and comments; design), what each part's
     contract is and where it is written, how each is run and tested alone (a test file per part, a page
     that shows the part with fake data, as `/design` does for the look), and which files today cross
     parts (`AGENTS.md` already warns about `app.ts`, `screens.ts`, `server.ts`, `canvas.ts`). Split a
     file only when the transcripts show agents reading the whole of it for a change to a piece.
   - **The loop itself.** A brief template in `AGENTS.md` or beside it, so a lead writes a builder's brief
     in a minute; a rule for when a critic is worth its time (yesterday's critics found 35 real defects,
     so do not drop them: make them cheaper, for example one critic per two small steps, or a critic that
     runs while the next builder starts); what the lead checks in the browser and what a test can check
     for it; per-part docs short enough to read whole.
4. **Show the plan to the user and wait.** Then do it in steps, each one an Opus builder and a critic as
   in the journals, each leaving `bun test` and `bun run typecheck` green and the app working.
5. **Measure again** after each of the three kinds of change (delete, shrink, divide): the same three
   throwaway features, fresh builders, the same table. Keep a change only if it helped or cost nothing;
   say so plainly when one did not help. Target: a small feature is built in under 10 minutes and under
   120k tokens, reading at most 8 files.
6. **Leave the rules behind** in `AGENTS.md`, short: the parts and their one-line contracts, what to read
   for a change in each, the brief template, size caps where they proved useful (the cap on `design/`
   works; `fx.ts` sits exactly at its 130 lines). Then a journal file with the before and after table.

Rules that stand: behavior does not change (this is a refactor: the spec's sentences stay true, the tests
stay, cassettes do not change because no prompt byte changes); TypeScript, no runtime dependencies, bun
from `src/`; `process/journal/` is a record, so move or delete whole files there only with the user's
yes; never delete from `cassettes/`; the user's cache `temp/screen-cache.json` is never written by a
test or a check (use a copy on another port); nothing is pushed. Check the usage card before each
subagent and start none past 75% of the 5-hour window.

## Part B: exact steps to put the project in a new GitHub repo

After the cleanup, write the steps for the user to `README.md` (a short section) and give them in chat,
exact and in order, each command in its own block. The repo has no remote today. Before you write them:

- Check that nothing secret is or ever was in git: `.env` is ignored, but search the whole history for
  keys (`sk-`, `OPENAI`, `OPENROUTER`, `UXWOZ_OWNER`, tokens in `cassettes/` request headers, share tokens
  in fixtures). If something is in history, say what and how to remove it before the first push.
- Check what is tracked that should not be (large files, `temp/`, `.claude/` settings, screenshots) and
  what size the repo is.
- Decide with the user: private or public, the repo's name, the licence (the font is OFL and Pico is MIT;
  both licence files are in the tree), whether `cassettes/` and `process/` go public.
- The steps use the `gh` CLI if it is installed and signed in (check), else the website plus `git remote
  add`. Do not create the repo or push yourself: the user does that, or tells you to.
- Say whether a GitHub Action is worth adding (`bun test` and `typecheck` on push take seconds) and write
  it if the user wants it.

## Part C: where to host the app

Recommend one host, with a second choice, and say what it costs per month and what the user must do.
What the app needs, from the code: one long-running Bun process (`bun run start`, `Bun.serve`), streaming
responses up to 30 s, a JSON cache file on a disk that survives restarts and deploys (`UXWOZ_CACHE_FILE`;
one process writes it, so one instance, not several), three secret keys (`.env`), `UXWOZ_OWNER` set so
only the owner can spend model credits, `UXWOZ_HOST=0.0.0.0` behind the host's HTTPS, and a public address
for share links (`/s/<token>`, `/og.png`). Traffic is the owner and a handful of reviewers. Compare on
those needs only: a small VM with a volume (Fly.io, Hetzner with Caddy), a container host with a disk
(Render, Railway), and say why serverless hosts without a disk (Vercel, Cloudflare Workers) do not fit
today. Check current prices and Bun support on the hosts' own pages, since both change. Then list what in
the code must change first, if anything (the journal says production mode was read by a critic and not
run: run `bun run start` behind a proxy and try a share link from a phone; check `x-forwarded-proto` in
`share.ts`'s link maker, which a critic flagged; the cache file's backups; a health route), and write the
deploy steps and the one config file the chosen host needs. Do not deploy or sign up yourself.
