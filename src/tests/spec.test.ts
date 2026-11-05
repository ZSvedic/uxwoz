// The spec rules (process/plans/2026-11-05-spec-memory.md): the plan's limits, lines from designs,
// picks, Edits, Undo, the request and the check. No model calls: a fake provider where one is needed.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FLOW_KEY, MAX_LINE, PLANNER_PROMPT, ScreenCache, generateScreen, applyEdit, applyPick, checkScreen, cutProse, dropValues, fallbackSpec, flowRequest, linesOf, makePlan, markTab, parsePlan, screenRequest,
  backLabelOf, drawChrome, plannedScreens, screenTree, shapeOf, specRequest, takeSpecLines, treeLines, valueOf, wouldTake, type Fetch, type Spec, type Version,
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
      '<meta name="spec" content="ui.back = &quot;‹ Back&quot;, top left">',
      '<meta name="spec" content="ui.lists = Rows">',
      '<h1>Tonight</h1>',
    ].join('\n')
    const { html: rest, lines, refused } = takeSpecLines(html)
    expect(lines).toEqual([
      { key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' },
      { key: 'data.score', text: 'Snore score 0-100, "higher" is better' },
      { key: 'ui.back', text: '"‹ Back", top left' },
    ])
    expect(refused).toBe(3)
    expect(rest).toBe('<title>Home</title>\n<meta name="idea" content="Tabs at the bottom">\n<h1>Tonight</h1>')
  })

  test('a singular or plural of a known name is the known name', () => {
    expect(takeSpecLines('<meta name="spec" content="ui.toggle = Switches">').lines).toEqual([{ key: 'ui.toggles', text: 'Switches' }])
    expect(Object.keys(parsePlan('product.core-flow @home → @a\nui.navs ? main navigation'))).toEqual([FLOW_KEY, 'ui.nav'])
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
    // A later pick cannot change a filled row, and adds no key of its own: no known name, no fact.
    expect(applyPick(spec, [{ key: 'ui.nav', text: 'A drawer' }, { key: 'ui.toggles', text: 'Switches' }, { key: 'data.units', text: 'Minutes' }], 'settings')).toEqual([])
    expect(applyPick(spec, [{ key: 'data.score', text: 'Higher is better' }], 'night')).toEqual(['data.score'])
    expect(valueOf(spec, 'ui.nav')).toBe('Tabs: Tonight @home, History @night-history')
    expect(Object.keys(spec)).toEqual([FLOW_KEY, 'ui.nav', 'ui.back', 'data.score'])
  })

  test('before the pick, the A OR B shows which lines its pick would add and which it would drop', () => {
    const spec = plan()
    applyPick(spec, [{ key: 'ui.back', text: '"‹ Back", top left' }], 'home')
    expect(wouldTake(spec, [{ key: 'ui.nav', text: 'Tabs: A @home, B @b' }, { key: 'ui.back', text: '"← Back", top' }, { key: 'ui.menu', text: 'A drawer' }])).toEqual([true, false, false])
    expect(valueOf(spec, 'ui.nav')).toBeUndefined() // a preview changes nothing
  })

  test('a pick puts in at most 3 lines', () => {
    const spec = parsePlan(['ui.a ? a', 'ui.b ? b', 'ui.c ? c', 'ui.d ? d'].join('\n'))
    expect(applyPick(spec, ['a', 'b', 'c', 'd'].map((k) => ({ key: `ui.${k}`, text: k })), 'home')).toEqual(['ui.a', 'ui.b', 'ui.c'])
  })
})

describe('Edits and Undo', () => {
  test('an Edit sets any key; Undo of that version brings the value before back, and drops a row it added', () => {
    const spec = plan()
    applyPick(spec, [{ key: 'ui.back', text: '"‹ Back", first in the header' }], 'night')
    applyEdit(spec, [{ key: 'ui.back', text: '"← Back", top left' }, { key: 'ui.toggles', text: 'Switches' }], 'settings', 't2')
    expect(valueOf(spec, 'ui.back')).toBe('"← Back", top left')
    expect(linesOf(spec, 'settings', 't2')).toEqual([
      { key: 'ui.back', text: '"← Back", top left', before: '"‹ Back", first in the header', later: false },
      { key: 'ui.toggles', text: 'Switches', before: undefined, later: false },
    ])
    expect(dropValues(spec, 'settings', 't2')).toBe(2)
    expect(valueOf(spec, 'ui.back')).toBe('"‹ Back", first in the header')
    expect(spec['ui.toggles']).toBeUndefined()
  })

  test('✕ takes back one line of an Edit and leaves its others', () => {
    const spec = plan()
    applyEdit(spec, [{ key: 'ui.nav', text: 'A drawer menu' }, { key: 'data.score', text: 'Higher is better' }], 'home', 't1')
    expect(dropValues(spec, 'home', 't1', 'ui.nav')).toBe(1)
    expect(spec['ui.nav']!.values).toEqual([])
    expect(valueOf(spec, 'data.score')).toBe('Higher is better')
  })

  test('the cache applies a pick, an Edit, a Regenerate and Undo to the mockup spec, and saves it', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const cache = new ScreenCache(file)
    cache.setSpec('Snore', plan())
    const key = cache.propose('Snore', null, 0, ver('<h1>A</h1>', { spec: [{ key: 'ui.nav', text: 'Tabs: Tonight @home, History @history' }] }))!.key
    cache.propose('Snore', null, 1, ver('<h1>B</h1>', { spec: [{ key: 'ui.back', text: '"‹ Back", top left' }] }))
    cache.pick(key, 0)
    expect(valueOf(cache.spec('Snore'), 'ui.nav')).toBe('Tabs: Tonight @home, History @history')
    expect(valueOf(cache.spec('Snore'), 'ui.back')).toBeUndefined() // the design not picked
    cache.addVersion(key, ver('<h1>A2</h1>', { createdAt: 't-a2', spec: [{ key: 'ui.back', text: 'Regenerated' }] }))
    expect(cache.get(key)!.versions[1]!.spec).toBeUndefined()
    expect(valueOf(cache.spec('Snore'), 'ui.back')).toBeUndefined()
    cache.addVersion(key, ver('<h1>A3</h1>', { createdAt: 't-a3', feedback: 'use a drawer', spec: [{ key: 'ui.nav', text: 'A drawer' }] }))
    expect(valueOf(cache.spec('Snore'), 'ui.nav')).toBe('A drawer')
    expect(valueOf(new ScreenCache(file).spec('Snore'), 'ui.nav')).toBe('A drawer')
    cache.undo(key)
    expect(valueOf(cache.spec('Snore'), 'ui.nav')).toBe('Tabs: Tonight @home, History @history')
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

  test('a step of the core flow is asked for a control to the next step, near the end of the request', () => {
    const spec = plan()
    expect(flowRequest(spec, 'recording')).toBe('This screen is a step of the main path (product.core-flow): the control that finishes this screen\'s task (Stop, Save, Done) opens @morning-report itself, with data-action="@morning-report"; not a script handler, and not a second link beside it.')
    expect(flowRequest(spec, 'morning-report')).toBe('')
    expect(flowRequest(spec, 'settings')).toBe('')
    expect(screenRequest('Snore', 'Recording', [], { spec: specRequest(spec), device: 'a phone screen', flow: flowRequest(spec, 'recording') })).toEndWith(`Design it for a phone screen.\n\n${flowRequest(spec, 'recording')}`)
  })

  test('the check flags a flow step with no control to the next step, and more than 2 new screens', () => {
    const spec = plan()
    expect(checkScreen('<button id="stop">Stop</button>', spec, 'recording')).toEqual(['no link to @morning-report, the next step of the core flow'])
    expect(checkScreen('<button data-action="@morning-report">Stop</button>', spec, 'recording')).toEqual([])
    const known = new Set(['home', 'recording', 'morning-report'])
    const html = (names: string[]) => names.map((n) => `<a data-action="@${n}: A new screen">x</a>`).join('') + '<a data-action="@home">Home</a>'
    // The details of a list's items are one kind: five remedies and a form are two kinds.
    expect(checkScreen(html(['remedy-side-sleeping', 'remedy-nasal-strip', 'remedy-no-alcohol', 'remedy-extra-pillow', 'remedy-add']), {}, 'remedies', known)).toEqual([])
    expect(checkScreen(html(['latte-details', 'mocha-details']), {}, 'menu', known)).toEqual([])
    expect(checkScreen(html(['profile', 'export', 'privacy']), {}, 'settings', known)).toEqual(['opens 3 new kinds of screen (@profile, @export, @privacy)'])
  })

  test('the app marks the current tab, and removes the marks the model wrote', () => {
    const nav = '<nav data-ui="tabs"><a data-action="@home" aria-current="page">Tonight</a><a data-action="@night-history">History</a></nav>'
    expect(markTab(nav, 'night-history')).toBe('<nav data-ui="tabs"><a data-action="@home">Tonight</a><a data-action="@night-history" aria-current="page">History</a></nav>')
    expect(markTab(nav, 'night-details')).toBe('<nav data-ui="tabs"><a data-action="@home">Tonight</a><a data-action="@night-history">History</a></nav>')
    expect(markTab('<a data-action="@home" aria-current="page">Home</a>', 'x')).toBe('<a data-action="@home" aria-current="page">Home</a>')
  })

  test('prose before the title is cut; markup before it stays', () => {
    expect(cutProse('The request has no change, so here it is again.\n\n<title>Home</title><h1>Hi</h1>')).toBe('<title>Home</title><h1>Hi</h1>')
    expect(cutProse('<style>p{}</style><title>Home</title>')).toBe('<style>p{}</style><title>Home</title>')
    expect(cutProse('<h1>No title</h1>')).toBe('<h1>No title</h1>')
  })

  test('code draws the tab bar from ui.nav and Back from ui.back; the check no longer looks at them', () => {
    const spec = plan()
    applyPick(spec, [{ key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' }, { key: 'ui.back', text: '"‹ Back", first in the header' }], 'home')
    const tabs = '<nav data-ui="tabs" style="position:sticky"><a data-action="@home" aria-current="page">Home</a></nav>'
    const drawnBar = '<nav data-ui="tabs"><a data-action="@home">Tonight</a><a data-action="@night-history" aria-current="page">History</a></nav>'
    expect(drawChrome(`<h1>History</h1>${tabs}<script>x()</script>`, spec, 'night-history')).toBe(`<h1>History</h1>${drawnBar}<script>x()</script>`)
    // A screen with no tab bar gets one, before its script; Back's label is drawn, whatever the model wrote.
    expect(drawChrome('<a data-ui="back" data-action="back">&lsaquo;&nbsp;Settings</a><h1>Night</h1><script>y()</script>', spec, 'night-details'))
      .toBe('<a data-ui="back" data-action="back">‹ Back</a><h1>Night</h1><nav data-ui="tabs"><a data-action="@home">Tonight</a><a data-action="@night-history">History</a></nav>\n<script>y()</script>')
    // A screen with no Back is left alone; with no Tabs: line nothing is drawn.
    expect(drawChrome('<h1>x</h1>', { 'ui.nav': { values: [{ text: 'A drawer menu', from: 'pick' }] } }, 'x')).toBe('<h1>x</h1>')
    expect(checkScreen(`<a data-ui="back" data-action="back">‹ Settings</a><h1>Night</h1>`, spec, 'night-details')).toEqual([])
    expect(checkScreen(`<title>A</title>${tabs}<title>A</title>${tabs}`, spec, 'night-history')).toEqual(['the screen is written twice'])
  })
})

test('a failed plan never blocks the first screen: it starts with main navigation and Back open', async () => {
  const reply = `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: '<title>Home</title><h1>Shop</h1>' }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
  const fetch: Fetch = async () => new Response(reply)
  const cache = new ScreenCache()
  const server = createServer({ port: 0, cache, fetch, env: { OPENROUTER_API_KEY: 'fake' }, log: () => {}, plan: async () => { throw new Error('no plan') } })
  try {
    const res = await globalThis.fetch(new URL('/api/screen', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }) })
    const evs = (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as ScreenEvent)
    expect(evs.map((e) => e.type).filter((t) => t !== 'chunk')).toEqual(['meta', 'spec', 'version', 'version', 'done'])
    expect(evs.find((e) => e.type === 'spec')).toEqual({ type: 'spec', spec: fallbackSpec() })
    expect(Object.keys(fallbackSpec())).toEqual(['ui.nav', 'ui.back'])
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

test('Home linking its flow steps and the tabs of its own ui.nav line opens no new screens', async () => {
  const html = '<title>Home</title>\n<meta name="spec" content="ui.nav = Tabs: Home @home, History @history, Remedies @remedy-log">\n'
    + '<a data-action="@recording">Start</a><a data-action="@history">History</a><a data-action="@remedy-log">Remedies</a><a data-action="@tips: Sleep tips">Tips</a>'
  const body = `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
  const fetch: Fetch = async () => new Response(body)
  const spec = parsePlan('product.core-flow @home → @recording → @morning-report\nui.nav ? main navigation')
  for await (const ev of generateScreen({ app: 'Snore', action: null, model: 'claude-haiku-5.5', spec, name: 'home', fetch, env: { OPENROUTER_API_KEY: 'fake' } })) {
    if (ev.type === 'done') expect(ev.version.misses).toEqual([])
  }
})

describe('shapes, and the drawn tabs in the tree', () => {
  test('ui.back starts with its label in quotes; a ui.nav that claims tabs starts with Tabs:', () => {
    expect(shapeOf({ key: 'ui.back', text: '"‹ Back", top left' })).toEqual({ text: '"‹ Back", top left' })
    expect(shapeOf({ key: 'ui.back', text: 'Back sits top-left as a text link' })).toEqual({ why: 'a ui.back line starts with its label in double quotes, e.g. "‹ Back", top left' })
    expect(shapeOf({ key: 'ui.nav', text: 'Bottom tabs: Record @recording, History @history' })).toEqual({ why: 'a tab bar starts with Tabs:, e.g. Tabs: Home @home, Cart @cart' })
    expect(shapeOf({ key: 'ui.nav', text: 'A drawer menu from the top left' })).toEqual({ text: 'A drawer menu from the top left' })
    expect(backLabelOf('“← Night”, top right')).toBe('← Night')
  })

  test('a tab the frame draws is a link the tree knows', () => {
    const cache = new ScreenCache()
    const spec = parsePlan('ui.nav ? main navigation')
    applyPick(spec, [{ key: 'ui.nav', text: 'Tabs: Tonight @home, History @night-history' }], 'home')
    const home = cache.pick(cache.propose('Snore', null, 0, ver('<h1>Tonight</h1><a data-action="@details: A night">x</a>'))!.key, 0)!
    const details = cache.pick(cache.propose('Snore', '@details: A night', 0, ver('<h1>Night</h1>'), { key: home.key, label: 'x' })!.key, 0)!
    const history = cache.pick(cache.propose('Snore', '@night-history: History', 0, ver('<h1>History</h1>'), { key: details.key, label: 'History' })!.key, 0)!
    // Made from Details (level 3 by its click), but every screen's drawn tab bar links it: level 2, under Home.
    expect(screenTree(cache.map('Snore').entries, spec).get(history.key)).toEqual({ level: 2, parent: home.key, label: 'History' })
  })
})
