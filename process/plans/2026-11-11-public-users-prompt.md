# Prompt: open UX Woz to the public, with allowances, sign-up and onboarding

Paste everything below the line into a new Claude Code session (Fable 5.2) opened on this repo.

---

You are the lead for opening UX Woz to the public. Today https://app.uxwoz.com runs on Railway for one
person: the owner, behind `UXWOZ_OWNER`. Read `AGENTS.md` first, then the latest file in
`process/journal/`, then the Sharing section of `spec/behavior.md` and `share.ts` (the owner's gate and
`guard` are where roles live today). You plan and review; Opus 5.5 subagents build, one builder in a
worktree and one critic per step, with the brief template in `AGENTS.md`.

Write a plan to `process/plans/` first, show it to the user, and build after their go-ahead. Nothing is
pushed without the user's yes: a push deploys to the live app.

## What the user wants

There is no marketing site: uxwoz.com redirects to the app, on purpose. A stranger lands in the app.

1. **Starter prompts.** A first-time visitor sees 4 to 8 ready prompts, each 1 to 5 sentences: phone
   apps, web apps, a desktop app, a game. Picking one calls no model. It replays recorded Haiku replies
   with their original timing, so it looks and feels live, and each screen has at least 4 recorded
   versions (so Regenerate works too).
2. **A visitor's allowance.** Haiku is called only when a visitor types their own prompt or an Edit. Each
   visitor gets about $0.25 of model use. No Luna or Sol for the public: too expensive.
3. **Sign-up.** When the allowance is gone, the visitor registers and verifies their email, and gets
   about $0.50 more.
4. **Quota requests.** Past that, a user asks for more and the owner approves or refuses as admin.
5. **The cost of one registered user stays at or under $0.25.** Caching exists to hold that line.
6. **Onboarding in the app**, since nobody reads marketing pages. It should be satisfying and fun.

## What the plan must decide, with a reason each

- **What $0.25 buys.** Work it out from the costs stored in the cache: Haiku per design, per pick (A OR
  B is two designs), and the background work per screen (Terra's filing, the fixer's visits). Say whether
  background work counts against a visitor, runs less often for them, or not at all.
- **Where users live.** Everything is one JSON file written by one process. Users, allowances, spend and
  each user's own mockups need a home: the same file, or `bun:sqlite` (built in, so still no runtime
  dependency). A visitor must never see another visitor's mockups.
- **Who a visitor is.** A cookie is cheap to reset, and a reset is a fresh $0.25. Set limits that hold
  anyway: per address, per day for the whole site, and a hard monthly cap that switches the public to
  starter prompts only. The owner sees the spend and can flip that switch.
- **Sign-in without passwords.** A link by email is enough and stores no password. Sending email needs a
  service with a plain HTTP API; recommend one, say what the user must sign up for and which DNS records
  go into GoDaddy. Carry a visitor's mockups over when they register.
- **The $0.50 "after some time".** The user's words are unclear: at once on verifying, or after a wait?
  Ask.
- **How deep the recordings go.** The first screen only, or also the first clicks from it. What happens
  at the edge, where a click would need a live call. How recordings are made, stored and re-recorded when
  the prompt changes (the tests' cassettes are a different thing: do not mix them).
- **The admin's page.** Users, spend per user and per day, quota requests with Approve and Refuse.
- **What a visitor may not do.** Share links, Export, voice, the boxes: say for each.
- **The law's minimum.** Emails are stored, so a short privacy note and a way to delete an account.

## Onboarding: the lead's starting position

The user listed four ideas (a tutorial game, a tutorial mockup whose screens explain the app, a guided
tour, hints that appear when you act) and asked for the best one. Start from this and improve it:

- **The starter prompt is the first lesson.** The visitor picks a prompt, watches two designs draw, and
  picks one: the product's whole idea in 30 seconds, at no cost.
- **Hints at the moment of action**, one line each, shown once: beside the two designs ("pick the one you
  like"), then on the picked screen ("click anything in it"), then Edit, then Undo. No tour that blocks
  the app, no dialog to dismiss.
- **One starter is "How UX Woz works"**: a mockup made in UX Woz whose screens explain UX Woz. It costs
  nothing to serve and shows the product by being it.

Count the steps so experiments can be compared: arrived, picked a starter, picked a design, typed an own
prompt, hit the allowance, registered, verified. Counts only, no tracking service.

## Rules that stand

No runtime dependencies. The owner's access and the existing share links keep working. Every visible
change gets its line in `spec/behavior.md` first. New CSS goes in `design/` under its caps; if the caps
cannot hold it, ask before raising them. Sign-in, allowances and the limits get a second critic who only
tries to get free model calls or see someone else's mockups. Never test against the live site's data: use
a copy of the cache on another port. Check the usage card before each subagent and start none past 75% of
the 5-hour window.
