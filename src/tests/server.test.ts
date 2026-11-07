// Feature: the web server streams a new screen's A OR B, keeps the pick, and revises screens (cassette: server).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ScreenCache, linksIn, plannedScreens, screenRef, type CacheEntry } from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'
import { cassette } from './cassette.ts'

const tape = cassette('server')
let server: ReturnType<typeof createServer>
const APP = 'A tiny bakery website'
const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

// The second side always asks for the different design, so the recorded requests replay.
beforeAll(() => { server = createServer({ port: 0, cache: new ScreenCache(), fetch: tape.fetch, env: tape.env, log: () => {}, random: () => 0.9 }) })
afterAll(() => { server.stop(true); tape.save() })

async function stream(path: string, body: object): Promise<ScreenEvent[]> {
  const res = await post(path, body)
  expect(res.headers.get('content-type')).toContain('application/x-ndjson')
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
}
const screen = (body: object) => stream('/api/screen', body)
/** The links to new screens in a screen (`@name: prompt`), in page order. */
const actions = (html: string) => linksIn(html).map((l) => l.action).filter((a) => screenRef(a)?.prompt && screenRef(a)!.name !== 'home')
const nameOf = (action: string) => screenRef(action)!.name
const done = (evs: ScreenEvent[]) => evs.find((e) => e.type === 'done') as Extract<ScreenEvent, { type: 'done' }>
const pick = async (key: string, index: number) => (await (await post('/api/pick', { key, index })).json()).entry as CacheEntry
const shown = (e: CacheEntry) => e.versions.at(-1)!.html

describe('web server', () => {
  test('a new prompt streams two designs at once, each stored as it finishes, with its idea', async () => {
    const evs = await screen({ app: APP })
    expect(evs[0]).toEqual({ type: 'meta', key: 'a tiny bakery website', cached: false, variants: 2 })
    const chunks = evs.filter((e) => e.type === 'chunk')
    for (const v of [0, 1]) expect(chunks.filter((c) => c.variant === v).length).toBeGreaterThan(5)
    expect(evs.filter((e) => e.type === 'version').map((e) => e.variant).sort()).toEqual([0, 1])
    const { entry } = done(evs)
    expect(entry.versions).toEqual([])
    expect(entry.proposals!.map((p) => p!.device)).toEqual(['phone', 'phone'])
    expect(entry.proposals![0]!.html).not.toBe(entry.proposals![1]!.html)
    for (const p of entry.proposals!) expect(p!.idea!.length).toBeGreaterThan(8)
  }, 30_000)

  test('while the A OR B is open, the same prompt, written differently, shows it again at no cost', async () => {
    const evs = await screen({ app: '  a tiny BAKERY website. ' })
    expect(evs.map((e) => e.type)).toEqual(['meta', 'done'])
    expect(evs[0]).toMatchObject({ cached: true, variants: 0 })
    expect(done(evs).entry.proposals).toHaveLength(2)
  })

  test('a pick keeps one design as the first version and drops the other', async () => {
    const before = done(await screen({ app: APP })).entry
    const entry = await pick(before.key, 1)
    expect(entry.versions).toEqual([before.proposals![1]!])
    expect(entry.proposals).toBeUndefined()
    expect((await post('/api/pick', { key: before.key, index: 0 })).status).toBe(404)
  })

  test('a click opens a new screen under its name, with the prompt of its link and the click as its parent', async () => {
    const first = done(await screen({ app: APP })).entry
    expect(first.name).toBe('home')
    const action = actions(shown(first))[0]!
    const evs = await screen({ app: APP, action, from: first.key, label: 'Our breads' })
    const { entry } = done(evs)
    expect(entry.key).toBe(`a tiny bakery website » @${nameOf(action)}`)
    expect(entry).toMatchObject({ name: nameOf(action), action: screenRef(action)!.prompt, parent: { key: first.key, label: 'Our breads' } })
    expect((await pick(entry.key, 0)).name).toBe(nameOf(action))
  }, 30_000)

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
    const first = done(await screen({ app: APP })).entry
    const planned = plannedScreens([first]).at(-1)!
    expect(planned.action).toBe(screenRef(actions(shown(first)).find((a) => nameOf(a) === planned.name)!)!.prompt)
    const second = done(await screen({ app: APP, action: `@${planned.name}`, from: first.key, label: 'More' })).entry
    expect(second).toMatchObject({ key: `a tiny bakery website » @${planned.name}`, name: planned.name, action: planned.action })
    await pick(second.key, 0)
  }, 30_000)

  test('a later screen gets the tree of made and planned screens, and links to them by name', async () => {
    const first = done(await screen({ app: APP })).entry
    const second = done(await screen({ app: APP, action: actions(shown(first))[0]! })).entry
    const made = async () => (await (await fetch(new URL(`/api/map?app=${encodeURIComponent(APP)}`, server.url))).json() as { entries: CacheEntry[] }).entries
    const madeNames = new Set((await made()).map((e) => e.name))
    const next = actions(shown(second)).find((a) => !madeNames.has(nameOf(a)))
    expect(next).toBeTruthy()
    const third = done(await screen({ app: APP, action: next, from: second.key, label: 'Next' })).entry
    const map = await (await fetch(new URL(`/api/map?app=${encodeURIComponent(APP)}`, server.url))).json() as { entries: CacheEntry[] }
    const known = new Set([...map.entries, ...plannedScreens(map.entries)].map((e) => e.name).filter(Boolean))
    const links = third.proposals!.flatMap((p) => linksIn(p!.html).map((l) => l.action))
    // Links by name to screens the mockup has: home at least, from the tree.
    const refs = links.map(screenRef).filter((r) => r != null)
    // (A new name without a prompt happens now and then; it is made from its words and the button's.)
    expect(refs.some((r) => known.has(r.name))).toBe(true)
    // One name is one screen: in one design, a name never comes with two different prompts.
    for (const p of third.proposals!) {
      const prompts = new Map<string, Set<string>>()
      for (const l of linksIn(p!.html)) {
        const r = screenRef(l.action)
        if (r?.prompt && !known.has(r.name)) prompts.set(r.name, new Set([...prompts.get(r.name) ?? [], r.prompt]))
      }
      for (const [, set] of prompts) expect(set.size).toBe(1)
    }
    await pick(third.key, 0)
  }, 60_000)

  test('the map lists one mockup, and the apps list every mockup', async () => {
    const map = await (await fetch(new URL(`/api/map?app=${encodeURIComponent(APP)}`, server.url))).json()
    expect(map.root).toBe('a tiny bakery website')
    expect(map.links).toBeUndefined()
    const { apps } = await (await fetch(new URL('/api/apps', server.url))).json()
    expect(apps.map((a: { app: string }) => a.app)).toEqual([APP])
  })

  test('an Edit makes a new version from the screen and the change, for its device; Regenerate one from its prompt; Undo drops them', async () => {
    const first = done(await screen({ app: APP })).entry
    const change = 'Make the main heading say "Fresh bread daily"'
    const edited = await stream('/api/revise', { key: first.key, change, device: 'desktop' })
    expect(edited[0]).toEqual({ type: 'meta', key: first.key, cached: false, variants: 1 })
    expect(edited.filter((e) => e.type === 'chunk').length).toBeGreaterThan(5)
    const e1 = done(edited).entry
    expect(e1.versions).toHaveLength(2)
    expect(e1.versions[1]).toMatchObject({ feedback: change, device: 'phone' })
    expect(shown(e1)).toContain('Fresh bread daily')
    const e2 = done(await stream('/api/revise', { key: first.key })).entry
    expect(e2.versions).toHaveLength(3)
    expect(e2.versions[2]!.feedback).toBeUndefined()
    expect(shown(e2)).not.toBe(shown(e1))
    expect((await (await post('/api/undo', { key: first.key })).json()).entry.versions).toHaveLength(2)
    expect((await (await post('/api/undo', { key: first.key })).json()).entry.versions).toHaveLength(1)
    expect((await post('/api/undo', { key: first.key })).status).toBe(404)
    expect((await post('/api/revise', { key: first.key, change: ' ' })).status).toBe(400)
    expect((await post('/api/revise', { key: 'no such screen' })).status).toBe(404)
  }, 60_000)

  test('a screen whose A OR B is still open cannot be revised', async () => {
    const first = done(await screen({ app: APP })).entry
    const open = done(await screen({ app: APP, action: 'A page about the bakers of a tiny bakery', from: first.key, label: 'Our bakers' })).entry
    expect(open.versions).toEqual([])
    expect((await post('/api/revise', { key: open.key })).status).toBe(409)
    expect((await post('/api/undo', { key: open.key })).status).toBe(404)
  }, 30_000)

  test('bad input is refused', async () => {
    expect((await post('/api/screen', { app: 'x', model: 'gpt-2' })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', model: 'toString' })).status).toBe(400)
    expect((await post('/api/screen', { app: '' })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', device: 'watch' })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', action: 'x'.repeat(501) })).status).toBe(400)
    expect((await post('/api/delete', { key: 'no such screen' })).status).toBe(404)
    expect((await post('/api/pick', { key: 'no such screen', index: 0 })).status).toBe(404)
  })

  test('the mockup theme and the phone are the defaults, and the stylesheet is served', async () => {
    const cfg = await (await fetch(new URL('/api/config', server.url))).json()
    expect(cfg.defaultTheme).toBe('mockup')
    expect(cfg.themes.map((t: { id: string }) => t.id)).toEqual(['mockup', 'clean'])
    expect(cfg.defaultDevice).toBe('phone')
    expect(cfg.devices.map((d: { id: string }) => d.id)).toEqual(['phone', 'desktop'])
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
    const first = done(await screen({ app: APP })).entry
    const second = done(await screen({ app: APP, action: actions(shown(first))[0]! })).entry
    const del = await (await post('/api/delete', { key: second.key })).json()
    expect(del.removed).toContain(second.key)
    expect(del.entries.map((e: { key: string }) => e.key)).toContain(first.key) // the whole mockup, as /api/map sends it
    expect((await (await post('/api/delete-app', { app: APP })).json()).removed).toBeGreaterThan(1) // the first screen and the bakers' A OR B
    expect((await (await fetch(new URL('/api/apps', server.url))).json()).apps).toEqual([])
    // A later screen of the deleted mockup is refused before any model call.
    const late = await screen({ app: APP, action: '@breads: Our breads' })
    expect(late.map((e) => e.type)).toEqual(['error'])
  })
})
