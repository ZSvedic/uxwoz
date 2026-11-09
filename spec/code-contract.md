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
  `boxes.ts`, `shell.css`, bundled by Bun's HTML import), and the themes in `themes/`.

There are no runtime dependencies; `@types/bun` and `typescript` are dev-only.

## HTTP API

The server listens on 127.0.0.1 by default (`UXWOZ_HOST`). Every POST must be `application/json` (else 415) and must not
come from another origin (`Origin` or `Sec-Fetch-Site: cross-site`, else 403), so no other web page
can spend model credits.

- `GET /api/config`: models (id, label, costEstimated), themes (`mockup`, `clean`), devices (id,
  label, width), and the default model, theme and device; `warning` when the cache file is from a
  newer app (it is left alone and nothing is saved).
- `POST /api/screen {app, action?, model?, device?, from?, label?}`: a new screen, as an NDJSON
  stream. `action` is `@name: prompt`, `@name` alone (a screen the mockup has or plans; one with no
  plan is made from the name and `label`); anything else but `home` is 400. A screen with that name
  is a cache hit. A cache hit sends `meta` (cached true, variants 0) and `done` only; a screen whose A OR B
  is still open comes back with its `proposals`, at no cost. Otherwise two designs stream at once:
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
- `GET /api/apps`: `{apps: {app, screens, updatedAt}[]}`, every mockup once as first typed,
  most recently changed first, for the Recent mockups lists.
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
- `GET /themes/{pico,mockup}.css`: the stylesheets. Theme `clean` is `pico.css`; `mockup` is
  `pico.css` followed by `mockup.css`.

## Frame messages

The script we add to every screen talks to the app with `postMessage`; the app accepts a message
only from a card's own frame.

```ts
{ uxwoz: 'action', prompt, label }   // a click on a control with an action prompt (ignored on a side of an A OR B)
{ uxwoz: 'touch' }                   // any press in the screen: it becomes the current screen
{ uxwoz: 'key', key, code, shift, mod } // a zoom key (⌘/Ctrl with + − 0), ⌘[ ⌘], ⇧1-3 outside a text field,
                                     // or Esc: the app handles it as if pressed outside the screen
{ uxwoz: 'size', height, width }     // the screen's size, so the frame fits it (160-8000 px tall;
                                     // the card is the device's width; `width` is reported, not used)
{ uxwoz: 'wheel', dx, dy }           // scroll over the screen: dy and dx scroll the canvas
{ uxwoz: 'zoom', dy, x, y }          // Ctrl/Cmd + scroll or a pinch over the screen, at (x, y) in
                                     // the frame: zooms the canvas around that point
```

## Types

```ts
CacheEntry { key; app; action: string | null; name?: string; parent: { key; label } | null;
             versions: Version[]; proposals?: (Version | null)[]; filed?: { at; screen; ms; costUsd; added; changed; refused; error? } }
             // filed: the screen's last filing, shown in its Info
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
TreeNode   { level; parent: key | null; label }
             // from screenTree: level 1 is the first screen, the fewest clicks from it otherwise
VoiceState 'off' | 'asleep' | 'awake' | 'countdown'   // web/src/voice.ts, the microphone's state
VoiceEvent { type: 'state'; state } | { type: 'interim'; text } | { type: 'countdown'; text; secondsLeft }
           | { type: 'send'; text } | { type: 'error'; message }   // what VoiceMachine tells the page
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
| `UXWOZ_CACHE_FILE` | screen cache `{version: 5, entries, boxes, states}`, default `temp/screen-cache.json` |
| `UXWOZ_RECORD` | `1` makes tests call the live APIs and rewrite `cassettes/` |

## Tests

`bun test` runs `src/tests/*.test.ts`. Model calls go through `tests/cassette.ts`, which replays
`cassettes/<test file name>.json` keyed by a hash of URL and request body; `tests/no-network.ts` makes any
other non-localhost call throw. A test file that calls models has a cassette of the same name;
`cut-off.test.ts`, `races.test.ts`, `boxes.test.ts` and `fixer.test.ts` use a fake provider instead.
