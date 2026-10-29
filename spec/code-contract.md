# Code contract

This doc owns the shapes the code agrees on: packages, the HTTP API, the stored types, env vars and
the test setup. It does not own what the user sees ([behavior.md](behavior.md)) or the screen format
and model settings ([ui-generation.md](ui-generation.md)).

## Example

```
POST /api/screen  {"app": "A coffee shop ordering app", "action": null, "model": "claude-haiku-5.5"}

{"type":"meta","key":"a coffee shop ordering app","cached":false}
{"type":"chunk","text":"<h1>Brew"}
...
{"type":"done","entry":{...CacheEntry},"index":0,"link":null}
```

## Packages

- `@uxwoz/core` (`src/packages/core`): models, prompt, provider streaming, screen cache, frame page,
  canvas layout. `frame.ts` and `layout.ts` run in the browser too, so they use no Node or Bun APIs.
- `@uxwoz/web` (`src/packages/web`): `Bun.serve` server, the page (`index.html`, `app.ts`,
  `canvas.ts`, bundled by Bun's HTML import), and the themes in `themes/`.

There are no runtime dependencies; `@types/bun` and `typescript` are dev-only.

## HTTP API

The server listens on 127.0.0.1 by default (`UXWOZ_HOST`). Every POST must be `application/json` (else 415) and must not
come from another origin (`Origin` or `Sec-Fetch-Site: cross-site`, else 403), so no other web page
can spend model credits.

- `GET /api/config`: models (id, label, costEstimated), themes (`mockup`, `clean`), default model
  and theme.
- `POST /api/screen {app, action?, model?, regenerate?, from?, label?}`: NDJSON stream of `meta`,
  `chunk`*, then `done` or `error`. A cache hit sends `meta` (cached true) and `done` only. With
  `from` (the key of the screen clicked in) and `label` (the control's text), `done` carries the
  `Link` it recorded, or null. 400 on an empty
  or too long `app` (2,000), `action` (500), or an unknown model. A closed browser connection aborts
  the model call.
- `GET /api/map?app=…`: `{root, entries: CacheEntry[], links: Link[]}` for one mockup, oldest first.
- `POST /api/choose {key, index}`: set the version revisits show; 404 if either is unknown.
- `POST /api/warmup {model}`: 204 at once; sends a 16-token request in the background.
- `GET /themes/{pico,mockup}.css`: the stylesheets. Theme `clean` is `pico.css`; `mockup` is
  `pico.css` followed by `mockup.css`.

## Frame messages

The script we add to every screen talks to the app with `postMessage`; the app accepts a message
only from a card's own frame, and `action` only from the current card.

```ts
{ uxwoz: 'action', prompt, label }   // a click on a control with an action prompt
{ uxwoz: 'size', height }            // the screen's height, so the card fits it (160-8000 px)
{ uxwoz: 'wheel', dx, dy, zoom, x, y } // scroll or pinch over the screen, applied to the canvas
```

## Types

```ts
CacheEntry { key; app; action: string | null; chosen: number; candidates: Candidate[] }
Candidate  { html; model: ModelId; servedModel; createdAt; costUsd: number | null;
             costEstimated; firstChunkMs; totalMs; finishReason }
Link       { from: key; to: key; label; createdAt }  // first click between two screens wins
ModelId    'claude-haiku-5.5' | 'gpt-6-luna-fast' | 'gpt-6.1-sol-ultrafast'
key        normalize(app) or normalize(app) + ' » ' + normalize(action); normalize turns » into >; action
           "home" or the product prompt itself means the first screen (action null)
```

## Env vars

Read from the repo-root `.env` by `bun --env-file=../.env`; the browser never sees them.

| Var | Use |
|---|---|
| `OPENROUTER_API_KEY` | Claude Haiku 5.5 |
| `OPENAI_API_KEY` | GPT-6 Luna, GPT-6.1 Sol |
| `PORT` | server port, default 3000 |
| `UXWOZ_HOST` | listen address, default `127.0.0.1` |
| `UXWOZ_CACHE_FILE` | screen cache `{entries, links}`, default `temp/screen-cache.json` |
| `UXWOZ_RECORD` | `1` makes tests call the live APIs and rewrite `cassettes/` |

## Tests

`bun test` runs `src/tests/*.test.ts`. Model calls go through `tests/cassette.ts`, which replays
`cassettes/<test file name>.json` keyed by a hash of URL and request body; `tests/no-network.ts` makes any
other non-localhost call throw. A test file that calls models has a cassette of the same name;
`cut-off.test.ts` uses a fake provider instead.
