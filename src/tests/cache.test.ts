import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALTERNATIVE_REQUEST, ScreenCache, normalizePrompt, screenKey, screenRequest, type Candidate } from '@uxwoz/core'

const cand = (html: string): Candidate => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-10-23T00:00:00Z',
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop',
})

describe('screen cache', () => {
  test('prompts that differ only in case, spacing and end punctuation share a key', () => {
    expect(normalizePrompt('  A Coffee   shop app!! ')).toBe('a coffee shop app')
    expect(screenKey('Coffee app', 'Show  the Cart.')).toBe(screenKey('coffee app', 'show the cart'))
    expect(screenKey('Coffee app', null)).not.toBe(screenKey('Coffee app', 'Show the cart'))
  })

  test('regenerating adds a candidate and keeps the chosen one until the user picks another', () => {
    const cache = new ScreenCache()
    cache.add('Coffee app', null, cand('<h1>v1</h1>'))
    const { entry, index } = cache.add('coffee app', null, cand('<h1>v2</h1>'))
    expect(index).toBe(1)
    expect(entry.candidates.map((c) => c.html)).toEqual(['<h1>v1</h1>', '<h1>v2</h1>'])
    expect(entry.chosen).toBe(0)
    expect(cache.choose(entry.key, 1)?.chosen).toBe(1)
    expect(cache.choose(entry.key, 5)).toBeUndefined()
  })

  test('a pair of variants is stored in order, and the first of a new screen is the chosen one', () => {
    const cache = new ScreenCache()
    const first = cache.add('Coffee app', 'Cart', cand('<h1>A</h1>'), cand('<h1>B</h1>'))
    expect(first.index).toBe(0)
    expect(first.entry.chosen).toBe(0)
    const more = cache.add('Coffee app', 'Cart', cand('<h1>C</h1>'), cand('<h1>D</h1>'))
    expect(more.index).toBe(2)
    expect(more.entry.candidates.map((c) => c.html)).toEqual(['<h1>A</h1>', '<h1>B</h1>', '<h1>C</h1>', '<h1>D</h1>'])
  })

  test('"home" and the product prompt as an action both mean the first screen', () => {
    expect(screenKey('Coffee app', 'Home')).toBe(screenKey('Coffee app', null))
    expect(screenKey('Coffee app', 'coffee app.')).toBe(screenKey('Coffee app', null))
    const cache = new ScreenCache()
    expect(cache.add('Coffee app', 'home', cand('<h1>Menu</h1>')).entry.action).toBeNull()
  })

  test('a mockup lists its later screens, newest first, for the next request', () => {
    const cache = new ScreenCache()
    cache.add('Coffee app', null, cand('<h1>Menu</h1>'))
    cache.add('Coffee app', 'Cart', cand('<h1>Cart</h1>'))
    cache.add('Coffee app', 'Receipt', cand('<h1>Receipt</h1>'))
    cache.add('Tea app', 'Cart', cand('<h1>Tea cart</h1>'))
    expect(cache.existingScreens('coffee APP')).toEqual(['Receipt', 'Cart'])
    expect(screenRequest('Coffee app', 'Pay', ['Receipt', 'Cart'])).toEndWith('Screens that already exist in this mockup:\n- Receipt\n- Cart')
    expect(screenRequest('Coffee app', null)).toBe('Coffee app')
  })

  test('the request names the device, the user\'s feedback and, for a second variant, asks for a different design', () => {
    const msg = screenRequest('Coffee app', null, [], { device: 'a phone screen', feedback: 'bigger photos', alternative: true })
    expect(msg).toBe(`Coffee app\n\nDesign it for a phone screen.\n\nThe user saw earlier versions of this screen and asks: bigger photos\n\n${ALTERNATIVE_REQUEST}`)
    expect(screenRequest('Coffee app', null, [], { device: 'a phone screen' })).not.toContain(ALTERNATIVE_REQUEST)
  })

  test('the cache keeps the first click between two screens and serves one mockup at a time', () => {
    const cache = new ScreenCache()
    const menu = cache.add('Cafe', null, cand('<h1>Menu</h1>')).entry.key
    const cart = cache.add('Cafe', 'Cart', cand('<h1>Cart</h1>')).entry.key
    cache.add('Bakery', null, cand('<h1>Bread</h1>'))
    expect(cache.link(menu, cart, '  View   cart ')?.label).toBe('View cart')
    expect(cache.link(menu, cart, 'Other words')?.label).toBe('View cart')
    expect(cache.link(menu, screenKey('Bakery', null), 'x')).toBeUndefined() // another mockup
    expect(cache.link(menu, menu, 'x')).toBeUndefined()
    const map = cache.map('cafe')
    expect(map.entries.map((e) => e.key)).toEqual([menu, cart])
    expect(map.links).toHaveLength(1)
  })

  test('the history lists each mockup once, as first typed, most recently changed first', () => {
    const cache = new ScreenCache()
    cache.add('Coffee app', null, { ...cand('<h1>Menu</h1>'), createdAt: '2026-10-20T00:00:00Z' })
    cache.add('Tea app', null, { ...cand('<h1>Tea</h1>'), createdAt: '2026-10-21T00:00:00Z' })
    cache.add('coffee APP', 'Cart', { ...cand('<h1>Cart</h1>'), createdAt: '2026-10-22T00:00:00Z' })
    expect(cache.apps()).toEqual([
      { app: 'Coffee app', screens: 2, updatedAt: '2026-10-22T00:00:00Z' },
      { app: 'Tea app', screens: 1, updatedAt: '2026-10-21T00:00:00Z' },
    ])
  })

  test('a cache file from before links existed still loads', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    writeFileSync(file, JSON.stringify([{ key: 'cafe', app: 'Cafe', action: null, chosen: 0, candidates: [cand('<h1>Menu</h1>')] }]))
    const cache = new ScreenCache(file)
    expect(cache.map('Cafe').entries).toHaveLength(1)
    expect(cache.map('Cafe').links).toEqual([])
  })

  test('a cache file survives a restart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    new ScreenCache(file).add('Coffee app', 'Cart', cand('<h1>Cart</h1>'))
    expect(new ScreenCache(file).get(screenKey('coffee app', 'cart'))?.candidates[0]?.html).toBe('<h1>Cart</h1>')
  })
})
