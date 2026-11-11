// `bun run demo`: the app on a fresh copy of the demo mockup, with no model keys, so nothing can spend money.
// Never reads ../.env, never touches temp/ or the fixture itself. PORT picks the port (3100 by default).

import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DEMO_FILE, DEMO_TOKENS, DEMO_VISITOR } from './make-demo-cache.ts'

const port = Number(process.env.PORT || 3100)
const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-demo-')), 'screen-cache.json')
copyFileSync(DEMO_FILE, file)

const env: Record<string, string | undefined> = { ...process.env, PORT: String(port), UXWOZ_CACHE_FILE: file }
// No owner gate, development mode (frontend edits show on reload), and empty keys: a model call fails at once.
for (const k of ['UXWOZ_OWNER', 'UXWOZ_HOST', 'NODE_ENV']) delete env[k]
for (const k of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) env[k] = ''

const server = Bun.spawn(['bun', '--no-env-file', '--hot', resolve(import.meta.dir, '../packages/web/src/server.ts')], {
  cwd: resolve(import.meta.dir, '..'), env, stdout: 'inherit', stderr: 'inherit',
})

const base = `http://127.0.0.1:${port}`
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/config`).then((r) => r.ok, () => false)) break
  await Bun.sleep(100)
}
console.log(`
Demo mockup, no model keys (cache: ${file})
  App:          ${base}/
  View link:    ${base}/s/${DEMO_TOKENS.view}
  Comment link: ${base}/s/${DEMO_TOKENS.comment}   (to be the visitor with the pinned comment: localStorage['uxwoz:visitor'] = '${DEMO_VISITOR}')
  Edit link:    ${base}/s/${DEMO_TOKENS.edit}
`)

const stop = () => { server.kill(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
await server.exited
