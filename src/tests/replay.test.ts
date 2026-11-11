// A starter's mockup replays its recording wherever drawing.ts would call a model (spec/public.md,
// Recordings): the plants recording, a fetch that throws when called, a clock that does not wait.
import { describe, expect, test } from 'bun:test'
import {
  HOME_NAME, ScreenCache, STARTERS, VISIT_EVERY, isComponent, linkedNames, recordedHtml, recordingFor, screenKey,
  type CacheEntry, type Recording,
} from '@uxwoz/core'
import { drawing, type ScreenEvent } from '../packages/web/src/drawing.ts'

const APP = STARTERS.find((s) => s.id === 'plants')!.prompt
const rec = recordingFor(APP) as Recording
const design = (name: string, n: number) => recordedHtml(rec.screens[name]!.designs[n]!)

function desk(may = () => true) {
  const cache = new ScreenCache(), calls: string[] = []
  const fetch = (async (url: string) => { calls.push(String(url)); throw new Error('no network in this test') }) as any
  const d = drawing(cache, { fetch, env: { OPENROUTER_API_KEY: 'k', OPENAI_API_KEY: 'k' }, sleep: async () => {} }, () => {}, () => 0, 0, may)
  return { cache, calls, ...d }
}
type Desk = ReturnType<typeof desk>

async function all(events: AsyncIterable<ScreenEvent>) {
  const out: ScreenEvent[] = []
  for await (const ev of events) out.push(ev)
  return out
}
const signal = () => new AbortController().signal
const versions = (evs: ScreenEvent[]) => evs.filter((e) => e.type === 'version').map((e) => (e as { version: { html: string; costUsd: number | null } }).version)

/** Draw a screen as /api/screen does, then pick a side as /api/pick does; what the pick's reply would say. */
async function drawAndPick(d: Desk, action: string | null, side: number, from?: CacheEntry) {
  const evs = await all(d.screenEvents(APP, action, 'claude-haiku-5.5', 'phone', from ? { from: from.key, label: action! } : null, signal()))
  const key = screenKey(APP, action)
  const body = { key, index: side }
  const replayed = d.replayed('/api/pick', body)
  const entry = d.cache.pick(key, side)!
  const filing = d.file(key, { other: 'the other' })
  const visiting = d.cache.boxesOf(APP).picks! % VISIT_EVERY === 0 && !d.visit(APP)
  await d.idle(APP)
  return { evs, entry, filing, visiting, replayed }
}
const boxes = (d: Desk) => {
  const m = d.cache.map(APP)
  return { rules: m.boxes.rules, data: m.boxes.data, components: m.entries.filter(isComponent).map((e) => e.name) }
}
const linked = (home: string) => linkedNames(home).find((n) => rec.screens[n])!

describe('a starter replays its recording', () => {
  test('Home\'s A OR B is designs 0 and 1, free, with no model call; picking A and picking B fill the boxes differently', async () => {
    const byside = []
    for (const side of [0, 1]) {
      const d = desk()
      expect(d.replayed('/api/screen', { app: APP })).toBe(true)
      const { evs, filing, replayed } = await drawAndPick(d, null, side)
      expect(evs.filter((e) => e.type === 'chunk').length).toBeGreaterThan(2)
      expect(versions(evs).map((v) => v.html).sort()).toEqual([design(HOME_NAME, 0), design(HOME_NAME, 1)].sort())
      expect(versions(evs).every((v) => v.costUsd === 0)).toBe(true)
      expect([replayed, filing]).toEqual([true, true])
      expect(d.cache.get(screenKey(APP, null))!.versions[0]!.html.length).toBeGreaterThan(0)
      expect(d.calls).toEqual([])
      byside.push(boxes(d))
    }
    expect(byside[0]).not.toEqual(byside[1])
    expect(Object.values(byside[0]!).flat().length).toBeGreaterThan(0)
  })

  test('a linked screen replays; its pick files nothing; four Regenerates take designs 2, 3, 0, 1', async () => {
    const d = desk()
    const home = (await drawAndPick(d, null, 0)).entry
    const name = linked(design(HOME_NAME, 0)), action = rec.screens[name]!.action!
    expect(d.replayed('/api/screen', { app: APP, action })).toBe(true)
    const before = boxes(d)
    const { evs, filing, replayed, entry } = await drawAndPick(d, action, 1, home)
    expect(versions(evs).map((v) => v.html).sort()).toEqual([design(name, 0), design(name, 1)].sort())
    expect([replayed, filing]).toEqual([true, false])
    expect(boxes(d)).toEqual(before)
    const drawn: string[] = []
    for (let i = 0; i < 4; i++) {
      expect(d.replayed('/api/revise', { key: entry.key })).toBe(true)
      const v = versions(await all(d.reviseEvents(d.cache.get(entry.key)!, null, 'claude-haiku-5.5', 'phone', signal())))
      expect(v[0]!.costUsd).toBe(0)
      drawn.push(v[0]!.html)
    }
    expect(drawn).toEqual([design(name, 2), design(name, 3), design(name, 0), design(name, 1)])
    expect(d.calls).toEqual([])
  })

  test('five replayed picks bring no visit, and a pick of a recorded screen files nothing', async () => {
    const d = desk()
    let last = (await drawAndPick(d, null, 0)).entry
    const names = [...new Set(rec.screens.home!.designs.flatMap((x) => linkedNames(recordedHtml(x))))].filter((n) => rec.screens[n])
    for (const n of names.slice(0, VISIT_EVERY - 1)) {
      const r = await drawAndPick(d, rec.screens[n]!.action!, 0, last)
      expect([r.replayed, r.filing, r.visiting]).toEqual([true, false, false])
      last = r.entry
    }
    expect(d.cache.boxesOf(APP).picks).toBe(VISIT_EVERY)
    expect(d.cache.boxesOf(APP).visits ?? []).toEqual([])
    expect(d.calls).toEqual([])
  })

  test('an Edit, Visit now and a screen with no recording stay live; after a live call a pick files live', async () => {
    const d = desk()
    const home = (await drawAndPick(d, null, 0)).entry
    // An Edit is a live call (here: the fetch throws), and Regenerate stays as it was asked.
    expect(d.replayed('/api/revise', { key: home.key, change: 'Bigger title' })).toBe(false)
    const edit = await all(d.reviseEvents(home, 'Bigger title', 'claude-haiku-5.5', 'phone', signal()))
    expect(edit.at(-1)!.type).toBe('error')
    expect(d.calls.length).toBe(1)
    // Visit now is live.
    expect(d.visit(APP)).toBeNull()
    await d.idle(APP)
    expect(d.calls.length).toBe(2)
    // A screen with no recording is live, and so is its A OR B.
    expect(d.replayed('/api/screen', { app: APP, action: '@nowhere: a page nobody recorded' })).toBe(false)
    await all(d.screenEvents(APP, '@nowhere: a page nobody recorded', 'claude-haiku-5.5', 'phone', null, signal()))
    expect(d.calls.length).toBe(4)
    // Now a recorded screen still draws from the recording, but its pick files live.
    const name = linked(design(HOME_NAME, 0)), action = rec.screens[name]!.action!
    expect(d.replayed('/api/screen', { app: APP, action })).toBe(true)
    const r = await drawAndPick(d, action, 0, home)
    expect([r.replayed, r.filing]).toEqual([false, true])
    expect(d.calls.length).toBe(5)
  })

  test('`may` stops live filing and visits, not a replay', async () => {
    const d = desk(() => false)
    expect((await drawAndPick(d, null, 1)).filing).toBe(true)
    expect(d.file(screenKey(APP, null), { change: 'x' })).toBe(false)
    expect(d.visit(APP)).toBe('No live calls now.')
    expect(d.calls).toEqual([])
  })

  test('`replayed` is false for another mockup, a component, an unknown key or path', async () => {
    const d = desk()
    expect(d.replayed('/api/screen', { app: 'A habit tracker' })).toBe(false)
    expect(d.replayed('/api/pick', { key: 'nope', index: 0 })).toBe(false)
    await drawAndPick(d, null, 0)
    const comp = d.cache.map(APP).entries.find(isComponent)
    if (comp) expect(d.replayed('/api/revise', { key: comp.key })).toBe(false)
    expect(d.replayed('/api/undo', { key: screenKey(APP, null) })).toBe(false)
  })
})
