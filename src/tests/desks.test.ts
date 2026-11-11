// Desks: every person reaches their own screen cache; a desk closes when idle and reopens with its data (no cassette: a fake provider).
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScreenCache, type Fetch } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'

const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
const APP = 'A sleep tracker'
const ANA = 'a'.repeat(16), BO = 'b'.repeat(32)

/** Screens come back at once; filing (OpenAI) waits for `release` when a gate is set, then fails quietly. */
let gate: Promise<void> | null = null
const fakeFetch: Fetch = async (url) => {
  if (String(url).includes('openai.com') && gate) await gate
  return new Response(reply(`<title>Home</title><h1>Home of ${Math.random()}</h1>`))
}

let server: ReturnType<typeof createServer> | null = null
afterEach(() => { server?.stop(true); server = null; gate = null })
/** A server where the `x-person` header says who sends a request (none: the owner). */
const start = (opts: { usersDir?: string; idleMs?: number } = {}) =>
  (server = createServer({ port: 0, cache: new ScreenCache(), fetch: fakeFetch, env, log: () => {}, fileWaitMs: 0, who: (req) => req.headers.get('x-person') ?? 'owner', ...opts }))
const as = (person: string | null, headers: Record<string, string> = {}) => ({ ...(person && { 'x-person': person }), ...headers })
const get = (person: string | null, path: string, headers: Record<string, string> = {}) => fetch(new URL(path, server!.url), { headers: as(person, headers) })
const post = (person: string | null, path: string, body: object, headers: Record<string, string> = {}) =>
  fetch(new URL(path, server!.url), { method: 'POST', headers: { 'Content-Type': 'application/json', ...as(person, headers) }, body: JSON.stringify(body) })
const lines = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
/** Draw the mockup's Home and pick its first design; returns whether it came from the cache. */
async function home(person: string | null) {
  const evs = await lines(await post(person, '/api/screen', { app: APP, model: 'claude-haiku-5.5' }))
  const cached = evs[0].cached as boolean
  if (!cached) expect((await post(person, '/api/pick', { key: evs[0].key, index: 0 })).status).toBe(200)
  return cached
}
const apps = async (person: string | null) => (await (await get(person, '/api/apps')).json()).apps.map((a: any) => a.app)
const q = `app=${encodeURIComponent(APP)}`

describe('desks', () => {
  test('two people with the same prompt never see each other\'s screens, map, apps, export or share links', async () => {
    start()
    expect(await home(ANA)).toBe(false)
    expect(await apps(BO)).toEqual([])
    expect(await apps(null)).toEqual([])
    expect((await (await get(BO, `/api/map?${q}`)).json()).entries).toEqual([])
    expect((await get(BO, `/api/export?${q}`)).status).toBe(404)
    expect((await get(ANA, `/api/export?${q}`)).status).toBe(200)
    // The same prompt is no cache hit for Bo: he draws his own.
    expect(await home(BO)).toBe(false)
    const html = async (p: string) => (await (await get(p, `/api/map?${q}`)).json()).entries[0].versions[0].html
    expect(await html(ANA)).not.toBe(await html(BO))
    // Ana's share link: not in Bo's list, not his to revoke, and it opens Ana's mockup.
    const link = await (await post(ANA, '/api/share', { app: APP, role: 'edit' })).json()
    expect((await (await get(BO, `/api/shares?${q}`)).json()).shares).toEqual([])
    expect((await post(BO, '/api/unshare', { token: link.token })).status).toBe(404)
    const map = await (await get(null, `/api/s/${link.token}/map`)).json()
    expect(map.screens[0].html).toBe(await html(ANA))
    expect((await get(null, `/s/${link.token}`)).status).toBe(200)
    // Through Ana's edit link, anyone works on Ana's mockup, not their own.
    expect((await (await get(BO, `/api/map?${q}`, { 'x-uxwoz-share': link.token })).json()).entries[0].versions[0].html).toBe(await html(ANA))
    // The owner's cache never saw either.
    expect(await apps(null)).toEqual([])
  })

  test('an id that is not 16-40 lowercase hex is refused', async () => {
    start()
    for (const bad of ['xyz', 'a'.repeat(15), 'a'.repeat(41), 'A'.repeat(16), '../' + 'a'.repeat(16), 'Owner']) {
      const res = await get(bad, '/api/apps')
      expect(res.status).toBe(400)
    }
    expect(server!.desks.open()).toEqual([])
    expect((await get(ANA, '/api/apps')).status).toBe(200)
  })

  test('a desk closes when idle, saved first, never while its filing runs, and reopens with its data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uxwoz-desks-'))
    start({ usersDir: dir, idleMs: 20 })
    let release!: () => void
    gate = new Promise((r) => (release = r))
    await home(ANA)
    expect(server!.desks.open()).toEqual([ANA])
    // Its filing waits at the gate: the desk stays open however long it has been idle.
    server!.desks.sweep(Date.now() + 3_600_000)
    expect(server!.desks.open()).toEqual([ANA])
    release()
    await get(ANA, `/api/map?${q}&wait=1`)
    server!.desks.sweep(Date.now() + 3_600_000)
    expect(server!.desks.open()).toEqual([])
    const file = join(dir, `${ANA}.json`)
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(5)
    // Her next request opens it again, with her mockup.
    expect(await apps(ANA)).toEqual([APP])
    expect(await home(ANA)).toBe(true)
    expect(server!.desks.open()).toEqual([ANA])
  })
})
