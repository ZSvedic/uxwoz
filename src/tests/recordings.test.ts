// Recordings (spec/public.md, Recordings; `Io.spent` under The meter): a replay says the recorded events
// with their delays and calls nothing; a live call reports its cost once however it ends. No cassette:
// a fake provider. And every file in recordings/ is complete.
import { expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  RECORDINGS_DIR, STARTERS, askBackground, generateScreen, loadRecordings, normalizePrompt, recordedDesign, recordedFiling, recordingFor, recordingProblems,
  streamModel, type Fetch, type FinalEvent, type Recorded, type Recording,
} from '@uxwoz/core'

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const delta = (text: string) => ({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: text } }] })
const end = { model: 'anthropic/claude-haiku-5.5', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { cost: 0.0012 } }
const reply = (body: string): Fetch => async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
const noFetch: Fetch = async () => { throw new Error('a replay must not fetch') }

const final: FinalEvent = { type: 'final', servedModel: 'anthropic/claude-haiku-5.5', finishReason: 'stop', inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, costUsd: 0.001 }
const recorded: Recorded = { events: [[120, '<h1>Plants'], [120, '</h1>'], [450, '<p>Water'], [900, ' today</p>']], final }

/** A clock a test runs at once: each wait is noted, none is slept. */
const fastClock = () => {
  const waits: number[] = []
  return { waits, sleep: async (ms: number) => void waits.push(ms) }
}

test('a replay yields the recorded events in order, each after its delay, and calls no fetch and no spent', async () => {
  const clock = fastClock(), spent: unknown[] = [], said: unknown[] = []
  for await (const ev of streamModel({ model: 'claude-haiku-5.5', system: 's', user: 'u', recorded, fetch: noFetch, env, sleep: clock.sleep, spent: (...a) => spent.push(a), record: (r) => said.push(r) })) said.push(ev)
  expect(said).toEqual([
    { type: 'text', text: '<h1>Plants' }, { type: 'text', text: '</h1>' }, { type: 'text', text: '<p>Water' }, { type: 'text', text: ' today</p>' }, final,
  ])
  // 120 ms to the first, none to the second (same moment), then the gaps.
  expect(clock.waits).toEqual([120, 330, 450])
  expect(spent).toEqual([])
})

test('a replayed design is the same screen generateScreen makes, with no call', async () => {
  const clock = fastClock(), spent: unknown[] = []
  const evs = []
  for await (const ev of generateScreen({ user: 'Plants', model: 'claude-haiku-5.5', recorded, fetch: noFetch, env, sleep: clock.sleep, spent: (...a) => spent.push(a) })) evs.push(ev)
  expect(evs.filter((e) => e.type === 'chunk').map((e) => e.type === 'chunk' && e.text).join('')).toBe('<h1>Plants</h1><p>Water today</p>')
  expect(evs.at(-1)).toMatchObject({ type: 'done', version: { html: '<h1>Plants</h1><p>Water today</p>', costUsd: 0.001 } })
  expect(spent).toEqual([])
})

test('a replayed filing is the reply askBackground returns', async () => {
  const filing: Recorded = { events: [[300, 'rule tone: '], [600, 'friendly']], final }
  const out = await askBackground('file', { fetch: noFetch, env, sleep: fastClock().sleep, recorded: filing })
  expect(out.reply).toBe('rule tone: friendly')
})

test('a replay stops when its signal does', async () => {
  const stop = new AbortController()
  const sleep = async () => { stop.abort(new Error('gone')) }
  const run = async () => { for await (const _ of streamModel({ model: 'claude-haiku-5.5', system: 's', user: 'u', recorded, sleep, signal: stop.signal })) {} }
  await expect(run()).rejects.toThrow('gone')
})

test('a live call reports its cost once when it finishes, and records what it said', async () => {
  const spent: unknown[] = [], said: { r: Recorded; call: unknown }[] = []
  const fetch = reply(sse(delta('<h1>Hi'), delta('</h1>'), end))
  for await (const _ of streamModel({ model: 'claude-haiku-5.5', system: 's', user: 'Draw home', fetch, env, spent: (...a) => spent.push(a), record: (r, call) => said.push({ r, call }) })) {}
  expect(spent).toEqual([[0.0012, 'claude-haiku-5.5']])
  expect(said).toHaveLength(1)
  expect(said[0]!.call).toEqual({ model: 'claude-haiku-5.5', user: 'Draw home' })
  expect(said[0]!.r.events.map(([, t]) => t)).toEqual(['<h1>Hi', '</h1>'])
  expect(said[0]!.r.events.every(([ms]) => Number.isInteger(ms) && ms >= 0)).toBe(true)
  expect(said[0]!.r.final).toMatchObject({ finishReason: 'stop', costUsd: 0.0012 })
})

test('a live call that fails reports null once and records nothing', async () => {
  for (const fetch of [
    (async () => new Response('down', { status: 503 })) as Fetch,
    reply(sse(delta('<h1>Hi'), { error: { message: 'overloaded' } })),
  ]) {
    const spent: unknown[] = [], said: unknown[] = []
    const run = async () => { for await (const _ of streamModel({ model: 'claude-haiku-5.5', system: 's', user: 'u', fetch, env, spent: (...a) => spent.push(a), record: (r) => said.push(r) })) {} }
    await expect(run()).rejects.toThrow()
    expect(spent).toEqual([[null, 'claude-haiku-5.5']])
    expect(said).toEqual([])
  }
})

test('a live call that is aborted, or left early, reports null once', async () => {
  const enc = new TextEncoder()
  const hanging: Fetch = async (_url, init) => new Response(new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sse(delta('<h1>Hi'))))
      init!.signal!.addEventListener('abort', () => c.error(init!.signal!.reason))
    },
  }))
  const stop = new AbortController(), spent: unknown[] = []
  const run = async () => {
    for await (const ev of streamModel({ model: 'claude-haiku-5.5', system: 's', user: 'u', fetch: hanging, env, signal: stop.signal, spent: (...a) => spent.push(a) })) {
      if (ev.type === 'text') stop.abort(new Error('aborted'))
    }
  }
  await expect(run()).rejects.toThrow('aborted')
  expect(spent).toEqual([[null, 'claude-haiku-5.5']])

  const left: unknown[] = []
  for await (const _ of streamModel({ model: 'claude-haiku-5.5', system: 's', user: 'u', fetch: reply(sse(delta('a'), delta('b'), end)), env, spent: (...a) => left.push(a) })) break
  expect(left).toEqual([[null, 'claude-haiku-5.5']])
})

const rec: Recording = {
  starter: 'plants', prompt: STARTERS.find((s) => s.id === 'plants')!.prompt, promptHash: '0123456789abcdef', recordedAt: '2026-11-11T00:00:00Z',
  screens: { home: { action: null, designs: ['A', 'B', 'C', 'D'].map((x) => ({ events: [[0, `<h1>${x}</h1>`]], final })) } },
  filings: ['after A', 'after B'].map((x) => ({ events: [[0, x]], final })),
}

test('a screen\'s draws take A, B, then each Regenerate the next, round again; the filing follows the side picked', () => {
  const html = (n: number) => recordedDesign(rec, 'home', n)!.events[0]![1]
  expect([0, 1, 2, 3, 4, 5].map(html)).toEqual(['<h1>A</h1>', '<h1>B</h1>', '<h1>C</h1>', '<h1>D</h1>', '<h1>A</h1>', '<h1>B</h1>'])
  expect(recordedDesign(rec, null, 1)).toBe(rec.screens.home!.designs[1]!)
  expect(recordedDesign(rec, 'nowhere', 0)).toBeNull()
  expect(recordedFiling(rec, 1)!.events[0]![1]).toBe('after B')
  const all = new Map([[normalizePrompt(rec.prompt), rec]])
  expect(recordingFor(`  ${rec.prompt.toUpperCase()}  `, all)).toBe(rec)
  expect(recordingFor('a dog walking app', all)).toBeNull()
})

test('a recording missing a linked screen, a design or a filing is incomplete', () => {
  const linking: Recording = { ...rec, screens: { home: { action: null, designs: rec.screens.home!.designs.map(() => ({ events: [[0, '<button data-action="@plant-page: one plant">Fern</button>']], final })) } } }
  expect(recordingProblems(linking)).toEqual(['home links to @plant-page, which has no recording'])
  expect(recordingProblems({ ...rec, filings: rec.filings.slice(0, 1) })).toEqual(['1 filings, not 2'])
  expect(recordingProblems({ ...rec, screens: { home: { action: null, designs: rec.screens.home!.designs.slice(0, 3) } } })).toEqual(['home: 3 designs, not 4'])
  expect(recordingProblems(rec)).toEqual([])
})

test('every file in recordings/ is a starter\'s, and complete', () => {
  const files = readdirSync(RECORDINGS_DIR).filter((f) => f.endsWith('.json'))
  const loaded = loadRecordings(RECORDINGS_DIR, (m) => { throw new Error(m) })
  expect(loaded.size).toBe(files.length)
  for (const f of files) {
    const r = [...loaded.values()].find((x) => `${x.starter}.json` === f)
    expect(r, `${f} is named after its starter`).toBeDefined()
    expect(recordingProblems(r!), join('recordings', f)).toEqual([])
  }
})
