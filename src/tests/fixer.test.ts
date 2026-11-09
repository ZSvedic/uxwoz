// The fixer: its reply's parse, each change and its refusals, the user's entries left alone, the Undo
// of each change, and the visit in the server: every 5 picks, on demand, in the chain with filing
// (no cassette: a fake provider).
import { describe, expect, test } from 'bun:test'
import { MAX_REDRAWS, ScreenCache, applyFiling, applyVisit, backgroundVersion, numberParts, parseVisit, type Fetch, type Version } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ver = (html: string, createdAt = '2026-11-08T00:00:00Z'): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt,
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 3000, finishReason: 'stop',
})
const HOME = '<title>Home</title><h1>Tonight</h1><nav><a data-action="@history: every night">History</a></nav>'

/** Home and History picked; two rules, a table and a component, one rule the user's. */
function paper() {
  const cache = new ScreenCache()
  const home = cache.pick(cache.propose('Snore', null, 0, ver(HOME))!.key, 0)!
  const history = cache.pick(cache.propose('Snore', '@history: every night', 0, ver('<title>History</title><nav><a data-action="@home">Home</a></nav>'), { key: home.key, label: 'History' })!.key, 0)!
  cache.setBox('Snore', 'add', 'rules', { id: 'score-scale', text: 'Scores run from 0 to 10.' }, 'filing')
  cache.setBox('Snore', 'add', 'rules', { id: 'score-range', text: 'A score is between 0 and 10.' }, 'filing')
  cache.setBox('Snore', 'add', 'rules', { id: 'calm', text: 'Screens speak calmly.' }, 'user')
  cache.setBox('Snore', 'add', 'data', { id: 'devices', columns: ['name'], rows: [['Watch']] }, 'filing')
  cache.addComponent('Snore', 'back', 'every screen below home', ver('<a data-action="back">‹ Back</a>'), 'filing')
  const sent = new Map([['home', numberParts(HOME)], ['history', numberParts(history.versions[0]!.html)]])
  return { cache, home, history, visit: (reply: string) => applyVisit(cache, 'Snore', reply, sent) }
}

const rules = (cache: ScreenCache) => cache.boxesOf('Snore').rules.map((r) => r.id)

describe('a visit\'s reply', () => {
  test('each line is read as one of the forms; anything else is bad', () => {
    expect(parseVisit('merge a into b\nremove c\nadd rule d: One sentence.\nadd component e from home part 3: every screen\nredraw home: Paste e.\nnote: why\nI tidied up').map((l) => [l.op, l.a, l.b, l.part, l.text]))
      .toEqual([['merge', 'a', 'b', 0, ''], ['remove', 'c', '', 0, ''], ['box', 'd', '', 0, 'One sentence.'], ['component', 'e', 'home', 3, 'every screen'],
        ['redraw', 'home', '', 0, 'Paste e.'], ['note', '', '', 0, 'why'], ['bad', '', '', 0, '']])
  })

  test('a merge keeps the older entry, whichever way it is written; a note explains the change above it', () => {
    const { cache, visit } = paper()
    const out = visit('merge score-scale into score-range\nnote: Both say the same.')
    expect(out.changes).toMatchObject([{ text: 'merged score-range into score-scale', note: 'Both say the same.' }])
    expect(rules(cache)).toEqual(['score-scale', 'calm'])
    expect(cache.boxesOf('Snore').gone.rules).toEqual(['score-range'])
  })

  test('an entry the user wrote is never removed or merged away; other lines are refused with a reason', () => {
    const { cache, visit } = paper()
    const out = visit(['remove calm', 'merge calm into score-scale', 'remove nothing-here', 'merge devices into score-scale', 'add rule calm: Again.', 'redraw nowhere: x', 'well'].join('\n'))
    expect(out.changes).toEqual([])
    expect(out.refused.map((r) => r.split('": ')[1])).toEqual(['calm was written by the user', 'calm was written by the user', 'no entry nothing-here',
      'they are not two entries of one box', 'rules already has or had calm', 'no screen nowhere', 'not one of the forms'])
    expect(rules(cache)).toContain('calm')
  })

  test('remove, add a rule, take a component from a screen it read, redraw at most 5 screens, each once and none with an open A OR B', () => {
    const { cache, home, visit } = paper()
    cache.propose('Snore', '@nights: all nights', 0, ver('<h1>n</h1>'), { key: home.key, label: 'Nights' })
    const more = Array.from({ length: MAX_REDRAWS }, (_, i) => cache.pick(cache.propose('Snore', `@s${i}: screen ${i}`, 0, ver('<h1>s</h1>'), { key: home.key, label: 'S' })!.key, 0)!.name)
    const out = visit(['remove devices', 'add rule score-direction: A higher score is worse.', 'add component tab-bar from home part 2: every main screen',
      'add component nope from nights part 1: x', 'redraw nights: x', 'redraw home: x', 'redraw home: again', ...more.map((n) => `redraw ${n}: x`)].join('\n'))
    expect(out.changes.map((c) => c.text)).toEqual(['removed devices', 'added rule score-direction: A higher score is worse.', 'added component tab-bar from home',
      'redrawing home: x', ...more.slice(0, MAX_REDRAWS - 1).map((n) => `redrawing ${n}: x`)])
    expect(out.refused.map((r) => r.split('": ')[1])).toEqual(['the visit did not read a screen nights', 'nights is waiting for a pick', 'home is redrawn once a visit', 'a visit redraws at most 5 screens'])
    expect(cache.component('Snore', 'tab-bar')).toMatchObject({ by: 'fixer', seen: false, parent: { key: home.key }, versions: [{ html: '<nav><a data-action="@history: every night">History</a></nav>' }] })
    expect(cache.boxesOf('Snore').rules.at(-1)).toMatchObject({ id: 'score-direction', by: 'fixer' })
    expect(out.redraws.map((r) => [r.key, r.sentence])[0]).toEqual([home.key, 'x'])
  })

  test('a component that goes, merged or removed, leaves its HTML in the screens that paste it', () => {
    const { cache, history, visit } = paper()
    cache.addVersion(history.key, ver('<h1>History</h1><div data-component="back"></div>'))
    cache.addComponent('Snore', 'go-back', 'every screen', ver('<a data-action="back">Back</a>'), 'filing')
    expect(visit('merge go-back into back').changes.map((c) => c.text)).toEqual(['merged go-back into back'])
    expect(cache.get(history.key)!.versions.at(-1)!.html).toBe('<h1>History</h1><div data-component="back"></div>')
    visit('remove back')
    expect(cache.get(history.key)!.versions.at(-1)!.html).toBe('<h1>History</h1><a data-action="back">‹ Back</a>')
  })
})

describe('the forms an Edit of a box needs', () => {
  test('filing\'s rule, table and row lines are read as box lines', () => {
    expect(parseVisit('change rule a: New.\ntable t: x | y\nrow t: 1 | 2\nchange table t: x\nchange component c from part 2: x').map((l) => [l.op, l.f?.kind, l.a]))
      .toEqual([['box', 'rule', 'a'], ['box', 'table', 't'], ['box', 'row', 't'], ['box', 'table', 't'], ['bad', 'component', 'c']])
  })

  test('a visit changes a rule and a table, adds a table with its rows, and redraws a component; each change has its Undo', () => {
    const { cache, visit } = paper()
    const out = visit(['change rule score-scale: Scores run from 0 to 100.', 'note: The app scores in percent.', 'change table devices: name | kind', 'row devices: Watch | wrist',
      'table plans: plan | price', 'row plans: Free | $0', 'row plans: Pro | $5', 'redraw back: make it bigger'].join('\n'))
    expect(out.refused).toEqual([])
    expect(out.changes.map((c) => [c.text, c.note])).toEqual([['changed rule score-scale: Scores run from 0 to 100.', 'The app scores in percent.'],
      ['changed table devices', undefined], ['added table plans', undefined], ['redrawing back: make it bigger', undefined]])
    expect(cache.boxesOf('Snore').data).toMatchObject([{ id: 'devices', columns: ['name', 'kind'], rows: [['Watch', 'wrist']], by: 'fixer' }, { id: 'plans', rows: [['Free', '$0'], ['Pro', '$5']] }])
    expect(out.redraws.map((r) => r.key)).toEqual([cache.component('Snore', 'back')!.key])
    cache.noteVisit('Snore', { at: 'v', ms: 1, costUsd: 0, screens: 2, changes: out.changes, refused: [], seen: false })
    expect(cache.undoChange('Snore', 'v', 0)).toBeNull()
    expect(cache.undoChange('Snore', 'v', 1)).toBeNull()
    expect(rules(cache)).toEqual(['score-scale', 'score-range', 'calm'])
    expect(cache.boxesOf('Snore').rules[0]!.text).toBe('Scores run from 0 to 10.')
    expect(cache.boxesOf('Snore').data[0]).toMatchObject({ columns: ['name'], rows: [['Watch']] })
  })

  test('what the user wrote changes only in the box the user asked about; bad lines are refused with a reason', () => {
    const { cache, visit } = paper()
    const lines = 'change rule calm: Screens shout.\nremove calm\nchange rule nope: x\nrow devices: Phone'
    expect(visit(lines).refused.map((r) => r.split('": ')[1])).toEqual(['calm was written by the user', 'calm was written by the user', 'rules has no nope', 'no table above it'])
    const sent = new Map<string, string>()
    expect(applyVisit(cache, 'Snore', 'change rule calm: Screens whisper.', sent, 'data').refused).toHaveLength(1)
    expect(applyVisit(cache, 'Snore', 'change rule calm: Screens whisper.', sent, 'rules').changes.map((c) => c.text)).toEqual(['changed rule calm: Screens whisper.'])
    expect(applyVisit(cache, 'Snore', 'remove calm', sent, 'rules').changes).toHaveLength(1)
  })
})

describe('the Undo of a box', () => {
  test('a box goes back as it was before its last change, whoever made it; a visit is one change; it keeps the last 10', () => {
    const { cache, visit } = paper()
    expect(cache.undos('Snore')).toEqual({ components: 1, rules: 3, data: 1 })
    visit('remove score-range\nadd rule big: Text is big.\nremove devices')
    expect(cache.undos('Snore')).toEqual({ components: 1, rules: 4, data: 2 })
    expect(cache.undoBox('Snore', 'rules')).toBeNull()
    expect(rules(cache)).toEqual(['score-scale', 'score-range', 'calm'])
    // An ID the Undo drops is never used again; one it restores is free of `gone`.
    expect(cache.boxesOf('Snore').gone.rules).toEqual(['big'])
    expect(cache.boxesOf('Snore').data).toHaveLength(0)
    cache.setBox('Snore', 'set', 'rules', { id: 'calm', text: 'Quiet.' }, 'user')
    expect(cache.undoBox('Snore', 'rules')).toBeNull()
    expect(cache.boxesOf('Snore').rules[2]!.text).toBe('Screens speak calmly.')
    for (let i = 0; i < 12; i++) cache.setBox('Snore', 'add', 'rules', { id: `r${i}`, text: 'x' }, 'user')
    expect(cache.undos('Snore').rules).toBe(10)
    while (!cache.undoBox('Snore', 'rules'));
    expect(rules(cache)).toEqual(['score-scale', 'score-range', 'calm', 'r0', 'r1'])
    expect(cache.undoBox('Snore', 'rules')).toBe('nothing to undo')
  })

  test('Components go back too: a removed component returns, a new version goes', () => {
    const { cache, visit } = paper()
    visit('remove back')
    expect(cache.component('Snore', 'back')).toBeUndefined()
    expect(cache.undoBox('Snore', 'components')).toBeNull()
    const back = cache.component('Snore', 'back')!
    cache.addVersion(back.key, ver('<a>Back</a>'))
    expect(cache.undoBox('Snore', 'components')).toBeNull()
    expect(cache.component('Snore', 'back')!.versions).toHaveLength(1)
  })

  test('Undo on the fixer\'s notes undoes the newest visit not undone yet, every change of it', () => {
    const { cache, visit } = paper()
    cache.noteVisit('Snore', { at: 'v1', ms: 1, costUsd: 0, screens: 1, changes: visit('add rule big: Big.').changes, refused: [], seen: false })
    cache.noteVisit('Snore', { at: 'v2', ms: 1, costUsd: 0, screens: 1, changes: visit('remove score-range\nremove devices').changes, refused: [], seen: false })
    expect(cache.undoVisit('Snore')).toBeNull()
    expect(rules(cache)).toEqual(['score-scale', 'score-range', 'calm', 'big'])
    expect(cache.boxesOf('Snore').data).toHaveLength(1)
    expect(cache.undoVisit('Snore')).toBeNull()
    expect(rules(cache)).toEqual(['score-scale', 'score-range', 'calm'])
    expect(cache.undoVisit('Snore')).toBe('nothing to undo')
  })

  test('the states are saved with the cache', () => {
    const file = join(tmpdir(), `uxwoz-states-${Date.now()}.json`)
    const a = new ScreenCache(file)
    a.pick(a.propose('Snore', null, 0, ver(HOME))!.key, 0)
    a.setBox('Snore', 'add', 'rules', { id: 'big', text: 'Big.' }, 'user')
    const b = new ScreenCache(file)
    expect(b.undoBox('Snore', 'rules')).toBeNull()
    expect(b.boxesOf('Snore').rules).toEqual([])
  })
})

describe('fixes after review', () => {
  test('Undo of Components after filing took tab-bar from Home leaves Home showing the tab bar', () => {
    const cache = new ScreenCache()
    const home = cache.pick(cache.propose('Snore', null, 0, ver(HOME))!.key, 0)!
    applyFiling(cache, 'Snore', home.key, HOME, 'component tab-bar from part 2: every main screen', backgroundVersion(null))
    expect(cache.get(home.key)!.versions[0]!.html).toContain('data-component="tab-bar"')
    expect(cache.undoBox('Snore', 'components')).toBeNull()
    expect(cache.component('Snore', 'tab-bar')).toBeUndefined()
    expect(cache.get(home.key)!.versions[0]!.html).toBe(HOME)
    expect(cache.boxesOf('Snore').gone.components).toEqual(['tab-bar'])
  })

  test('a visit redraws a component the user wrote only in an Edit of Components', () => {
    const { cache } = paper()
    cache.addComponent('Snore', 'mine', 'x', ver('<a>Mine</a>'), 'user')
    const sent = new Map<string, string>()
    expect(applyVisit(cache, 'Snore', 'redraw mine: bigger', sent).refused.map((r) => r.split('": ')[1])).toEqual(['mine was written by the user'])
    expect(applyVisit(cache, 'Snore', 'redraw mine: bigger', sent, 'components').redraws).toHaveLength(1)
  })

  test('the fixer\'s Undo skips what is already back or gone and never gets stuck on one visit', () => {
    const { cache, visit } = paper()
    cache.noteVisit('Snore', { at: 'v1', ms: 1, costUsd: 0, screens: 1, changes: visit('remove devices').changes, refused: [], seen: false })
    const v2 = visit('remove score-range\nadd rule big: Big.\nchange rule score-scale: Fixer.')
    cache.noteVisit('Snore', { at: 'v2', ms: 1, costUsd: 0, screens: 1, changes: v2.changes, refused: [], seen: false })
    cache.setBox('Snore', 'add', 'rules', { id: 'score-range-2', text: 'x' }, 'user')
    expect(cache.undoChange('Snore', 'v2', 0)).toBeNull() // score-range back by hand
    cache.setBox('Snore', 'delete', 'rules', { id: 'big' }, 'user') // big gone already
    cache.setBox('Snore', 'set', 'rules', { id: 'score-scale', text: 'Mine.' }, 'user')
    expect(cache.undoVisit('Snore')).toBe('you changed score-scale since')
    expect(cache.boxesOf('Snore').rules.find((r) => r.id === 'score-scale')!.text).toBe('Mine.')
    expect(cache.undoVisit('Snore')).toBeNull() // on to the visit before
    expect(cache.boxesOf('Snore').data).toHaveLength(1)
    expect(cache.undoVisit('Snore')).toBe('nothing to undo')
  })

  test('a note\'s Undo of a change refuses once the entry is no longer the fixer\'s', () => {
    const { cache, visit } = paper()
    cache.noteVisit('Snore', { at: 'v', ms: 1, costUsd: 0, screens: 1, changes: visit('change rule score-scale: Fixer.').changes, refused: [], seen: false })
    cache.setBox('Snore', 'set', 'rules', { id: 'score-scale', text: 'Filing.' }, 'filing')
    expect(cache.undoChange('Snore', 'v', 0)).toBe('you changed score-scale since')
  })

  test('the redraws of a visit join its one Undo step; undoing a redraw through its note keeps a state', () => {
    const { cache, visit } = paper()
    const out = visit('add component bar from home part 2: every screen\nredraw back: bigger')
    const back = cache.component('Snore', 'back')!
    const states = cache.undos('Snore').components
    cache.group(() => cache.addVersion(back.key, ver('<a>BACK</a>', 't9')), out.group)
    expect(cache.undos('Snore').components).toBe(states)
    out.changes[1]!.undo = { key: back.key, createdAt: 't9' }
    cache.noteVisit('Snore', { at: 'v', ms: 1, costUsd: 0, screens: 1, changes: out.changes, refused: [], seen: false })
    expect(cache.undoChange('Snore', 'v', 1)).toBeNull()
    expect(cache.undos('Snore').components).toBe(states + 1)
    expect(cache.undoBox('Snore', 'components')).toBeNull()
    expect(cache.undoBox('Snore', 'components')).toBeNull()
    expect(cache.component('Snore', 'bar')).toBeUndefined()
    expect(cache.component('Snore', 'back')!.versions).toHaveLength(1)
  })
})

describe('the Undo of each change', () => {
  test('each change undoes once: entries come back, an added one goes, a redraw\'s version is dropped', () => {
    const { cache, home, visit } = paper()
    const out = visit('merge score-range into score-scale\nremove devices\nremove back\nadd rule big: Text is big.\nadd component bar from home part 2: every screen\nredraw home: x')
    cache.addVersion(home.key, { ...ver('<h1>redrawn</h1>', '2026-11-08T01:00:00Z'), feedback: 'x', by: 'fixer' })
    out.redraws[0]!.change.undo = { key: home.key, createdAt: '2026-11-08T01:00:00Z' }
    cache.noteVisit('Snore', { at: 'v1', ms: 1, costUsd: 0, screens: 2, changes: out.changes, refused: [], seen: false })
    for (let i = 0; i < out.changes.length; i++) expect(cache.undoChange('Snore', 'v1', i)).toBeNull()
    expect(cache.undoChange('Snore', 'v1', 0)).toBe('nothing to undo')
    expect(rules(cache)).toEqual(['score-scale', 'score-range', 'calm'])
    expect(cache.boxesOf('Snore').data.map((t) => t.id)).toEqual(['devices'])
    expect(cache.component('Snore', 'back')?.versions).toHaveLength(1)
    expect(cache.component('Snore', 'bar')).toBeUndefined()
    expect(cache.boxesOf('Snore').gone).toEqual({ components: ['bar'], rules: ['big'], data: [] })
    expect(cache.get(home.key)!.versions.map((v) => v.html)).toEqual([HOME])
    // A merged entry back in its box can be merged again.
    expect(visit('merge score-range into score-scale').changes).toHaveLength(1)
    // A component put back keeps its place, so it is still the older one in a merge.
    cache.addComponent('Snore', 'back-2', 'x', ver('<a>b</a>'), 'filing')
    expect(visit('merge back-2 into back').changes.map((c) => c.text)).toEqual(['merged back-2 into back'])
  })

  test('an added rule the user rewrote since is not undone; a version the user already undid counts as undone', () => {
    const { cache, home, visit } = paper()
    const out = visit('add rule big: Text is big.')
    cache.setBox('Snore', 'set', 'rules', { id: 'big', text: 'Text is huge.' }, 'user')
    cache.noteVisit('Snore', { at: 'v', ms: 1, costUsd: 0, screens: 1, refused: [], seen: false,
      changes: [...out.changes, { text: 'redrew home: x', undo: { key: home.key, createdAt: 'gone' } }] })
    expect(cache.undoChange('Snore', 'v', 0)).toBe('you changed big since')
    expect(cache.undoChange('Snore', 'v', 1)).toBeNull()
    expect(cache.boxesOf('Snore').visits![0]!.changes[1]!.undone).toBe(true)
  })

  test('a redraw\'s version is dropped even when the user changed the screen after it; never the last one', () => {
    const { cache, home } = paper()
    cache.addVersion(home.key, { ...ver('<h1>fixer</h1>', 't1'), by: 'fixer' })
    cache.addVersion(home.key, ver('<h1>user</h1>', 't2'))
    cache.noteVisit('Snore', { at: 'v', ms: 1, costUsd: 0, screens: 1, changes: [{ text: 'redrew home: x', undo: { key: home.key, createdAt: 't1' } }], refused: [], seen: false })
    expect(cache.undoChange('Snore', 'v', 0)).toBeNull()
    expect(cache.get(home.key)!.versions.map((v) => v.html)).toEqual([HOME, '<h1>user</h1>'])
  })
})

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const terra = (text: string) => new Response(sse({ type: 'response.output_text.delta', delta: text },
  { type: 'response.completed', response: { model: 'gpt-6.1-terra', usage: { input_tokens: 1000, output_tokens: 100 } } }))

/** Screens come at once; filings file nothing; a visit waits for `open()`, then replies `reply`. Every Terra request is kept, in order. */
function provider(reply: string) {
  let open = () => {}
  const gate = new Promise<void>((r) => { open = r })
  const asked: string[] = [], inputs: string[] = []
  const fetch: Fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.model === 'gpt-6.1-terra') {
      const user: string = body.input
      const visit = user.endsWith('Visit the paper as the overnight fixer.')
      asked.push(visit ? 'visit' : 'file')
      inputs.push(user)
      if (visit) await gate
      return terra(visit ? reply : 'nothing')
    }
    return new Response(sse({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: `<title>S</title><h1>${body.messages[1].content.includes('add a Back') ? 'redrawn' : 'S'}</h1>` }, finish_reason: 'stop' }], usage: { cost: 0.001 } }))
  }
  return { fetch, open, asked, inputs }
}

async function withServer(reply: string, run: (s: { post: (p: string, b: object) => Promise<Response>; map: (wait?: boolean) => Promise<any>; p: ReturnType<typeof provider>; cache: ScreenCache }) => Promise<void>) {
  const p = provider(reply), cache = new ScreenCache()
  const server = createServer({ port: 0, cache, fetch: p.fetch, env, log: () => {}, random: () => 0.9, fileWaitMs: 100 })
  const post = (path: string, body: object) => fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const map = async (wait = false) => (await fetch(new URL(`/api/map?app=Snore${wait ? '&wait=1' : ''}`, server.url))).json()
  try { await run({ post, map, p, cache }) } finally { p.open(); server.stop(true) }
}

/** Make and pick the first screen and `n - 1` more. */
async function picks(post: (p: string, b: object) => Promise<Response>, n: number, from = 0) {
  for (let i = from; i < from + n; i++) {
    const action = i ? `@s${i}: screen ${i}` : null
    const done = (await (await post('/api/screen', { app: 'Snore', action, ...(i && { from: 'snore', label: `S${i}` }) })).text()).trim().split('\n').at(-1)!
    await post('/api/pick', { key: JSON.parse(done).entry.key, index: 0 })
  }
}

describe('the visit in the server', () => {
  test('every 5th pick brings a visit after its filing; its redraw is an Edit that files nothing', () => {
    return withServer('remove old-rule\nnote: No screen needs it.\nredraw home: add a Back\nnote: x', async ({ post, map, p, cache }) => {
      await picks(post, 4)
      cache.setBox('Snore', 'add', 'rules', { id: 'old-rule', text: 'Old.' }, 'filing')
      expect((await map()).visiting).toBe(false)
      await picks(post, 1, 4)
      expect((await map()).visiting).toBe(true)
      p.open()
      const m = await map(true)
      expect(p.asked).toEqual(['file', 'file', 'file', 'file', 'file', 'visit'])
      expect(m).toMatchObject({ visiting: false, boxes: { rules: [], visits: [{ screens: 5, seen: false, changes: [{ text: 'removed old-rule', note: 'No screen needs it.' }, { text: 'redrew home: add a Back' }] }] } })
      const home = m.entries.find((e: { key: string }) => e.key === 'snore')
      expect(home.versions.at(-1)).toMatchObject({ feedback: 'add a Back', by: 'fixer' })
      expect(m.boxes.visits[0].changes[1].undo).toEqual({ key: 'snore', createdAt: home.versions.at(-1).createdAt })
      // Undo through the box API, then the note says it is undone.
      const after = await (await post('/api/box', { app: 'Snore', op: 'undo', at: m.boxes.visits[0].at, i: 1 })).json()
      expect(after.entries.find((e: { key: string }) => e.key === 'snore').versions).toHaveLength(1)
      expect(after.boxes.visits[0].changes[1].undone).toBe(true)
      expect((await post('/api/box', { app: 'Snore', op: 'undo', at: m.boxes.visits[0].at, i: 1 })).status).toBe(400)
      expect(p.asked.at(-1)).toBe('visit') // the redraw started no filing
    })
  })

  test('Visit now runs one on demand; a filing asked for meanwhile waits for it; the second visit sees only what changed', () => {
    return withServer('add rule big: Text is big.', async ({ post, map, p }) => {
      expect((await post('/api/box', { app: 'Snore', op: 'visit' })).status).toBe(404)
      await picks(post, 2)
      await map(true)
      expect((await (await post('/api/box', { app: 'Snore', op: 'visit' })).json()).visiting).toBe(true)
      await (await post('/api/screen', { app: 'Snore', action: '@s9: nine', from: 'snore', label: 'S9' })).text()
      await post('/api/pick', { key: 'snore » @s9', index: 0 })
      expect(p.asked.at(-1)).toBe('visit') // the pick's filing waits in the chain
      p.open()
      const m = await map(true)
      expect(p.asked.slice(-2)).toEqual(['visit', 'file'])
      expect(m.boxes.visits[0]).toMatchObject({ screens: 2, changes: [{ text: 'added rule big: Text is big.', undo: { drop: 'rules', id: 'big' } }] })
      await post('/api/box', { app: 'Snore', op: 'visit' })
      expect((await map(true)).boxes.visits[1]).toMatchObject({ screens: 1, refused: ['"add rule big: Text is big.": rules already has or had big'] })
    })
  })

  test('a screen deleted meanwhile keeps the visit, and a line about it is refused; after Start over the visit is dropped', () => {
    return withServer('add rule big: Text is big.\nredraw s1: x', async ({ post, map, p }) => {
      await picks(post, 2)
      await map(true)
      await post('/api/box', { app: 'Snore', op: 'visit' })
      await post('/api/delete', { key: 'snore » @s1' })
      p.open()
      expect((await map(true)).boxes.visits[0]).toMatchObject({ changes: [{ text: 'added rule big: Text is big.' }], refused: ['"redraw s1: x": no screen s1'] })
    }).then(() => withServer('add rule big: Text is big.', async ({ post, map, p }) => {
      await picks(post, 2)
      await map(true)
      await post('/api/box', { app: 'Snore', op: 'visit' })
      await post('/api/delete-app', { app: 'Snore' })
      await picks(post, 1)
      p.open()
      expect((await map(true)).boxes).toMatchObject({ rules: [] })
      expect((await map()).boxes.visits).toBeUndefined()
    }))
  })

  test('an Edit of a box is a visit that starts from the user\'s request; Undo of the box puts it back', () => {
    return withServer('change rule calm: Screens whisper.', async ({ post, map, p, cache }) => {
      await picks(post, 1)
      await map(true)
      cache.setBox('Snore', 'add', 'rules', { id: 'calm', text: 'Screens speak calmly.' }, 'user')
      expect((await post('/api/box', { app: 'Snore', op: 'edit', box: 'rules', text: '' })).status).toBe(400)
      expect((await (await post('/api/box', { app: 'Snore', op: 'edit', box: 'rules', text: 'quieter' })).json()).visiting).toBe(true)
      expect((await post('/api/box', { app: 'Snore', op: 'edit', box: 'rules', text: 'again' })).status).toBe(409)
      p.open()
      const m = await map(true)
      expect(p.inputs.at(-1)).toEndWith('The user asks for this change in Rules: "quieter"\n\nVisit the paper as the overnight fixer.')
      expect(m.boxes.visits[0]).toMatchObject({ ask: 'quieter', changes: [{ text: 'changed rule calm: Screens whisper.' }] })
      expect(m.undos.rules).toBe(2)
      const back = await (await post('/api/box', { app: 'Snore', op: 'undo-box', box: 'rules' })).json()
      expect(back.boxes.rules).toMatchObject([{ id: 'calm', text: 'Screens speak calmly.', by: 'user' }])
      // The rule is the user's again, so the visit's Undo skips it, says why, and is done with that visit.
      const undone = await (await post('/api/box', { app: 'Snore', op: 'undo-box', box: 'notes' })).json()
      expect(undone).toMatchObject({ error: 'you changed calm since', boxes: { visits: [{ undone: true }] } })
      expect((await (await post('/api/box', { app: 'Snore', op: 'undo-box', box: 'notes' })).json()).error).toBe('nothing to undo')
      expect((await post('/api/box', { app: 'Snore', op: 'undo-box', box: 'toString' })).status).toBe(400)
    })
  })

  test('a 409 says why; a 5-pick visit that lands during a visit runs after it', () => {
    return withServer('', async ({ post, map, p }) => {
      await (await post('/api/screen', { app: 'Snore' })).text()
      expect(await (await post('/api/box', { app: 'Snore', op: 'edit', box: 'rules', text: 'x' })).json()).toEqual({ error: 'Wait for Home\'s pick.' })
      await post('/api/pick', { key: 'snore', index: 0 })
      await map(true)
      await post('/api/box', { app: 'Snore', op: 'visit' })
      await picks(post, 4, 1)
      p.open()
      await map(true)
      await Bun.sleep(50)
      expect(p.asked.filter((x) => x === 'visit')).toHaveLength(2)
    })
  })

  test('a redraw of a screen the user changed during the visit is skipped; a failed visit leaves its screens to the next one', () => {
    return withServer('redraw home: add a Back', async ({ post, map, p, cache }) => {
      await picks(post, 2)
      await map(true)
      await post('/api/box', { app: 'Snore', op: 'visit' })
      cache.addVersion('snore', ver('<h1>mine</h1>', new Date(Date.now() + 1000).toISOString()))
      p.open()
      const m = await map(true)
      expect(m.boxes.visits[0].changes).toEqual([{ text: 'did not redraw home: it changed during the visit' }])
      expect(m.entries[0].versions.at(-1).html).toBe('<h1>mine</h1>')
      // A failed visit does not count as the last one: the next reads the same screens again.
      cache.noteVisit('Snore', { at: new Date(Date.now() + 5000).toISOString(), ms: 1, costUsd: null, screens: 0, changes: [], refused: [], error: 'cut off', seen: false })
      await post('/api/box', { app: 'Snore', op: 'visit' })
      expect((await map(true)).boxes.visits.at(-1).screens).toBe(1)
    })
  })
})
