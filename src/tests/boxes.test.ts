// The boxes: paste by ID, the current link, filing's parse and apply with the manual's limits, the
// cache format, the box API, and a click that waits for filing (no cassette: a fake provider).
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITS, ScreenCache, applyFiling, elementEnd, markCurrent, numberParts, parseFiling, pasteComponents, type Fetch, type Version } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'

const ver = (html: string): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-07T00:00:00Z',
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 3000, finishReason: 'stop',
})
const made = { ...ver(''), model: 'gpt-6.1-terra' as const, costUsd: null }
const HOME = '<title>Home</title><h1>Tonight</h1><p>Ready.</p><nav><a data-action="@home">Tonight</a><a data-action="@history: every night">History</a></nav>'

function mockup(html = HOME) {
  const cache = new ScreenCache()
  const key = cache.propose('Snore', null, 0, ver(html))!.key
  cache.pick(key, 0)
  return { cache, key, file: (reply: string, filed = html) => applyFiling(cache, 'Snore', key, filed, reply, made) }
}

describe('paste by ID and the current link', () => {
  test('a placeholder becomes its component, contents and all; an ID not in the box leaves its element as it is', () => {
    const comps = { 'tab-bar': '<nav><a data-action="@home">Home</a></nav>', footer: '<footer><div data-component="tab-bar"></div></footer>' }
    expect(pasteComponents('<h1>x</h1><div data-component="tab-bar"></div><p>y</p>', comps)).toBe(`<h1>x</h1>${comps['tab-bar']}<p>y</p>`)
    expect(pasteComponents('<div data-component="tab-bar"><div>hand-drawn</div></div>!', comps)).toBe(`${comps['tab-bar']}!`)
    // A deleted component's empty placeholder shows nothing; hand-drawn contents of an unknown ID stay.
    expect(pasteComponents('<div data-component="gone"></div><nav data-component="new">x</nav>', comps)).toBe('<div data-component="gone"></div><nav data-component="new">x</nav>')
    // A component taken from a part that pasted another one pastes it too, three levels deep at most.
    expect(pasteComponents('<div data-component="footer"></div>', comps)).toBe(`<footer>${comps['tab-bar']}</footer>`)
    expect(pasteComponents('<i data-component="loop"></i>', { loop: '<b data-component="loop"></b>' })).toBe('<b data-component="loop"></b>')
    // While a screen streams, a placeholder with no end yet still shows its component.
    expect(pasteComponents('<p>a</p><div data-component="tab-bar">', comps)).toBe(`<p>a</p>${comps['tab-bar']}`)
  })

  test('an element ends at its own closing tag, past nested ones of its name, quoted > and scripts', () => {
    const html = '<div a=">"><div></div><script>"</div>"</script></div>tail'
    expect(html.slice(0, elementEnd(html, 0))).toBe(html.slice(0, -4))
    expect(elementEnd('<input value="x">rest', 0)).toBe(17)
    expect(elementEnd('<div><p>open', 0)).toBe(-1)
  })

  test('a link to the screen it sits on is marked current, wherever it is', () => {
    expect(markCurrent('<a data-action="@history">H</a><button data-action="@history: all nights">All</button><a data-action="@history-2">2</a>', 'history'))
      .toBe('<a data-action="@history" aria-current="page">H</a><button data-action="@history: all nights" aria-current="page">All</button><a data-action="@history-2">2</a>')
    expect(markCurrent(`<a data-action="@history: the user's nights">H</a>`, 'history')).toContain('aria-current')
    expect(markCurrent('<a data-action="@home">H</a>', undefined)).toBe('<a data-action="@home">H</a>')
  })
})

describe('filing', () => {
  test('parts are numbered in order, not inside an svg or a script, and not a paste placeholder; numbers a model wrote go', () => {
    expect(numberParts('<div><p data-part="9">a</p><b DATA-PART=3></b><svg><g></g></svg><div data-component="x"></div><script>"<p>"</script><p>b</p></div>'))
      .toBe('<div data-part="1"><p data-part="2">a</p><b></b><svg data-part="3"><g></g></svg><div data-component="x"></div><script>"<p>"</script><p data-part="4">b</p></div>')
  })

  test('each line is read as one of the forms; anything else is bad', () => {
    expect(parseFiling('component tab-bar from part 4: every main screen\nchange rule score: Higher is worse.\ntable nights: night | score\nrow nights: Mon | 4\nnothing\nI think a rule').map((l) => [l.kind, l.change, l.id, l.part]))
      .toEqual([['component', false, 'tab-bar', 4], ['rule', true, 'score', null], ['table', false, 'nights', null], ['row', false, 'nights', null], ['nothing', false, '', null], ['bad', false, '', null]])
  })

  test('a component takes its part, and the screen pastes it there: it looks the same as before', () => {
    const { cache, key, file } = mockup()
    const out = file('component tab-bar from part 3: every main screen\nrule calm-words: Screens speak calmly.\ntable nights: night | score\nrow nights: Mon | 4\nrow nights: Tue | 6')
    expect(out).toEqual({ added: ['tab-bar', 'calm-words', 'nights'], changed: [], refused: [] })
    const bar = cache.component('Snore', 'tab-bar')!
    expect(bar).toMatchObject({ kind: 'component', name: 'tab-bar', action: 'every main screen', by: 'filing', seen: false, parent: { key } })
    expect(bar.versions[0]!.html).toBe('<nav><a data-action="@home">Tonight</a><a data-action="@history: every night">History</a></nav>')
    const now = cache.get(key)!.versions[0]!.html
    expect(now).toBe('<title>Home</title><h1>Tonight</h1><p>Ready.</p><div data-component="tab-bar"></div>')
    expect(pasteComponents(now, { 'tab-bar': bar.versions[0]!.html })).toBe(HOME)
    expect(cache.boxesOf('Snore').data).toMatchObject([{ id: 'nights', columns: ['night', 'score'], rows: [['Mon', '4'], ['Tue', '6']], by: 'filing', seen: false }])
  })

  test('code refuses a bad ID, a double ID, a line over the limit, a full box and a part that is not there', () => {
    const { cache, file } = mockup()
    cache.setBox('Snore', 'add', 'rules', { id: 'calm', text: 'Calm.' }, 'user')
    const out = file([
      'rule Tab_Bar: Bad ID.', 'rule calm: Taken.', `rule long-one: ${'x'.repeat(LIMITS.line + 1)}`, 'change rule missing: No such rule.',
      'component bar from part 99: nowhere', 'component nav-bar from part 3: every screen', 'component link from part 4: inside part 3',
      'row lonely: 1 | 2', 'table wide: a | b | c | d | e | f | g', 'well, nothing much',
    ].join('\n'))
    expect(out.added).toEqual(['nav-bar'])
    expect(out.refused.map((r) => r.split('": ')[1])).toEqual([
      '"Tab_Bar" is no ID (1 to 4 lowercase words joined by dashes)', 'rules already has or had calm', 'a line must be at most 120 characters',
      'rules has no missing', 'the screen has no part 99', 'part 4 overlaps a part filed above', 'no table above it',
      'a table has 1 to 6 named columns', 'not one of the forms',
    ])
    for (let i = 1; cache.boxesOf('Snore').rules.length < LIMITS.rules; i++) cache.setBox('Snore', 'add', 'rules', { id: `r${i}`, text: 'A rule.' }, 'user')
    expect(file('rule one-more: Too many.').refused).toEqual(['"rule one-more: Too many.": rules is full (20)'])
  })

  test('a table takes at most 8 rows of its own width; a change keeps the ID and takes the rows after it', () => {
    const { cache, file } = mockup()
    const rows = Array.from({ length: LIMITS.rows + 1 }, (_, i) => `row t: n${i} | ${i}`)
    expect(file(['table t: name | value', ...rows, 'row t: one cell'].join('\n')).refused).toEqual(['"row t: n8 | 8": a table has at most 8 rows', '"row t: one cell": table t has 2 columns'])
    file('change table t: name | amount\nrow first-row: a | 1')
    expect(cache.boxesOf('Snore').data[0]).toMatchObject({ id: 't', columns: ['name', 'amount'], rows: [['a', '1']] })
    expect(file('row t: b | 2').refused).toEqual(['"row t: b | 2": no table above it'])
    expect(file('table u: a | b\nrow t: 1 | 2\nrow u-one: 3 | 4').refused).toEqual(['"row t: 1 | 2": table t is not the one above it'])
    expect(file('table u: a | b\nrow u: 5 | 6').refused).toEqual(['"table u: a | b": data already has or had u', '"row u: 5 | 6": table u was refused'])
    expect(file('change table t: name | amount').changed).toEqual(['t'])
    expect(cache.boxesOf('Snore').data[0]!.rows).toEqual([])
    file('change rule x: nope\nrule x: Once.\nchange rule x: Twice.')
    expect(cache.boxesOf('Snore').rules).toMatchObject([{ id: 'x', text: 'Twice.' }])
  })

  test('a changed component takes its new part and its new line; a bad line is refused', () => {
    const { cache, file } = mockup()
    file('component tab-bar from part 3: every screen')
    expect(file(`change component tab-bar from part 4: ${'x'.repeat(121)}`).refused).toHaveLength(1)
    expect(file('change component tab-bar from part 4: the top of every screen').changed).toEqual(['tab-bar'])
    expect(cache.component('Snore', 'tab-bar')).toMatchObject({ action: 'the top of every screen', versions: [{}, { html: '<a data-action="@home">Tonight</a>' }] })
  })

  test('a screen changed while filing ran keeps its HTML; the component still goes in the box', () => {
    const { cache, key, file } = mockup()
    cache.addVersion(key, ver('<h1>Edited meanwhile</h1>'))
    expect(file('component tab-bar from part 3: every screen').added).toEqual(['tab-bar'])
    expect(cache.get(key)!.versions.at(-1)!.html).toBe('<h1>Edited meanwhile</h1>')
  })
})

describe('the boxes in the cache', () => {
  test('a deleted ID is never used again; a deleted component leaves the screens that paste it', () => {
    const { cache, key } = mockup('<h1>x</h1><div data-component="bar"></div>')
    const bar = cache.addComponent('Snore', 'bar', 'top of every screen', ver('<nav>b</nav>'), 'user') as { key: string }
    expect(cache.addComponent('Snore', 'bar', 'again', ver('<nav></nav>'), 'user')).toBe('components already has or had bar')
    expect(cache.delete(bar.key)).toEqual([bar.key])
    expect(cache.get(key)).toBeDefined()
    expect(cache.addComponent('Snore', 'bar', 'again', ver('<nav></nav>'), 'user')).toBe('components already has or had bar')
    cache.setBox('Snore', 'add', 'rules', { id: 'calm', text: 'Calm.' }, 'user')
    cache.setBox('Snore', 'delete', 'rules', { id: 'calm' }, 'user')
    expect(cache.setBox('Snore', 'add', 'rules', { id: 'calm', text: 'Calm.' }, 'user')).toBe('rules already has or had calm')
    expect(cache.freeId('Snore', 'rules', 'Calm screens, always and everywhere')).toBe('calm-screens-always')
    expect(cache.freeId('Snore', 'rules', 'Calm')).toBe('calm-2')
  })

  test('the boxes survive a restart in a format 5 file, and go with their mockup', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const cache = new ScreenCache(file)
    cache.pick(cache.propose('Snore', null, 0, ver('<h1>x</h1>'))!.key, 0)
    cache.setBox('Snore', 'add', 'data', { id: 'nights', columns: ['night'], rows: [['Mon']] }, 'filing')
    cache.markSeen('Snore', 'data')
    const again = new ScreenCache(file)
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(5)
    expect(again.boxesOf('snore').data).toMatchObject([{ id: 'nights', rows: [['Mon']], by: 'filing', seen: true }])
    again.deleteApp('Snore')
    expect(new ScreenCache(file).boxesOf('Snore').data).toEqual([])
  })
})

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }

/** Screens come at once; a filing waits for `open()` and files one rule. Every screen request is kept. */
function provider() {
  let open = () => {}
  const gate = new Promise<void>((r) => { open = r })
  const screens: string[] = []
  const fetch: Fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.model === 'gpt-6.1-terra') {
      await gate
      return new Response(sse({ type: 'response.output_text.delta', delta: 'rule quiet-nights: Quiet nights show in green.' },
        { type: 'response.completed', response: { model: 'gpt-6.1-terra', usage: { input_tokens: 100, output_tokens: 10 } } }))
    }
    screens.push(body.messages[1].content)
    return new Response(sse({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: '<title>S</title><h1>S</h1><a data-action="@history: every night">H</a>' }, finish_reason: 'stop' }], usage: { cost: 0.001 } }))
  }
  return { fetch, open, screens }
}

async function withServer(fileWaitMs: number, run: (s: { post: (p: string, b: object) => Promise<Response>; url: URL; p: ReturnType<typeof provider>; cache: ScreenCache }) => Promise<void>) {
  const p = provider(), cache = new ScreenCache()
  const server = createServer({ port: 0, cache, fetch: p.fetch, env, log: () => {}, random: () => 0.9, fileWaitMs })
  const post = (path: string, body: object) => fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try { await run({ post, url: server.url, p, cache }) } finally { p.open(); server.stop(true) }
}

describe('filing in the server', () => {
  test('a click while filing runs waits for it, so the new screen reads what was filed', () => {
    return withServer(5000, async ({ post, p }) => {
      await (await post('/api/screen', { app: 'Snore' })).text()
      expect((await (await post('/api/pick', { key: 'snore', index: 0 })).json()).filing).toBe(true)
      setTimeout(p.open, 200)
      const t0 = performance.now()
      await (await post('/api/screen', { app: 'Snore', action: '@history: every night', from: 'snore', label: 'H' })).text()
      expect(performance.now() - t0).toBeGreaterThan(150)
      expect(p.screens.at(-1)).toContain('quiet-nights: Quiet nights show in green.')
    })
  })

  test('a click waits at most fileWaitMs, then goes on without it; the map with wait=1 brings what was filed', () => {
    return withServer(100, async ({ post, url, p }) => {
      await (await post('/api/screen', { app: 'Snore' })).text()
      await post('/api/pick', { key: 'snore', index: 0 })
      const t0 = performance.now()
      await (await post('/api/screen', { app: 'Snore', action: '@history: every night', from: 'snore', label: 'H' })).text()
      expect(performance.now() - t0).toBeLessThan(1000)
      expect(p.screens.at(-1)).not.toContain('quiet-nights')
      expect((await (await fetch(new URL('/api/map?app=Snore', url))).json()).filing).toBe(true)
      setTimeout(p.open, 50)
      const map = await (await fetch(new URL('/api/map?app=Snore&wait=1', url))).json()
      expect(map).toMatchObject({ filing: false, boxes: { rules: [{ id: 'quiet-nights', by: 'filing', seen: false }] }, undos: { rules: 1 } })
      expect(map.entries[0].filed).toMatchObject({ screen: 'home', added: ['quiet-nights'] })
    })
  })

  test('Start over does not wait for the old mockup\'s filing, and drops what it files', () => {
    return withServer(5000, async ({ post, url }) => {
      await (await post('/api/screen', { app: 'Snore' })).text()
      await post('/api/pick', { key: 'snore', index: 0 })
      await post('/api/delete-app', { app: 'Snore' })
      const t0 = performance.now()
      await (await post('/api/screen', { app: 'Snore' })).text()
      expect(performance.now() - t0).toBeLessThan(1000)
      expect((await (await fetch(new URL('/api/map?app=Snore', url))).json()).boxes.rules).toEqual([])
    })
  })

  test('a component the user changes is the user\'s; Terra is no screen model', () => {
    return withServer(100, async ({ post, url, cache }) => {
      await (await post('/api/screen', { app: 'Snore' })).text()
      await post('/api/pick', { key: 'snore', index: 0 })
      const bar = cache.addComponent('Snore', 'bar', 'every screen', ver('<nav></nav>'), 'filing') as { key: string }
      await (await post('/api/revise', { key: bar.key, change: 'Bigger' })).text()
      expect(cache.get(bar.key)).toMatchObject({ by: 'user', seen: true, versions: [{}, { feedback: 'Bigger' }] })
      expect((await post('/api/revise', { key: bar.key })).status).toBe(400)
      const cfg = await (await fetch(new URL('/api/config', url))).json()
      expect(cfg.models.map((m: { id: string }) => m.id)).not.toContain('gpt-6.1-terra')
      expect((await post('/api/screen', { app: 'X', model: 'gpt-6.1-terra' })).status).toBe(400)
    })
  })

  test('the user adds, changes and deletes rules and tables; a bad one is refused; looking marks a box seen', () => {
    return withServer(100, async ({ post }) => {
      expect((await post('/api/box', { app: 'Snore', op: 'add', box: 'rules', text: 'Hi.' })).status).toBe(404)
      await (await post('/api/screen', { app: 'Snore' })).text()
      const add = await (await post('/api/box', { app: 'Snore', op: 'add', box: 'rules', text: 'Scores run from 0 to 10.' })).json()
      expect(add.boxes.rules).toMatchObject([{ id: 'scores-run-from', text: 'Scores run from 0 to 10.', by: 'user', seen: true }])
      expect((await post('/api/box', { app: 'Snore', op: 'set', box: 'rules', id: 'scores-run-from', text: 'x'.repeat(121) })).status).toBe(400)
      expect((await post('/api/box', { app: 'Snore', op: 'add', box: 'data', text: 'Nights', columns: ['a', 'b'], rows: [['1']] })).status).toBe(400)
      const t = await (await post('/api/box', { app: 'Snore', op: 'add', box: 'data', text: 'Nights', columns: ['night', 'score'], rows: [['Mon', '4']] })).json()
      expect(t.boxes.data).toMatchObject([{ id: 'nights', columns: ['night', 'score'] }])
      const del = await (await post('/api/box', { app: 'Snore', op: 'delete', box: 'rules', id: 'scores-run-from' })).json()
      expect(del.boxes).toMatchObject({ rules: [], gone: { rules: ['scores-run-from'] } })
      expect(await (await post('/api/box', { app: 'Snore', op: 'set', box: 'data', id: 'nights', columns: ['night', 'x'.repeat(121)], rows: [] })).json()).toMatchObject({ error: 'a value must be at most 120 characters' })
      expect((await post('/api/box', { app: 'Snore', op: 'seen', box: 'data' })).status).toBe(200)
      expect((await post('/api/box', { app: 'Snore', op: 'drop', box: 'rules' })).status).toBe(400)
    })
  })
})
