// The tour (spec/behavior.md, The tour; GET /api/tour in the contract): `tour/` reads as a project of four mocks in a
// chain with its boxes, every button leads somewhere that exists, and no route changes it. No model is called.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { HOME_NAME, ScreenCache, isComponent, linksIn, screenRef, screenTree, type CacheEntry } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'
import { TOUR_APP, TOUR_DIR, isTour, tourMap } from '../packages/web/src/tour.ts'

const CHAIN = ['home', 'meet-woz', 'how-woz-works', 'be-like-bill']

describe('the tour', () => {
  const map = tourMap()
  const screens = map.entries.filter((e) => !isComponent(e))

  test('reads as four mocks in a chain, Home first, each under the one whose button leads to it', () => {
    expect(screens.map((e) => e.name)).toEqual(CHAIN)
    expect(screens.map((e) => e.versions.at(-1)!.name)).toEqual(['This is Bill.', 'Meet Woz.', 'How Woz works', 'Be like Bill'])
    const tree = screenTree(map.entries)
    expect(screens.map((e) => tree.get(e.key)?.parent ?? null)).toEqual([null, ...screens.slice(0, -1).map((e) => e.key)])
    expect(screens.map((e) => e.parent?.key ?? null)).toEqual([null, ...screens.slice(0, -1).map((e) => e.key)])
    for (const e of screens) expect(e.versions.at(-1)).toMatchObject({ device: 'small-phone', costUsd: 0 })
    expect(map).toMatchObject({ root: 'the uxwoz tour', filing: false, visiting: false })
  })

  test('its boxes hold three rules, one component, one table and one fixer\'s note', () => {
    expect(map.boxes.rules.map((r) => r.id)).toEqual(['short-text', 'one-button', 'bill-right'])
    expect(map.entries.filter(isComponent).map((e) => [e.name, e.action])).toEqual([['bill', 'Bill, a stick figure, at the right of the first and last mocks']])
    expect(map.boxes.data).toMatchObject([{ id: 'bill-hours', columns: ['name', 'value'], rows: [['deciding', '4 h'], ['waiting and reading', '36 h']] }])
    expect(map.boxes.visits).toHaveLength(1)
    expect(map.boxes.visits![0]!.changes.map((c) => c.text)).toEqual(['pasted bill on home and be-like-bill, so Bill looks the same on both'])
  })

  test('every button leads to a mock that exists (the last opens New project), every pasted component exists', () => {
    const names = new Set(readdirSync(TOUR_DIR).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)))
    const parts = new Set(map.entries.filter(isComponent).map((e) => e.name))
    for (const e of screens) {
      const html = e.versions.at(-1)!.html
      const links = linksIn(html)
      expect(links.length, `${e.name} has its button`).toBeGreaterThan(0)
      for (const l of links) {
        if (l.action === 'new') { expect(e.name).toBe('be-like-bill'); continue }
        const ref = screenRef(l.action)
        expect(ref && (ref.name === HOME_NAME || names.has(ref.name)), `${e.name}: ${l.action}`).toBe(true)
      }
      for (const m of html.matchAll(/data-component="([^"]+)"/g)) expect(parts.has(m[1]!), `${e.name} pastes ${m[1]}`).toBe(true)
    }
  })

  test('isTour knows the tour by name and by key, written any way', () => {
    expect(isTour(TOUR_APP)).toBe(true)
    expect(isTour('  the UXWOZ tour. ')).toBe(true)
    expect(isTour('the uxwoz tour » @meet-woz')).toBe(true)
    expect(isTour('A habit tracker')).toBe(false)
    expect(isTour(null)).toBe(false)
  })
})

describe('the tour in the server', () => {
  let server: ReturnType<typeof createServer>
  const cache = new ScreenCache()
  const calls: string[] = []
  beforeAll(() => { server = createServer({ port: 0, cache, fetch: (async (u: string) => { calls.push(String(u)); throw new Error('no model') }) as any, env: {}, log: () => {} }) })
  afterAll(() => server.stop(true))
  const url = (p: string) => new URL(p, server.url)
  const post = (p: string, body: object) => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  test('GET /api/tour sends it as /api/map sends a mockup; /tour and /tour/:name are the app\'s page', async () => {
    const res = await (await fetch(url('/api/tour'))).json() as { entries: CacheEntry[]; past: unknown }
    expect(res).toMatchObject({ root: 'the uxwoz tour', filing: false, visiting: false })
    expect(res.entries.filter((e) => !isComponent(e)).map((e) => e.name)).toEqual(CHAIN)
    expect(res.past).toBeDefined()
    for (const p of ['/tour', '/tour/meet-woz']) {
      const page = await fetch(url(p))
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('<html')
    }
  })

  test('every other route refuses the tour with 404, and nothing reaches the cache or a model', async () => {
    const app = TOUR_APP, key = 'the uxwoz tour', meet = 'the uxwoz tour » @meet-woz'
    const refused = [
      post('/api/screen', { app }), post('/api/screen', { app, action: '@meet-woz', from: key, label: 'x' }),
      post('/api/settle', { key }), post('/api/revise', { key: meet }), post('/api/revise', { key, prompt: 'Something else' }),
      post('/api/undo', { key }), post('/api/delete', { key: meet }), post('/api/delete-app', { app }),
      post('/api/box', { app, op: 'add', box: 'rules', text: 'More' }), post('/api/box', { app, op: 'visit' }),
      post('/api/share', { app, role: 'view' }),
      fetch(url(`/api/map?app=${encodeURIComponent(app)}`)), fetch(url(`/api/export?app=${encodeURIComponent(app)}`)),
    ]
    expect((await Promise.all(refused)).map((r) => r.status)).toEqual(Array(refused.length).fill(404))
    expect(cache.size).toBe(0)
    expect(calls).toEqual([])
  })
})
