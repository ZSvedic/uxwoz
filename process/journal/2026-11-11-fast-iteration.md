# 2026-11-11: why you waited, and what changed

The repo was never the slow part. A builder makes a small feature here in 2 minutes and a medium one
in 3 to 5; the 40-minute waits came from big steps run one after another, with a plan round in
front. The cleanup is done, the way a lead runs builders is written into `AGENTS.md`, and the repo is
ready for GitHub and Fly.io. 195 tests pass, typecheck is clean, nothing is pushed or deployed.

## Your checklist

1. **Try the new way of working.** Ask for a small feature and time it from your message to the
   merged commit. The aim is about 5 minutes for a small one and about 12 for a medium one.
2. **`cd src && bun run demo`.** The app on a made-up habit tracker at http://127.0.0.1:3100, with no
   keys, and its three share links printed. Builders use it; you can show it to someone.
3. **GitHub.** README, *Put it on GitHub*: one command. Decide first: private (the default in the
   command) or public.
4. **Hosting.** README, *Host it*: seven commands for Fly.io. You sign up and run them.

## What was measured

The same five throwaway features, built three times by fresh Opus builders from the same short
briefs: before anything changed, after deleting, after splitting. Minutes, then tokens.

| Feature | Before | After delete | After divide |
|---|---|---|---|
| Version count on a name chip (canvas) | 1.8, 85k | 1.8, 90k | 1.6, 90k |
| "3 of 7 screens" in the player | 2.2, 95k | 2.0, 92k | 1.9, 95k |
| A mockup's cost in Recent (server, cache) | 2.0, 87k | 1.6, 85k | 1.5, 87k |
| Screens list in the player | 3.7, 111k | 3.3, 112k | 3.6, 119k |
| The owner's note on a screen (five parts) | 5.1, 170k | 4.8, 168k | 5.1, 163k |

All fifteen builds came back green with no question asked. A builder starts at 54k tokens before it
reads a file, so the repo's own share of a small feature is about 35k.

## What each idea was worth

- **Delete: no speed gain, as predicted.** No builder had opened any of the old files. It was still
  worth doing: 127 tracked files instead of 142, and 330 MB off the disk (`benchmarks/`, the old
  backups in `temp/`, two merged worktrees). Gone: 11 finished plans, `process/design/`,
  `src/scripts/fixer-reply.ts`, 16 exports nothing imported. No dead CSS or routes were found.
- **Shrink: nothing to do.** A survey of every pair that grew side by side found 17 lines of real
  duplication and no dead code. The shared pieces are already shared. I stopped there.
- **Divide: no speed gain for one builder, and it stays.** `cache.ts` (574 lines) is now `cache.ts`
  (329, the screens and the file) and `cache-boxes.ts` (262); `server.ts` (444) is `server.ts` (202,
  the routes) and `drawing.ts` (259, the filing chain and a screen's stream). The saved cache file is
  byte for byte the same, no test was edited, and a critic found no defect. The note feature still
  costs 163k tokens: its cost is breadth (84 tool calls across five parts), not file size. The split
  earns its keep another way: two builders can now work in the cache or the server at once.
- **The loop: this is where the time was.** Yesterday's design work took 98 minutes because five
  big steps ran in a row (builders 63 minutes, critics 19, the lead 15); comments and voice took 56
  where about 30 was possible. Today's divide step ran three builders at once (2, 4 and 7 minutes)
  and one critic over two of them: about 9 minutes of waiting for 13 minutes of building. The whole
  of this cleanup, 24 subagents, 15 of them measured builds, took under an hour.

## What is in `AGENTS.md` now

- **Parts**: seven, each with its files, tests and spec section. Two builders run together only in
  different parts.
- **How a request is built**: small (one builder, no plan, no critic), medium (a builder, then a
  critic while the lead looks), large (cut by part, three at once, one critic per two steps). A
  builder takes two screenshots at most.
- **A brief template** under 1,500 characters. Today's briefs were that size and none needed a
  clarification; yesterday's were 6,000 to 10,000.
- **Look at the app**: `bun run demo`, `bun run check`, `bun install` first in a worktree, your own
  browser tab. Every baseline builder had lost time on each of these.
- **Seven facts** builders had to search for (what `note` already means, where a card's name is
  built, what `guard` already does for a new route).

## Hosting

Fly.io first, Railway second. Prices are from the hosts' own pages today.

| Host | Per month | You must | Catch |
|---|---|---|---|
| Fly.io, 512 MB + 1 GB volume | about $4 | run seven commands | a deploy restarts the one machine: a few seconds away |
| Railway, Hobby + volume | $5 to $8 | connect the GitHub repo, add a volume | usage-priced; no config file needed |
| Render, Starter + disk | about $7.25 | connect the repo, add a disk | the free tier has no disk |
| Hetzner, small VM + Caddy | about €6 + VAT | keep a server patched yourself | most work |

Vercel and Cloudflare Workers do not fit: neither keeps a file on disk or runs one long process.

Two things in the code had to change first, and did (5845beb):

- **Every button press would have been refused.** The app compared the browser's `https://` address
  with the `http://` one it sees behind the host's proxy. It now compares the host names.
- **Share links and the preview picture came out as `http://`.** They now follow the address the
  visitor used.

Also new: `GET /healthz` for the host's check. The cache file was already written safely (a
temporary file, then a rename). Production mode was run for the first time, on port 3141 with the
proxy's headers: the owner's gate, the Secure cookie, share links, the player, `/design` and every
script and stylesheet answered as they should.

## Not verified

- **A real host.** Nothing was deployed. The Docker image was not built (Docker is not running
  here); the Fly commands were checked against Fly's docs, not run. Whether `fly ssh sftp put`
  replaces a file that exists is not documented.
- **A share link from a phone**, and a chat app fetching the preview.
- **A stop mid-save.** The server does not catch the host's stop signal, so a deploy can lose up to
  a second of visitor feedback.
- **The loop on a real request.** The sizes and the parallel rule are measured on throwaway features
  and on this cleanup, not yet on something you asked for.
- One run per feature per round: differences under a minute are noise.

## Budget

The 5-hour window went from 11% to about 42%; the week from 8% to 12%. No model credits were spent:
every server a builder started ran without keys. No cassette changed, because no prompt byte changed.

## Addendum, the same day: public, MIT, Railway

You chose a public repo under the MIT licence, and Railway (Hobby) over Fly.io. `fly.toml` is gone;
Railway reads the root `Dockerfile` and needs no config file (its `railway.json` stops being read on
2026-12-01, so none was written). The README is rewritten short: how to run, where to find things, the
six hosting steps. One more fix for a proxy: the browser's host is taken from `X-Forwarded-Host` when a
proxy sets it, because Railway's docs promise that header and say nothing about `Host`.

The repo is public at https://github.com/ZSvedic/uxwoz, with the work email replaced by the GitHub
no-reply address in every commit (so commit IDs quoted in older journal files no longer match). It runs
on Railway at https://uxwoz-production.up.railway.app: the service deploys `main` from GitHub, a 5 GB
volume is mounted at `/data`, the healthcheck is `/healthz`, the port is pinned to 8080, the region is
EU West (moved from US East the same day). Checked on the live host: `/healthz`, the page, a button press from the page passes and one
from another site is refused. The three secrets were left for the owner to add, so until then it has
no keys and no owner's gate.
