# UX Woz

*UX Woz* is short for *UX Wizard of Oz*, after the
[prototyping technique](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment) where a hidden person plays
the system. Here a model plays it: type a product idea, click around, and each screen you reach is drawn
on demand, two designs at a time, and kept. The result is a clickable mockup you can share for comments
or export for a coding agent.

## Run it

You need [bun](https://bun.sh). Every `bun` command runs from `src/`.

| To | Run | Needs |
|---|---|---|
| Look around on a made-up mockup | `bun install && bun run demo` | nothing: no keys, no model calls |
| Make your own mockups | `bun run dev`, then http://127.0.0.1:3000 | a root `.env` with `OPENROUTER_API_KEY` and `OPENAI_API_KEY` |
| Test and typecheck | `bun run check` | nothing: tests replay `cassettes/` offline |
| Re-record after a prompt change | `bun run test:record` | the keys, a few cents |
| Re-record the starters after a prompt change | `bun run starters:record` (or `… plants bill` for some) | the keys, about 2 cents a starter |
| Check voice input on a Mac | `bun scripts/voice-check.ts --voice Karen` | the app running, speakers the microphone hears |

Your mockups are saved in `temp/screen-cache.json`. `PORT=3001` picks another port. Restart `bun run dev`
after adding a frontend file: live reload cannot add one.

## Find your way

| You want | Read |
|---|---|
| To change the code, as an agent or a person | [AGENTS.md](AGENTS.md): the code map, the seven parts, the rules |
| What the user sees and the system does | [spec/behavior.md](spec/behavior.md) |
| The HTTP API, types, env vars, tests | [spec/code-contract.md](spec/code-contract.md) |
| How a screen is generated, and the prompt | [spec/ui-generation.md](spec/ui-generation.md), [spec/prompt-screen.md](spec/prompt-screen.md) |
| Where the work stands | the latest file in [process/journal/](process/journal/) |
| Why it exists | [process/uxwoz-product-brief.md](process/uxwoz-product-brief.md) |

```
spec/        what the app does
src/         the app, a bun workspace: packages/core (engine), packages/web (server and page), tests/, scripts/
cassettes/   recorded model replies the tests replay
recordings/  the starters' recorded designs and filings, replayed in place of the model
process/     product brief, writing style, journal
temp/        local scratch, ignored by git
```

## Host it

The app is one Bun process that writes one JSON file, so it needs one always-on machine with a disk.
These steps are for [Railway](https://railway.com) (Hobby plan); the root `Dockerfile` is all it reads.

1. **New Project**, **Deploy from GitHub repo**, pick this repo. Railway finds the `Dockerfile` and
   builds; every push to `main` deploys again.
2. On the service, **Variables**: add `OPENROUTER_API_KEY`, `OPENAI_API_KEY` and `UXWOZ_OWNER`, a long
   password you make up. Only a browser that opened `/?owner=<that password>` once can use the app and
   spend model credits.
3. Right-click the canvas, add a **Volume**, attach it to the service, mount path `/data`. The cache
   lives there and survives deploys.
4. **Settings**: under Networking, **Generate Domain**; set the healthcheck path to `/healthz`.
5. Open `https://<your domain>/?owner=<that password>`. Share links then start with that address.

To bring local mockups along, with the `railway` CLI linked to the project (`railway link`):

```bash
railway volume files upload temp/screen-cache.json /screen-cache.json --overwrite
```

Then redeploy the service so it reads the file. A deploy takes the app away for a few seconds, since
one machine holds the disk.

**Backups.** Railway's scheduled volume backups need its Pro plan, so the repo has its own:
`src/scripts/backup.sh` fetches the host's whole cache from `GET /api/backup` (owner only) into
`backups/`, which git ignores. Run it by hand, or weekly from a scheduler (cron, or launchd on a Mac). It reads two lines from a root `.env.local`, also ignored:

```
UXWOZ_BACKUP_URL=https://<your domain>
UXWOZ_BACKUP_OWNER=<that password>
```

To restore one, upload it as above, or run locally on it: `UXWOZ_CACHE_FILE=../backups/<file> bun run dev`.
In public mode the backup is a `.zip`: `screen-cache.json`, `uxwoz.db` and `users/<id>.json`. Unzip it
and upload each file to the same path under `/data` (`/uxwoz.db`, `/users/<id>.json`).

**Open it to the public** ([spec/public.md](spec/public.md)). Add these variables, then redeploy:

| Variable | Value |
|---|---|
| `UXWOZ_PUBLIC` | `1`; the server will not start without `UXWOZ_OWNER` |
| `RESEND_API_KEY` | a sending-only key from Resend; without it sign-up answers *Sign-up is not set up yet.* |
| `UXWOZ_ADMIN_EMAIL` | where quota requests and waiting sign-ups go |
| `UXWOZ_URL` | the app's address in emails, default `https://app.uxwoz.com/` |
| `UXWOZ_OPERATOR`, `UXWOZ_CONTACT` | who runs the site and whom to write to, on `/privacy` |
| `UXWOZ_ADDRESS_HEADER` | the header with a visitor's address, default `x-real-ip` |
| `UXWOZ_DB`, `UXWOZ_USERS_DIR` | default `uxwoz.db` and `users/` beside the cache file |

The owner's page is `/admin`.

## Licence

[MIT](LICENSE). Two vendored pieces keep their own: the Fredoka font
([OFL](src/packages/web/src/design/brand/LICENSE-fredoka.md)) and Pico CSS
([MIT](src/packages/web/themes/LICENSE-pico.md)).
