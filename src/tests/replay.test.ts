// A starter's mockup replays its recording wherever drawing.ts would call a model (spec/public.md,
// Recordings): the plants recording at the small phone, a fetch that throws when called, a clock that does not wait.
import { describe, expect, test } from 'bun:test'
import {
  HOME_NAME, ScreenCache, STARTERS, VISIT_EVERY, isComponent, recordedHtml, recordingFor, screenKey,
  type CacheEntry, type Device, type Recording,
} from '@uxwoz/core'
import { drawing, type ScreenEvent } from '../packages/web/src/drawing.ts'

const APP = STARTERS.find((s) => s.id === 'plants')!.prompt
const rec = recordingFor(APP, 'small-phone') as Recording
const design = (name: string, n: number) => recordedHtml(rec.screens[name]!.designs[n]!)
const linked = Object.keys(rec.screens).filter((n) => n !== HOME_NAME)

function desk(may = () => true) {
  const cache = new ScreenCache(), calls: string[] = []
  const fetch = (async (url: string) => { calls.push(String(url)); throw new Error('no network in this test') }) as any
  const d = drawing(cache, { fetch, env: { OPENROUTER_API_KEY: 'k', OPENAI_API_KEY: 'k' }, sleep: async () => {} }, () => {}, 0, may)
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

/** Draw a screen as /api/screen does (Home at `device`), clicked from `from`. */
async function draw(d: Desk, action: string | null, from?: CacheEntry, device: Device = 'small-phone') {
  const evs = await all(d.screenEvents(APP, action, 'claude-haiku-5.5', device, from ? { from: from.key, label: action! } : null, signal()))
  return { evs, entry: d.cache.find(APP, action)! }
}
/** Another on a screen, as /api/revise with neither change nor prompt does. */
const another = async (d: Desk, key: string) => versions(await all(d.reviseEvents(d.cache.get(key)!, null, 'claude-haiku-5.5', signal())))
/** Settle a screen as /api/settle does, and wait for its filing and visit; whether /api/settle would be replayed. */
async function settle(d: Desk, key: string) {
  const replayed = d.replayed('/api/settle', { key })
  const r = d.settle(key)!
  await d.idle(APP)
  return { ...r, replayed }
}
const boxes = (d: Desk) => {
  const m = d.cache.map(APP)
  return { rules: m.boxes.rules, data: m.boxes.data, components: m.entries.filter(isComponent).map((e) => e.name) }
}

describe('a starter replays its recording', () => {
  test('Home\'s first design is design 0 and Another design 1, free, with no call; Home\'s filing follows the design showing', async () => {
    const filled = []
    for (const n of [0, 1]) {
      const d = desk()
      expect(d.replayed('/api/screen', { app: APP, device: 'small-phone' })).toBe(true)
      const { evs, entry } = await draw(d, null)
      expect(evs.filter((e) => e.type === 'chunk').length).toBeGreaterThan(2)
      expect(versions(evs).map((v) => [v.html, v.costUsd])).toEqual([[design(HOME_NAME, 0), 0]])
      if (n) {
        expect(d.replayed('/api/revise', { key: entry.key })).toBe(true)
        expect((await another(d, entry.key)).map((v) => [v.html, v.costUsd])).toEqual([[design(HOME_NAME, 1), 0]])
      }
      const s = await settle(d, entry.key)
      expect([s.replayed, s.filing, s.visiting]).toEqual([true, true, false])
      expect(d.calls).toEqual([])
      filled.push(boxes(d))
    }
    expect(filled[0]).not.toEqual(filled[1])
    expect(Object.values(filled[0]!).flat().length).toBeGreaterThan(0)
  })

  test('a linked screen replays its two designs; a third design, Draw again and an Edit are live; its settle files nothing', async () => {
    const d = desk()
    const home = (await draw(d, null)).entry
    await settle(d, home.key)
    const name = linked[0]!, action = rec.screens[name]!.action!
    expect(d.replayed('/api/screen', { app: APP, action })).toBe(true)
    const before = boxes(d)
    const { evs, entry } = await draw(d, action, home)
    expect(versions(evs).map((v) => v.html)).toEqual([design(name, 0)])
    expect((await another(d, entry.key)).map((v) => v.html)).toEqual([design(name, 1)])
    expect(d.calls).toEqual([])
    // Settled now, with a recorded design showing: nothing is filed.
    const s = await settle(d, entry.key)
    expect([s.replayed, s.filing]).toEqual([true, false])
    expect(boxes(d)).toEqual(before)
    // A third design is live (here: the fetch throws), and so are Draw again and an Edit.
    expect(d.replayed('/api/revise', { key: entry.key })).toBe(false)
    expect(d.replayed('/api/revise', { key: entry.key, prompt: 'a plant page with a big photo' })).toBe(false)
    expect(d.replayed('/api/revise', { key: entry.key, change: 'Bigger title' })).toBe(false)
    expect((await all(d.reviseEvents(d.cache.get(entry.key)!, null, 'claude-haiku-5.5', signal()))).at(-1)!.type).toBe('error')
    expect(d.calls.length).toBe(1)
  })

  test('a settle answered by a recording brings no visit, even the 5th', async () => {
    const d = desk()
    let last = (await draw(d, null)).entry
    await settle(d, last.key)
    for (const n of linked) {
      const r = await draw(d, rec.screens[n]!.action!, last)
      last = r.entry
    }
    // The clicks settled Home's children as they went; make the next one the 5th.
    d.cache.boxesOf(APP).settled = VISIT_EVERY - 1
    const s = await settle(d, last.key)
    expect([s.replayed, s.filing, s.visiting]).toEqual([true, false, false])
    expect(d.cache.boxesOf(APP).settled).toBe(VISIT_EVERY)
    expect(d.cache.boxesOf(APP).visits ?? []).toEqual([])
    expect(d.calls).toEqual([])
  })

  test('an Edit, Visit now and a screen with no recording stay live; after a live call a settle files live', async () => {
    const d = desk()
    const home = (await draw(d, null)).entry
    expect(d.replayed('/api/revise', { key: home.key, change: 'Bigger title' })).toBe(false)
    const edit = await all(d.reviseEvents(home, { change: 'Bigger title' }, 'claude-haiku-5.5', signal()))
    expect(edit.at(-1)!.type).toBe('error')
    expect(d.calls.length).toBe(1)
    expect(d.visit(APP)).toBeNull()
    await d.idle(APP)
    expect(d.calls.length).toBe(2)
    expect(d.replayed('/api/screen', { app: APP, action: '@nowhere: a page nobody recorded' })).toBe(false)
    await all(d.screenEvents(APP, '@nowhere: a page nobody recorded', 'claude-haiku-5.5', 'small-phone', null, signal()))
    expect(d.calls.length).toBe(3)
    // Now a recorded screen still draws from the recording, but its settle files live.
    const name = linked[0]!, action = rec.screens[name]!.action!
    expect(d.replayed('/api/screen', { app: APP, action })).toBe(true)
    // The click settles Home, which files live; the design itself is the recording's.
    const { entry } = await draw(d, action, home)
    await d.idle(APP)
    expect(d.calls.length).toBe(4)
    const s = await settle(d, entry.key)
    expect([s.replayed, s.filing]).toEqual([false, true])
    expect(d.calls.length).toBe(5)
  })

  test('`may` stops live filing and visits, not a replay', async () => {
    const d = desk(() => false)
    const home = (await draw(d, null)).entry
    expect((await settle(d, home.key)).filing).toBe(true)
    expect(d.file(screenKey(APP, null), { change: 'x' })).toBe(false)
    expect(d.visit(APP)).toBe('No live calls now.')
    expect(d.calls).toEqual([])
  })

  test('a settle that `may` stops leaves the screen unsettled, so a later click files it', async () => {
    let ok = false
    const d = desk(() => ok)
    const home = d.cache.addScreen('A habit tracker', null, { html: '<h1>Habits</h1>', model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-24T00:00:00Z', costUsd: 0.001, costEstimated: false, firstChunkMs: 1, totalMs: 2, finishReason: 'stop', device: 'small-phone' })!
    expect(d.settle(home.key)).toMatchObject({ filing: false })
    expect(d.cache.get(home.key)!.settled).toBeUndefined()
    expect(d.cache.boxesOf('A habit tracker').settled).toBeUndefined()
    ok = true
    expect(d.settle(home.key)).toMatchObject({ filing: true })
    expect(d.cache.get(home.key)!.settled).toBe('2026-11-24T00:00:00Z')
    await d.idle('A habit tracker')
  })

  test('`replayed` is false at a size with no recording, for another mockup, a component, an unknown key or path', async () => {
    const d = desk()
    expect(d.replayed('/api/screen', { app: APP, device: 'laptop' })).toBe(false)
    expect(d.replayed('/api/screen', { app: 'A habit tracker' })).toBe(false)
    expect(d.replayed('/api/settle', { key: 'nope' })).toBe(false)
    const home = (await draw(d, null)).entry
    await settle(d, home.key)
    const comp = d.cache.map(APP).entries.find(isComponent)
    if (comp) expect(d.replayed('/api/revise', { key: comp.key })).toBe(false)
    expect(d.replayed('/api/undo', { key: home.key })).toBe(false)
    // A laptop mockup of the same starter draws live.
    const laptop = desk()
    await draw(laptop, null, undefined, 'laptop')
    expect(laptop.calls.length).toBe(1)
  })
})
