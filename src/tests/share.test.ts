// Sharing: links per role, the player's map, feedback and trips, the edit link's cap, the owner's gate (no cassette: a fake provider).
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScreenCache, linkTarget, type Fetch, type Version } from '@uxwoz/core'
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
function mockup(file: string | null = null) {
  const cache = new ScreenCache(file)
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
    const html = await page.text()
    expect(html).toContain('<html')
    expect(html).toContain(`<meta property="og:image" content="${server!.url.origin}/og.png">`)
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
    // A dead control's answer is a comment with the control's label; kind 'dead' is no longer written.
    expect((await send(comment.token, { kind: 'comment', screen: home, text: 'My settings', label: 'Settings' })).status).toBe(200)
    expect((await send(comment.token, { kind: 'dead', screen: home, text: 'My settings', label: 'Settings' })).status).toBe(400)
    expect((await send(comment.token, { kind: 'done', text: 'Yes, for my kids' })).status).toBe(200)
    expect((await send(comment.token, { kind: 'comment', screen: home, text: 'x'.repeat(1001) })).status).toBe(400)
    expect((await send(comment.token, { kind: 'comment', screen: 'elsewhere', text: 'Hi' })).status).toBe(404)
    expect((await send(comment.token, { kind: 'comment', screen: home, text: '' })).status).toBe(400)
    expect((await post(`/api/s/${comment.token}/feedback`, { kind: 'comment', screen: home, text: 'Hi' }, { Origin: 'https://evil.example' })).status).toBe(403)
    // A trip is stored once per visit and replaced as it grows; a view link sends none.
    const trip = { id: '0123456789abcdef', visitor, name: 'Ana', screens: ['Home'], dead: [] }
    expect((await post(`/api/s/${view.token}/trip`, trip)).status).toBe(403)
    await post(`/api/s/${comment.token}/trip`, trip)
    await post(`/api/s/${comment.token}/trip`, { ...trip, screens: ['Home', 'Nights'], dead: ['Settings'] })
    const s = cache.sharedOf(APP)
    expect(s.feedback.map((f) => [f.kind, f.name, f.title, f.text ?? f.up])).toEqual([
      ['comment', 'Ana', 'Home', 'Too busy'], ['thumb', 'Ana', 'Home', false], ['comment', 'Ana', 'Home', 'My settings'], ['done', 'Ana', '', 'Yes, for my kids'],
    ])
    expect(s.feedback[0]!.about).toBe('Nights')
    expect(s.feedback[2]!.label).toBe('Settings')
    expect(s.trips).toEqual([expect.objectContaining({ id: trip.id, screens: ['Home', 'Nights'], dead: ['Settings'] })])
    // At most 500 of each kind: the oldest comments go, and the thumb and the answers stay.
    for (let i = 0; i < 505; i++) s.feedback.push({ ...s.feedback[0]!, text: `n${i}` })
    await send(comment.token, { kind: 'comment', screen: nights, text: 'last' })
    expect(s.feedback.filter((f) => f.kind === 'comment')).toHaveLength(500)
    expect(s.feedback.filter((f) => f.kind !== 'comment')).toHaveLength(2)
    expect(s.feedback.at(-1)!.text).toBe('last')
    // A trip keeps at most 50 screens and 50 dead clicks.
    await post(`/api/s/${comment.token}/trip`, { ...trip, screens: Array(80).fill('Home'), dead: Array(80).fill('X') })
    expect([s.trips[0]!.screens.length, s.trips[0]!.dead.length]).toEqual([50, 50])
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
    const token = 'ab'.repeat(12)
    cache.ownShared(APP).shares.push({ token, role: 'comment', createdAt: '', used: 0, opens: 0 })
    process.env.UXWOZ_OWNER = 'sesame'
    start(cache)
    const home = await fetch(url('/'))
    expect(home.status).toBe(403)
    expect(await home.text()).toBe('This UX Woz is private.')
    expect((await fetch(url('/api/apps'))).status).toBe(401)
    expect((await post('/api/share', { app: APP, role: 'view' })).status).toBe(401)
    const secure = await fetch(url('/?owner=sesame'), { redirect: 'manual', headers: { 'x-forwarded-proto': 'https' } })
    expect(secure.headers.get('set-cookie')).toContain('; Secure')
    const enter = await fetch(url('/?owner=sesame'), { redirect: 'manual' })
    expect(enter.status).toBe(302)
    expect(enter.headers.get('set-cookie')).not.toContain('Secure')
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

  test('an edit link\'s scope reads a POST\'s body only, refuses an app or key that is not a string, and cannot delete its mockup', async () => {
    const { cache, home, nights } = mockup()
    cache.propose('Another app', null, 0, ver('<h1>Other</h1>', 'Other'))
    start(cache)
    const h = { 'x-uxwoz-share': (await share('edit')).token }
    // 1. The query names this mockup, the body another (or the other way round): refused.
    expect((await post(`/api/box?app=${encodeURIComponent(APP)}`, { app: 'Another app', op: 'visit' }, h)).status).toBe(403)
    expect((await post('/api/box?app=Another%20app', { app: APP, op: 'seen', box: 'rules' }, h)).status).toBe(403)
    // 2. An array or object key never reaches the route.
    expect((await post('/api/delete', { key: ['another app'] }, h)).status).toBe(403)
    expect((await post('/api/map', { app: { x: 1 } }, h)).status).toBe(403)
    expect(cache.get('another app')).toBeDefined()
    // 4. Its own first screen (the whole mockup) stays; another screen may go.
    expect((await post('/api/delete', { key: home }, h)).status).toBe(403)
    expect(cache.get(home)).toBeDefined()
    expect((await post('/api/delete', { key: nights }, h)).status).toBe(200)
    // The warm-up is the owner's.
    expect((await post('/api/warmup', { model: 'claude-haiku-5.5' }, h)).status).toBe(403)
  })

  test('a pick counts against the budget, and a refused call gives its unit back', async () => {
    const { cache } = mockup()
    start(cache)
    const edit = await share('edit', 1), h = { 'x-uxwoz-share': edit.token }
    const open = cache.map(APP).entries.find((e) => !e.versions.length)!
    expect((await post('/api/pick', { key: open.key, index: 0 }, h)).status).toBe(404) // side 0 never finished
    expect(cache.share(edit.token)!.share.used).toBe(0)
    expect((await post('/api/pick', { key: open.key, index: 1 }, h)).status).toBe(200)
    expect(cache.share(edit.token)!.share.used).toBe(1)
    expect((await post('/api/box', { app: APP, op: 'visit' }, h)).status).toBe(429)
  })

  test('3. a page is fetched from this server, whatever Host the request names', async () => {
    const { cache } = mockup()
    start(cache)
    const { token } = await share('comment')
    const res = await fetch(url(`/s/${token}`), { headers: { Host: 'evil.example:9' } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<html')
  })

  test('5. in the player, a plain-text control leads nowhere; back, home and names lead somewhere', () => {
    expect(linkTarget('Open settings')).toBeNull()
    expect(linkTarget('back')).toEqual({ back: true })
    expect(linkTarget('home')).toEqual({ name: 'home' })
    expect(linkTarget('@nights: Last nights')).toEqual({ name: 'nights' })
  })

  test('8. visitors cannot flood: big bodies refused, the file saved at most once a second and never on a GET', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const { cache, home } = mockup(file)
    start(cache)
    const { token } = await share('comment')
    const before = statSync(file).mtimeMs
    await fetch(url(`/api/s/${token}/map`))
    await fetch(url(`/api/shares?app=${encodeURIComponent('Nothing here')}`))
    expect(statSync(file).mtimeMs).toBe(before)
    expect((await post(`/api/s/${token}/feedback`, { kind: 'comment', screen: home, text: 'x'.repeat(70_000) })).status).toBe(413)
    for (const text of ['one', 'two']) await post(`/api/s/${token}/feedback`, { visitor: 'abcdef0123456789', name: 'Ana', kind: 'comment', screen: home, text })
    expect(readFileSync(file, 'utf8')).not.toContain('"two"')
    await Bun.sleep(1100)
    expect(JSON.parse(readFileSync(file, 'utf8')).shared['a sleep tracker'].feedback.map((f: any) => f.text)).toEqual(['one', 'two'])
    expect(JSON.parse(readFileSync(file, 'utf8')).shared['nothing here']).toBeUndefined()
  })

  test('a name first: without one, no feedback and no trip are stored; with one, the anchor is kept and an id comes back', async () => {
    const { cache, home } = mockup()
    start(cache)
    const { token } = await share('comment')
    const visitor = 'abcdef0123456789'
    for (const name of [undefined, '', '   ']) {
      const res = await post(`/api/s/${token}/feedback`, { visitor, name, kind: 'comment', screen: home, text: 'Hi' })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Type your name first.')
    }
    expect((await post(`/api/s/${token}/trip`, { id: '0123456789abcdef', visitor, screens: ['Home'], dead: [] })).status).toBe(400)
    expect(cache.sharedOf(APP)).toMatchObject({ feedback: [], trips: [] })
    const res = await post(`/api/s/${token}/feedback`, { visitor, name: 'Ana', kind: 'comment', screen: home, text: 'Bigger', about: 'Nights', tag: 'button', nth: 1 })
    const { ok, id } = await res.json()
    expect(ok).toBe(true)
    expect(id).toMatch(/^[a-f0-9]{16}$/)
    expect(cache.sharedOf(APP).feedback[0]).toMatchObject({ id, name: 'Ana', about: 'Nights', tag: 'button', nth: 1 })
    // A bad tag or place is dropped; the words stay.
    await post(`/api/s/${token}/feedback`, { visitor, name: 'Ana', kind: 'comment', screen: home, text: 'x', about: 'Nights', tag: 'BUTTON<', nth: 1000 })
    expect(cache.sharedOf(APP).feedback[1]).not.toHaveProperty('tag')
    expect(cache.sharedOf(APP).feedback[1]).not.toHaveProperty('nth')
  })

  test('a visitor gets back only their own feedback; a view link gets 403', async () => {
    const { cache, home } = mockup()
    start(cache)
    const view = await share('view'), { token } = await share('comment')
    const ana = 'aaaaaaaaaaaaaaaa', bo = 'bbbbbbbbbbbbbbbb'
    await post(`/api/s/${token}/feedback`, { visitor: ana, name: 'Ana', kind: 'comment', screen: home, text: 'Mine' })
    await post(`/api/s/${token}/feedback`, { visitor: ana, name: 'Ana', kind: 'thumb', screen: home, up: true })
    await post(`/api/s/${token}/feedback`, { visitor: bo, name: 'Bo', kind: 'comment', screen: home, text: 'Theirs' })
    const get = (t: string, v: string) => fetch(url(`/api/s/${t}/feedback?visitor=${v}`))
    const got = (await (await get(token, ana)).json()).feedback
    expect(got.map((f: any) => [f.name, f.kind])).toEqual([['Ana', 'comment'], ['Ana', 'thumb']])
    expect((await (await get(token, 'nope')).json()).feedback).toEqual([])
    expect((await (await get(token, 'cccccccccccccccc')).json()).feedback).toEqual([])
    expect((await get(view.token, ana)).status).toBe(403)
  })

  test('the owner resolves and unresolves a comment; an edit link and a browser without the cookie cannot', async () => {
    const { cache, home } = mockup()
    start(cache)
    const { token } = await share('comment'), edit = await share('edit')
    const visitor = 'aaaaaaaaaaaaaaaa'
    const { id } = await (await post(`/api/s/${token}/feedback`, { visitor, name: 'Ana', kind: 'comment', screen: home, text: 'Hi' })).json()
    expect((await post('/api/feedback', { app: APP, id, resolved: true })).status).toBe(200)
    const resolved = cache.sharedOf(APP).feedback[0]!.resolved
    expect(new Date(resolved!).getTime()).toBeGreaterThan(0)
    expect((await (await fetch(url(`/api/s/${token}/feedback?visitor=${visitor}`))).json()).feedback[0].resolved).toBe(resolved)
    expect((await post('/api/feedback', { app: APP, id, resolved: false })).status).toBe(200)
    expect(cache.sharedOf(APP).feedback[0]).not.toHaveProperty('resolved')
    expect((await post('/api/feedback', { app: APP, id: 'ffffffffffffffff', resolved: true })).status).toBe(404)
    expect((await post('/api/feedback', { app: APP, id, resolved: true }, { 'x-uxwoz-share': edit.token })).status).toBe(403)
    expect(cache.sharedOf(APP).feedback[0]).not.toHaveProperty('resolved')
    // The ids and anchors reach the owner's list.
    expect((await (await fetch(url(`/api/shares?app=${encodeURIComponent(APP)}`))).json()).feedback[0].id).toBe(id)
    server!.stop(true)
    process.env.UXWOZ_OWNER = 'sesame'
    start(cache)
    expect((await post('/api/feedback', { app: APP, id, resolved: true })).status).toBe(401)
    expect((await post('/api/feedback', { app: APP, id, resolved: true }, { cookie: 'uxwoz_owner=sesame' })).status).toBe(200)
  })

  test('feedback from before names and ids loads: Someone, kinds dead and done, each with an id that stays the same', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const { cache, home } = mockup(file)
    const old = { at: '2026-11-01T00:00:00Z', visitor: 'abcdef0123456789', name: 'Someone', screen: home, title: 'Home' }
    cache.ownShared(APP).feedback.push(
      { ...old, kind: 'dead', text: 'My settings', label: 'Settings' } as any,
      { ...old, kind: 'done', text: 'Yes' } as any,
      { ...old, kind: 'done', text: 'Yes' } as any,
    )
    cache.save()
    const a = new ScreenCache(file).sharedOf(APP).feedback, b = new ScreenCache(file).sharedOf(APP).feedback
    expect(a.map((f) => [f.name, f.kind])).toEqual([['Someone', 'dead'], ['Someone', 'done'], ['Someone', 'done']])
    for (const f of a) expect(f.id).toMatch(/^[a-f0-9]{16}$/)
    expect(new Set(a.map((f) => f.id)).size).toBe(3)
    expect(b.map((f) => f.id)).toEqual(a.map((f) => f.id))
  })
})
