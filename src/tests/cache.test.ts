import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScreenCache, normalizePrompt, screenKey, type Candidate } from '@uxwoz/core'

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

  test('a cache file survives a restart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    new ScreenCache(file).add('Coffee app', 'Cart', cand('<h1>Cart</h1>'))
    expect(new ScreenCache(file).get(screenKey('coffee app', 'cart'))?.candidates[0]?.html).toBe('<h1>Cart</h1>')
  })
})
