# Code contract

This doc owns the shapes the code agrees on: packages, the HTTP API, the stored types, env vars and
the test setup. It does not own what the user sees ([behavior.md](behavior.md)) or the screen format
and model settings ([ui-generation.md](ui-generation.md)).

## Example

```
POST /api/screen  {"app": "A coffee shop ordering app", "action": null, "model": "claude-haiku-5.5", "device": "phone"}

{"type":"meta","key":"a coffee shop ordering app","cached":false,"variants":2}
{"type":"chunk","variant":0,"text":"<title>Menu</title><meta name=\"idea\" ..."}
{"type":"chunk","variant":1,"text":"<title>Order"}
...
{"type":"version","variant":1,"version":{...Version}}
{"type":"version","variant":0,"version":{...Version}}
{"type":"done","entry":{...CacheEntry, "versions":[], "proposals":[{...}, {...}]}}

POST /api/pick  {"key": "a coffee shop ordering app", "index": 1}
{"entry":{...CacheEntry, "versions":[{...the second proposal}]}, "filing":true, "visiting":false}

GET /api/map?app=A%20coffee%20shop%20ordering%20app&wait=1      (answers once filing and a visit are done)
{"root":"a coffee shop ordering app","entries":[...],"boxes":{...Boxes},"past":{"components":[],"rules":[{"what":"Filing after home","at":"…"}],"data":[]},"filing":false,"visiting":false}
```

## Packages

- `@uxwoz/core` (`src/packages/core`): models, prompt, provider streaming, screen cache with the
  boxes, filing, the fixer, cache keys, frame page (with paste by ID and the current link) and devices. `frame.ts`, `keys.ts` and `tree.ts` run in the browser too, so they use
  no Node or Bun APIs.
- `@uxwoz/web` (`src/packages/web`): `Bun.serve` server, the page (`index.html`, `app.ts`
  as the entry, `state.ts`, `screens.ts`, `nav.ts`, `drawer.ts`, `toolbar.ts`, `net.ts`, `canvas.ts`,
  `boxes.ts`, `sharing.ts`, `comments.ts`, the CSS in `design/`, bundled by Bun's HTML import), the player (`player.html`,
  `player.ts`, `pins.ts` (shared with the app), its CSS in `design/player.css` on the shared tokens), the design sheet (`design/sheet.html`, `design/sheet.ts`), the share routes (`share.ts`), the desks (`desks.ts`), and the themes in `themes/`.

There are no runtime dependencies; `@types/bun` and `typescript` are dev-only.

## HTTP API

The server listens on 127.0.0.1 by default (`UXWOZ_HOST`). Every POST must be `application/json` (else 415) and must not
come from another origin (`Origin` or `Sec-Fetch-Site: cross-site`, else 403), so no other web page
can spend model credits. The `Origin`'s host is compared with the request's host (`X-Forwarded-Host` when a proxy sets it, else `Host`), scheme left out,
so a proxy that ends HTTPS and forwards plain HTTP still passes; a request with no `Origin` passes.
A link the server builds (a share's `url`, the player's `og:image`) uses the request's public origin: the
scheme from `X-Forwarded-Proto` (its first value) when present, else the request's own, and that same host.

- **Desks**: every `/api` request works on one person's desk, a screen cache with its own filing chains
  and visits, and no route can name another's. `createServer`'s `who(req)` says whose request it is
  (default: always `owner`, the cache it is given). Any other id must be 16-40 lowercase hex, else
  400; it opens `<dir>/<id>.json` (today's format) on its first request, where `dir` is the option
  `usersDir`, else `UXWOZ_USERS_DIR`, else `users/` beside the cache file (`server.ts` run directly;
  no dir keeps it in memory), and closes after 10 idle minutes, saved first, never while its filing or
  a visit runs. A share token (`/s/:token`, `/api/s/*`, `x-uxwoz-share`) finds its desk with
  `whose(token)`: the owner's and the open ones are searched (in public mode the owner's, then the
  person the share index names, opened if closed: spec/public.md), and an edit link works on its desk.

- `GET /healthz` → 200 `ok` (text) for the host's health check: open with `UXWOZ_OWNER` set, touches nothing.

- `GET /api/config`: models (id, label, costEstimated), themes (`mockup`, `clean`), devices (id,
  label, width), and the default model, theme and device; `warning` when the cache file is from a
  newer app (it is left alone and nothing is saved).
- `POST /api/screen {app, action?, model?, device?, from?, label?}`: a new screen, as an NDJSON
  stream. `action` is `@name: prompt`, `@name` alone (a screen the mockup has or plans; one with no
  plan is made from the name and `label`); anything else but `home` is 400. A screen with that name
  is a cache hit. A cache hit sends `meta` (cached true, variants 0) and `done` only; a screen whose A OR B
  is still open comes back with its `proposals`, at no cost, unless a side is missing (refused or
  failed): then it streams like a new screen (`meta.variants` 2), sends the side there as `version` at
  once, and draws only the missing side, a paid request like any other (a recording still answers a
  starter's). Otherwise two designs stream at once:
  `meta.variants` is 2 and each `chunk` names its side (`variant` 0 or 1). One random side is asked
  for a clearly different design. Each side that finishes is stored at once as that side's
  proposal and sent as `version`; one that fails sends `failed` with its message. The first side to
  finish makes the screen, with the click as its parent (`from`, the key of the screen clicked in,
  and `label`, the control's text). `done` ends the stream with the screen; `error` comes when both sides fail. A side that finishes after the other was
  picked, or after the screen, the screen clicked in or its mockup was deleted (even before the
  screen existed: the cache remembers when each key was deleted), is dropped. A `from` that is not
  a picked screen gets `error` before any model call. 400 on an empty or too long
  `app` (2,000) or `action` (500), or an unknown model or device. A later screen of a mockup without
  a first screen gets `error` before any model call. A closed browser connection aborts the model
  calls; a side that already finished is still stored.
- `POST /api/pick {key, index}`: keep proposal `index` as the screen's first version and drop the
  other; `{entry, filing: true, visiting}`, as filing starts in the background (see below), and on
  every 5th pick of the mockup (`VISIT_EVERY`, counted in `boxes.picks`) a visit after it; 404 if
  the screen has no open A OR B or that side has not finished.
- **Filing** runs after a pick and after a screen's Edit (whose `done` event has `filing: true`), on
  the background model GPT-6.1 Terra, one filing per mockup at a time. It applies the reply's lines
  to the boxes (`applyFiling` in `core/src/filing.ts`) and refuses, in the server log and in the
  screen's `filed.refused`, a bad or used ID, a line over 120 characters, a full box, a part that is
  not there, a row with no table above it or naming another table, the rows of a refused table. A
  row joins the table above it whatever ID it names. A new screen or a revise waits for a running filing at most 5 s (`fileWaitMs`) before
  its model calls, after its `meta` event.
- **A visit** of the fixer (`visitPaper` and `applyVisit` in `core/src/fixer.ts`) takes its turn in
  the same chain, so filing and the fixer never change the boxes at once. Terra reads the paper and
  the screens whose newest version is newer than the last visit, oldest first, parts numbered
  (code's numbers only: `numberParts` drops any a model wrote). The visit's forms are its own
  (merge, remove, add component, redraw a screen or a component) and filing's rule, table and row
  lines (`boxLines`, shared with filing; `parseFiling` takes an optional `add `). Its lines are
  applied with refusals in `visits[].refused`: no such entry, an entry `by: 'user'` (except in the
  box of an Edit, below; a component the user wrote is redrawn only in an Edit of Components), two IDs of
  different boxes, a used ID, a part not there, a second redraw of one screen, more than 5
  redraws (`MAX_REDRAWS`, a cost limit), a screen with an open A OR B. A merge removes the newer
  entry of the two; a component removed this way leaves its HTML in place (`removeComponent`). The
  reply is dropped when the mockup was deleted or started over after the visit began. Redraws then
  run at once, as `/api/revise` Edits on the screen's own model that start no filing, skipping a
  screen with a version newer than the visit; their versions have `by: 'fixer'`, and a redrawn
  component keeps its `by`. They join the visit's one change of the boxes (`Applied.group`). A visit
  asked for while one runs (Visit now, the 5th pick) comes after it. Start over and
  deleting the mockup stop them. The next visit reads what changed since the last visit that did
  not fail. The map's `filing` counts filings only, so a visit in the chain is `visiting`.
- **An Edit of a box** is a visit with `ask: {box, text}`: the request names the box and the
  user's words just before the visit's last line, and the note keeps `ask`.
- **Box states**: each box (components, rules, data) keeps its last 10 states (`BOX_STATES`), one
  before each change, with `what` that change was and `at` when; `cache.group(fn, change?, what?)`
  makes a filing (*Filing after home*), a visit with its redraws (*Visit*, or *Edit: …* for an Edit
  of a box), or an Undo of a visit one change, and the outermost group names it; a user's change
  is named by what it did (*You changed score-direction*). They are saved in the cache file under `states`, by mockup. An Undo that drops
  a component pastes its HTML into the screens that paste it; no Undo frees an ID (`gone` keeps
  every ID it drops).
- `POST /api/revise {key, change?, model?, device?}`: one new version of a picked screen or a
  component (a component takes `change` only, else 400), streamed
  like `/api/screen` with one side (`meta.variants` 1, then `chunk`*, `version`, `done`). With
  `change` (1-1,000 characters) it is an Edit: the model gets the newest version's HTML and the
  change, and the version stores it as `feedback`. Without it, a Regenerate from the screen's own
  prompt. Both keep the device of the newest version (`device` only for screens made before
  devices). 400 on a bad `change`, model or device, 404 for an unknown screen, 409 while its A OR B
  is open; `error` if the model fails or the screen was deleted meanwhile.
- `POST /api/undo {key}`: drop the newest version; `{entry}`, or 404 when one or none is left.
- `GET /api/map?app=…[&wait=1]`: `{root, entries: CacheEntry[], boxes: Boxes, past, filing, visiting}`
  (`past`: each box's changes that Undo can take back, oldest first, `{what, at}`)
  for one mockup, oldest first, components included; with `wait=1` once its running filing and
  visit, redraws included, have finished (at most a minute). Levels, the
  tree and planned screens are not stored: `screenTree` and `plannedScreens` in `core/src/tree.ts`
  work them out (server and browser).
- `GET /api/apps`: `{apps: {app, id, screens, updatedAt}[]}`, every mockup once as first typed,
  most recently changed first, for the Recent mockups lists; `id` is the mockup's ID in its address,
  which the page looks up there.
- `GET /m/:mockup` and `GET /m/:mockup/:screen`: the app's page, as `/` serves it (the same gate); the
  page reads the IDs from its address (`web/src/address.ts`).
- `GET /api/export?app=…`: the mockup as a zip (`application/zip`, stored entries, written by
  `core/src/zip.ts`), `Content-Disposition: attachment; filename="<slug>.zip"`, the slug being the
  prompt's letters, digits and dashes (40 at most). It holds one folder, `<slug>/`, with `HANDOFF.md`,
  `README.md`, `rules.md`, `data.md`, `components.md` and `screens/<name>.html` per drawn screen
  (newest version, components pasted, Pico and `mockup.css` inlined, vh as pixels of the device's
  height, centred on a grey page, our link script in place of the frame's); see
  [behavior.md](behavior.md#export). 404 for a mockup with no picked first screen.
- `GET /api/backup`: the whole screen cache, the same bytes `save()` would write to the cache file
  now (every mockup, the boxes, the shares, feedback and trips), as `application/json` with
  `Content-Disposition: attachment; filename="screen-cache.json"` and `Cache-Control: no-store`; it
  changes nothing. The owner's only (see Sharing): never through a share link of any role. A file
  saved from it loads as `UXWOZ_CACHE_FILE`. In public mode it is a zip instead (see
  [public.md](public.md#routes)).
- `POST /api/delete {key}`: delete a screen. Screens the first screen reached before and no longer
  reaches (through the clicks that made screens and the buttons in each screen's newest version) go
  too; a screen whose first click came from a screen that is gone takes the screen that reaches it
  now as its parent. Deleting the first screen deletes the mockup. `{removed, root, entries}`: the
  keys removed and the whole mockup as `/api/map` sends it; 404 if unknown.
- `POST /api/delete-app {app}`: delete every screen, component and box of a mockup; `{removed}`, the
  number of screens.
- `POST /api/box {app, op, box, id?, text?, columns?, rows?}`: the user's box edits. `op` `add`,
  `set` or `delete` on `box` `rules` (`text`) or `data` (`columns`, `rows`); a new entry's ID comes
  from `text` (the sentence, or the table's name). `op: 'seen', box, ids?` (also `components`, and
  `notes` with visits by `at`) clears the new marks. `op: 'undo', at, i` undoes change `i` of the
  visit that began at `at` (`undoChange`); 400 when it was undone, its version is gone or its box is
  full, or the entry is no longer the fixer's (`you changed X since`); an entry already back or gone
  counts as undone. `op: 'undo-box', box` puts a box back as it was before its last change
  (`undoBox`; 400 when there is nothing to undo). For `notes` it undoes the newest visit not undone
  yet (`undoVisit`): changes it cannot undo are skipped, the visit is marked `undone`, and the map
  comes back with `error` saying the first skip. `op: 'visit'` asks for a visit now (after the
  running one, if any); `op: 'edit', box, text` (1-1,000 characters) starts an Edit of the box.
  Both 409 with why: *Wait for Home's pick.*, or for an Edit *The fixer is visiting now*. The whole mockup as `/api/map` sends it; 400 with `{error}` for a refused edit, 404 for
  a mockup with no first screen. A component is deleted with `/api/delete`, changed with
  `/api/revise`, undone with `/api/undo`.
- `POST /api/warmup {model}`: 204 at once; sends a 16-token request in the background.
- **Sharing** (`web/src/share.ts`): `POST /api/share {app, role, cap?}` makes a link (`role` view,
  comment or edit; `cap` 1-1,000, default 20, edit only) and answers the `Share` with its `url`; 404
  before the first pick. `GET /api/shares?app=` → `{shares, feedback, trips}`. `POST /api/unshare
  {token}` (404 if unknown). `GET /s/:token` serves the player (`player.html`), or the app for an
  edit link, from the hidden routes `/_player` and `/_app`; 404 for a revoked link. A visitor's
  routes: `GET /api/s/:token/map` → `{role, app, root, components, screens: {key, name, title, html,
  device, parent}[]}` (picked screens' newest versions and their tree parents only; it counts an
  open in memory; a GET never writes the file), `POST /api/s/:token/feedback {visitor, name, kind,
  screen, text?, about?, tag?, nth?, up?, label?}` → `{ok, id}` (`kind` comment, thumb or done; 400
  *Type your name first.* without a `name`, for a text over 1,000 characters, or an empty one but a
  thumb; 404 for a screen not in the mockup; `about` is kept to 120 characters, `tag` to 20 lower case
  letters and digits, `nth` to an integer 0-999, `label` to 80; a comment with `label` is one at a dead
  control), `GET /api/s/:token/feedback?visitor=` → `{feedback}` (that visitor's own comments,
  thumbs and answers with `resolved`; empty for an unknown or malformed visitor; never another
  visitor's), `POST /api/s/:token/trip {id, visitor, name, screens, dead}` (400 without a `name`;
  replaces the trip with that id; at most 50 screens and 50 dead clicks). All three are 403 for a view
  link. A mockup keeps 500 of each: comments, thumbs, answers (Done, and the old dead controls), trips.
  The two POSTs save the file at most once a second. `POST /api/feedback {app, id, resolved}` (the
  owner only: 403 through an edit link) sets or clears a comment's `resolved` → `{ok}`; 404 for an
  unknown id. Every request body is at most 64 KB (`maxRequestBodySize`).
- **An edit link**: its page sends `x-uxwoz-share: <token>` on every `/api` call. It may use
  `/api/config`, `/api/apps` (its mockup only), `/api/map`, `/api/screen`, `/api/pick`,
  `/api/revise`, `/api/undo`, `/api/box` and `/api/delete`, each for its own mockup only: the mockup
  is a GET's `?app=`, or a POST body's `app` or the first part of its `key`; a POST whose `app` or
  `key` is not a string, or whose `?app=` names another mockup than its body, is 403. It may not use
  `/api/share`, `/api/shares`, `/api/unshare`, `/api/feedback`, `/api/delete-app`, `/api/warmup`, `/api/backup`, `/api/admin`, or `/api/delete` of
  its first screen (all 403). Its budget (`cap`) counts each call that makes a model work: a new
  screen that is not a cache hit, a pick (its filing), `/api/revise`, and `/api/box` with `edit` or
  `visit`. A unit is taken before the call and given back when the call is refused; past the cap,
  429 *This link's budget is used up.*
- **The owner**: with `UXWOZ_OWNER` set, `/`, `/m/…`, `/design`, `/admin` (public mode) and every `/api` route but `/api/s/*` need the cookie
  `uxwoz_owner=<secret>` (401 on the API, a one-line 403 page on `/` and `/design`; `/og.png` and share links
  answer everyone); `/?owner=<secret>` sets it
  (`HttpOnly; SameSite=Lax`, and `Secure` when the public origin is https) and redirects to the same path without it. The server fetches the
  pages it proxies from itself (`127.0.0.1` and its port), never from the request's Host.
- `GET /design`: the design sheet, built from the app's own CSS and classes on static markup: the logo, every
  colour token by day and night, type, controls, surfaces, motion, and a ▶ per sound.
- `GET /og.png`: the share preview image (1200×630, `design/brand/og.png`) that `player.html`'s `og:image` names.
- `GET /themes/{pico,mockup}.css`: the stylesheets. Theme `clean` is `pico.css`; `mockup` is
  `pico.css` followed by `mockup.css`.

## Frame messages

The script we add to every screen talks to the app with `postMessage`; the app accepts a message
only from a card's own frame.

```ts
{ uxwoz: 'action', prompt, label, part } // a click on a control with an action prompt (ignored on a side of an A OR B)
{ uxwoz: 'touch' }                   // any press in the screen: it becomes the current screen
{ uxwoz: 'key', key, code, shift, mod } // a zoom key (⌘/Ctrl with + − 0), ⌘[ ⌘], ⇧1-3 outside a text field,
                                     // or Esc: the app handles it as if pressed outside the screen
{ uxwoz: 'size', height, width }     // the screen's size, so the frame fits it (160-8000 px tall;
                                     // the card is the device's width; `width` is reported, not used)
{ uxwoz: 'wheel', dx, dy }           // scroll over the screen: dy and dx scroll the canvas
{ uxwoz: 'zoom', dy, x, y }          // Ctrl/Cmd + scroll or a pinch over the screen, at (x, y) in
                                     // the frame: zooms the canvas around that point
{ uxwoz: 'part', text, tag, nth, x, y, w, h } // the part clicked after the page sent { uxwoz: 'name-part' }:
                                     // its words (60 characters), tag, place among the parts with the same
                                     // tag and words, and its rectangle in the frame's own pixels; while
                                     // picking, the part under the pointer has an outline
{ uxwoz: 'located', n, spots: [{ id, x, y, w, h }] } // the answer to locate (n echoed): an anchor not found is left out
```

An `action` also carries `part`, the control clicked as above. The page sends the frame
`{ uxwoz: 'name-part' }` to pick a part, `{ uxwoz: 'name-part', off: true }` to stop picking, and
`{ uxwoz: 'locate', anchors: [{ id, text, tag, nth }] }` (at most 200) to find parts again: the `nth`
element with that tag and words (the first if there are fewer), else the first part of any tag with
those words. `locate` may carry `n`, a number the page bumps for each screen it shows; `located` echoes it
back, so the page drops a late answer about the screen before. The frame accepts these from its parent only and
does nothing until asked.

## Types

```ts
CacheEntry { key; app; action: string | null; name?: string; parent: { key; label } | null;
             versions: Version[]; proposals?: (Version | null)[]; filed?: { at; screen; ms; costUsd; added; changed; refused; error? } }
             // filed: the screen's last filing, shown in its Info
             // mid (the first screen only): the mockup's ID in its address, 6 of [a-z0-9], unique in the cache;
             // sid: the entry's ID in the address, 2-4 of [a-z0-9], unique in its mockup. Made from a hash
             // (the prompt and its first design's time; the key) where missing or taken twice, at load and save.
             // name never changes: "home" for the first screen, else the one in the link that
             // opened it ("@sleep-report: …"); unique in the mockup; links use it as "@sleep-report".
             // action is the screen's prompt (without "@name: "). parent is the screen and
             // click that first made it.
             // A planned screen (plannedScreens) has the same shape with no versions and no
             // proposals; it is never stored.
             // The last version shows; versions is empty and proposals holds the two sides of
             // the open A OR B (null until a side finishes) until a pick
             // A component has kind: 'component', its ID as name, where it belongs as action,
             // the screen it was taken from as parent, and by, at, seen (as Mark); its key is
             // normalize(app) + ' » #' + ID. It is in no tree; its links count where it is pasted.
Mark       { by: 'filing' | 'fixer' | 'user'; at; seen }   // who last wrote an entry, when, and whether its box was looked at since
Boxes      { rules: (Mark & { id; text })[]; data: (Mark & { id; columns: string[]; rows: string[][] })[];
             gone: { components, rules, data: string[] }   // IDs used and deleted, never used again
             visits?: Visit[]; picks?: number }   // the fixer's last 20 visits, oldest first; picks so far
Visit      { at; ask?: string; undone?: boolean; ms; costUsd; screens; changes: Change[]; refused: string[]; error?; seen }
Change     { text; note?; undo?: Undo; undone? }   // text says what changed: "merged a into b"
Undo       { put: box; entry; index } | { drop: box; id } | { key; createdAt }
           // put a removed or changed entry (a component's whole CacheEntry) back; delete an added one; drop a redraw's version
Version    { html; model: ModelId; servedModel; createdAt; costUsd: number | null;
             costEstimated; firstChunkMs; totalMs; finishReason; device?: Device;
             name?; idea?; feedback?; by?: 'fixer' }
             // name comes from the model's <title>, idea from its <meta name="idea">;
             // feedback is the Edit request that made this version, by: 'fixer' when a visit asked
Shared     { shares: Share[]; feedback: Feedback[]; trips: Trip[] }   // per mockup, in the cache file under `shared`
Share      { token; role: 'view' | 'comment' | 'edit'; createdAt; cap?; used; opens }   // token: 32 hex characters
Feedback   { id; at; visitor; name; screen: key; title; kind: 'comment' | 'thumb' | 'dead' | 'done'; text?; about?; tag?; nth?;
             up?; label?; resolved? }   // id: 16 hex, given on load to old entries; 'dead' is read, no longer
             // written; about, tag, nth: the anchor; resolved: when the owner resolved it
Trip       { id; visitor; name; at; screens: string[]; dead: string[] }   // the last 500 feedback and trips are kept
TreeNode   { level; parent: key | null; label }
             // from screenTree: level 1 is the first screen, the fewest clicks from it otherwise
VoiceState 'off' | 'asleep' | 'awake' | 'countdown'   // web/src/voice.ts, the microphone's state
VoiceEvent { type: 'state'; state } | { type: 'interim'; text } | { type: 'countdown'; text; secondsLeft }
           | { type: 'send'; text } | { type: 'error'; message }   // what VoiceMachine tells the page
           | { type: 'heard'; text; final; woke; phrase }   // every piece with words while on; woke: it starts with the
           // wake phrase, or the machine was awake or counting down already; phrase: the piece is a stop or cancel phrase
           | { type: 'quiet' }   // the browser heard no speech, once per turn-on and only before any words; an 'error'
           // from SpeechInput need not turn it off
ModelId    'claude-haiku-5.5' | 'gpt-6-luna-fast' | 'gpt-6.1-sol-ultrafast' | 'gpt-6.1-terra'
           // Terra is the background model (filing, the fixer): never a screen model, never in /api/config
Device     'phone' (390 × 844 px) | 'desktop' (1024 × 768 px): every screen is that wide and at
           least that tall
key        normalize(app) for the first screen, normalize(app) + ' » @' + name for any other
           (version 3 and 4 files also hold screens under normalize(app) + ' » ' + normalize(prompt));
           normalize turns » into >; action "home" or "@home" means the first screen
```

## Env vars

Read from the repo-root `.env` by `bun --env-file=../.env`; the browser never sees them.

| Var | Use |
|---|---|
| `OPENROUTER_API_KEY` | Claude Haiku 5.5 |
| `OPENAI_API_KEY` | GPT-6 Luna, GPT-6.1 Sol, GPT-6.1 Terra (filing, the fixer) |
| `PORT` | server port, default 3000 |
| `UXWOZ_HOST` | listen address, default `127.0.0.1` |
| `UXWOZ_CACHE_FILE` | screen cache `{version: 5, entries, boxes, states, shared}`, default `temp/screen-cache.json` |
| `UXWOZ_USERS_DIR` | people's caches, `<id>.json` each (see Desks), default `users/` beside the cache file |
| `UXWOZ_OWNER` | the owner's secret: when set, only a browser with its cookie uses the app (see Sharing) |
| `UXWOZ_PUBLIC`, `UXWOZ_URL`, … | the public app: see [public.md](public.md#mail) |
| `UXWOZ_RECORD` | `1` makes tests call the live APIs and rewrite `cassettes/` |

## Tests

`bun test` runs `src/tests/*.test.ts`. Model calls go through `tests/cassette.ts`, which replays
`cassettes/<test file name>.json` keyed by a hash of URL and request body; `tests/no-network.ts` makes any
other non-localhost call throw. A test file that calls models has a cassette of the same name;
`cut-off.test.ts`, `races.test.ts`, `boxes.test.ts`, `fixer.test.ts` and `share.test.ts` use a fake provider instead.
