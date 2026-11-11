# Plan: fast iteration

This plan says why a change to UX Woz takes 40 minutes of waiting, what was measured, and which
changes to the repo and to the way a lead runs builders bring that down. GitHub and hosting come
after it and have their own steps.

## Example

Yesterday, "comments and voice" took 56 minutes: three builders one after another (19, 16 and 13
minutes), a critic after each. Under this plan the same request runs like this:

```
lead      splits it by part: voice (drawer and voice), reviewer comments (player), owner comments (canvas)
0 min     voice builder and reviewer builder start together: they share no file
~15 min   both done; one critic reads both diffs while the owner builder starts on the merged code
~28 min   owner builder done, critic's fixes in, lead looks at the app once, merges
```

## What was measured

Five throwaway features, each built by one Opus builder in a worktree from a brief of about 1,400
characters, with tests, the spec sentence and a look at the running app. All five came back green
and needed no clarification. The branches are deleted.

| Feature | Part | Minutes | Tokens | Tool calls | Files opened (whole) | Lines changed |
|---|---|---|---|---|---|---|
| Version count on a name chip | canvas | 1.8 | 85k | 34 | 1 (0) | +23 −5 |
| "3 of 7 screens" in the player | player | 2.2 | 95k | 36 | 5 (2) | +35 −4 |
| A mockup's cost in Recent | server, cache | 2.0 | 87k | 30 | 1 (0) | +48 −14 |
| Screens list in the player | player | 3.7 | 111k | 53 | 8 (4) | +121 −6 |
| The owner's note on a screen | cache, server, drawer, canvas, export | 5.1 | 170k | 74 | 8 (5) | +131 −10 |

Where a builder's time went, on average: reading and searching 30%, the browser 25%, editing 15%,
tests and typecheck 10% (`bun test` runs in 2.5 s, typecheck in 0.3 s), commit and report the rest.
One run per feature, so differences under a minute are noise; tokens and files opened are steadier.

## What costs time

The repo is not the slow part. A small feature already meets the target (10 minutes, 120k tokens,
8 files) five times over. The waiting comes from four other places.

- **Steps run one after another.** The design work took 98 minutes: builders 63, critics 19, the
  lead about 15. Voice and comments were independent and still ran in series.
- **Steps are big.** Yesterday's builders got briefs of 6,000 to 10,000 characters and made 90 to
  124 tool calls each. Today's biggest made 74.
- **Pictures.** The 18-minute design builder opened 20 screenshots; they were most of its reading.
- **A plan round before building.** Yesterday's plan, its three critics and the wait for an answer
  took 30 minutes before the first line of code.

Three things do cost a builder something in the repo itself:

- **A builder starts at 54k tokens** before it reads a file (its tools and instructions). The repo
  added 30k to 115k on top. Only the note feature went over 120k.
- **Whole-file reads on a cross-part change.** The note builder read `cache.ts` (574 lines),
  `server.ts` (444), `share.ts` (234), `export.ts` (184) and `drawer.ts` (195) whole, to add one
  method, one route and three lines. That is about 30k of its tokens.
- **Setup snags, every builder:** a fresh worktree has no `node_modules`, so the first test run
  fails; nothing says how to start the app with no keys; builders share one browser tab and push
  each other off it; the player needs a share token fished out of the cache.

No builder opened an old plan, a journal file, a cassette or `temp/`.

## The changes, in the user's order

### 1. Delete

Expected gain for a builder: none measurable, since no builder read any of it. The reasons are a
tidy repo before it goes to GitHub and 330 MB of disk. The lead does this itself, no critic.

- `benchmarks/`: an old Python `.venv` and a pytest cache, 174 MB, nothing tracked. Delete.
- `process/plans/`: the 11 finished plans and prompts. Git keeps them. This plan stays until done.
- `process/design/` (a README and four screenshots of a variant that is now the app), and
  `src/scripts/fixer-reply.ts`. Fix the two lines of `AGENTS.md` that point at them.
- About ten exports nothing imports, and whatever dead CSS and routes a scripted check finds.
- **Needs your yes:** the worktrees `paper-cuts` and `step7` with their branches (both fully merged;
  the "uncommitted file" in each is a copy of `launch.json`), and everything in `temp/` except
  `screen-cache.json` and `screen-cache-night.json` (65 MB of old backups and logs).
- `process/journal/` stays whole: it is the record, and `AGENTS.md` already sends a session to its
  latest file only.

### 2. Shrink

Expected gain: small. Size cost tokens only where a builder read a file whole, and step 3 treats
that more directly. One builder surveys the pairs that grew side by side (the player and the app's
frame hosts and pin layers, `share.ts` and `server.ts`'s routes) and removes a duplicate only where
that takes out 30 lines or more with no behaviour change. If it finds under 100 lines in total, we
stop and say so. `spec/behavior.md` is left alone: every builder read it by search, 50 lines at a
time, never whole.

### 3. Divide

Expected gain: the note feature drops from 170k tokens and 5 whole files to under 120k and 2, and
two builders can work at once without meeting in a file.

- **Split the two files that were read whole for a small piece.** `cache.ts` into the screens
  (find, propose, pick, versions, delete, the file) and the boxes with the fixer's notes;
  `server.ts` into the routes and the filing chain. Same names, same tests, no new layer.
- **Write the parts down in `AGENTS.md`**, one line each: its files, its test files, what else to
  read, what it must not touch. Seven parts: engine; server and cache; canvas and tree; boxes and
  fixer; drawer and voice; sharing, player and comments; design.
- **A demo cache in the repo**, small and made up, with a view, a comment and an edit link and one
  comment, plus `bun run demo`: the app with no keys, on a spare port, on a temporary copy. Every
  builder spent 20 to 40 seconds building this by hand, and one had to add a view link first.
- No page of fake data per part. Builders found their way in the real app in under two minutes.

### 4. The loop

Expected gain: the largest. A job like yesterday's goes from 56 minutes to about 30, and a small
request from a plan round to about 5 minutes.

- **Three sizes.** *Small* (one part, like the first three rows): one builder, no plan file, no
  critic; the lead reads the diff. *Medium* (crosses parts): a builder, then a critic that runs
  while the lead looks at the app; fixes go back to the same builder. *Large*: the lead cuts it
  into medium steps by part, runs the independent ones together (three at most), and uses one
  critic for every two steps.
- **A brief template** in `AGENTS.md`, under 1,500 characters: the feature in the user's words,
  what done means, the rules, how to look at the app, what to report.
- **Fewer pictures.** A builder checks the page by its text and by script and takes two
  screenshots at most. The lead looks once, at the end. Design work is the exception.
- **Setup.** `bun run check` (tests and typecheck), `bun install` named as the first step in a
  worktree, "open your own tab", and five facts builders had to work out (for example: the canvas
  card's `note` is its status line; an edit link's view of `/api/apps` is cut in `share.ts`).

## How we will know

After each of the four steps the same five features are built again by fresh builders and the table
is printed beside this one. A step stays if nothing got worse. The loop is judged on the next real
request: the minutes from your message to the merged commit.

## Then

GitHub (no secret is in git history, `gh` is signed in, the tracked files are 2 MB) and hosting,
each with the decisions it needs from you.
