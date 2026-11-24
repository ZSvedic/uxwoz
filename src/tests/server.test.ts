// Feature: the web server streams one design a mock, settles a mock at a click and files it, and makes new versions:
// Edit, Another, Draw again, Undo and Redo (cassette: server).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ALTERNATIVE_REQUEST, ScreenCache, linksIn, plannedScreens, screenRef, type CacheEntry } from '@uxwoz/core'
import { createServer, type DrawEvent } from '@uxwoz/web/src/server.ts'
import { cassette } from './cassette.ts'

const tape = cassette('server')
let server: ReturnType<typeof createServer>
const cache = new ScreenCache()
const APP = 'A tiny bakery website'
const RENAMED = 'A tiny bakery website with online orders'
const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

// Every click waits for filing to end, so each request holds the same paper when recorded and when replayed.
/** The user message of every model call, as the server sent it. */
const sent: string[] = []
const fetchAndKeep: typeof tape.fetch = (url, init) => {
  const b = JSON.parse(String(init?.body))
  sent.push(b.input ?? b.messages?.[1]?.content ?? '')
  return tape.fetch(url, init)
}
beforeAll(() => { server = createServer({ port: 0, cache, fetch: fetchAndKeep, env: tape.env, log: () => {}, fileWaitMs: 60_000 }) })
afterAll(async () => {
  await fetch(new URL(`/api/map?app=${encodeURIComponent(RENAMED)}&wait=1`, server.url))
  server.stop(true)
  tape.save()
})

async function stream(path: string, body: object): Promise<DrawEvent[]> {
  const res = await post(path, body)
  expect(res.headers.get('content-type')).toContain('application/x-ndjson')
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
}
const screen = (body: object) => stream('/api/screen', body)
const map = async (app = APP, wait = false) => (await fetch(new URL(`/api/map?app=${encodeURIComponent(app)}${wait ? '&wait=1' : ''}`, server.url))).json() as Promise<{ entries: CacheEntry[]; filing: boolean } & Record<string, any>>
/** The links to new screens in a screen (`@name: prompt`), in page order. */
const actions = (html: string) => linksIn(html).map((l) => l.action).filter((a) => screenRef(a)?.prompt && screenRef(a)!.name !== 'home')
const nameOf = (action: string) => screenRef(action)!.name
const done = (evs: DrawEvent[]) => evs.find((e) => e.type === 'done') as Extract<DrawEvent, { type: 'done' }>
const shown = (e: CacheEntry) => e.versions.at(-1)!.html

describe('web server', () => {
  test('a new prompt streams one design, stored as it finishes and shown at once, with its idea', async () => {
    const evs = await screen({ app: APP })
    expect(evs[0]).toEqual({ type: 'meta', key: 'a tiny bakery website', cached: false })
    expect(evs.filter((e) => e.type === 'chunk').length).toBeGreaterThan(5)
    expect(evs.filter((e) => e.type === 'version')).toHaveLength(1)
    const { entry } = done(evs)
    expect(entry).toMatchObject({ name: 'home', draws: 1 })
    expect(entry.versions).toHaveLength(1)
    expect(entry.versions[0]!.device).toBe('small-phone')
    expect(entry.versions[0]!.idea!.length).toBeGreaterThan(8)
    expect(entry.settled).toBeUndefined()
  }, 30_000)

  test('the same prompt, written differently, shows it again at no cost', async () => {
    const evs = await screen({ app: '  a tiny BAKERY website. ' })
    expect(evs.map((e) => e.type)).toEqual(['meta', 'done'])
    expect(evs[0]).toMatchObject({ cached: true })
  })

  test('a click opens a new screen under its name, with its link\'s prompt and the click as its parent; it settles Home, which files on Terra', async () => {
    const first = done(await screen({ app: APP })).entry
    const action = actions(shown(first))[0]!
    const { entry } = done(await screen({ app: APP, action, from: first.key, label: 'Our breads' }))
    expect(entry.key).toBe(`a tiny bakery website » @${nameOf(action)}`)
    expect(entry).toMatchObject({ name: nameOf(action), action: screenRef(action)!.prompt, parent: { key: first.key, label: 'Our breads' } })
    const m = await map(APP, true)
    expect(m.filing).toBe(false)
    const home = m.entries.find((e) => e.name === 'home')!
    expect(home.settled).toBe(home.versions[0]!.createdAt)
    expect(home.filed).toMatchObject({ screen: 'home' })
    expect(home.filed!.error).toBeUndefined()
    expect(home.filed!.costUsd).toBeGreaterThan(0)
    expect(m.boxes.settled).toBe(1)
  }, 60_000)

  test('a click to a drawn screen settles the screen it came from at /api/settle; once settled, nothing more is filed', async () => {
    const second = (await map()).entries.find((e) => e.name !== 'home' && !e.kind)!
    const res = await (await post('/api/settle', { key: second.key })).json()
    expect(res).toMatchObject({ filing: true, visiting: false, entry: { key: second.key } })
    await map(APP, true)
    expect(await (await post('/api/settle', { key: second.key })).json()).toMatchObject({ filing: false })
    expect((await post('/api/settle', { key: 'no such screen' })).status).toBe(404)
  }, 60_000)

  test('another link with the same name, worded differently, opens the same screen with no model call', async () => {
    const first = done(await screen({ app: APP })).entry
    const name = nameOf(actions(shown(first))[0]!)
    for (const action of [`@${name}`, `@${name.toUpperCase()}: Some other words for the same screen`]) {
      const evs = await screen({ app: APP, action, from: first.key, label: 'x' })
      expect(evs.map((e) => e.type)).toEqual(['meta', 'done'])
      expect(done(evs).entry.name).toBe(name)
    }
  })

  test('a "home" link opens the cached first screen with no model call', async () => {
    const evs = await screen({ app: APP, action: 'home' })
    expect(evs.map((e) => e.type)).toEqual(['meta', 'done'])
    expect(done(evs).entry.key).toBe('a tiny bakery website')
  })

  test('a planned screen opened by its name alone is made from the prompt of the link that planned it', async () => {
    const { entries } = await map()
    const planned = plannedScreens(entries).at(-1)!
    const from = entries.find((e) => !e.kind && actions(shown(e)).some((a) => nameOf(a) === planned.name))!
    expect(planned.action).toBe(screenRef(actions(shown(from)).find((a) => nameOf(a) === planned.name)!)!.prompt)
    const second = done(await screen({ app: APP, action: `@${planned.name}`, from: from.key, label: 'More' })).entry
    expect(second).toMatchObject({ key: `a tiny bakery website » @${planned.name}`, name: planned.name, action: planned.action })
  }, 30_000)

  test('a later screen gets the paper, and links to the screens on it by their IDs', async () => {
    const first = done(await screen({ app: APP })).entry
    const third = done(await screen({ app: APP, action: '@opening-hours: Opening hours of the bakery, by day', from: first.key, label: 'Hours' })).entry
    const m = await map()
    const known = new Set([...m.entries, ...plannedScreens(m.entries)].map((e) => e.name).filter(Boolean))
    const asked = sent.filter((x) => x.includes('Draw this screen: opening-hours: Opening hours of the bakery, by day'))
    expect(asked).toHaveLength(1)
    expect(asked[0]).toStartWith(`App: ${APP}\nDevice: a phone screen, 360 × 500 px; the screen scrolls inside it, and a bar pinned to its bottom stays in view.\n\nScreens, the first screen first (id: what it is for):\nhome: the first screen\n`)
    expect(asked[0]).toContain(`The screen the click came from, home (the first screen):\n${shown(first)}`)
    expect(asked[0]).not.toContain(ALTERNATIVE_REQUEST)
    // A link by ID alone names a screen on the paper (made or planned); a new name never comes with two prompts.
    const prompts = new Map<string, Set<string>>()
    for (const l of linksIn(shown(third))) {
      const r = screenRef(l.action)
      if (r && !r.prompt) expect(known.has(r.name)).toBe(true)
      if (r?.prompt && !known.has(r.name)) prompts.set(r.name, new Set([...prompts.get(r.name) ?? [], r.prompt]))
    }
    for (const [, set] of prompts) expect(set.size).toBe(1)
  }, 60_000)

  test('the map lists one mockup, and the apps list every mockup', async () => {
    const m = await map()
    expect(m.root).toBe('a tiny bakery website')
    expect(m.links).toBeUndefined()
    const { apps } = await (await fetch(new URL('/api/apps', server.url))).json()
    expect(apps.map((a: { app: string }) => a.app)).toEqual([APP])
  })

  test('Edit makes a version from the screen and the change, for its device; Another one from its prompt, asked to differ; Undo and Redo walk them', async () => {
    const first = done(await screen({ app: APP })).entry
    const change = 'Make the main heading say "Fresh bread daily"'
    const edited = await stream('/api/revise', { key: first.key, change, device: 'laptop' })
    expect(edited[0]).toEqual({ type: 'meta', key: first.key, cached: false })
    expect(edited.filter((e) => e.type === 'chunk').length).toBeGreaterThan(5)
    const e1 = done(edited).entry
    expect(done(edited).filing).toBe(true)
    expect(e1.versions).toHaveLength(2)
    expect(e1.versions[1]).toMatchObject({ feedback: change, device: 'small-phone' })
    expect(e1.draws).toBe(1)
    expect(shown(e1)).toContain('Fresh bread daily')
    await map(APP, true)
    const e2 = done(await stream('/api/revise', { key: first.key })).entry
    expect(sent.at(-1)).toEndWith(ALTERNATIVE_REQUEST)
    expect(e2.versions).toHaveLength(3)
    expect(e2.versions[2]!.feedback).toBeUndefined()
    expect(e2.draws).toBe(2)
    expect(shown(e2)).not.toBe(shown(e1))
    // Undo shows the one before; Redo sends the next one's time; Undo by a time jumps there.
    const back = (await (await post('/api/undo', { key: first.key })).json()).entry as CacheEntry
    expect([back.versions.length, back.redo!.length]).toEqual([2, 1])
    const fwd = (await (await post('/api/undo', { key: first.key, at: back.redo![0]!.createdAt })).json()).entry as CacheEntry
    expect([fwd.versions.length, fwd.redo]).toEqual([3, undefined])
    const oldest = (await (await post('/api/undo', { key: first.key, at: e2.versions[0]!.createdAt })).json()).entry as CacheEntry
    expect([oldest.versions.length, oldest.redo!.length]).toEqual([1, 2])
    expect((await post('/api/undo', { key: first.key })).status).toBe(404)
    expect((await post('/api/undo', { key: first.key, at: 'never' })).status).toBe(404)
    await post('/api/undo', { key: first.key, at: e2.versions[2]!.createdAt })
    expect((await post('/api/revise', { key: first.key, change: ' ' })).status).toBe(400)
    expect((await post('/api/revise', { key: first.key, prompt: 'x'.repeat(501) })).status).toBe(400)
    expect((await post('/api/revise', { key: first.key, change: 'a', prompt: 'b' })).status).toBe(400)
    expect((await post('/api/revise', { key: 'no such screen' })).status).toBe(404)
  }, 90_000)

  test('Draw again draws from new words, which become the screen\'s prompt; draws starts again at 1', async () => {
    const hours = cache.find(APP, '@opening-hours')!
    const words = 'The opening hours as a week calendar, today marked'
    const { entry } = done(await stream('/api/revise', { key: hours.key, prompt: words }))
    expect(sent.at(-1)).toContain(`Draw this screen: opening-hours: ${words}`)
    expect(entry).toMatchObject({ action: words, draws: 1 })
    expect(entry.versions.at(-1)).toMatchObject({ prompt: words })
  }, 30_000)

  test('Draw again of Home renames the project, every key with it; a name another project has is refused', async () => {
    cache.addScreen('A tiny cafe', null, { ...cache.get('a tiny bakery website')!.versions[0]!, html: '<h1>Cafe</h1>' })
    expect((await post('/api/revise', { key: 'a tiny bakery website', prompt: 'A TINY cafe.' })).status).toBe(409)
    const ids = (await map()).entries.map((e) => e.sid).sort()
    const { entry } = done(await stream('/api/revise', { key: 'a tiny bakery website', prompt: RENAMED }))
    expect(entry).toMatchObject({ key: 'a tiny bakery website with online orders', app: RENAMED, action: null })
    expect(sent.at(-1)).toStartWith(`App: ${RENAMED}\n`)
    const m = await map(RENAMED)
    expect(m.entries.map((e) => e.sid).sort()).toEqual(ids)
    expect(m.entries.every((e) => e.key.startsWith('a tiny bakery website with online orders'))).toBe(true)
    expect((await map()).entries).toEqual([])
    cache.deleteApp('A tiny cafe')
  }, 30_000)

  test('bad input is refused', async () => {
    expect((await post('/api/screen', { app: 'x', model: 'gpt-2' })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', model: 'toString' })).status).toBe(400)
    expect((await post('/api/screen', { app: '' })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', device: 'watch' })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', action: 'x'.repeat(501) })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', action: 'Words with no name' })).status).toBe(400)
    expect((await post('/api/delete', { key: 'no such screen' })).status).toBe(404)
    expect((await post('/api/pick', { key: 'a tiny bakery website', index: 0 })).status).toBe(404)
  })

  test('the mockup theme and the small phone are the defaults, and the stylesheet is served', async () => {
    const cfg = await (await fetch(new URL('/api/config', server.url))).json()
    expect(cfg.defaultTheme).toBe('mockup')
    expect(cfg.themes.map((t: { id: string }) => t.id)).toEqual(['mockup', 'clean'])
    expect(cfg.defaultDevice).toBe('small-phone')
    expect(cfg.devices.map((d: { id: string }) => d.id)).toEqual(['small-phone', 'large-phone', 'laptop', 'monitor'])
    const css = await (await fetch(new URL('/themes/mockup.css', server.url))).text()
    expect(css).toContain('grayscale(1)')
    expect((await fetch(new URL('/themes/clean.css', server.url))).status).toBe(404)
  })

  test('another web page cannot spend model credits', async () => {
    expect((await post('/api/screen', { app: 'Other app' }, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await post('/api/revise', { key: 'a tiny bakery website' }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    const textPlain = await fetch(new URL('/api/screen', server.url), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ app: APP }) })
    expect(textPlain.status).toBe(415)
    expect((await post('/api/delete-app', { app: APP }, { Origin: 'https://evil.example' })).status).toBe(403)
  })

  test('a screen, then the whole mockup, can be deleted', async () => {
    const m = await map(RENAMED)
    const second = m.entries.find((e) => e.key.includes('» @') && !e.kind)!
    const del = await (await post('/api/delete', { key: second.key })).json()
    expect(del.removed).toContain(second.key)
    expect(del.entries.map((e: { key: string }) => e.key)).toContain('a tiny bakery website with online orders') // the whole mockup, as /api/map sends it
    expect((await (await post('/api/delete-app', { app: RENAMED })).json()).removed).toBeGreaterThan(0)
    expect((await (await fetch(new URL('/api/apps', server.url))).json()).apps).toEqual([])
    // A later screen of the deleted mockup is refused before any model call.
    const late = await screen({ app: RENAMED, action: '@breads: Our breads' })
    expect(late.map((e) => e.type)).toEqual(['error'])
  })
})
