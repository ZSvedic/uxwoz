// The review of step 4: the spec panel's routes, the review pass's guards and the limits, one case
// for each finding (numbered as in the review). No model calls: a fake provider and stub reviews.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_ROWS, ScreenCache, applyEdit, parsePlan, parseReview, setUserLine, valueOf, type Spec, type SpecRefusal, type Suggestion, type Version,
} from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'

const APP = 'Snore'
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
const plan = (): Spec => ({
  ...parsePlan('product.core-flow @home → @recording\nui.lists ? how lists look\nui.forms ? how forms look'),
  'ui.nav': { ask: 'navigation', from: 'plan', values: [{ text: 'Tabs: Home @home, History @history', from: 'pick' }] },
  'ui.back': { ask: 'Back', from: 'plan', values: [{ text: '"‹ Back", top left', from: 'pick' }] },
  'ui.colors': { ask: 'colors', from: 'plan', values: [{ text: 'Red is recording', from: 'pick' }] },
  'data.score': { ask: 'score', from: 'plan', values: [{ text: '0-100, higher is worse', from: 'pick' }] },
  'data.scale': { ask: 'scale', from: 'plan', values: [{ text: 'Scores run 0 to 100', from: 'pick' }] },
})
const REVIEW = 'add data.units ? which units durations use\nreword ui.colors = Red means a recording is on\nmerge data.score, data.scale = 0-100; higher is worse'

type Stub = (app: string, spec: Spec, tree: string[], deleted: string[]) => Promise<{ adds: { key: string; ask: string }[]; suggestions: Suggestion[]; ms: number; costUsd: number | null }>
let calls: { deleted: string[] }[] = []
const stub = (text = REVIEW, wait = 0): Stub => async (_app, spec, _tree, deleted) => {
  calls.push({ deleted })
  if (wait) await Bun.sleep(wait)
  return { ...parseReview(text, spec, `r${calls.length}-`, deleted), ms: 3, costUsd: 0.02 }
}

function setup(review: Stub, opts: { spec?: Spec | null; file?: string } = {}) {
  calls = []
  const cache = new ScreenCache(opts.file ?? null)
  let n = 0
  const server = createServer({
    port: 0, cache, env: { OPENROUTER_API_KEY: 'fake' }, log: () => {}, fetch: async () => new Response(reply(`<title>S${++n}</title><h1>S</h1>`)),
    plan: async () => (opts.spec === null ? {} : JSON.parse(JSON.stringify(opts.spec ?? plan()))), review,
  })
  const post = (path: string, body: object) => fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const make = async (name: string | null) => {
    await (await post('/api/screen', { app: APP, action: name && `@${name}: A screen`, from: name && 'snore', label: 'x' })).text()
    return (await post('/api/pick', { key: name ? `snore » @${name}` : 'snore', index: 0 })).json()
  }
  const settled = async () => { for (let i = 0; i < 50 && calls.length > cache.review(APP).reviews.length; i++) await Bun.sleep(5) }
  const five = async () => { await make(null); for (const s of ['recording', 'history', 'night', 'tips']) await make(s); await settled() }
  return { cache, server, post, make, five, settled }
}

describe('/api/spec/set, /api/spec/remove, /api/spec/suggestion', () => {
  test('set: the user\'s line, refusals with why, 404 for an unknown mockup; an unchanged Save changes nothing (13)', async () => {
    const { cache, server, post, make } = setup(stub())
    try {
      await make(null)
      const ok = await (await post('/api/spec/set', { app: APP, key: 'ui.toggles', text: 'Switches' })).json()
      expect(ok.spec['ui.toggles'].values).toEqual([{ text: 'Switches', from: 'user' }])
      const bad = await post('/api/spec/set', { app: APP, key: 'ui.toggles = Switches', text: 'x' })
      expect([bad.status, (await bad.json()).error]).toEqual([400, 'a key is product., ui. or data. and lowercase words joined by dashes, e.g. ui.dark-mode'])
      expect((await post('/api/spec/set', { app: 'No such app', key: 'ui.x', text: 'x' })).status).toBe(404)
      await post('/api/spec/set', { app: APP, key: 'ui.colors', text: 'Red is recording' })
      expect(cache.spec(APP)['ui.colors']!.values.at(-1)!.from).toBe('pick') // still the model's: an Edit may replace it
      const refused: SpecRefusal[] = []
      expect(applyEdit(cache.spec(APP), [{ key: 'ui.colors', text: 'Blue is recording' }], 's', 't', refused)).toEqual(['ui.colors'])
    } finally { server.stop(true) }
  })

  test('remove: a line, a row, 404 for none, and keys like constructor are no rows (11)', async () => {
    const { cache, server, post, make } = setup(stub())
    try {
      await make(null)
      await post('/api/spec/set', { app: APP, key: 'ui.colors', text: 'Blue is recording' })
      expect(valueOf((await (await post('/api/spec/remove', { app: APP, key: 'ui.colors', what: 'line' })).json()).spec, 'ui.colors')).toBe('Red is recording')
      expect((await (await post('/api/spec/remove', { app: APP, key: 'ui.colors', what: 'row' })).json()).spec['ui.colors']).toBeUndefined()
      for (const key of ['ui.colors', 'constructor', '__proto__', 'toString']) expect((await post('/api/spec/remove', { app: APP, key, what: 'row' })).status).toBe(404)
      expect(cache.review(APP).deleted).toEqual(['ui.colors'])
    } finally { server.stop(true) }
  })

  test('suggestion: 404 for none; accepting a merge removes its second row; a stale one is refused and dropped (1, 2)', async () => {
    const { cache, server, post, five } = setup(stub())
    try {
      await five()
      expect((await post('/api/spec/suggestion', { app: APP, id: 'nope', accept: true })).status).toBe(404)
      const [reword, merge] = cache.review(APP).suggestions
      expect(merge).toMatchObject({ kind: 'merge', keys: ['data.score', 'data.scale'], against: ['0-100, higher is worse', 'Scores run 0 to 100'] })
      const accepted = await (await post('/api/spec/suggestion', { app: APP, id: merge!.id, accept: true })).json()
      expect(accepted.spec['data.scale']).toBeUndefined()
      expect(accepted.spec['data.score'].values.at(-1)).toEqual({ text: '0-100; higher is worse', from: 'user' })
      // The user changes ui.colors after the reword was made: the reword is stale, hidden and refused.
      await post('/api/spec/set', { app: APP, key: 'ui.colors', text: 'Green is recording' })
      expect(cache.review(APP).suggestions).toEqual([])
      const stale = await post('/api/spec/suggestion', { app: APP, id: reword!.id, accept: true })
      expect([stale.status, (await stale.json()).error]).toEqual([400, 'the rows changed since this suggestion; it was dropped'])
      expect(valueOf(cache.spec(APP), 'ui.colors')).toBe('Green is recording')
    } finally { server.stop(true) }
  })
})

describe('the review pass\'s guards', () => {
  test('a merge may not remove the flow, ui.nav or ui.back (1); review text over 120 characters, with <, or a key like constructor is dropped (11); 3 of each at most', () => {
    const lines = [
      'merge ui.colors, ui.nav = Tabs: Home @home, History @history', 'merge ui.colors, ui.back = "‹ Back", top', 'merge data.score, product.core-flow = x',
      `reword ui.colors = ${'x'.repeat(121)}`, 'reword ui.colors = <b>Red</b>', 'reword constructor = x', 'reword ui.colors = Red is recording',
      'add ui.a ? a', 'add ui.b ? b', 'add ui.c ? c', 'add ui.d ? d',
      'reword ui.colors = One', 'reword ui.colors = One', 'reword data.score = Two', 'reword data.scale = Three', 'reword ui.back = "Back", four',
    ]
    const r = parseReview(lines.join('\n'), plan())
    expect(r.adds.map((a) => a.key)).toEqual(['ui.a', 'ui.b', 'ui.c'])
    expect(r.suggestions.map((s) => `${s.keys}=${s.text}`)).toEqual(['ui.colors=One', 'data.score=Two', 'data.scale=Three'])
  })

  test('the user\'s lines and an Edit\'s are bound by 24 lines in all, not by the models\' 12 rules (3)', () => {
    const spec: Spec = {}
    for (let i = 0; i < 12; i++) spec[`ui.r${i}`] = { ask: 'q', from: 'review', values: [] }
    expect(setUserLine(spec, 'ui.dark-mode', 'Dark')).toBeNull()
    expect(applyEdit(spec, [{ key: 'ui.font', text: 'Large' }], 's', 't')).toEqual(['ui.font'])
    for (let i = 0; Object.keys(spec).length < MAX_ROWS; i++) spec[`data.d${i}`] = { values: [{ text: 'x', from: 'user' }] }
    expect(setUserLine(spec, 'ui.more', 'x')).toBe('the spec is full: 24 lines')
    expect(parseReview('add ui.zz ? z', { ...spec, 'ui.font': spec['ui.font']! }).adds).toEqual([])
  })

  test('a review adds no row over a filled one, and none the user deleted (7); the request lists the deleted rows', async () => {
    const cache = new ScreenCache()
    cache.setSpec(APP, plan())
    cache.pick(cache.propose(APP, null, 0, { html: '<h1>x</h1>', model: 'claude-haiku-5.5', servedModel: null, createdAt: 't', costUsd: 0, costEstimated: false, firstChunkMs: 0, totalMs: 0, finishReason: 'stop' } as Version)!.key, 0)
    cache.remove(APP, 'ui.lists', 'row')
    cache.addReview(APP, [{ key: 'ui.colors', ask: 'x' }, { key: 'ui.lists', ask: 'again' }, { key: 'data.units', ask: 'units' }], [], { at: 'a', screens: 5, ms: 1, costUsd: 0, added: [], suggested: 0 })
    expect(cache.spec(APP)['ui.colors']).toEqual(plan()['ui.colors'])
    expect(cache.spec(APP)['ui.lists']).toBeUndefined()
    expect(cache.review(APP).reviews.at(-1)!.added).toEqual(['data.units'])
    expect(parseReview('add ui.lists ? again', cache.spec(APP), '', ['ui.lists']).adds).toEqual([])
  })

  test('one count of picks is read once; a new run replaces the suggestions not settled; two at once do not overlap (5)', async () => {
    const { cache, server, post, make, five, settled } = setup(stub(REVIEW, 30))
    try {
      await five()
      expect(calls).toHaveLength(1)
      await post('/api/delete', { key: 'snore » @tips' })
      await make('more')
      await settled()
      expect(calls).toHaveLength(1) // 5 picks again: already read
      for (const s of ['a', 'b', 'c', 'd']) await make(s)
      await make('e')
      await settled()
      expect(calls).toHaveLength(2)
      expect(cache.review(APP).suggestions.map((s) => s.id)).toEqual(['r2-0', 'r2-1'])
      expect(cache.review(APP).lastCount).toBe(10)
    } finally { server.stop(true) }
  })

  test('a failure is logged in the runs; runs are saved to the file; Start over clears them; a run that ends after it is dropped (8)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const failing: Stub = async () => { calls.push({ deleted: [] }); throw new Error('no review') }
    const { cache, server, post, five } = setup(failing, { file })
    try {
      await five()
      expect(cache.review(APP).reviews).toEqual([expect.objectContaining({ screens: 5, error: 'no review', added: [] })])
      expect(JSON.parse(readFileSync(file, 'utf8')).reviews.snore.reviews).toHaveLength(1)
      await post('/api/delete-app', { app: APP })
      expect(cache.review(APP).reviews).toEqual([])
    } finally { server.stop(true) }
    const slow = setup(stub(REVIEW, 60))
    try {
      await slow.make(null)
      for (const s of ['recording', 'history', 'night', 'tips']) await slow.make(s)
      await slow.post('/api/delete-app', { app: APP })
      await slow.make(null) // Start over: the mockup is made again before the old review ends
      await Bun.sleep(100)
      expect(slow.cache.review(APP).reviews).toEqual([])
      expect(slow.cache.spec(APP)['data.units']).toBeUndefined()
    } finally { slow.server.stop(true) }
  })

  test('a mockup with no spec is never reviewed: old mockups stay as they were (9)', async () => {
    const { server, five } = setup(stub(), { spec: null })
    try {
      await five()
      expect(calls).toHaveLength(0)
    } finally { server.stop(true) }
  })
})
