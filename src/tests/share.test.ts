// Sharing: links per role, the player's map, feedback and trips, the edit link's cap, the owner's gate (no cassette: a fake provider).
import { afterEach, describe, expect, test } from 'bun:test'
import { ScreenCache, type Fetch, type Version } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'

const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
/** Every model call gets the same small screen; filing cannot read it and fails quietly. */
const fakeFetch: Fetch = async () => new Response(reply('<title>Changed</title><h1>Changed</h1>'))
const ver = (html: string, name: string): Version => ({
  html, name, model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-09T00:00:00Z', device: 'phone',
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop',
})
const APP = 'A sleep tracker'

/** A mockup with Home (a link to Nights and one to a planned Settings), Nights, a component, and an open A OR B. */
function mockup() {
  const cache = new ScreenCache()
  const home = cache.propose(APP, null, 0, ver('<h1>Home</h1><div data-component="tab-bar"></div><button data-action="@nights: Last nights">Nights</button><button data-action="@settings: Settings">Settings</button>', 'Home'))!
  cache.pick(home.key, 0)
  const nights = cache.propose(APP, '@nights: Last nights', 0, ver('<h1>Nights</h1><button data-action="back">Back</button>', 'Nights'), { key: home.key, label: 'Nights' })!
  cache.pick(nights.key, 0)
  cache.addComponent(APP, 'tab-bar', 'every screen', ver('<nav>Tabs</nav>', 'tab-bar'), 'filing')
  cache.propose(APP, '@stats: Stats', 1, ver('<h1>Stats</h1>', 'Stats'), { key: home.key, label: 'Stats' })
  return { cache, home: home.key, nights: nights.key }
}

let server: ReturnType<typeof createServer> | null = null
afterEach(() => { server?.stop(true); server = null; delete process.env.UXWOZ_OWNER })
const start = (cache: ScreenCache) => (server = createServer({ port: 0, cache, fetch: fakeFetch, env, log: () => {}, fileWaitMs: 0 }))
const url = (path: string) => new URL(path, server!.url)
const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
const share = async (role: string, cap?: number) => (await (await post('/api/share', { app: APP, role, cap })).json()) as { token: string; url: string; role: string }

describe('sharing', () => {
  test('a link per role is made with a random token, listed with its usage, and revoked', async () => {
    const { cache } = mockup()
    start(cache)
    const view = await share('view'), edit = await share('edit')
    expect(view.token).toMatch(/^[a-f0-9]{32}$/)
    expect(view.url).toBe(`${server!.url.origin}/s/${view.token}`)
    expect(edit).toMatchObject({ role: 'edit', cap: 20, used: 0 })
    expect((await post('/api/share', { app: APP, role: 'admin' })).status).toBe(400)
    expect((await post('/api/share', { app: 'Nothing here', role: 'view' })).status).toBe(404)
    await fetch(url(`/api/s/${view.token}/map`))
    const list = await (await fetch(url(`/api/shares?app=${encodeURIComponent(APP)}`))).json()
    expect(list.shares.map((s: any) => [s.role, s.opens])).toEqual([['view', 1], ['edit', 0]])
    expect((await post('/api/unshare', { token: view.token })).status).toBe(200)
    expect((await fetch(url(`/api/s/${view.token}/map`))).status).toBe(404)
    expect((await fetch(url(`/s/${view.token}`))).status).toBe(404)
    expect((await post('/api/unshare', { token: view.token })).status).toBe(404)
  })

  test('the player gets the picked screens\' newest versions, their parents and the components, nothing else', async () => {
    const { cache, home, nights } = mockup()
    start(cache)
    const { token } = await share('view')
    const page = await fetch(url(`/s/${token}`))
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('<html')
    const map = await (await fetch(url(`/api/s/${token}/map`))).json()
    expect(map).toMatchObject({ role: 'view', app: APP, root: home, components: { 'tab-bar': '<nav>Tabs</nav>' } })
    expect(map.screens.map((s: any) => [s.key, s.name, s.title, s.parent])).toEqual([[home, 'home', 'Home', null], [nights, 'nights', 'Nights', home]])
    expect(Object.keys(map)).toEqual(['role', 'app', 'root', 'components', 'screens'])
    expect(Object.keys(map.screens[0])).toEqual(['key', 'name', 'title', 'html', 'device', 'parent'])
  })

  test('feedback: a view link gets 403, a comment link stores it, one thumb per visitor and screen, texts and lists capped', async () => {
    const { cache, home, nights } = mockup()
    start(cache)
    const view = await share('view'), comment = await share('comment')
    const visitor = 'abcdef0123456789'
    const send = (token: string, body: object) => post(`/api/s/${token}/feedback`, { visitor, name: 'Ana', ...body })
    expect((await send(view.token, { kind: 'comment', screen: home, text: 'Nice' })).status).toBe(403)
    expect((await send(comment.token, { kind: 'comment', screen: home, text: 'Too busy', about: 'Nights' })).status).toBe(200)
    expect((await send(comment.token, { kind: 'thumb', screen: home, up: true })).status).toBe(200)
    expect((await send(comment.token, { kind: 'thumb', screen: home, up: false })).status).toBe(200)
    expect((await send(comment.token, { kind: 'dead', screen: home, text: 'My settings', label: 'Settings' })).status).toBe(200)
    expect((await send(comment.token, { kind: 'done', text: 'Yes, for my kids' })).status).toBe(200)
    expect((await send(comment.token, { kind: 'comment', screen: home, text: 'x'.repeat(1001) })).status).toBe(400)
    expect((await send(comment.token, { kind: 'comment', screen: 'elsewhere', text: 'Hi' })).status).toBe(404)
    expect((await send(comment.token, { kind: 'comment', screen: home, text: '' })).status).toBe(400)
    expect((await post(`/api/s/${comment.token}/feedback`, { kind: 'comment', screen: home, text: 'Hi' }, { Origin: 'https://evil.example' })).status).toBe(403)
    // A trip is stored once per visit and replaced as it grows; a view link sends trips too.
    const trip = { id: '0123456789abcdef', visitor, name: 'Ana', screens: ['Home'], dead: [] }
    await post(`/api/s/${view.token}/trip`, trip)
    await post(`/api/s/${view.token}/trip`, { ...trip, screens: ['Home', 'Nights'], dead: ['Settings'] })
    const s = cache.sharedOf(APP)
    expect(s.feedback.map((f) => [f.kind, f.name, f.title, f.text ?? f.up])).toEqual([
      ['comment', 'Ana', 'Home', 'Too busy'], ['thumb', 'Ana', 'Home', false], ['dead', 'Ana', 'Home', 'My settings'], ['done', 'Ana', '', 'Yes, for my kids'],
    ])
    expect(s.feedback[0]!.about).toBe('Nights')
    expect(s.feedback[2]!.label).toBe('Settings')
    expect(s.trips).toEqual([expect.objectContaining({ id: trip.id, screens: ['Home', 'Nights'], dead: ['Settings'] })])
    // At most 500 of each: the oldest go.
    for (let i = 0; i < 505; i++) s.feedback.push({ ...s.feedback[0]!, text: `n${i}` })
    await send(comment.token, { kind: 'comment', screen: nights, text: 'last' })
    expect(s.feedback).toHaveLength(500)
    expect(s.feedback.at(-1)!.text).toBe('last')
  })

  test('an edit link reaches only its mockup, not the share routes, and stops at its cap with 429', async () => {
    const { cache, home, nights } = mockup()
    cache.propose('Another app', null, 0, ver('<h1>Other</h1>', 'Other'))
    start(cache)
    const edit = await share('edit', 1), comment = await share('comment')
    const h = { 'x-uxwoz-share': edit.token }
    expect((await fetch(url(`/api/map?app=${encodeURIComponent(APP)}`), { headers: h })).status).toBe(200)
    expect((await fetch(url('/api/map?app=Another%20app'), { headers: h })).status).toBe(403)
    expect((await (await fetch(url('/api/apps'), { headers: h })).json()).apps.map((a: any) => a.app)).toEqual([APP])
    expect((await post('/api/delete-app', { app: APP }, h)).status).toBe(403)
    expect((await post('/api/share', { app: APP, role: 'edit' }, h)).status).toBe(403)
    expect((await fetch(url(`/api/map?app=${encodeURIComponent(APP)}`), { headers: { 'x-uxwoz-share': comment.token } })).status).toBe(403)
    // A cache hit costs nothing; an Edit counts; past the cap, 429.
    expect((await post('/api/screen', { app: APP, action: '@nights' }, h)).status).toBe(200)
    const first = await post('/api/revise', { key: nights, change: 'Bigger title' }, h)
    expect(first.status).toBe(200)
    await first.text()
    const over = await post('/api/revise', { key: home, change: 'Bigger title' }, h)
    expect(over.status).toBe(429)
    expect((await over.json()).error).toBe('This link\'s budget is used up.')
    expect(cache.share(edit.token)!.share.used).toBe(1)
    // The owner has no cap.
    expect((await post('/api/revise', { key: home, change: 'Bigger title' })).status).toBe(200)
  })

  test('with UXWOZ_OWNER set, the app and its API need the owner\'s cookie; share links still work', async () => {
    const { cache } = mockup()
    const { token } = cache.sharedOf(APP).shares[cache.sharedOf(APP).shares.push({ token: 'ab'.repeat(12), role: 'comment', createdAt: '', used: 0, opens: 0 }) - 1]!
    process.env.UXWOZ_OWNER = 'sesame'
    start(cache)
    const home = await fetch(url('/'))
    expect(home.status).toBe(403)
    expect(await home.text()).toBe('This UX Woz is private.')
    expect((await fetch(url('/api/apps'))).status).toBe(401)
    expect((await post('/api/share', { app: APP, role: 'view' })).status).toBe(401)
    const enter = await fetch(url('/?owner=sesame'), { redirect: 'manual' })
    expect(enter.status).toBe(302)
    const cookie = enter.headers.get('set-cookie')!.split(';')[0]!
    expect(cookie).toBe('uxwoz_owner=sesame')
    expect((await fetch(url('/'), { headers: { cookie } })).status).toBe(200)
    expect((await fetch(url('/api/apps'), { headers: { cookie } })).status).toBe(200)
    expect((await fetch(url(`/api/s/${token}/map`))).status).toBe(200)
    expect((await fetch(url(`/s/${token}`))).status).toBe(200)
  })

  test('without UXWOZ_OWNER, everything works as before', async () => {
    start(mockup().cache)
    expect((await fetch(url('/'))).status).toBe(200)
    expect((await fetch(url('/api/apps'))).status).toBe(200)
  })
})
