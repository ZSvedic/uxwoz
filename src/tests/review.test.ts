// Feature: the review pass reads a mockup's spec and tree (cassette: review), and the server runs it
// after every 5 picked screens in the background (a stub review, no model call).
import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { REVIEW_PROMPT, ScreenCache, makeReview, parsePlan, parseReview, valueOf, type Spec } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'
import { cassette } from './cassette.ts'

const tape = cassette('review')
afterAll(tape.save)

const SPEC: Spec = {
  ...parsePlan('product.core-flow @home → @recording → @sleep-summary\nui.lists ? how sessions and remedies look'),
  'ui.nav': { ask: 'main navigation', from: 'plan', values: [{ text: 'Tabs: Home @home, History @history, Remedies @remedies', from: 'pick' }] },
  'ui.back': { ask: 'Back', from: 'plan', values: [{ text: '"‹ Back", top left', from: 'pick' }] },
  'ui.colors': { ask: 'what colors mean', from: 'plan', values: [{ text: 'Red is recording; snore severity green, amber, red; score 0-100, higher is worse', from: 'pick' }] },
}
const TREE = [
  '@home: the first screen of NiceSnore, a snore app',
  '  @recording: Live recording with a timer and a Stop button',
  '    @sleep-summary: Last night: snore score, timeline of episodes, remedies tried',
  '  @history: Past nights with their snore scores',
  '  @remedies: Remedies tried, each with its nights and average score',
  '    @remedy-details: One remedy: nights tried, average score before and after',
]

test('spec/prompt-review.md holds the exact review prompt', () => {
  const doc = readFileSync(new URL('../../spec/prompt-review.md', import.meta.url), 'utf8')
  expect(doc.match(/```text\n([\s\S]*?)\n```/)?.[1]).toBe(REVIEW_PROMPT)
})

test('Sol reviews a spec: open rows it adds are new keys, and its suggestions are for filled rows', async () => {
  const r = await makeReview('NiceSnore: a snore app with recording, score, remedy log', SPEC, TREE, { fetch: tape.fetch, env: tape.env })
  for (const a of r.adds) expect(SPEC[a.key]).toBeUndefined()
  for (const s of r.suggestions) for (const k of s.keys) expect(valueOf(SPEC, k)).toBeDefined()
  expect(r.adds.length + r.suggestions.length).toBeGreaterThan(0)
  expect(r.costUsd).toBeGreaterThan(0)
}, 30_000)

describe('the review\'s reply is checked against the spec', () => {
  test('an add for a filled or known key, a reword of an open row, or a bad shape is dropped', () => {
    const r = parseReview([
      'add ui.nav ? main navigation',
      'add data.units ? which units durations use',
      'add ui.colors ? colors',
      'reword ui.lists = Cards',
      'reword ui.back = Back sits top left',
      'reword ui.back = "‹ Back", top left of every screen but the tabs',
      'merge ui.colors, ui.back = "Back", and colors',
      'Some prose',
    ].join('\n'), SPEC, 'x')
    expect(r.adds).toEqual([{ key: 'data.units', ask: 'which units durations use' }])
    expect(r.suggestions).toEqual([
      { id: 'x0', kind: 'reword', keys: ['ui.back'], text: '"‹ Back", top left of every screen but the tabs', against: ['"‹ Back", top left'] },
    ])
  })
})

test('after the fifth pick the server reviews in the background: a new open row, a suggestion accepted, one dismissed, filled rows untouched', async () => {
  const cache = new ScreenCache()
  let n = 0
  const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`
  const server = createServer({
    port: 0, cache, env: { OPENROUTER_API_KEY: 'fake' }, log: () => {}, fetch: async () => new Response(reply(`<title>S${++n}</title><h1>S</h1>`)),
    plan: async () => JSON.parse(JSON.stringify(SPEC)) as Spec,
    review: async (_app, spec) => ({ ...parseReview('add data.units ? which units durations use\nreword ui.back = "‹ Back", top left of every screen\nreword ui.colors = Red is recording\nadd ui.nav ? navigation', spec, 'r'), ms: 5, costUsd: 0.01 }),
  })
  const post = (path: string, body: object) => fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const make = async (action: string | null, from: string | null) => {
    await (await post('/api/screen', { app: 'Snore', action, from, label: 'x' })).text()
    const key = action ? `snore » ${action.split(':')[0]}` : 'snore'
    return (await (await post('/api/pick', { key, index: 0 })).json()) as { reviewing: boolean }
  }
  try {
    await make(null, null)
    for (const name of ['@recording', '@sleep-summary', '@history']) expect((await make(`${name}: A screen`, 'snore')).reviewing).toBe(false)
    expect((await make('@remedies: A screen', 'snore')).reviewing).toBe(true)
    for (let i = 0; i < 20 && !cache.review('Snore').reviews.length; i++) await Bun.sleep(5)
    const map = await (await fetch(new URL('/api/map?app=Snore', server.url))).json()
    expect(map.review.reviews).toEqual([expect.objectContaining({ screens: 5, ms: 5, costUsd: 0.01, added: ['data.units'], suggested: 2 })])
    expect(map.spec['data.units']).toEqual({ ask: 'which units durations use', from: 'review', values: [] })
    expect(map.spec['ui.back']).toEqual(SPEC['ui.back']) // a filled row is untouched until the user accepts
    const [back, colors] = map.review.suggestions as { id: string }[]
    const accepted = await (await post('/api/spec/suggestion', { app: 'Snore', id: back!.id, accept: true })).json()
    expect(accepted.spec['ui.back'].values.at(-1)).toEqual({ text: '"‹ Back", top left of every screen', from: 'user' })
    const dismissed = await (await post('/api/spec/suggestion', { app: 'Snore', id: colors!.id, accept: false })).json()
    expect(valueOf(dismissed.spec, 'ui.colors')).toBe(valueOf(SPEC, 'ui.colors'))
    expect(dismissed.review.suggestions).toEqual([])
  } finally { server.stop(true) }
})
