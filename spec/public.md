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
GET /api/me → {role: "visitor", left: 0.0984, allowance: 0.1, screensLeft: 14, …}
…
POST /api/screen → 402 {error: "Your free screens are used up.", reason: "allowance"}
POST /api/signin {email} → 204, a six-digit code by email
POST /api/verify {email, code} → {me}; the $0.15 arrives 12 hours later, or when the owner approves
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
  `/api/step`; `/api/apps` answers `{apps: []}` and `/api/warmup` 204 with no call; any other route is
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
| `people` | id, email (unique or null), created, seen (each request), allowance, spent, blocked, topupDue (when a waiting top-up arrives), steps done |
| `sessions` | token hash, person, created |
| `codes` | email, code hash, the person who asked, expires, wrong tries |
| `calls` | one row per model call: at, person, usd, model. A deleted person's rows stay, with no person, so the day's and the month's sums hold |
| `addresses` | per day and hashed address: usd spent by visitors, visitors made, accounts made, `arrived` counted. A new salt deletes the days before |
| `requests` | a quota request: person, note, at, answer (`approved`, `refused` or null), answeredAt, usd |
| `steps` | per day and step: how many people |
| `settings` | the mode (`open` or `starters`), the caps, the day's salt, the day's count of emails sent |
| `shares` | share token → person |

## The meter

- `Io.spent?: (usd: number | null, model: ModelId) => void` (core, `providers.ts`): `streamModel` calls
  it once per call when the call ends, however it ends. `null` means the cost never arrived; the
  server charges $0.002 for it. A replayed recording never calls it.
- For a person, the server passes an `Io` whose `spent` adds a `calls` row, adds to the person's
  `spent`, and to the day's address row when the person is a visitor. A call in the background is
  charged to the address of the person's last request.
- **Paid** requests are the ones an edit link's cap counts (`costs` in `share.ts`) and `/api/warmup`,
  except `/api/pick`: a pick is never refused (the two designs are paid for already), and its filing
  and visit start only while the person may make a paid request (`may` in `drawing.ts`). A request a
  recording answers is free (`replayed` in `drawing.ts`). A paid request is refused before any model
  call with 402 `{error, reason}`:

| `reason` | When | `error` |
|---|---|---|
| `allowance` | the person's `spent` is at or over their `allowance` | *Your free screens are used up.* |
| `address` | a visitor, and visitors from this address spent $0.30 today | *This network has used today's free screens. Register to carry on.* |
| `paused` | the mode is `starters`, or the public spent $3 today or $20 this month | *Live designs are paused for now. The starters still work.* |
| `blocked` | the owner blocked the person | *This account is closed.* |

The store checks in the order `blocked`, `paused`, `allowance`, `address`: a reason the person cannot fix
comes before one that registering fixes, so a refused person is never sent to a sign-up that would not
help. The 21st new visitor from an address in a day gets 402 `address` at their first `POST /api/screen`.

- A person runs one paid request at a time (409 *One at a time: wait for this one.*): a new screen or
  a revise holds until its stream ends or the browser leaves. A warm-up, a box's Edit and Visit now
  answer at once and are not held. Background work (filing, a visit) starts only while a paid request
  of the person would pass (no 402 reason). Two people can still pass a
  shared cap (the address's, the day's) at once: each running call finishes, and the next is refused.
- The public's model is Claude Haiku: `/api/config` lists only it (and makes it `defaultModel`), and
  another `model` on any route is 403 *Only Claude Haiku is open to the public.*
- `/api/warmup` from the public calls the model only if no Haiku call ran in the last 4 minutes (it
  answers 204 without a call then, before the meter is asked).
- Defaults, each changeable on the admin's page: visitor allowance $0.10, top-up $0.15 after 12 hours,
  $0.30 a day per address for visitors, 20 new visitors and 3 new accounts a day per address, $3 a day
  and $20 a month for the public as a whole, 100 emails a day (Resend's free plan).
- **The address** is the header named by `UXWOZ_ADDRESS_HEADER` (default `x-real-ip`), else the
  socket's. An IPv6 address counts by its /64. It is stored only as an HMAC under a salt made new each
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

A visitor's cache file is deleted after 30 days with no request. A cache file that passed 5 MB takes no
new screen and no revise (413 *This account is full: delete a mockup first.*); a cache hit still opens.

A person's share links are in the `shares` index: added by `/api/share`, dropped by `/api/unshare`, by
`/api/delete` of a mockup's Home and by `/api/delete-app` (Start over). `whose(token)` looks in the
owner's cache first, then opens the index's person's desk, closed or not. The owner's links are not in
the index.

## Routes

- `GET /api/me` → `{role: "owner" | "user" | "visitor" | "new", email?, left, allowance, screensLeft,
  topupDue?, request?: {at, answer?}, paused, may: {share, exportZip}}`. `left` is allowance minus spent, never below 0;
  `screensLeft` is `floor(left / 0.007)`; `paused` is true when a paid request would get `paused`.
- `POST /api/step {step: "arrived"}` → 204 (another step is 400). The other steps (`starter`, `picked`, `own`, `limit`,
  `asked`, `verified`) the server counts itself, each once per person: `starter` and `own` at a
  `POST /api/screen` for a Home not in the person's cache, with a starter's prompt or another;
  `picked` at a pick that worked; `limit` at a 402 `allowance`. `arrived` is counted at most 50 times
  a day per address, and an `arrived` before the person exists counts for the day only.
- `POST /api/signin {email}` → 204, and a code is sent: six digits, good for 15 minutes, dead after 5
  wrong tries; a new one replaces the old. 400 for a bad email, 429 *Sign-ups are full for today.*
  when the day's 100 emails or the address's 3 accounts are used (for every email alike, so the answer
  never tells whether an email has an account; the accounts are checked again at verify, so codes
  asked together cannot make a fourth), 503 *Sign-up is not set up yet.* in production with no mail
  key, 503 when the email did not go. The code is never logged in production.
- `POST /api/verify {email, code}` → `{me}` and a new session cookie. A new email takes over the
  visitor's person (the mockups stay where they are) and sets `topupDue` 12 hours ahead. An email with
  an account signs in to it: the visitor's mockups move in, except those whose prompt the account
  already has, and the visitor's person is deleted. 400 *That code is not right.*, 429 when the address
  made its accounts and the email is new.
- `POST /api/signout` → 204, the session is deleted and the cookie cleared.
- `POST /api/delete-account {email}` (registered; `email` must be the account's) → 204 and the cookie
  cleared: the cache file, every row and share link of the person go (their `calls` stay with no
  person). 400 for another email.
- `POST /api/ask {note}` (registered, 1 to 500 characters) → 204, and the owner gets it by email at
  once. One open request per person (409).
- `GET /api/admin` (owner) → `{spent: {today, month}, caps, mode, steps: {day, …counts}[] (30 days),
  people: {id, email, created, seen, allowance, spent, mockups, blocked, topupDue}[], requests[],
  address, mailToday, startersCurrent}`. `address` is the caller's as the server sees it.
- `POST /api/admin {op, …}` (owner): `mode`, `caps`, `give {id, usd}`, `block {id, blocked}`,
  `delete {id}`, `topup {id}` (now), `answer {request, approved, usd?}`. It answers the same body as
  `GET /api/admin`, with `mailed: false` when the op's email did not go. A bad input is 400 (an unknown
  op or cap, a cap below 0 or over its ceiling, an amount over $100, `give` of 0 or below −$100, an
  `answer` amount of 0 or less), an unknown person or request 404, a top-up that no longer waits or an
  answered request 409. `topup` emails *Your free screens are ready*, `answer` the answer; each sent
  email counts toward the day's.
- `GET /admin` (owner), `GET /privacy` (everyone): pages. The privacy page names `UXWOZ_OPERATOR` as who
  runs the site and `UXWOZ_CONTACT` (else `UXWOZ_ADMIN_EMAIL`) as whom to write to.
- `GET /api/config` gains `public: true`, `starters: Starter[]` (both only in public mode, the owner's
  too) and, for the public, one model.
- `GET /api/backup` in public mode is a zip: `screen-cache.json`, `uxwoz.db`, `users/<id>.json`.

A check once a minute hands out the top-ups that are due and emails each user *Your free screens are
ready* (not when the day's emails are used up). Approving in the admin's page does the same at once.
The same check tells the owner of sign-ups that started waiting since its last such email, one email an
hour at most. These routes and the check are `web/src/account.ts`.

## Mail

`web/src/mail.ts` sends through Resend: `POST https://api.resend.com/emails` with
`Authorization: Bearer $RESEND_API_KEY` and `{from, to: [to], subject, text}`, through the server's
`Io.fetch` (so tests fake it). With no key outside production it logs the message instead. The owner
(`UXWOZ_ADMIN_EMAIL`) gets a quota request at once, and waiting sign-ups in one email an hour at most.

| Var | Use |
|---|---|
| `UXWOZ_PUBLIC` | `1` opens the app to the public |
| `UXWOZ_DB`, `UXWOZ_USERS_DIR` | the database file and the folder of people's cache files |
| `UXWOZ_ADDRESS_HEADER` | the header with the visitor's address, default `x-real-ip` |
| `RESEND_API_KEY`, `UXWOZ_MAIL_FROM`, `UXWOZ_ADMIN_EMAIL` | mail: the key, the sender (default `UX Woz <hello@mail.uxwoz.com>`), the owner's address |
| `UXWOZ_OPERATOR`, `UXWOZ_CONTACT` | the privacy page: who runs the site, whom to write to |

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
