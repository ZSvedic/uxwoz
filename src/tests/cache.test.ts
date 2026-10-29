import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALTERNATIVE_REQUEST, ScreenCache, letterAt, normalizePrompt, screenKey, screenRequest, variantId, type Candidate } from '@uxwoz/core'

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
    cache.add('Coffee app', null, [cand('<h1>v1</h1>')])
    const { entry, index } = cache.add('coffee app', null, [cand('<h1>v2</h1>')])
    expect(index).toBe(1)
    expect(entry.candidates.map((c) => c.html)).toEqual(['<h1>v1</h1>', '<h1>v2</h1>'])
    expect(entry.chosen).toBe(0)
    expect(cache.choose(entry.key, 1)?.chosen).toBe(1)
    expect(cache.choose(entry.key, 5)).toBeUndefined()
  })

  test('a pair of variants is stored in order, and the first of a new screen is the chosen one', () => {
    const cache = new ScreenCache()
    const first = cache.add('Coffee app', 'Cart', [cand('<h1>A</h1>'), cand('<h1>B</h1>')])
    expect(first.index).toBe(0)
    expect(first.entry.chosen).toBe(0)
    const more = cache.add('Coffee app', 'Cart', [cand('<h1>C</h1>'), cand('<h1>D</h1>')])
    expect(more.index).toBe(2)
    expect(more.entry.candidates.map((c) => c.html)).toEqual(['<h1>A</h1>', '<h1>B</h1>', '<h1>C</h1>', '<h1>D</h1>'])
  })

  test('"home" and the product prompt as an action both mean the first screen', () => {
    expect(screenKey('Coffee app', 'Home')).toBe(screenKey('Coffee app', null))
    expect(screenKey('Coffee app', 'coffee app.')).toBe(screenKey('Coffee app', null))
    const cache = new ScreenCache()
    expect(cache.add('Coffee app', 'home', [cand('<h1>Menu</h1>')]).entry.action).toBeNull()
  })

  test('a mockup lists its later screens, newest first, for the next request', () => {
    const cache = new ScreenCache()
    cache.add('Coffee app', null, [cand('<h1>Menu</h1>')])
    cache.add('Coffee app', 'Cart', [cand('<h1>Cart</h1>')])
    cache.add('Coffee app', 'Receipt', [cand('<h1>Receipt</h1>')])
    cache.add('Tea app', 'Cart', [cand('<h1>Tea cart</h1>')])
    expect(cache.existingScreens('coffee APP')).toEqual(['Receipt', 'Cart'])
    expect(screenRequest('Coffee app', 'Pay', ['Receipt', 'Cart'])).toEndWith('Screens that already exist in this mockup:\n- Receipt\n- Cart')
    expect(screenRequest('Coffee app', null)).toBe('Coffee app')
  })

  test('the request names the device and, for a second variant, asks for a different design', () => {
    const msg = screenRequest('Coffee app', null, [], { device: 'a phone screen', alternative: true })
    expect(msg).toBe(`Coffee app\n\nDesign it for a phone screen.\n\n${ALTERNATIVE_REQUEST}`)
    expect(screenRequest('Coffee app', null, [], { device: 'a phone screen' })).not.toContain(ALTERNATIVE_REQUEST)
  })

  test('the cache keeps the first click between two screens and serves one mockup at a time', () => {
    const cache = new ScreenCache()
    const menu = cache.add('Cafe', null, [cand('<h1>Menu</h1>')]).entry.key
    const cart = cache.add('Cafe', 'Cart', [cand('<h1>Cart</h1>')]).entry.key
    cache.add('Bakery', null, [cand('<h1>Bread</h1>')])
    expect(cache.link(menu, 0, cart, '  View   cart ')?.label).toBe('View cart')
    expect(cache.link(menu, 0, cart, 'Other words')?.label).toBe('View cart')
    expect(cache.link(menu, 0, screenKey('Bakery', null), 'x')).toBeUndefined() // another mockup
    expect(cache.link(menu, 0, menu, 'x')).toBeUndefined()
    expect(cache.link(menu, 3, cart, 'x')).toBeUndefined() // no such variant
    const map = cache.map('cafe')
    expect(map.entries.map((e) => e.key)).toEqual([menu, cart])
    expect(map.links).toHaveLength(1)
  })

  test('the history lists each mockup once, as first typed, most recently changed first', () => {
    const cache = new ScreenCache()
    cache.add('Coffee app', null, [{ ...cand('<h1>Menu</h1>'), createdAt: '2026-10-20T00:00:00Z' }])
    cache.add('Tea app', null, [{ ...cand('<h1>Tea</h1>'), createdAt: '2026-10-21T00:00:00Z' }])
    cache.add('coffee APP', 'Cart', [{ ...cand('<h1>Cart</h1>'), createdAt: '2026-10-22T00:00:00Z' }])
    expect(cache.apps()).toEqual([
      { app: 'Coffee app', screens: 2, updatedAt: '2026-10-22T00:00:00Z' },
      { app: 'Tea app', screens: 1, updatedAt: '2026-10-21T00:00:00Z' },
    ])
  })

  test('each variant is named by its level and a letter that is never reused', () => {
    expect([0, 1, 25, 26, 27].map(letterAt)).toEqual(['A', 'B', 'Z', 'AA', 'AB'])
    expect(variantId(2, 'B')).toBe('L2-B')
    const cache = new ScreenCache()
    const menu = cache.add('Cafe', null, [cand('<h1>Menu</h1>'), cand('<h1>Menu 2</h1>')]).entry
    expect(menu.level).toBe(1)
    expect(menu.candidates.map((c) => c.letter)).toEqual(['A', 'B'])
    // Screens made from different variants share their level's letters: C and D follow A and B.
    const cart = cache.add('Cafe', 'Cart', [cand('<h1>Cart</h1>'), cand('<h1>Cart 2</h1>')], { parent: { key: menu.key, variant: 0, label: 'Cart' } }).entry
    const help = cache.add('Cafe', 'Help', [cand('<h1>Help</h1>'), cand('<h1>Help 2</h1>')], { parent: { key: menu.key, variant: 1, label: 'Help' } }).entry
    expect(cart).toMatchObject({ level: 2, parent: { key: menu.key, variant: 0, label: 'Cart' } })
    expect(help.candidates.map((c) => c.letter)).toEqual(['C', 'D'])
    cache.deleteVariant(cart.key, 1)
    expect(cache.add('Cafe', 'Cart', [cand('<h1>Cart 3</h1>')]).entry.candidates.map((c) => c.letter)).toEqual(['A', 'B', 'E'])
  })

  test('deleting a variant takes the screens only it reached, and a screen with no variant left', () => {
    const cache = new ScreenCache()
    const menu = cache.add('Cafe', null, [cand('<h1>A</h1>'), cand('<h1>B</h1>')]).entry.key
    const cart = cache.add('Cafe', 'Cart', [cand('<h1>Cart</h1>')], { parent: { key: menu, variant: 0, label: 'Cart' } }).entry.key
    const pay = cache.add('Cafe', 'Pay', [cand('<h1>Pay</h1>')], { parent: { key: cart, variant: 0, label: 'Pay' } }).entry.key
    const help = cache.add('Cafe', 'Help', [cand('<h1>Help</h1>')], { parent: { key: menu, variant: 0, label: 'Help' } }).entry.key
    cache.link(menu, 1, help, 'Help') // variant B reaches Help too
    const done = cache.deleteVariant(menu, 0)!
    expect(done.removed.sort()).toEqual([cart, pay].sort())
    expect(done.entry).toMatchObject({ chosen: 1 })
    expect(done.entry!.candidates[0]).toMatchObject({ deleted: true, html: '', letter: 'A' })
    expect(cache.get(help)?.parent).toMatchObject({ key: menu, variant: 1 })
    expect(cache.choose(menu, 0)).toBeUndefined()
    expect(cache.deleteVariant(help, 0)!.entry).toBeUndefined()
    expect(cache.map('Cafe').entries.map((e) => e.key)).toEqual([menu])
  })

  test('deleting a mockup removes all its screens and links, and no other', () => {
    const cache = new ScreenCache()
    const menu = cache.add('Cafe', null, [cand('<h1>Menu</h1>')]).entry.key
    const cart = cache.add('Cafe', 'Cart', [cand('<h1>Cart</h1>')], { parent: { key: menu, variant: 0, label: 'Cart' } }).entry.key
    cache.link(cart, 0, menu, 'Back')
    cache.add('Bakery', null, [cand('<h1>Bread</h1>')])
    expect(cache.deleteApp('CAFE')).toBe(2)
    expect(cache.map('Cafe')).toEqual({ root: 'cafe', entries: [], links: [] })
    expect(cache.apps().map((a) => a.app)).toEqual(['Bakery'])
  })

  test('a cache file from before the tree gets levels, parents and letters from its links', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const at = (t: string) => ({ ...cand('<h1>x</h1>'), createdAt: `2026-10-2${t}T00:00:00Z` })
    const old = (key: string, action: string | null, chosen: number, ...c: Candidate[]) => ({ key, app: 'Cafe', action, chosen, candidates: c })
    writeFileSync(file, JSON.stringify({
      entries: [old('cafe', null, 1, at('1'), at('1')), old('cafe » cart', 'Cart', 0, at('3'), at('3')), old('cafe » pay', 'Pay', 0, at('4'))],
      links: [
        { from: 'cafe', to: 'cafe » cart', label: 'Cart', createdAt: '2026-10-23T00:00:00Z' },
        { from: 'cafe » cart', to: 'cafe » pay', label: 'Pay', createdAt: '2026-10-24T00:00:00Z' },
        { from: 'cafe » pay', to: 'cafe', label: 'Home', createdAt: '2026-10-25T00:00:00Z' },
      ],
    }))
    const cache = new ScreenCache(file)
    const pay = cache.get('cafe » pay')!
    expect(pay).toMatchObject({ level: 3, parent: { key: 'cafe » cart', variant: 0, label: 'Pay' } })
    expect(cache.get('cafe » cart')).toMatchObject({ level: 2, parent: { key: 'cafe', variant: 1 } })
    expect(cache.get('cafe')!.candidates.map((c) => c.letter)).toEqual(['A', 'B'])
    expect(new ScreenCache(file).map('Cafe').links.map((l) => l.variant)).toEqual([1, 0, 0])
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
    new ScreenCache(file).add('Coffee app', 'Cart', [cand('<h1>Cart</h1>')])
    expect(new ScreenCache(file).get(screenKey('coffee app', 'cart'))?.candidates[0]?.html).toBe('<h1>Cart</h1>')
  })
})
