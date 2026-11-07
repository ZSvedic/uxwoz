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
{"entry":{...CacheEntry, "versions":[{...the second proposal}]}}
```

## Packages

- `@uxwoz/core` (`src/packages/core`): models, prompt, provider streaming, screen cache, cache keys,
  frame page and devices. `frame.ts`, `keys.ts` and `tree.ts` run in the browser too, so they use
  no Node or Bun APIs.
- `@uxwoz/web` (`src/packages/web`): `Bun.serve` server, the page (`index.html`, `app.ts`,
  `canvas.ts`, `shell.css`, bundled by Bun's HTML import), and the themes in `themes/`.

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
  plan is made from the name and `label`), or a plain prompt (links from before names). A screen
  with that name, else with that prompt's key, is a cache hit. A cache hit sends `meta` (cached true, variants 0) and `done` only; a screen whose A OR B
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
  other; `{entry}`, or 404 if the screen has no open A OR B or that side has not finished.
- `POST /api/revise {key, change?, model?, device?}`: one new version of a picked screen, streamed
  like `/api/screen` with one side (`meta.variants` 1, then `chunk`*, `version`, `done`). With
  `change` (1-1,000 characters) it is an Edit: the model gets the newest version's HTML and the
  change, and the version stores it as `feedback`. Without it, a Regenerate from the screen's own
  prompt. Both keep the device of the newest version (`device` only for screens made before
  devices). 400 on a bad `change`, model or device, 404 for an unknown screen, 409 while its A OR B
  is open; `error` if the model fails or the screen was deleted meanwhile.
- `POST /api/undo {key}`: drop the newest version; `{entry}`, or 404 when one or none is left.
- `GET /api/map?app=…`: `{root, entries: CacheEntry[]}` for one mockup, oldest first. Levels, the
  tree and planned screens are not stored: `screenTree` and `plannedScreens` in `core/src/tree.ts`
  work them out (server and browser).
- `GET /api/apps`: `{apps: {app, screens, updatedAt}[]}`, every mockup once as first typed,
  most recently changed first, for the Recent mockups lists.
- `POST /api/delete {key}`: delete a screen. Screens the first screen reached before and no longer
  reaches (through the clicks that made screens and the buttons in each screen's newest version) go
  too; a screen whose first click came from a screen that is gone takes the screen that reaches it
  now as its parent. Deleting the first screen deletes the mockup. `{removed, root, entries}`: the
  keys removed and the whole mockup as `/api/map` sends it; 404 if unknown.
- `POST /api/delete-app {app}`: delete every screen of a mockup; `{removed}`.
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
             versions: Version[]; proposals?: (Version | null)[] }
             // name never changes: "home" for the first screen, else the one in the link that
             // opened it ("@sleep-report: …"), or, for a screen opened by a plain prompt, one
             // from its title at the pick; unique in the mockup; links use it as "@sleep-report".
             // action is the screen's prompt (without "@name: "). parent is the screen and
             // click that first made it.
             // A planned screen (plannedScreens) has the same shape with no versions and no
             // proposals; it is never stored.
             // The last version shows; versions is empty and proposals holds the two sides of
             // the open A OR B (null until a side finishes) until a pick
Version    { html; model: ModelId; servedModel; createdAt; costUsd: number | null;
             costEstimated; firstChunkMs; totalMs; finishReason; device?: Device;
             name?; idea?; feedback? }
             // name comes from the model's <title>, idea from its <meta name="idea">;
             // feedback is the Edit request that made this version. html has prose before <title>
             // cut, and a reply that held the screen twice keeps its first copy
TreeNode   { level; parent: key | null; label }
             // from screenTree: level 1 is the first screen, the fewest clicks from it otherwise
ModelId    'claude-haiku-5.5' | 'gpt-6-luna-fast' | 'gpt-6.1-sol-ultrafast'
Device     'phone' (390 × 844 px) | 'desktop' (1024 × 768 px): every screen is that wide and at
           least that tall
key        normalize(app), normalize(app) + ' » @' + name for a screen opened by name, or
           normalize(app) + ' » ' + normalize(action) for one opened by a plain prompt; normalize
           turns » into >; action "home", "@home" or the product prompt means the first screen
```

## Env vars

Read from the repo-root `.env` by `bun --env-file=../.env`; the browser never sees them.

| Var | Use |
|---|---|
| `OPENROUTER_API_KEY` | Claude Haiku 5.5 |
| `OPENAI_API_KEY` | GPT-6 Luna, GPT-6.1 Sol |
| `PORT` | server port, default 3000 |
| `UXWOZ_HOST` | listen address, default `127.0.0.1` |
| `UXWOZ_CACHE_FILE` | screen cache `{version: 4, entries}`, default `temp/screen-cache.json` |
| `UXWOZ_RECORD` | `1` makes tests call the live APIs and rewrite `cassettes/` |

## Tests

`bun test` runs `src/tests/*.test.ts`. Model calls go through `tests/cassette.ts`, which replays
`cassettes/<test file name>.json` keyed by a hash of URL and request body; `tests/no-network.ts` makes any
other non-localhost call throw. A test file that calls models has a cassette of the same name;
`cut-off.test.ts` and `races.test.ts` use a fake provider instead.
