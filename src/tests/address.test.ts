// A mockup's address in the browser (spec/behavior.md, Navigation: The address), with no DOM.
import { describe, expect, test } from 'bun:test'
import type { CacheEntry } from '@uxwoz/core'
import { Shown, addressOf, addressStep, entryAt, landing, openChoice, readAddress } from '../packages/web/src/address.ts'

const v = { html: '', model: 'claude-haiku-5.5', servedModel: null, createdAt: '', costUsd: 0, costEstimated: false, firstChunkMs: null, totalMs: 0, finishReason: 'stop' } as const
const entry = (key: string, sid: string, extra: Partial<CacheEntry> = {}): CacheEntry => ({ key, app: 'Sleep', action: null, parent: null, versions: [{ ...v }], sid, ...extra })
const map = (...es: CacheEntry[]) => new Map(es.map((e) => [e.key, e]))
const home = entry('sleep', 'h1', { mid: 'k3f9x2' }), nights = entry('sleep » @nights', 'a7')
const stats = entry('sleep » @stats', 'q2', { versions: [], proposals: [null, null] })

describe('the address', () => {
  test('names a mockup and a screen by their IDs; any other path is the start page', () => {
    expect(readAddress('/m/k3f9x2/a7')).toEqual({ mid: 'k3f9x2', sid: 'a7' })
    expect(readAddress('/m/k3f9x2')).toEqual({ mid: 'k3f9x2', sid: null })
    expect(readAddress('/m/k3f9x2/')).toEqual({ mid: 'k3f9x2', sid: null })
    for (const p of ['/', '/s/abcd', '/m/', '/m/K3F/a7', '/m/k3f9x2/a7/x', '/m/a%20b']) expect(readAddress(p)).toBeNull()
  })

  test('is written from the IDs, never the prompt; none while the first screen is not stored', () => {
    const es = map(home, nights)
    expect(addressOf('Sleep', es, nights.key)).toBe('/m/k3f9x2/a7')
    expect(addressOf('Sleep', es, null)).toBe('/m/k3f9x2')
    expect(addressOf(null, es, null)).toBe('/')
    expect(addressOf('Sleep', new Map(), null)).toBeNull()
    expect(entryAt('Sleep', es, 'a7')).toBe(nights)
    expect(entryAt('Sleep', es, null)).toBe(home)
    expect(entryAt('Sleep', es, 'zz')).toBeUndefined()
  })

  test('lands on the screen it names; a screen deleted since lands on the first screen, with a word why', () => {
    expect(landing('Sleep', map(home, nights), 'a7')).toEqual({ entry: nights, why: null })
    expect(landing('Sleep', map(home, nights), null)).toEqual({ entry: home, why: null })
    expect(landing('Sleep', map(home), 'a7')).toEqual({ entry: home, why: 'That screen is not here.' })
    expect(landing('Sleep', new Map(), 'a7')).toBeNull()
  })

  test('shows what came into view last: a screen made current, an A OR B that opened, where Back went', () => {
    const shown = new Shown()
    expect(shown.next(home.key, map(home, nights))).toBe(home.key)
    expect(shown.next(nights.key, map(home, nights))).toBe(nights.key)
    // An A OR B opens: its screen, even while the current screen stays.
    const open = map(home, nights, stats)
    expect(openChoice(open)).toBe(stats.key)
    expect(shown.next(nights.key, open)).toBe(stats.key)
    expect(shown.next(nights.key, open)).toBe(stats.key)
    // Back to Nights while it is open: Nights, until something else comes into view.
    shown.went(nights.key, nights.key, open)
    expect(shown.next(nights.key, open)).toBe(nights.key)
    expect(shown.next(home.key, open)).toBe(home.key)
    // Picked: the same screen, so the same address.
    const picked = map(home, nights, { ...stats, versions: [{ ...v }], proposals: undefined })
    expect(shown.next(stats.key, picked)).toBe(stats.key)
    // An A OR B dropped while another screen stays current: that screen.
    shown.next(home.key, open)
    expect(shown.next(home.key, map(home, nights))).toBe(home.key)
    expect(new Shown().next(null, map(home))).toBeNull()
  })

  test('changes as a new step whenever the screen shown changes, in place for a reload or Back, not at all when it merely redraws', () => {
    // A, B, C, then ← to B: a step of its own, so the browser's Back returns to C.
    const steps = ['/m/k3f9x2/aa']
    for (const want of ['/m/k3f9x2/bb', '/m/k3f9x2/cc', '/m/k3f9x2/bb', '/m/k3f9x2/bb']) if (addressStep(steps.at(-1)!, want, false) === 'push') steps.push(want)
    expect(steps).toEqual(['/m/k3f9x2/aa', '/m/k3f9x2/bb', '/m/k3f9x2/cc', '/m/k3f9x2/bb'])
    expect(addressStep('/m/k3f9x2/h1', '/m/k3f9x2/a7', false)).toBe('push')
    expect(addressStep('/m/k3f9x2/h1', '/m/k3f9x2/a7', true)).toBe('replace')
    expect(addressStep('/m/k3f9x2/a7', '/m/k3f9x2/a7', false)).toBeNull()
    expect(addressStep('/', null, false)).toBeNull()
  })
})
