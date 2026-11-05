// The spec rules (process/plans/2026-11-05-spec-memory.md): the plan's limits, lines from designs,
// picks, Edits, Undo, the request and the check. No model calls: a fake provider where one is needed.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FLOW_KEY, MAX_LINE, PLANNER_PROMPT, ScreenCache, applyEdit, applyPick, checkScreen, dropValues, linesOf, makePlan, parsePlan,
  plannedScreens, specRequest, takeSpecLines, treeLines, valueOf, type Fetch, type Spec, type Version,
} from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'

const ver = (html: string, extra: Partial<Version> = {}): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: new Date().toISOString(), costUsd: 0, costEstimated: false,
  firstChunkMs: 0, totalMs: 0, finishReason: 'stop', ...extra,
})
const plan = (): Spec => parsePlan('product.core-flow @home → @recording → @morning-report\nui.nav ? main navigation\nui.back ? how Back looks\ndata.score ? what the score means')

describe('the plan', () => {
  test('keeps the first 8 rows and drops a line over 120 characters', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `ui.row-${i} ? question ${i}`)
    rows.splice(2, 0, `ui.long ? ${'x'.repeat(MAX_LINE + 1)}`)
    const spec = parsePlan(['product.core-flow @home → @a', ...rows, 'Some prose the model added'].join('\n'))
    expect(Object.keys(spec)).toEqual([FLOW_KEY, ...Array.from({ length: 8 }, (_, i) => `ui.row-${i}`)])
    expect(spec['ui.row-0']).toEqual({ ask: 'question 0', from: 'plan', values: [] })
  })

  test('cuts a looping flow at the first repeated name, and starts it at @home', () => {
    expect(valueOf(parsePlan('product.core-flow @home → @field → @market → @upgrades → @field'), FLOW_KEY)).toBe('@home → @field → @market → @upgrades')
    expect(valueOf(parsePlan('product.core-flow @search → @note'), FLOW_KEY)).toBe('@home → @search → @note')
  })

  test('the planner gets the kind of device, never its width', () => {
    expect(PLANNER_PROMPT).not.toMatch(/390|1024/)
  })

  test('a slow plan gives up at its limit', async () => {
    const never: Fetch = (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    await expect(makePlan('Shop', 'phone', { fetch: never, env: { OPENAI_API_KEY: 'fake' }, ms: 30 })).rejects.toThrow('no plan within')
  })
})

describe('lines from designs', () => {
  test('are read to the end of their line and taken out of the screen; at most 3, none over 120 characters', () => {
    const html = [
      '<title>Home</title>',
      '<meta name="idea" content="Tabs at the bottom">',
      '<meta name="spec" content="ui.nav = Tabs: Tonight @home, History @night-history">',
      '<meta name="spec" content="data.score = Snore score 0-100, "higher" is better">',
      `<meta name="spec" content="data.long = ${'x'.repeat(MAX_LINE + 1)}">`,
      '<meta name="spec" content="not a line">',
      '<meta name="spec" content="ui.back = ‹ Back">',
      '<meta name="spec" content="ui.lists = Rows">',
      '<h1>Tonight</h1>',
    ].join('\n')
    const { html: rest, lines, refused } = takeSpecLines(html)
    expect(lines).toEqual([
      { key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' },
      { key: 'data.score', text: 'Snore score 0-100, "higher" is better' },
      { key: 'ui.back', text: '‹ Back' },
    ])
    expect(refused).toBe(3)
    expect(rest).toBe('<title>Home</title>\n<meta name="idea" content="Tabs at the bottom">\n<h1>Tonight</h1>')
  })

  test('a pick fills only rows that are still empty, and drops the rest', () => {
    const spec = plan()
    const taken = applyPick(spec, [
      { key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' },
      { key: FLOW_KEY, text: '@home → @somewhere-else' },
      { key: 'ui.menu', text: 'A drawer' },
    ], 'home')
    expect(taken).toEqual(['ui.nav'])
    expect(valueOf(spec, FLOW_KEY)).toBe('@home → @recording → @morning-report')
    expect(spec['ui.menu']).toBeUndefined()
    // A later pick cannot change a filled row; it may add a known name or a new fact.
    expect(applyPick(spec, [{ key: 'ui.nav', text: 'A drawer' }, { key: 'ui.toggles', text: 'Switches' }, { key: 'data.units', text: 'Minutes' }], 'settings')).toEqual(['ui.toggles', 'data.units'])
    expect(valueOf(spec, 'ui.nav')).toBe('Tabs: Tonight @home, History @night-history')
  })

  test('a pick adds at most 8 facts', () => {
    const spec: Spec = {}
    for (let i = 0; i < 4; i++) applyPick(spec, [0, 1, 2].map((j) => ({ key: `data.f${i}-${j}`, text: 'x' })), `s${i}`)
    expect(Object.keys(spec).length).toBe(8)
  })
})

describe('Edits and Undo', () => {
  test('an Edit sets any key; Undo of that version brings the value before back, and drops a row it added', () => {
    const spec = plan()
    applyPick(spec, [{ key: 'ui.back', text: '‹ Back, first in the header' }], 'night')
    applyEdit(spec, [{ key: 'ui.back', text: '← Back, top left' }, { key: 'ui.toggles', text: 'Switches' }], 'settings', 2)
    expect(valueOf(spec, 'ui.back')).toBe('← Back, top left')
    expect(linesOf(spec, 'settings', 2)).toEqual([
      { key: 'ui.back', text: '← Back, top left', before: '‹ Back, first in the header' },
      { key: 'ui.toggles', text: 'Switches', before: undefined },
    ])
    expect(dropValues(spec, 'settings', 2)).toBe(2)
    expect(valueOf(spec, 'ui.back')).toBe('‹ Back, first in the header')
    expect(spec['ui.toggles']).toBeUndefined()
  })

  test('✕ takes back one line of an Edit and leaves its others', () => {
    const spec = plan()
    applyEdit(spec, [{ key: 'ui.nav', text: 'Tabs' }, { key: 'data.score', text: 'Higher is better' }], 'home', 1)
    expect(dropValues(spec, 'home', 1, 'ui.nav')).toBe(1)
    expect(spec['ui.nav']!.values).toEqual([])
    expect(valueOf(spec, 'data.score')).toBe('Higher is better')
  })

  test('the cache applies a pick, an Edit, a Regenerate and Undo to the mockup spec, and saves it', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const cache = new ScreenCache(file)
    cache.setSpec('Snore', plan())
    const key = cache.propose('Snore', null, 0, ver('<h1>A</h1>', { spec: [{ key: 'ui.nav', text: 'Tabs: Tonight @home' }] }))!.key
    cache.propose('Snore', null, 1, ver('<h1>B</h1>', { spec: [{ key: 'ui.back', text: '‹ Back' }] }))
    cache.pick(key, 0)
    expect(valueOf(cache.spec('Snore'), 'ui.nav')).toBe('Tabs: Tonight @home')
    expect(valueOf(cache.spec('Snore'), 'ui.back')).toBeUndefined() // the design not picked
    cache.addVersion(key, ver('<h1>A2</h1>', { spec: [{ key: 'ui.back', text: 'Regenerated' }] }))
    expect(cache.get(key)!.versions[1]!.spec).toBeUndefined()
    expect(valueOf(cache.spec('Snore'), 'ui.back')).toBeUndefined()
    cache.addVersion(key, ver('<h1>A3</h1>', { feedback: 'use a drawer', spec: [{ key: 'ui.nav', text: 'A drawer' }] }))
    expect(valueOf(cache.spec('Snore'), 'ui.nav')).toBe('A drawer')
    expect(valueOf(new ScreenCache(file).spec('Snore'), 'ui.nav')).toBe('A drawer')
    cache.undo(key)
    expect(valueOf(cache.spec('Snore'), 'ui.nav')).toBe('Tabs: Tonight @home')
    cache.deleteApp('Snore')
    expect(cache.hasSpec('Snore')).toBe(false)
  })

  test('a cache file from before specs loads every mockup with an empty spec', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    writeFileSync(file, JSON.stringify({ version: 3, entries: [{ key: 'shop', app: 'Shop', action: null, name: 'home', parent: null, versions: [ver('<h1>Shop</h1>')] }] }))
    const cache = new ScreenCache(file)
    expect(cache.map('Shop').entries).toHaveLength(1)
    expect(cache.spec('Shop')).toEqual({})
    cache.setSpec('Shop', {})
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(4)
  })
})

describe('the request and the check', () => {
  test('the request lists filled rows with their value and open ones with their question, then the markup', () => {
    const spec = plan()
    applyPick(spec, [{ key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' }], 'home')
    const text = specRequest(spec)
    expect(text).toContain('product.core-flow = @home → @recording → @morning-report\nui.nav = Tabs: Tonight @home, History @night-history\nui.back ? how Back looks\ndata.score ? what the score means')
    expect(text).toContain('<nav data-ui="tabs">')
    expect(text).toContain('<a data-ui="back" data-action="back">')
    expect(text).not.toContain('role="switch"')
    expect(specRequest({})).toBe('')
  })

  test('the flow and the tabs are planned screens: a flow step hangs under the step before', () => {
    const cache = new ScreenCache()
    const spec = plan()
    applyPick(spec, [{ key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' }], 'home')
    const home = cache.propose('Snore', null, 0, ver('<h1>Tonight</h1>'))!
    cache.pick(home.key, 0)
    const planned = plannedScreens(cache.map('Snore').entries, spec)
    expect(planned.map((p) => [p.name, p.parent!.key, p.action])).toEqual([
      ['recording', 'snore', 'The recording screen'],
      ['morning-report', 'snore » @recording', 'The morning report screen'],
      ['night-history', 'snore', 'The night history screen, opened by "History"'],
    ])
    expect(treeLines(cache.map('Snore').entries, 80, undefined, spec)).toEqual([
      '@home: the first screen of Snore',
      '  @recording: The recording screen (not made yet)',
      '    @morning-report: The morning report screen (not made yet)',
      '  @night-history: The night history screen, opened by "History" (not made yet)',
    ])
  })

  test('the check finds a missing tab, another Back label and a screen written twice; tab screens need no Back', () => {
    const spec = plan()
    applyPick(spec, [{ key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' }, { key: 'ui.back', text: '‹ Back, first in the header' }], 'home')
    const tabs = '<nav data-ui="tabs"><a data-action="@home">Tonight</a><a data-action="@night-history">History</a></nav>'
    expect(checkScreen(`<a data-ui="back" data-action="back">‹ Back</a><h1>Night</h1>${tabs}`, spec, 'night-details')).toEqual([])
    expect(checkScreen('<a data-ui="back" data-action="back">‹ Settings</a><a data-action="@home">Tonight</a>', spec, 'profile'))
      .toEqual(['no tab for @night-history', 'Back says "‹ Settings"'])
    expect(checkScreen(`<h1>History</h1>${tabs}`, spec, 'night-history')).toEqual([])
    expect(checkScreen(`<h1>Night</h1>${tabs}`, spec, 'night-details')).toEqual(['no Back'])
    expect(checkScreen(`<title>A</title>${tabs}<title>A</title>${tabs}`, spec, 'home')).toEqual(['the screen is written twice'])
  })
})

test('a failed plan never blocks the first screen: it comes with an empty spec', async () => {
  const reply = `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: '<title>Home</title><h1>Shop</h1>' }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
  const fetch: Fetch = async () => new Response(reply)
  const cache = new ScreenCache()
  const server = createServer({ port: 0, cache, fetch, env: { OPENROUTER_API_KEY: 'fake' }, log: () => {}, plan: async () => { throw new Error('no plan') } })
  try {
    const res = await globalThis.fetch(new URL('/api/screen', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }) })
    const evs = (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as ScreenEvent)
    expect(evs.map((e) => e.type).filter((t) => t !== 'chunk')).toEqual(['meta', 'spec', 'version', 'version', 'done'])
    expect(evs.find((e) => e.type === 'spec')).toEqual({ type: 'spec', spec: {} })
    expect(cache.hasSpec('Shop')).toBe(true)
    expect(cache.get('shop')!.proposals!.every((p) => p?.misses?.length === 0)).toBe(true)
  } finally {
    server.stop(true)
  }
})

test('spec/prompt-plan.md holds the exact planner prompt', () => {
  const doc = readFileSync(new URL('../../spec/prompt-plan.md', import.meta.url), 'utf8')
  expect(doc.match(/```text\n([\s\S]*?)\n```/)?.[1]).toBe(PLANNER_PROMPT)
})
