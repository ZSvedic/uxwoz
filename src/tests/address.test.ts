// The address in the browser (spec/behavior.md, Navigation: The address), with no DOM.
import { describe, expect, test } from 'bun:test'
import type { CacheEntry } from '@uxwoz/core'
import { addressOf, addressStep, entryAt, landing, readAddress } from '../packages/web/src/address.ts'

const v = { html: '', model: 'claude-haiku-5.5', servedModel: null, createdAt: '', costUsd: 0, costEstimated: false, firstChunkMs: null, totalMs: 0, finishReason: 'stop' } as const
const entry = (key: string, sid: string, extra: Partial<CacheEntry> = {}): CacheEntry => ({ key, app: 'Sleep', action: null, parent: null, versions: [{ ...v }], sid, ...extra })
const map = (...es: CacheEntry[]) => new Map(es.map((e) => [e.key, e]))
const home = entry('sleep', 'h1', { mid: 'k3f9x2', name: 'home' }), nights = entry('sleep » @nights', 'a7', { name: 'nights' })
const tab = entry('sleep » #tab', 'c1', { name: 'tab', kind: 'component' })

describe('the address', () => {
  test('names a project and a mock by their IDs, a box by its name, a tour mock by its name; any other path is `/`', () => {
    expect(readAddress('/m/k3f9x2/a7')).toEqual({ mid: 'k3f9x2', at: 'a7', box: null })
    expect(readAddress('/m/k3f9x2')).toEqual({ mid: 'k3f9x2', at: null, box: null })
    expect(readAddress('/m/k3f9x2/')).toEqual({ mid: 'k3f9x2', at: null, box: null })
    expect(readAddress('/m/k3f9x2/box-rules')).toEqual({ mid: 'k3f9x2', at: null, box: 'rules' })
    expect(readAddress('/m/k3f9x2/box-fixer')).toEqual({ mid: 'k3f9x2', at: null, box: 'notes' })
    expect(readAddress('/tour')).toEqual({ mid: null, at: null, box: null })
    expect(readAddress('/tour/meet-woz')).toEqual({ mid: null, at: 'meet-woz', box: null })
    expect(readAddress('/tour/box-data')).toEqual({ mid: null, at: null, box: 'data' })
    for (const p of ['/', '/s/abcd', '/m/', '/m/K3F/a7', '/m/k3f9x2/a7/x', '/m/a%20b', '/m/k3f9x2/box-nope', '/tours']) expect(readAddress(p)).toBeNull()
  })

  test('is written from the IDs, never the sentence; a box by its name; none while Home is not stored', () => {
    const es = map(home, nights)
    expect(addressOf('Sleep', es, nights.key)).toBe('/m/k3f9x2/a7')
    expect(addressOf('Sleep', es, null)).toBe('/m/k3f9x2')
    expect(addressOf('Sleep', es, nights.key, 'components')).toBe('/m/k3f9x2/box-components')
    expect(addressOf(null, es, null)).toBe('/')
    expect(addressOf('Sleep', new Map(), null)).toBeNull()
    // A new mock while its first design is drawn: the address stays as it is.
    expect(addressOf('Sleep', map(home, entry('sleep » @stats', 'q2', { versions: [] })), 'sleep » @stats')).toBeNull()
  })

  test('the tour\'s is /tour/<mock> by name, and a box\'s /tour/box-…', () => {
    const es = map(home, nights)
    expect(addressOf('Sleep', es, nights.key, null, true)).toBe('/tour/nights')
    expect(addressOf('Sleep', es, home.key, null, true)).toBe('/tour/home')
    expect(addressOf('Sleep', es, null, 'rules', true)).toBe('/tour/box-rules')
    expect(entryAt('Sleep', es, 'nights', true)).toBe(nights)
    expect(entryAt('Sleep', es, 'a7', true)).toBeUndefined()
  })

  test('finds the mock an ID names, never a component', () => {
    const es = map(home, nights, tab)
    expect(entryAt('Sleep', es, 'a7')).toBe(nights)
    expect(entryAt('Sleep', es, null)).toBe(home)
    expect(entryAt('Sleep', es, 'zz')).toBeUndefined()
    expect(entryAt('Sleep', es, 'c1')).toBeUndefined()
  })

  test('lands on the mock it names; one deleted since lands on Home, with a word why', () => {
    expect(landing('Sleep', map(home, nights), 'a7')).toEqual({ entry: nights, why: null })
    expect(landing('Sleep', map(home, nights), null)).toEqual({ entry: home, why: null })
    expect(landing('Sleep', map(home), 'a7')).toEqual({ entry: home, why: 'That mock is not here.' })
    expect(landing('Sleep', new Map(), 'a7')).toBeNull()
  })

  test('changes as a new step whenever what shows changes, in place for a reload or Back, not at all when it merely redraws', () => {
    // A, B, C, then ← to B: a step of its own, so the browser's Back returns to C.
    const steps = ['/m/k3f9x2/aa']
    for (const want of ['/m/k3f9x2/bb', '/m/k3f9x2/box-rules', '/m/k3f9x2/bb', '/m/k3f9x2/bb']) if (addressStep(steps.at(-1)!, want, false) === 'push') steps.push(want)
    expect(steps).toEqual(['/m/k3f9x2/aa', '/m/k3f9x2/bb', '/m/k3f9x2/box-rules', '/m/k3f9x2/bb'])
    expect(addressStep('/m/k3f9x2/h1', '/m/k3f9x2/a7', false)).toBe('push')
    expect(addressStep('/m/k3f9x2/h1', '/m/k3f9x2/a7', true)).toBe('replace')
    expect(addressStep('/m/k3f9x2/a7', '/m/k3f9x2/a7', false)).toBeNull()
    expect(addressStep('/', null, false)).toBeNull()
  })
})
