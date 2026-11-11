# Plan: open UX Woz to the public

This plan owns the decisions and the build order for letting strangers use https://app.uxwoz.com:
starters, a metered allowance, sign-up by email, quota requests, the admin's page and onboarding. It
changes nothing for the owner, whose gate, file and share links stay as they are.

Status: waiting for the owner's go-ahead. Nothing is built. The owner's three answers are at the end.

## A visitor's first ten minutes

1. Ana opens app.uxwoz.com. The panel shows eight starter cards above the prompt box.
2. Ana picks *Split a bill with friends*. Two designs draw at their recorded speed. No model is called.
3. A one-line hint beside them says *Pick the one you like.* Ana picks; the sparks fly as they do today.
4. *Click anything in it.* Ana opens two screens (recorded) and tries Regenerate (recorded).
5. Ana types an Edit. This is the first live call: the mockup is Ana's own now, and a small meter appears,
   *About 14 free screens left.*
6. Ana describes a product of their own and builds nine screens. The meter reaches zero.
7. In place of the next design a card says *Register to get about 21 more.* Ana types an email address,
   gets a six-digit code and types it in the same tab. The card now says *Thanks. Your 21 screens
   arrive within 12 hours, and we will email you.* The mockups stay open to look at, click and export.
8. The owner sees Ana waiting on `/admin` and presses Approve (or 12 hours pass). Ana gets the email
   *Your free screens are ready*, comes back and carries on.
9. Weeks later Ana runs out again and presses *Ask for more*, with a line on what the mockup is for.
   The owner gets an email, opens `/admin`, presses Approve.

## What the money buys

Measured in the local cache (61 Haiku designs, 4 visits) and in `spec/ui-generation.md`:

| Call | Cost |
|---|---|
| One Haiku design (billed, as OpenRouter reports it) | $0.0008 on average, $0.0012 at most |
| A pick: A OR B, two designs | $0.0016 |
| Terra's filing after a pick or an Edit (estimate from tokens) | $0.0015 to $0.004 |
| The fixer's visit with its redraws, every 5 picks | $0.009 to $0.012, so $0.002 a pick |
| **One picked screen with all its background work** | **about $0.007** |

So the $0.25 and $0.50 first asked for would buy about 105 screens. The owner chose **$0.10 for a
visitor (about 14 screens) and $0.15 more for a registered user (about 21)**: a hard $0.25 a user.

- **Background work runs for everyone and counts against the person who caused it.** The boxes are
  what makes screen 5 match screen 1; a visitor who judges the product should see the product. One rule
  for owner and public also means no second code path.
- **The meter counts dollars, the visitor sees screens.** Every model call reports its cost at one place
  (`providers.ts`), so filing, visits, redraws, failed designs and warm-ups are all counted. A call
  whose cost never arrives (a timeout) is charged $0.002. A call starts only while the balance is above
  zero, and a person runs one paid call at a time, so the overshoot is one call.
- **Haiku only**, checked on the server: `/api/config` offers the public one model, and another model's
  id is refused. Terra stays, in the background, counted.
- **Warm-up**: the public's page load sends none. The server warms the prompt once when a visitor first
  focuses the prompt box, and only if no Haiku call ran in the last 4 minutes. The system prompt is the
  same for everyone, so a busy site keeps it warm by itself.

## Where things live

- **People and money: `bun:sqlite`, one file at `/data/uxwoz.db`.** Users, sessions, sign-in codes, a
  row per model call (who, when, cost), quota requests, the daily step counts, the site's switch. Why:
  the admin's page is sums by user and by day, every call adds a row, and SQLite does both without
  rewriting a file. It is built into bun.
- **Mockups: one cache file per person, `/data/users/<id>.json`, in today's format.** The server opens
  a person's cache when their request comes and closes it after 10 idle minutes. Why: a request reaches
  one person's cache object and has no way to name another's, so the wall is the structure, not a check
  someone can forget. Two people can type the same prompt. A save writes one person's data. Deleting an
  account deletes a file. The owner's `screen-cache.json` is untouched.
- **Share links** get an index in SQLite (token → person), so `/s/<token>` finds the right file.
- **Backup** becomes a zip of the database and every file (`zip.ts` exists).

## Who a visitor is, and the limits that hold anyway

A visitor is a random id in an `HttpOnly` cookie, made at their first own prompt (a starter needs
none). Resetting the cookie gives a fresh allowance, so three limits sit above it:

- **Per address, per day**: visitors without an account share $0.30 from one address (IPv4, or an IPv6
  /64), and one address makes 3 accounts a day. The address is stored only as a hash salted per day.
- **The site, per day**: $3 of public spend, then starters only until midnight UTC.
- **The site, per month**: a hard $20, then starters only until the owner raises it.

The owner sees all three on `/admin` and has the switch *Open / Starters only*. All of it sits behind
`UXWOZ_PUBLIC=1`: without it the app is private, as today, so the code can deploy dark.

Not known yet: which header carries the visitor's address on Railway. Their staff's answers conflict.
I measure it on the live host (the admin's page shows *your address as the server sees it*) before the
per-address limit is trusted.

## Sign-in

- **A six-digit code by email, typed into the same tab.** The prompt suggested a link. A code is
  better here: the visitor stays in the tab that holds their mockup (a link opened in a phone's mail
  app signs in the phone), and mail scanners that open every link cannot use it up. A code lives 15
  minutes and dies after 5 wrong tries. No password is stored.
- **The top-up waits.** Verifying grants nothing at once: the $0.15 arrives 12 hours later, or when the
  owner approves it on `/admin` before that, and the user gets an email when it does. Why: someone
  farming a hundred accounts gets nothing for half a day, and the owner sees them queue up. A check
  once a minute hands out what is due; it reads SQLite, so a restart loses nothing.
- **Carrying mockups over**: a new email takes over the visitor's id, so nothing moves. Signing in to
  an account that exists moves the visitor's mockups in; where both have the same prompt, the
  account's stays.
- **Email service: Resend.** One HTTPS POST with a key, 3,000 emails a month and 100 a day free.
  Railway's Hobby plan blocks SMTP, so an HTTP API is the only way. A sign-up takes two emails (the
  code, the top-up), so the free plan carries about 50 sign-ups a day; past that the card says
  *Sign-ups are full for today.* The owner hears of waiting sign-ups in one email an hour at most.

## Starters and their recordings

- **Eight starters**, replacing Templates for everyone: *How UX Woz works*, plant care reminders, split
  a bill (phone); a clinic's appointment desk, a freelancer's invoices (web, desktop width); a podcast
  editor (desktop app); a daily word puzzle (game); a recipe box that plans the shopping (phone). I
  write the prompts, 1 to 5 sentences each; you can change any.
- **Depth: Home and every screen any Home design links to**, 4 recorded designs each (A, B and two
  Regenerates, then they repeat). About 36 designs a starter.
- **A recording is a model reply with its timing**, replayed where the model would be called
  (`generate.ts`). Everything after that is the normal path: the screens land in the visitor's own
  cache, pick and Regenerate work, and no new browser code is needed. Home's filing is recorded too, so
  the boxes fill.
- **At the edge** (a deeper click, an Edit, a box's Edit) the call is live and counted, and a hint says
  once: *From here your designs are made live.* In starters-only mode it says *Live designs are paused
  for now.*
- **Made by `bun run starters:record`** (live, about $0.50, a few minutes) into `recordings/`, one JSON
  per starter, about 1.2 MB in all, copied into the Docker image. Each file keeps the hash of the prompt
  it was made with; the admin's page says when the starters are older than the prompt. A test checks
  every recording is complete. Tests' cassettes stay separate.

## Onboarding

The starter is the first lesson, then five hints in a chain, one line each, each shown once at the
moment it applies and gone when the visitor acts: *Pick the one you like* → *Click anything in it* →
*Change it in words: Edit* → *Changed your mind? Undo* → *That is the whole app. Now describe your
own*, which opens the prompt box. Each step ends with the spark and sound the app already has. Nothing
blocks and nothing needs dismissing. *How UX Woz works* is the first card for those who would rather
read. A returning visitor sees Recent first and no hints.

Steps counted per day, once per visitor, in SQLite: arrived, picked a starter, picked a design, typed
an own prompt, hit the allowance, asked for a code, verified.

## What the public may do

| Thing | Visitor | Registered | Why |
|---|---|---|---|
| View and Comment links | no | yes | free to serve, but a public page needs an email behind it |
| Edit links | no | no | a stranger would spend someone's allowance |
| Export the boxes | yes | yes | free |
| Export project (zip) | no | yes | free; a second reason to register |
| Voice | yes | yes | runs in the browser; a spoken Edit counts like a typed one |
| Boxes by hand | yes | yes | free |
| A box's Edit, Visit now | yes | yes | model calls, counted |
| Luna, Sol, `/design`, backup, `/admin` | no | no | the owner's |

A visitor's file is deleted after 30 idle days. A person's file stops growing at 5 MB.

## The admin's page and the law's minimum

- **`/admin`** (the owner's cookie): today's and the month's spend against the caps, the switch, the
  step counts by day, users (email, spent of allowance, mockups, last seen; Give more, Block, Delete),
  the top-ups that wait with **Approve now**, and quota requests with the user's note, Approve (an amount, $0.50 by default) and Refuse. A new
  request emails the owner; an answer emails the user.
- **`/privacy`**, linked from the sign-up card: what is stored (email, prompts and mockups, a hashed
  address for a day, counts), who else handles it (Railway, Resend, OpenRouter with Anthropic, OpenAI),
  how long, a contact address. Only cookies the app needs, so no banner. **Delete my account** in the
  account menu removes the file, the rows and the share links at once.

## Build order

Opus builders in worktrees, a critic per step; steps 2 and 4 also get the critic who only tries to get
free model calls or see someone else's mockups. I write the new routes into `spec/code-contract.md`
before step 2, so 4, 5 and 6 can run side by side. Each step puts its sentences in `spec/behavior.md`
first.

1. **A cache per person** (Server). Routes take the cache from the request; the owner is the only
   person. No visible change, no test edited. With it, apart: **recordings** (Engine, a script, the
   starter prompts).
2. **Visitors and the meter** (Server, new `people.ts`): the cookie, the cost hook, Haiku only, the
   three limits, the switch, `UXWOZ_PUBLIC`.
3. Wire the replay into drawing (small).
4. **Sign-up** (Server, new `account.ts`, `mail.ts`): code, verify, the waiting top-up, carry over,
   sign out, delete, ask for more. Side by side with 5.
5. **The first visit** (Canvas, Design): starter cards, hints, the meter, the sign-up card, the account
   menu, what is hidden.
6. **`/admin`, `/privacy`, the backup zip, the 30-day sweep.**
7. The lead tries to break it on a production-mode local server with a copy of the cache, then on the
   live host with `UXWOZ_PUBLIC` unset. Then your yes, the push, the flag.

About 2 to 3 hours and a third of a 5-hour window. Model credits: about $0.50, for the recordings.
CSS has 124 lines and 5.5 KB left under the caps; I expect to need about 90 lines. If that fails I ask.

## What I need from you

- A Resend account (resend.com, free). Add the domain `mail.uxwoz.com`; Resend's **Auto Configure**
  writes the records into GoDaddy for you. By hand they are three, with values copied from Resend's
  page: MX `send.mail` (priority 10), TXT `send.mail` (SPF), TXT `resend._domainkey.mail` (DKIM). A
  subdomain leaves any mail on uxwoz.com alone. Then a sending-only API key into Railway as
  `RESEND_API_KEY`.
- For the privacy note: who runs the site (a name) and a contact email.
- One look at OpenRouter's activity page, to confirm a design really bills about $0.0008.

## The owner's answers (2026-11-11)

1. **Sizes**: $0.10 for a visitor, $0.15 more for a registered user.
2. **The top-up**: within 12 hours of verifying, sooner if the owner approves it, with an email when it
   arrives. The aim is to stop someone farming 100 accounts at once. My reading: nothing is granted at
   the moment of verifying.
3. **The monthly cap**: $20.
