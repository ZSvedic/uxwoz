// The second critic's findings on slice 3 (Edits, ✕ and Undo), one test each, numbered as in the
// review; and a doubled reply keeping its first copy. No model calls: fake providers.
import { describe, expect, test } from 'bun:test'
import {
  ScreenCache, applyEdit, firstCopy, generateScreen, linesOf, parsePlan, takeSpecLines, valueOf, type Fetch, type SpecRefusal, type Version,
} from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'

let clock = 0
const ver = (html: string, extra: Partial<Version> = {}): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: `t${++clock}`, costUsd: 0, costEstimated: false,
  firstChunkMs: 0, totalMs: 0, finishReason: 'stop', ...extra,
})
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }

/** A mockup with a picked Home and a picked Settings screen. */
function mockup() {
  const cache = new ScreenCache()
  cache.setSpec('Snore', parsePlan('product.core-flow @home → @recording\nui.nav ? main navigation\nui.back ? how Back looks'))
  const home = cache.pick(cache.propose('Snore', null, 0, ver('<h1>Home</h1>'))!.key, 0)!
  const settings = () => cache.pick(cache.propose('Snore', '@settings: Settings', 0, ver('<h1>Settings</h1>'), { key: home.key, label: 'Settings' })!.key, 0)!
  return { cache, home, settings }
}

describe('1: values belong to a version, and a deleted screen lets go of them', () => {
  test('Edit, delete, remake, Regenerate, Undo: the deleted screen\'s line stays', () => {
    const { cache, settings } = mockup()
    let s = settings()
    cache.addVersion(s.key, ver('<h1>S</h1>', { feedback: 'use switches', spec: [{ key: 'ui.toggles', text: 'Switches' }] }))
    cache.delete(s.key)
    s = settings()
    cache.addVersion(s.key, ver('<h1>S again</h1>'))
    cache.undo(s.key)
    expect(valueOf(cache.spec('Snore'), 'ui.toggles')).toBe('Switches')
    expect(cache.spec('Snore')['ui.toggles']!.values[0]!.screen).toBeUndefined()
  })

  test('Edit, Undo, Edit again: a ✕ for the first Edit does not take back the second\'s line', () => {
    const { cache, settings } = mockup()
    const s = settings()
    const first = ver('<h1>S1</h1>', { feedback: 'switches', spec: [{ key: 'ui.toggles', text: 'Switches' }] })
    cache.addVersion(s.key, first)
    cache.undo(s.key)
    cache.addVersion(s.key, ver('<h1>S2</h1>', { feedback: 'checkboxes', spec: [{ key: 'ui.toggles', text: 'Checkboxes' }] }))
    expect(cache.dropLine(s.key, first.createdAt, 'ui.toggles')).toBeUndefined()
    expect(valueOf(cache.spec('Snore'), 'ui.toggles')).toBe('Checkboxes')
  })
})

test('2: an Edit cannot give the flow or a Tabs: navigation a shape the plan would refuse', () => {
  const spec = parsePlan('product.core-flow @home → @cart\nui.nav ? main navigation')
  const refused: SpecRefusal[] = []
  expect(applyEdit(spec, [{ key: 'product.core-flow', text: 'Browse, then pay' }, { key: 'ui.nav', text: 'Tabs: Home only' }], 's', 't', refused)).toEqual([])
  expect(refused.map((r) => r.why)).toEqual(['a core flow names its screens, e.g. @home → @cart', 'a Tabs: line names each tab by its @name'])
  expect(valueOf(spec, 'product.core-flow')).toBe('@home → @cart')
  expect(applyEdit(spec, [{ key: 'product.core-flow', text: '@home → @menu → @cart → @menu' }], 's', 't2')).toEqual(['product.core-flow'])
  expect(valueOf(spec, 'product.core-flow')).toBe('@home → @menu → @cart')
})

test('4: an Edit\'s lines that were not taken are kept on its version, with why', () => {
  const { cache, settings } = mockup()
  const s = settings()
  const taken = takeSpecLines(`<meta name="spec" content="ui.back = ${'x'.repeat(130)}">\n<meta name="spec" content="product.core-flow = Browse">\n<h1>S</h1>`)
  cache.addVersion(s.key, ver('<h1>S</h1>', { feedback: 'a change', spec: taken.lines, specRefused: taken.refusals }))
  expect(cache.get(s.key)!.versions[1]!.specRefused!.map((r) => r.why)).toEqual(['longer than 120 characters', 'a core flow names its screens, e.g. @home → @cart'])
})

test('5: an Edit that changes Back is checked against its own Back line', async () => {
  const spec = parsePlan('ui.back ? how Back looks')
  spec['ui.back']!.values.push({ text: '"‹ Back", first in the header', from: 'pick' })
  const html = '<title>Night</title>\n<meta name="spec" content="ui.back = &quot;← Night&quot;, top right">\n<a data-ui="back" data-action="back">← Night</a><h1>Night</h1>'
  for await (const ev of generateScreen({ app: 'Snore', action: 'Night', model: 'claude-haiku-5.5', spec, name: 'night', edit: { html: '<h1>Night</h1>', change: 'Back top right' },
    fetch: async () => new Response(reply(html)), env })) {
    if (ev.type === 'done') expect(ev.version.misses).toEqual([])
  }
})

test('6: a line a later Edit replaced says so', () => {
  const spec = parsePlan('ui.back ? how Back looks')
  applyEdit(spec, [{ key: 'ui.back', text: '"‹ Back", top' }], 'a', 't1')
  applyEdit(spec, [{ key: 'ui.back', text: '"← Back", top' }], 'b', 't2')
  expect(linesOf(spec, 'a', 't1')).toEqual([{ key: 'ui.back', text: '"‹ Back", top', before: undefined, later: true }])
  expect(linesOf(spec, 'b', 't2')[0]!.later).toBe(false)
})

describe('7, 9: ✕ and Undo through the server, with an Edit that sets a line', () => {
  test('an Edit sets a line, ✕ takes it back, a second ✕ is refused, and Undo of a later Edit takes its line back', async () => {
    const pages = [
      '<title>Home</title>\n<meta name="idea" content="Tabs">\n<h1>Home</h1>',
      '<title>Home</title>\n<meta name="idea" content="Tabs">\n<meta name="spec" content="ui.toggles = Switches">\n<h1>Home</h1>',
      '<title>Home</title>\n<meta name="idea" content="Tabs">\n<meta name="spec" content="ui.toggles = Checkboxes">\n<h1>Home</h1>',
    ]
    let n = 0
    const fetch: Fetch = async (_url, init) => new Response(reply(String(init?.body).includes('The change:') ? pages[++n]! : pages[0]!))
    const cache = new ScreenCache()
    const server = createServer({ port: 0, cache, fetch, env, log: () => {}, plan: async () => parsePlan('ui.nav ? main navigation') })
    const post = (path: string, body: object) => globalThis.fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const stream = async (path: string, body: object) => (await (await post(path, body)).text()).trim().split('\n').map((l) => JSON.parse(l) as ScreenEvent)
    try {
      await stream('/api/screen', { app: 'Shop' })
      await post('/api/pick', { key: 'shop', index: 0 })
      const done = (await stream('/api/revise', { key: 'shop', change: 'use switches' })).find((e) => e.type === 'done') as Extract<ScreenEvent, { type: 'done' }>
      expect(valueOf(done.spec, 'ui.toggles')).toBe('Switches')
      const at = done.entry.versions[1]!.createdAt
      const dropped = await post('/api/spec/drop', { key: 'shop', at, row: 'ui.toggles' })
      expect(valueOf((await dropped.json()).spec, 'ui.toggles')).toBeUndefined()
      expect((await post('/api/spec/drop', { key: 'shop', at, row: 'ui.toggles' })).status).toBe(404)
      await stream('/api/revise', { key: 'shop', change: 'use checkboxes' })
      expect(valueOf(cache.spec('Shop'), 'ui.toggles')).toBe('Checkboxes')
      const undone = await (await post('/api/undo', { key: 'shop' })).json()
      expect(valueOf(undone.spec, 'ui.toggles')).toBeUndefined()
    } finally { server.stop(true) }
  })
})

describe('a doubled reply keeps its first copy', () => {
  test('cut at the second idea or title outside SVG', () => {
    const one = '<title>Home</title>\n<meta name="idea" content="a">\n<h1>Home</h1><svg><title>chart</title></svg>'
    expect(firstCopy(`${one}\n/final\n${one}`)).toEqual({ html: `${one}\n/final`, cut: true })
    expect(firstCopy(one)).toEqual({ html: one, cut: false })
  })

  test('Info still notes it', async () => {
    const one = '<title>Home</title>\n<meta name="idea" content="a">\n<h1>Home</h1>'
    for await (const ev of generateScreen({ app: 'Shop', action: null, model: 'claude-haiku-5.5', spec: parsePlan('ui.back ? how Back looks'), name: 'home',
      fetch: async () => new Response(reply(`${one}\n${one}`)), env })) {
      if (ev.type === 'done') {
        expect(ev.version.html).toBe(one)
        expect(ev.version.misses).toEqual(['the reply held the screen twice; the first copy was kept'])
      }
    }
  })
})
