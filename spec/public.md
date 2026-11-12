# The public: people, the meter, sign-up, recordings

This doc owns the shapes behind the public app: who a request is, what a person may spend, the routes
for the account and the admin, and the starters' recordings. What a visitor sees is in
[behavior.md](behavior.md); the other routes are in [code-contract.md](code-contract.md). Why each
choice was made: `process/plans/2026-11-11-public-users.md`.

## Example

```
POST /api/screen {app: "a dog walking app"}     no cookie
  → a person is made (a visitor, $0.10), Set-Cookie: uxwoz_who=<token>
  → two Haiku designs stream; each call's cost is taken from the person when it ends
GET /api/me → {role: "visitor", left: 0.0984, allowance: 0.1, screensLeft: 24, more: 37, …}
…
POST /api/screen → 402 {error: "Your free screens are used up.", reason: "allowance"}
POST /api/signin {email} → 204, a six-digit code by email
POST /api/verify {email, code} → {me}; the $0.15 top-up is in the allowance at once
```

## Modes

`UXWOZ_PUBLIC=1` opens the app to everyone; it needs `UXWOZ_OWNER`, and the server refuses to start
without it. Unset, the app is as before (private, or open on a dev machine), `/api/me` answers
`{role: "owner"}`, `POST /api/step` is 204 and counts nothing, and nothing below applies. In public
mode `/` is open to everyone; `/design` stays the owner's. `web/src/public.ts` holds who a request is,
the address, the cookie, and the gate below; `createServer` takes `public`, `owner`, `people` and
`addressHeader` as options for tests.

## Who a request is

- The owner's cookie → `owner`: the owner's cache, every model, no meter.
- Cookie `uxwoz_who=<token>` (32 hex; `HttpOnly; SameSite=Lax; Max-Age` a year; `Secure` on https) → the
  person whose session it is. The database keeps a SHA-256 of the token, never the token.
- No cookie, or one that is no session → `new`: may load the page, `/api/config`, `/api/me`,
  `/api/step`, `/api/signin`, `/api/verify` and `/api/signout` (a second browser signs in with no person); `GET /api/map`
  answers an empty mockup (the page reads the map before it draws the first screen) and `GET /api/shares`
  `{shares: [], feedback: [], trips: []}`, neither making a person; `/api/apps` answers `{apps: []}` and `/api/warmup` 204 with no call; any other route is
  401 `{error, reason: "new"}`. The first `POST /api/screen` (from this app's page: a cross-site one is
  refused first) makes a person (a visitor) and sets the cookie, whatever it answers.
- An edit link (`x-uxwoz-share`) works as before: the owner's mockup, the owner's models, its cap.

A person has an id (hex, the name of their cache file, never sent to a browser), an email once
registered, an allowance and what they spent, both in USD. A visitor is a person with no email.

## Stored

`bun:sqlite` in one file (`UXWOZ_DB`, default `uxwoz.db` beside the cache file; `:memory:` in tests),
behind `web/src/people.ts`. No other file reads it. Money is integer micro-dollars in the tables; the
store's methods take and give USD. Times are milliseconds since 1970, days and months are UTC.

| Table | Holds |
|---|---|
| `people` | id, email (unique or null), created, seen (each request), allowance, spent, blocked, steps done |
| `sessions` | token hash, person, created |
| `codes` | email, code hash, the person who asked, expires, wrong tries |
| `calls` | one row per model call: at, person, usd, model. A deleted person's rows stay, with no person, so the day's and the month's sums hold |
| `addresses` | per day and hashed address: usd spent by visitors, visitors made, accounts made, `arrived` counted. A new salt deletes the days before |
| `requests` | a quota request: person, note, at, answer (`approved`, `refused` or null), answeredAt, usd |
| `steps` | per day and step: how many people |
| `settings` | the mode (`open` or `starters`), the caps, the day's salt, the day's count of emails sent, when the owner's last mail of requests went and which it told of |
| `shares` | share token → person |
| `emails` | per UTC day and hashed email: codes asked, wrong tries, when it last asked. Kept apart from `codes`, whatever the mails did; the days before go |
| `blocked` | hashed emails the owner blocked; it outlives the person |

## The meter

- `Io.allow?: () => void` (core, `providers.ts`): `streamModel` calls it right before a live call is
  sent, never for a replay. If it throws, the call ends with that error and costs nothing.
- `Io.spent?: (usd: number | null, model: ModelId) => void`: `streamModel` calls it once per call that
  was sent, when the call ends, however it ends. `null` means the cost never arrived; the server
  charges $0.002 for it. A replay, a call `allow` refused and a call that failed before it was sent (no
  key) never call it.
- **Every live call is checked when it starts**, whatever route, race or background work started it:
  streams, filing, visits, their redraws and warm-ups alike. A person's `Io` has an `allow` that
  reserves $0.004 for the call (`reserve` in `people.ts`, held in memory) or throws the reason's words
  below; its `spent` frees the reservation, adds a `calls` row, adds to the person's `spent`, and to the
  day's address row when the person is a visitor. A call in the background is charged to the address of
  the person's last request.
- A reservation holds against the person's allowance, a visitor's address and the public's day and
  month. A check counts what is spent plus what the running calls hold: a call may start while
  something is left and the reservations do not pass the cap. So with $0.004 left an A OR B gets both
  designs, and spend passes a cap by at most one reservation beyond the calls' real costs.
- **Paid** requests are the ones an edit link's cap counts (`costs` in `share.ts`) and `/api/warmup`,
  except `/api/pick`: a pick is never refused (the two designs are paid for already), and its filing
  and visit start only while the person may make a paid request (`may` in `drawing.ts`). A request a
  recording answers is free (`replayed` in `drawing.ts`). A paid request is refused before any model
  call with 402 `{error, reason}`:

| `reason` | When | `error` |
|---|---|---|
| `allowance` | the person's `spent` is at or over their `allowance`, or with the running calls' reservations over it | *Your free screens are used up.* |
| `address` | a visitor, and visitors from this address spent $0.30 today | *This network has used today's free screens. Register to carry on.* |
| `guests` | a visitor, and the public spent 70% of the day's cap (`dayUsd`) today, the running calls' reservations counted | *Today's free screens for guests are used up. Register to carry on.* |
| `paused` | the mode is `starters`, or the public spent $3 today or $20 this month | *Live designs are paused for now. The starters still work.* |
| `blocked` | the owner blocked the person | *This account is closed. Write to <contact>.* (`UXWOZ_CONTACT`, else `UXWOZ_ADMIN_EMAIL`; with neither, the first sentence only) |

So registered users go on to the whole day's cap after guests stop. The store checks in the order
`blocked`, `paused`, `guests`, `allowance`, `address`: a reason the person cannot fix
comes before one that registering fixes, so a refused person is never sent to a sign-up that would not
help. The 21st new visitor from an address in a day gets 402 `address` at their first `POST /api/screen`.

- A person runs one paid request at a time (409 *One at a time: wait for this one.*): a new screen or
  a revise holds until its stream ends or the browser leaves. A warm-up, a box's Edit and Visit now
  answer at once and are not held. Background work (filing, a visit) starts only while a paid request
  of the person would pass (no 402 reason), and each of its calls is checked again as it starts. Two
  people share a cap (the address's, the day's) through the reservations, as one person's calls do.
- The public's model is Claude Haiku: `/api/config` lists only it (and makes it `defaultModel`), and
  another `model` on any route is 403 *Only Claude Haiku is open to the public.*
- `/api/warmup` from the public calls the model only if no Haiku call ran and no warm-up was let
  through in the last 4 minutes (it answers 204 without a call then, before the meter is asked). The
  warm-up claims that slot, one for the whole public, before it calls, so warm-ups sent together make
  one call.
- Defaults, each changeable on the admin's page: visitor allowance $0.10, top-up $0.15 at sign-up,
  $0.30 a day per address for visitors, 20 new visitors and 3 new accounts a day per address, $3 a day
  and $20 a month for the public as a whole, 100 emails a day (Resend's free plan).
- **The address** is the header named by `UXWOZ_ADDRESS_HEADER` (default `x-real-ip`), else the
  socket's. Of a list the first value counts, except for `x-forwarded-for`, whose last value counts:
  the one the proxy added (the ones before it are the client's own claim). An IPv6 address counts by its /64. It is stored only as an HMAC under a salt made new each
  UTC day.

## What a role may do

A person uses every app route on their own cache, with these limits (403 `{error, reason: "register"}`
for a visitor, plain 403 otherwise):

| Route | Visitor | Registered |
|---|---|---|
| `/api/share` with role `view` or `comment`, `/api/shares`, `/api/unshare`, `/api/feedback` | no | yes |
| `/api/share` with role `edit` | no | no |
| `/api/export` | no | yes |
| `/api/backup`, `/design`, `/admin`, `/api/admin` | no | no |

A visitor's cache file and rows are deleted after 30 days with no request, by a check once a day (the first a
day after the server starts). A cache file that passed 5 MB takes no
new screen and no revise (413 *This account is full: delete a mockup first.*); a cache hit still opens.

A person's share links are in the `shares` index: added by `/api/share`, dropped by `/api/unshare`, by
`/api/delete` of a mockup's Home and by `/api/delete-app` (Start over). `whose(token)` looks in the
owner's cache first, then opens the index's person's desk, closed or not. The owner's links are not in
the index.

## Routes

- `GET /api/me` → `{role: "owner" | "user" | "visitor" | "new", email?, left, allowance, screensLeft,
  more?, request?: {at, answer?}, paused, may: {share, exportZip}}`. `left` is allowance minus spent, never below 0;
  `screensLeft` is `floor(left / SCREEN_USD)`, with `SCREEN_USD` $0.004 (`people.ts`); `more`, for `new` and
  `visitor` only, is the screens a new account adds, `floor(topup / SCREEN_USD)`; `paused` is true when a paid
  request would get `paused`.
- `POST /api/step {step: "arrived"}` → 204 (another step is 400). The other steps (`starter`, `picked`, `own`, `limit`,
  `asked`, `verified`) the server counts itself, each once per person: `starter` and `own` at a
  `POST /api/screen` for a Home not in the person's cache, with a starter's prompt or another;
  `picked` at a pick that worked; `limit` at a 402 `allowance`. `arrived` is counted at most 50 times
  a day per address, and an `arrived` before the person exists counts for the day only.
- `POST /api/signin {email}` → 204, and a code is sent: six digits, good for 15 minutes, dead after 5
  wrong tries; a new one replaces the old. 400 for a bad email, 429 *Sign-ups are full for today.*
  when the day's 100 emails are used or the network asked for its 10 codes today, 429 *A code is on its
  way: wait a minute before asking again.* when this email asked less than a minute ago, 429 *Too many
  codes for this email today. Try again tomorrow.* when it asked for its 5 codes today or made its 15
  wrong tries (all counted in the store, the email's in `emails`, whatever the mails did). The day's
  email is counted when the code is made, before the send, and never given back, so emails sent
  together cannot pass the day's cap; a code whose email did not go is deleted. A blocked email gets 204
  like any other. Asking never depends on the address's accounts nor on whether the email has one, so a
  network that made its 3 accounts still lets its users sign in; the fourth new account is refused at
  verify only. 503 *Sign-up is not set up yet.* in production with no mail
  key, 503 when the email did not go. The code is never logged in production.
- `POST /api/verify {email, code}` → `{me}` and a new session cookie. A new email takes over the
  visitor's person (the mockups stay where they are) and adds the top-up (`topup`, $0.15) to its
  allowance at once; with no visitor it makes a person with the visitor's allowance and the top-up. An email with
  an account signs in to it: the visitor's mockups move in, except those whose prompt the account
  already has, and the visitor's person is deleted; signing in again adds nothing. 400 *That code is not right.* (each wrong one counts
  toward the email's 15 a day), 429 *Too many codes…* past them, 403 *This account is closed. Write to <contact>.* for a
  blocked email (after the right code, so only its owner learns it), 429 when the address made its
  accounts and the email is new; the right code stays good then, to use from another network.
- `POST /api/signout` → 204, the session is deleted and the cookie cleared.
- `POST /api/delete-account {email}` (registered; `email` must be the account's) → 204 and the cookie
  cleared: the cache file, every row and share link of the person go (their `calls` stay with no
  person). 400 for another email.
- `POST /api/ask {note}` (registered, 1 to 500 characters) → 204, and the owner is told by email (see
  below). One open request per person (409). A blocked person gets 403 *This account is closed. Write to <contact>.*
- `GET /api/admin` (owner) → `{spent: {today, month}, caps, mode, steps: {day, …counts}[] (30 days),
  people: {id, email, created, seen, allowance, spent, mockups, blocked}[], requests[],
  address, mailToday, startersCurrent, screenUsd}`. `address` is the caller's as the server sees it;
  `screenUsd` is `SCREEN_USD`, so the page says about how many screens each dollar amount is.
- `POST /api/admin {op, …}` (owner): `mode`, `caps`, `give {id, usd}`, `block {id, blocked}`,
  `delete {id}`, `answer {request, approved, usd?}`. `block` blocks the person's
  email too (hashed, in `blocked`); a blocked person may still delete their account, and the email stays
  blocked; unblocking takes it off. `caps` takes only `CAPS`'s own keys. It answers the same body as
  `GET /api/admin`, with `mailed: false` when the op's email did not go. A bad input is 400 (an unknown
  op or cap, a cap below 0 or over its ceiling, an amount over $100, `give` of 0 or below −$100, an
  `answer` amount of 0 or less), an unknown person or request 404, an answered request 409. `answer`
  emails the answer; each sent email counts toward the day's.
- `GET /admin` (owner: anyone else gets 403, as at `/design`; the page itself is served from a path with a
  secret made per process, which only the server's own fetch knows), `GET /privacy` (everyone): pages. The privacy page names `UXWOZ_OPERATOR` as who
  runs the site and `UXWOZ_CONTACT` (else `UXWOZ_ADMIN_EMAIL`) as whom to write to, and who handles the data:
  Railway (the host), Resend (mail), OpenRouter with Anthropic's Claude, and OpenAI (the models). An email address there is
  kept from scrapers: the HTML holds it backwards in two pieces and as words (*name at site dot com*),
  and a script builds the link in the browser.
- `GET /api/config` gains `public: true`, `starters: Starter[]` (both only in public mode, the owner's
  too) and, for the public, one model.
- `GET /api/backup` in public mode is a zip, `uxwoz-backup.zip`: `screen-cache.json` (the owner's), `uxwoz.db`
  (a snapshot of the database) and `users/<id>.json` for every person with a cache, open or on disk.
  `src/scripts/backup.sh` keeps either kind.

The owner hears of quota requests in one email an hour at most, listing every open request: a request
sends it at once when none went in the last hour, and a check once a minute (`startAsks`) sends it when
the hour is up and a request is new since the last one (not when the day's emails are used up). When that mail went and which
requests it told of are kept in `settings`, so a restart does not send it again. A
database from when the top-up waited 12 hours gives each waiting top-up when the server starts. These
routes and the check are `web/src/account.ts`. The links in every email start with
`UXWOZ_URL` (default `https://app.uxwoz.com/`).

## Mail

`web/src/mail.ts` sends through Resend: `POST https://api.resend.com/emails` with
`Authorization: Bearer $RESEND_API_KEY` and `{from, to: [to], subject, text}`, through the server's
`Io.fetch` (so tests fake it). With no key outside production it logs the message instead. The owner
(`UXWOZ_ADMIN_EMAIL`) gets the open quota requests, one email an hour at most.

| Var | Use |
|---|---|
| `UXWOZ_PUBLIC` | `1` opens the app to the public |
| `UXWOZ_DB`, `UXWOZ_USERS_DIR` | the database file and the folder of people's cache files |
| `UXWOZ_ADDRESS_HEADER` | the header with the visitor's address, default `x-real-ip` |
| `RESEND_API_KEY`, `UXWOZ_MAIL_FROM`, `UXWOZ_ADMIN_EMAIL` | mail: the key, the sender (default `UX Woz <hello@mail.uxwoz.com>`), the owner's address |
| `UXWOZ_OPERATOR`, `UXWOZ_CONTACT` | the privacy page: who runs the site, whom to write to (also in a blocked person's refusal) |
| `UXWOZ_URL` | the app's address in emails, default `https://app.uxwoz.com/` |

## Recordings

A recording is what the models said for one starter, with its timing; it is replayed where the model
would be called. `recordings/<id>.json`, one per starter in `core/src/starters.ts`:

```
{starter, prompt, promptHash, recordedAt,
 screens: {<name>: {action, designs: Recorded[4]}},   // home, and every @name any Home design links to
 filings: Recorded[2]}                                 // Home's filing when A was picked, when B was
Recorded = {events: [ms, text][], final: FinalEvent}   // ms since the call began
```

- `Io.record?: (r: Recorded, call: {model, user}) => void` captures a live call; `recorded?: Recorded`
  on a call replays one: the same events, each after its recorded delay, no network, no `spent`.
- In a mockup whose normalized prompt is a starter's: a recorded screen's A is `designs[0]` and B
  `designs[1]`; each Regenerate takes the next (2, 3, then 0 again). The filing after Home's pick is
  `filings[side picked]`. A pick of another recorded screen files nothing. Anything else (a screen with
  no recording, an Edit, a box's Edit, Visit now) is a live, paid call.
- This holds for everyone, the owner too. A Regenerate takes design *versions held + 1*, so after an
  Undo the same design comes back; a screen whose newest version an Edit or the fixer made regenerates
  live. A pick answered by a recording (Home's replayed filing, or nothing) never brings the fixer's
  visit. Once the mockup has had a live call (here, or a screen's design that cost something, or a
  visit), its picks file live and visits run as usual; recorded screens still draw from the recording.
  A replayed design or filing costs 0. `drawing(…, may)` starts a live filing or visit only when `may()`
  says so; a replay always runs. `replayed(path, body)` says whether a request to `/api/screen`,
  `/api/revise` or `/api/pick` would be answered by a recording, with no model call.
- `bun run starters:record [id…]` (live calls) drives the real server on a temporary cache: Home's two
  designs, two Regenerates, then each linked name from a Home version that links to it, its four
  designs the same way. `promptHash` is a hash of the system prompt; `startersCurrent` is false when a
  recording's differs from today's.
- The tests' cassettes are separate and never read these files.
