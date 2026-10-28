// Feature: the web server streams, caches and versions screens (cassette: server).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ScreenCache } from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'
import { cassette } from './cassette.ts'

const tape = cassette('server')
let server: ReturnType<typeof createServer>
const APP = 'A tiny bakery website'
const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

beforeAll(() => { server = createServer({ port: 0, cache: new ScreenCache(), fetch: tape.fetch, env: tape.env, log: () => {} }) })
afterAll(() => { server.stop(true); tape.save() })

async function screen(body: object): Promise<ScreenEvent[]> {
  const res = await post('/api/screen', body)
  expect(res.headers.get('content-type')).toContain('application/x-ndjson')
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
}
/** The action prompts in a screen, in page order, without "home". */
const actions = (html: string) => [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]!).filter((a) => a.toLowerCase() !== 'home')
const done = (evs: ScreenEvent[]) => evs.find((e) => e.type === 'done') as Extract<ScreenEvent, { type: 'done' }>

describe('web server', () => {
  test('a new prompt streams chunks, then the cached entry', async () => {
    const evs = await screen({ app: APP })
    expect(evs[0]).toEqual({ type: 'meta', key: 'a tiny bakery website', cached: false })
    expect(evs.filter((e) => e.type === 'chunk').length).toBeGreaterThan(5)
    expect(done(evs).entry.candidates).toHaveLength(1)
  }, 30_000)

  test('the same prompt, written differently, comes from the cache with no model call', async () => {
    const evs = await screen({ app: '  a tiny BAKERY website. ' })
    expect(evs.map((e) => e.type)).toEqual(['meta', 'done'])
    expect((evs[0] as { cached: boolean }).cached).toBe(true)
  })

  test('clicking an action opens a new screen under its own key', async () => {
    const first = done(await screen({ app: APP })).entry.candidates[0]!.html
    const action = actions(first)[0]
    expect(action).toBeTruthy()
    const evs = await screen({ app: APP, action })
    expect(done(evs).entry.key).toBe(`a tiny bakery website » ${action!.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!?;:,]+$/, '')}`)
  }, 30_000)

  test('a "home" link opens the cached first screen with no model call', async () => {
    const evs = await screen({ app: APP, action: 'home' })
    expect(evs.map((e) => e.type)).toEqual(['meta', 'done'])
    expect(done(evs).entry.key).toBe('a tiny bakery website')
  })

  test('a later screen is told which screens exist, so it can link back to them', async () => {
    const first = done(await screen({ app: APP })).entry.candidates[0]!.html
    const action = actions(first)[0]!
    const second = done(await screen({ app: APP, action })).entry.candidates[0]!.html
    const next = actions(second).find((a) => a !== action)
    expect(next).toBeTruthy()
    const third = done(await screen({ app: APP, action: next })).entry.candidates[0]!.html
    // The third screen may link to "home" or the first action; either way it reuses a known prompt.
    const links = third.match(/data-action="([^"]+)"/g)!.map((m) => m.slice(13, -1))
    expect(links.some((a) => a === 'home' || a === action)).toBe(true)
  }, 60_000)

  test('regenerate adds a version; revisits keep the old one until the user chooses', async () => {
    const regen = done(await screen({ app: APP, regenerate: true }))
    expect(regen.entry.candidates).toHaveLength(2)
    expect(regen.index).toBe(1)
    expect(regen.entry.chosen).toBe(0)
    const res = await post('/api/choose', { key: regen.entry.key, index: 1 })
    expect((await res.json()).entry.chosen).toBe(1)
    expect((await post('/api/choose', { key: regen.entry.key, index: 7 })).status).toBe(404)
    expect(done(await screen({ app: APP })).index).toBe(1)
  }, 30_000)

  test('bad input is refused', async () => {
    expect((await post('/api/screen', { app: 'x', model: 'gpt-2' })).status).toBe(400)
    expect((await post('/api/screen', { app: 'x', model: 'toString' })).status).toBe(400)
    expect((await post('/api/screen', { app: '' })).status).toBe(400)
  })

  test('the mockup theme is the default and its stylesheet is served', async () => {
    const cfg = await (await fetch(new URL('/api/config', server.url))).json()
    expect(cfg.defaultTheme).toBe('mockup')
    expect(cfg.themes.map((t: { id: string }) => t.id)).toEqual(['mockup', 'clean'])
    const css = await (await fetch(new URL('/themes/mockup.css', server.url))).text()
    expect(css).toContain('grayscale(1)')
    expect((await fetch(new URL('/themes/clean.css', server.url))).status).toBe(404)
  })

  test('another web page cannot spend model credits', async () => {
    expect((await post('/api/screen', { app: APP, regenerate: true }, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await post('/api/screen', { app: APP, regenerate: true }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    const textPlain = await fetch(new URL('/api/screen', server.url), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ app: APP }) })
    expect(textPlain.status).toBe(415)
  })
})
