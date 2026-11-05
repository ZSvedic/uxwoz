// The critic's findings on the spec (slices 1 and 2), one test each, numbered as in the review.
// No model calls: fake providers and plan stubs.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ScreenCache, applyEdit, checkScreen, fallbackSpec, framePage, generateScreen, linesOf, navNames, parsePlan, planRequest,
  plannedScreens, specRequest, tabLabel, takeSpecLines, valueOf, type Fetch, type Spec, type Version,
} from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'

const ver = (html: string, extra: Partial<Version> = {}): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: new Date().toISOString(), costUsd: 0, costEstimated: false,
  firstChunkMs: 0, totalMs: 0, finishReason: 'stop', ...extra,
})
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const withTabs = (): Spec => ({
  ...parsePlan('product.core-flow @home → @recording → @morning-report\nui.back ? how Back looks'),
  'ui.nav': { ask: 'main navigation', from: 'plan', values: [{ text: 'Tabs: Tonight @home, History @night-history', from: 'pick' }] },
})

async function events(server: ReturnType<typeof createServer>, body: object, signal?: AbortSignal): Promise<ScreenEvent[]> {
  const res = await fetch(new URL('/api/screen', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
  return (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
const post = (server: ReturnType<typeof createServer>, path: string, body: object) =>
  fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('1, 7, 13: the plan', () => {
  test('1: a mockup with no first screen plans again, and a failed plan shows in Info on Home', async () => {
    let plans = 0, fail = true
    const cache = new ScreenCache()
    const fetch: Fetch = async () => (fail ? new Response('nope', { status: 500 }) : new Response(reply('<title>Home</title><h1>Shop</h1>')))
    const server = createServer({ port: 0, cache, fetch, env, log: () => {}, plan: async () => { plans++; if (fail) throw new Error('no key'); return parsePlan('ui.nav ? main navigation') } })
    try {
      expect((await events(server, { app: 'Shop' })).at(-1)!.type).toBe('error') // the plan and both designs failed
      expect(valueOf(cache.spec('Shop'), 'ui.nav')).toBeUndefined()
      fail = false
      const evs = await events(server, { app: 'Shop' })
      expect(plans).toBe(2)
      expect(evs.find((e) => e.type === 'spec')).toEqual({ type: 'spec', spec: parsePlan('ui.nav ? main navigation') })
    } finally { server.stop(true) }
    // A plan that fails before a first screen that works: the fallback rows, and why, on Home's designs.
    const cache2 = new ScreenCache()
    const server2 = createServer({ port: 0, cache: cache2, fetch: async () => new Response(reply('<title>Home</title><h1>Shop</h1>')), env, log: () => {}, plan: async () => { throw new Error('no plan within 6 s') } })
    try {
      await events(server2, { app: 'Shop' })
      expect(cache2.spec('Shop')).toEqual(fallbackSpec())
      expect(cache2.get('shop')!.proposals!.map((p) => p!.plan)).toEqual([0, 1].map(() => ({ rows: 0, ms: 0, costUsd: null, error: 'no plan within 6 s' })))
    } finally { server2.stop(true) }
  })

  test('1: ✕ under the OR before either side finishes takes the plan with it', () => {
    const cache = new ScreenCache()
    cache.setSpec('Shop', fallbackSpec())
    expect(cache.delete('shop')).toBeUndefined()
    expect(cache.hasSpec('Shop')).toBe(false)
  })

  test('7: two first-screen requests for one new mockup share one plan', async () => {
    let plans = 0
    const server = createServer({ port: 0, cache: new ScreenCache(), fetch: async () => new Response(reply('<title>Home</title><h1>Shop</h1>')), env, log: () => {},
      plan: async () => { plans++; await Bun.sleep(30); return parsePlan('ui.nav ? main navigation') } })
    try {
      await Promise.all([events(server, { app: 'Shop' }), events(server, { app: 'shop ' })])
      expect(plans).toBe(1)
    } finally { server.stop(true) }
  })

  test('13: the planner request names the kind of device, never its width', () => {
    expect(planRequest('x', 'phone')).toBe('x\n\nThe mockup is for a phone.')
    expect(planRequest('x', 'desktop')).toBe('x\n\nThe mockup is for a desktop browser.')
    for (const d of ['phone', 'desktop'] as const) expect(planRequest('x', d)).not.toMatch(/\d+ ?px|390|1024/)
  })

  test('13: a mockup deleted while its plan runs keeps no spec and no screen', async () => {
    let release = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const cache = new ScreenCache()
    const server = createServer({ port: 0, cache, fetch: async () => new Response(reply('<title>Home</title><h1>Shop</h1>')), env, log: () => {},
      plan: async () => { await gate; return parsePlan('ui.nav ? main navigation') } })
    try {
      const pending = events(server, { app: 'Shop' })
      await Bun.sleep(20)
      await post(server, '/api/delete-app', { app: 'Shop' })
      release()
      const evs = await pending
      expect(cache.hasSpec('Shop')).toBe(false)
      expect(cache.get('shop')).toBeUndefined()
      expect(evs.at(-1)!.type).toBe('error')
    } finally { server.stop(true) }
  })
})

test('2: the tab bar keeps its place against a model\'s inline style', () => {
  expect(framePage('', '', true, 'phone')).toContain('position: absolute !important; left: 0 !important; right: 0 !important; bottom: 0 !important;')
})

describe('3: spec tags are read one tag at a time', () => {
  test('a whole screen on the line of a spec tag stays, and the HTML never becomes a value', () => {
    const html = '<title>Home</title><meta name="spec" content="ui.nav = Tabs: Tonight @home"><h1>Tonight</h1><button data-action="@x">Go</button>'
    const r = takeSpecLines(html)
    expect(r.lines).toEqual([{ key: 'ui.nav', text: 'Tabs: Tonight @home' }])
    expect(r.html).toBe('<title>Home</title><h1>Tonight</h1><button data-action="@x">Go</button>')
  })

  test('two tags on one line are two lines; content first is read too; a quote inside is safe; `<` is refused', () => {
    const r = takeSpecLines('<meta name="spec" content="ui.nav = Tabs: A @home"> <meta content="data.score = "higher" is better" name="spec">\n<meta name="spec" content="ui.back = <b>Back</b>">\n<h1>x</h1>')
    expect(r.lines).toEqual([{ key: 'ui.nav', text: 'Tabs: A @home' }, { key: 'data.score', text: '"higher" is better' }])
    expect(r.refused).toBe(1)
    expect(r.html).toBe('<h1>x</h1>')
  })
})

test('4: an Edit line that repeats a row\'s value adds nothing; the drawer lists every row an Edit changed, the flow too', () => {
  const spec = withTabs()
  expect(applyEdit(spec, [{ key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' }, { key: 'product.core-flow', text: '@home → @night-history' }], 'settings', 't1')).toEqual(['product.core-flow'])
  expect(spec['ui.nav']!.values).toHaveLength(1)
  expect(linesOf(spec, 'settings', 't1').map((l) => l.key)).toEqual(['product.core-flow'])
})

describe('5: tabs only when ui.nav says Tabs', () => {
  test('names in other navigation are not tabs, and get no tab markup', () => {
    const spec: Spec = { 'ui.nav': { values: [{ text: 'No tab bar: one step per screen with Next @next-step', from: 'pick' }] } }
    expect(navNames(spec)).toEqual([])
    expect(specRequest(spec)).not.toContain('data-ui="tabs"')
    expect(specRequest({ 'ui.nav': { ask: 'main navigation', values: [] } })).toContain('data-ui="tabs"')
  })

  test('a tab label is matched to its whole name', () => {
    const spec: Spec = { 'ui.nav': { values: [{ text: 'Tabs: History @night-history, Night @night', from: 'pick' }] } }
    expect(tabLabel(spec, 'night')).toBe('Night')
    expect(tabLabel(spec, 'night-history')).toBe('History')
  })
})

test('6: Back labels with entities pass; a label that is not how ui.back starts misses; a button Back counts', () => {
  const spec = withTabs()
  spec['ui.back']!.values.push({ text: '‹ Back, first in the header', from: 'pick' })
  const tabs = '<nav data-ui="tabs"><a data-action="@home">Tonight</a><a data-action="@night-history">History</a></nav>'
  for (const label of ['&lsaquo; Back', '&#8249; Back', '‹&nbsp;Back', '&#x2039; Back'])
    expect(checkScreen(`<a data-ui="back" data-action="back">${label}</a>${tabs}`, spec, 'details')).toEqual([])
  expect(checkScreen(`<a data-ui="back" data-action="back">e</a>${tabs}`, spec, 'details')).toEqual(['Back says "e"'])
  expect(checkScreen(`<button data-ui="back" data-action="back">‹ Back</button>${tabs}`, spec, 'details')).toEqual([])
})

test('10: the spec\'s planned screens show once the first screen is picked', () => {
  const cache = new ScreenCache()
  const spec = withTabs()
  const home = cache.propose('Snore', null, 0, ver('<h1>Tonight</h1>'))!
  expect(plannedScreens(cache.map('Snore').entries, spec)).toEqual([])
  cache.pick(home.key, 0)
  expect(plannedScreens(cache.map('Snore').entries, spec).map((p) => p.name)).toEqual(['recording', 'morning-report', 'night-history'])
})

test('11: Undo of an Edit on a remade screen leaves the deleted screen\'s values alone', () => {
  const cache = new ScreenCache()
  cache.setSpec('Snore', parsePlan('ui.nav ? main navigation'))
  const home = cache.propose('Snore', null, 0, ver('<h1>Home</h1>'))!
  cache.pick(home.key, 0)
  const make = () => cache.pick(cache.propose('Snore', '@settings: Settings', 0, ver('<h1>Settings</h1>'), { key: home.key, label: 'Settings' })!.key, 0)!
  let settings = make()
  cache.addVersion(settings.key, ver('<h1>S2</h1>', { createdAt: 'edit-1', feedback: 'use switches', spec: [{ key: 'ui.toggles', text: 'Switches' }] }))
  cache.delete(settings.key)
  settings = make()
  cache.addVersion(settings.key, ver('<h1>S2b</h1>', { createdAt: 'edit-2', feedback: 'a title', spec: [] }))
  cache.undo(settings.key)
  expect(valueOf(cache.spec('Snore'), 'ui.toggles')).toBe('Switches')
})

describe('12: written twice, and no check without a spec', () => {
  test('a title inside an SVG is not a second screen; two ideas are', () => {
    expect(checkScreen('<title>Home</title><svg><title>Chart</title></svg>', withTabs(), 'night-history')).not.toContain('the screen is written twice')
    expect(checkScreen('<meta name="idea" content="a"><h1>x</h1><meta name="idea" content="a">', {}, 'x')).toEqual(['the screen is written twice'])
  })

  test('a mockup with no spec rows gets no check', async () => {
    for await (const ev of generateScreen({ app: 'Shop', action: null, model: 'claude-haiku-5.5', spec: {}, name: 'home', fetch: async () => new Response(reply('<title>Home</title>')), env })) {
      if (ev.type === 'done') expect(ev.version.misses).toBeUndefined()
    }
  })
})

test('15: a cache file from a newer app is left as it is, and the app says so', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
  const text = JSON.stringify({ version: 99, entries: [] })
  writeFileSync(file, text)
  const cache = new ScreenCache(file)
  expect(cache.warning).toContain('newer version')
  cache.setSpec('Shop', {})
  expect(readFileSync(file, 'utf8')).toBe(text)
})

test('8: a tab screen hides Back from its first build, and a change needs no reload', () => {
  expect(framePage('', '', true, 'phone', true)).toContain('data-tab')
  expect(framePage('', '', true)).toContain("e.data.uxwoz === 'tab'")
})
