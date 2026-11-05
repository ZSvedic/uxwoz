// The last critic's findings, on the fix rounds and round C, one test each (numbered as in the
// review), and a test for each mutation it found unguarded (12). No model calls.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ScreenCache, applyEdit, applyPick, checkScreen, drawChrome, firstCopy, framePage, generateScreen, hidesBack, linesOf, navNames, parsePlan, parseTabs,
  plannedScreens, setUserLine, shapeOf, tabLabel, valueOf, type Fetch, type Spec, type Version,
} from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'

let clock = 0
const ver = (html: string, extra: Partial<Version> = {}): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: `t${++clock}`, costUsd: 0, costEstimated: false,
  firstChunkMs: 0, totalMs: 0, finishReason: 'stop', ...extra,
})
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const tabs = (text: string): Spec => { const s = parsePlan('ui.nav ? navigation'); expect(setUserLine(s, 'ui.nav', text)).toBeNull(); return s }

describe('1, 4: the doubled-reply cut', () => {
  test('a title in a script\'s string after an SVG is no second copy, and a cut never ends inside a script', () => {
    const html = '<title>Trends</title>\n<meta name="idea" content="a">\n<svg id="chart"></svg>\n<script>chart.innerHTML = data.map((v) => `<rect><title>${v}</title></rect>`).join("")</script>'
    expect(firstCopy(html)).toEqual({ html, cut: false })
  })

  test('the junk between copies goes: a marker like </assistant>, or notes after the last tag', () => {
    const one = '<title>Home</title>\n<meta name="idea" content="a">\n<main><h1>Home</h1></main><script>go()</script>'
    expect(firstCopy(`${one}</assistant>ablytyped\n${one}`)).toEqual({ html: one, cut: true })
    expect(firstCopy(`${one}\nHere is the screen again, with the notes I wrote.\n${one}`)).toEqual({ html: one, cut: true })
  })

  test('11: a script that selects the tab bar is no second bar', () => {
    const html = '<title>H</title><nav data-ui="tabs"><a data-action="@home">Home</a></nav><script>document.querySelectorAll(\'nav[data-ui="tabs"] a\')</script>'
    expect(checkScreen(html, {}, 'home')).toEqual([])
  })
})

test('2: a delete counts the drawn tabs, as the browser\'s confirm does', () => {
  const cache = new ScreenCache()
  cache.setSpec('Snore', tabs('Tabs: Home @home, History @history'))
  const home = cache.pick(cache.propose('Snore', null, 0, ver('<h1>Home</h1><a data-action="@details: Details">D</a>'))!.key, 0)!
  const details = cache.pick(cache.propose('Snore', '@details: Details', 0, ver('<h1>D</h1>'), { key: home.key, label: 'D' })!.key, 0)!
  const history = cache.pick(cache.propose('Snore', '@history: History', 0, ver('<h1>History</h1>'), { key: details.key, label: 'History' })!.key, 0)!
  expect(cache.delete(details.key)).toEqual([details.key])
  expect(cache.get(history.key)).toBeDefined() // still reached by the tab bar code draws on Home
})

describe('3, 6: ui.nav shapes and tab labels', () => {
  test('a line that says there is no tab bar is fine; one that claims tabs without Tabs: is refused', () => {
    for (const text of ['No tab bar: one step per screen with Next', 'Instead of tabs, a menu button top left', 'Remove the tab bar; a menu button opens @menu'])
      expect(shapeOf({ key: 'ui.nav', text })).toEqual({ text })
    expect('why' in shapeOf({ key: 'ui.nav', text: 'Bottom tabs: Record @recording, History @history' })).toBe(true)
    const spec = parsePlan('ui.nav ? navigation')
    applyPick(spec, [{ key: 'ui.nav', text: 'Tabs: Home @home, History @history' }], 'home')
    expect(applyEdit(spec, [{ key: 'ui.nav', text: 'No tab bar: a menu button top left' }], 's', 't')).toEqual(['ui.nav'])
    expect(navNames(spec)).toEqual([])
  })

  test('labels on either side, with the usual separators; a line whose labels do not parse is refused', () => {
    expect(parseTabs('Tabs: Tonight @home / History @history / Me @me')).toEqual([{ name: 'home', label: 'Tonight' }, { name: 'history', label: 'History' }, { name: 'me', label: 'Me' }])
    expect(parseTabs('Tabs: @home Tonight, @history History')).toEqual([{ name: 'home', label: 'Tonight' }, { name: 'history', label: 'History' }])
    expect(tabLabel(tabs('Tabs: Tonight (@home) · History (@history)'), 'history')).toBe('History')
    expect(shapeOf({ key: 'ui.nav', text: 'Tabs: @home, @history' })).toEqual({ why: 'a Tabs: line names each tab by a label and its @name, e.g. Tabs: Home @home, Cart @cart' })
    expect('why' in shapeOf({ key: 'ui.nav', text: 'Tabs: Tonight @home History @history' })).toBe(true)
  })
})

test('5: Back is hidden on a tab screen only when Home is a tab', () => {
  expect(hidesBack(tabs('Tabs: Home @home, History @history'), 'history')).toBe(true)
  expect(hidesBack(tabs('Tabs: Record @recording, History @history'), 'history')).toBe(false)
  expect(hidesBack(tabs('Tabs: Home @home, History @history'), 'details')).toBe(false)
})

test('7: the tree reads the drawn tab bar, not a stored bar\'s stray links', () => {
  const cache = new ScreenCache()
  const spec = tabs('Tabs: Home @home, History @history')
  cache.pick(cache.propose('Snore', null, 0, ver('<h1>Home</h1><nav data-ui="tabs"><a data-action="@history">History</a><a data-action="@trends: Trends">Trends</a></nav>'))!.key, 0)
  expect(plannedScreens(cache.map('Snore').entries, spec).map((p) => p.name)).toEqual(['history'])
})

test('8: a second request after the plan but before the first design is stored shares that plan', async () => {
  let plans = 0, release = () => {}
  const designs = new Promise<void>((r) => { release = r })
  const fetch: Fetch = async () => { await designs; return new Response(reply('<title>Home</title><h1>x</h1>')) }
  const server = createServer({ port: 0, cache: new ScreenCache(), fetch, env, log: () => {}, plan: async () => { plans++; return parsePlan('ui.nav ? navigation') } })
  const go = () => globalThis.fetch(new URL('/api/screen', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }) }).then((r) => r.text())
  try {
    const first = go()
    await Bun.sleep(30) // the plan is done; the designs wait
    const second = go()
    await Bun.sleep(30)
    release()
    await Promise.all([first, second])
    expect(plans).toBe(1)
  } finally { server.stop(true) }
})

test('9: values saved with a version index get that version\'s createdAt, or lose their tie', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
  const v0 = ver('<h1>S</h1>'), v1 = ver('<h1>S2</h1>', { feedback: 'switches' })
  writeFileSync(file, JSON.stringify({
    version: 4, entries: [{ key: 's', app: 'S', action: null, name: 'home', parent: null, versions: [v0, v1] }],
    specs: { s: { 'ui.toggles': { from: 'edit', values: [{ text: 'Switches', from: 'edit', screen: 's', version: 1 }] }, 'ui.lists': { values: [{ text: 'Rows', from: 'pick', screen: 'gone', version: 0 }] } } },
  }))
  const cache = new ScreenCache(file)
  expect(linesOf(cache.spec('S'), 's', v1.createdAt).map((l) => l.key)).toEqual(['ui.toggles'])
  expect(cache.spec('S')['ui.lists']!.values[0]).toEqual({ text: 'Rows', from: 'pick' })
  cache.undo('s')
  expect(cache.spec('S')['ui.toggles']).toBeUndefined()
})

test('10: more than 5 new screens is flagged even when they are one kind', () => {
  const html = Array.from({ length: 7 }, (_, i) => `<a data-action="@export-${i}: An export">x</a>`).join('')
  expect(checkScreen(html, {}, 'settings', new Set(['home']))).toEqual(['opens 7 new screens (@export-0, @export-1, @export-2, @export-3, @export-4, @export-5, @export-6)'])
})

test('13: any element with data-ui tabs, quoted or not, is the bar; a missing bar goes at the end, never into a container', () => {
  const spec = tabs('Tabs: Home @home, History @history')
  const bar = '<nav data-ui="tabs"><a data-action="@home" aria-current="page">Home</a><a data-action="@history">History</a></nav>'
  expect(drawChrome('<div data-ui=tabs><div>A</div><div>B</div></div><p>x</p>', spec, 'home')).toBe(`${bar}<p>x</p>`)
  expect(drawChrome('<section><script>go()</script></section>', spec, 'home')).toBe(`<section><script>go()</script></section>\n${bar}`)
})

test('14: a row filled before the shape rules counts as open for picks', () => {
  const spec: Spec = { 'ui.back': { ask: 'Back', from: 'plan', values: [{ text: 'Back sits top left', from: 'pick' }] } }
  expect(applyPick(spec, [{ key: 'ui.back', text: '"‹ Back", top left' }], 'home', 'a')).toEqual(['ui.back'])
  expect(valueOf(spec, 'ui.back')).toBe('"‹ Back", top left')
})

describe('12: the mutations the critic found unguarded', () => {
  test('generate checks an Edit against its own lines: a new flow step is linked, the old one not', async () => {
    const spec = parsePlan('product.core-flow @home → @a → @b')
    const html = '<title>A</title>\n<meta name="spec" content="product.core-flow = @home → @a → @c">\n<a data-action="@c: C">Next</a>'
    for await (const ev of generateScreen({ app: 'X', action: 'A', model: 'claude-haiku-5.5', spec, name: 'a', edit: { html: '<h1>A</h1>', change: 'go to C' }, fetch: async () => new Response(reply(html)), env })) {
      if (ev.type === 'done') expect(ev.version.misses).toEqual([])
    }
  })

  test('a pick refuses a line of the wrong shape', () => {
    const spec = parsePlan('ui.back ? Back')
    expect(applyPick(spec, [{ key: 'ui.back', text: 'Back sits top left' }], 'home')).toEqual([])
  })

  test('drawn tab and Back labels are escaped', () => {
    const spec = tabs('Tabs: Q&A @home, History @history')
    setUserLine(spec, 'ui.back', '"A & B", top left')
    const out = drawChrome('<a data-ui="back" data-action="back">x</a>', spec, 'x')
    expect(out).toContain('>Q&amp;A</a>')
    expect(out).toContain('<a data-ui="back" data-action="back">A &amp; B</a>')
  })

  test('the frame hides Back on a tab screen', () => {
    expect(framePage('', '', true, 'phone', true)).toContain('html[data-tab] [data-ui="back"] { display: none !important; }')
  })

  test('a pick\'s values carry the picked version\'s createdAt', () => {
    const cache = new ScreenCache()
    cache.setSpec('S', parsePlan('ui.lists ? lists'))
    const v = ver('<h1>H</h1>', { spec: [{ key: 'ui.lists', text: 'Rows' }] })
    cache.pick(cache.propose('S', null, 0, v)!.key, 0)
    expect(cache.spec('S')['ui.lists']!.values[0]!.at).toBe(v.createdAt)
  })
})
