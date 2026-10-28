// The canvas map: which click made which screen, and where each screen sits.
import { expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CARD, ScreenCache, layoutMap, screenKey, type Candidate, type Link } from '@uxwoz/core'

const cand = (html: string): Candidate => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-10-28T00:00:00Z',
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop',
})
const link = (from: string, to: string, t: number): Link => ({ from, to, label: `${from}->${to}`, createdAt: `2026-10-28T00:00:0${t}Z` })

test('screens sit left to right in the order clicks found them; back links do not move them', () => {
  // menu -> cart -> pay, menu -> history, and pay -> menu (back)
  const { boxes, parent } = layoutMap(['menu', 'cart', 'pay', 'history'], [
    link('menu', 'cart', 1), link('cart', 'pay', 2), link('menu', 'history', 3), link('pay', 'menu', 4),
  ])
  const col = (k: string) => boxes.get(k)!.x / (CARD.w + CARD.gapX)
  expect(['menu', 'cart', 'pay', 'history'].map(col)).toEqual([0, 1, 2, 1])
  expect(parent.get('cart')).toBe('menu')
  expect(parent.has('menu')).toBe(false) // the back link is not a parent
  expect(boxes.get('history')!.y).toBeGreaterThan(boxes.get('cart')!.y)
  // A parent sits level with the middle of its children.
  expect(boxes.get('menu')!.y).toBe((boxes.get('cart')!.y + boxes.get('history')!.y) / 2)
})

test('a screen no click reached starts its own row', () => {
  const { boxes } = layoutMap(['menu', 'cart', 'help'], [link('menu', 'cart', 1)])
  expect(boxes.get('help')!.x).toBe(0)
  expect(boxes.get('help')!.y).toBeGreaterThan(boxes.get('menu')!.y)
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

test('a cache file from before links existed still loads', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
  writeFileSync(file, JSON.stringify([{ key: 'cafe', app: 'Cafe', action: null, chosen: 0, candidates: [cand('<h1>Menu</h1>')] }]))
  const cache = new ScreenCache(file)
  expect(cache.map('Cafe').entries).toHaveLength(1)
  expect(cache.map('Cafe').links).toEqual([])
})

test('cards as tall as their screens never overlap in a column', () => {
  const heights = new Map([['menu', 300], ['cart', 1400], ['history', 500], ['pay', 900]])
  const { boxes } = layoutMap(['menu', 'cart', 'history', 'pay'], [link('menu', 'cart', 1), link('menu', 'history', 2), link('cart', 'pay', 3)], heights)
  const cart = boxes.get('cart')!, history = boxes.get('history')!
  expect(cart.h).toBe(1400)
  expect(history.y).toBeGreaterThanOrEqual(cart.y + cart.h + CARD.gapY)
  // The short menu sits in the middle of its children's band.
  const menu = boxes.get('menu')!
  expect(menu.y + menu.h / 2).toBeCloseTo((cart.y + history.y + history.h) / 2)
})
