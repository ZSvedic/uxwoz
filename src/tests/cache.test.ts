import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALTERNATIVE_REQUEST, EDIT_REQUEST, ScreenCache, normalizePrompt, screenIdea, screenKey, screenRequest, type Version } from '@uxwoz/core'

const ver = (html: string, createdAt = '2026-10-23T00:00:00Z'): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt,
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop',
})

/** A picked screen: one side proposed, then picked. */
function screen(cache: ScreenCache, app: string, action: string | null, html: string, parent: { key: string; label: string } | null = null, at?: string) {
  const e = cache.propose(app, action, 0, ver(html, at), parent)!
  return cache.pick(e.key, 0)!
}

describe('screen cache', () => {
  test('prompts that differ only in case, spacing and end punctuation share a key', () => {
    expect(normalizePrompt('  A Coffee   shop app!! ')).toBe('a coffee shop app')
    expect(screenKey('Coffee app', 'Show  the Cart.')).toBe(screenKey('coffee app', 'show the cart'))
    expect(screenKey('Coffee app', null)).not.toBe(screenKey('Coffee app', 'Show the cart'))
  })

  test('a new screen holds both sides until a pick keeps one as its first version', () => {
    const cache = new ScreenCache()
    const e = cache.propose('Coffee app', null, 1, ver('<h1>B</h1>'))!
    expect(e).toMatchObject({ level: 1, versions: [], proposals: [null, { html: '<h1>B</h1>' }] })
    cache.propose('coffee app', null, 0, ver('<h1>A</h1>'))
    expect(cache.pick(e.key, 2)).toBeUndefined()
    const picked = cache.pick(e.key, 1)!
    expect(picked.versions.map((v) => v.html)).toEqual(['<h1>B</h1>'])
    expect(picked.proposals).toBeUndefined()
    // A side that finishes after the pick is dropped.
    expect(cache.propose('Coffee app', null, 0, ver('<h1>late</h1>'))).toBeUndefined()
    expect(cache.get(e.key)!.versions).toHaveLength(1)
  })

  test('a side that has not finished cannot be picked', () => {
    const cache = new ScreenCache()
    const e = cache.propose('Coffee app', null, 0, ver('<h1>A</h1>'))!
    expect(cache.pick(e.key, 1)).toBeUndefined()
    expect(cache.pick(e.key, 0)).toBeDefined()
  })

  test('versions stack up, and Undo drops the newest but never the last', () => {
    const cache = new ScreenCache()
    const { key } = screen(cache, 'Cafe', null, '<h1>v1</h1>')
    cache.addVersion(key, { ...ver('<h1>v2</h1>'), feedback: 'Bigger title' })
    expect(cache.get(key)!.versions.map((v) => v.html)).toEqual(['<h1>v1</h1>', '<h1>v2</h1>'])
    expect(cache.undo(key)!.versions.map((v) => v.html)).toEqual(['<h1>v1</h1>'])
    expect(cache.undo(key)).toBeUndefined()
    // No versions while the A OR B is open.
    const open = cache.propose('Cafe', 'Cart', 0, ver('<h1>c</h1>'), { key, label: 'Cart' })!
    expect(cache.addVersion(open.key, ver('<h1>x</h1>'))).toBeUndefined()
  })

  test('"home" and the product prompt as an action both mean the first screen', () => {
    expect(screenKey('Coffee app', 'Home')).toBe(screenKey('Coffee app', null))
    expect(screenKey('Coffee app', 'coffee app.')).toBe(screenKey('Coffee app', null))
    expect(new ScreenCache().propose('Coffee app', 'home', 0, ver('<h1>Menu</h1>'))!.action).toBeNull()
  })

  test('a mockup lists its later screens, newest first, for the next request', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Coffee app', null, '<h1>Menu</h1>')
    screen(cache, 'Coffee app', 'Cart', '<h1>Cart</h1>', { key: menu.key, label: 'Cart' })
    screen(cache, 'Coffee app', 'Receipt', '<h1>Receipt</h1>', { key: menu.key, label: 'Receipt' })
    screen(cache, 'Tea app', 'Cart', '<h1>Tea cart</h1>')
    expect(cache.existingScreens('coffee APP')).toEqual(['Receipt', 'Cart'])
    expect(screenRequest('Coffee app', 'Pay', ['Receipt', 'Cart'])).toEndWith('Screens that already exist in this mockup:\n- Receipt\n- Cart')
    expect(screenRequest('Coffee app', null)).toBe('Coffee app')
  })

  test('the request names the device and, for one side, asks for a different design', () => {
    const msg = screenRequest('Coffee app', null, [], { device: 'a phone screen', alternative: true })
    expect(msg).toBe(`Coffee app\n\nDesign it for a phone screen.\n\n${ALTERNATIVE_REQUEST}`)
    expect(screenRequest('Coffee app', null, [], { device: 'a phone screen' })).not.toContain(ALTERNATIVE_REQUEST)
  })

  test('an Edit sends the screen as it is now and the change, last', () => {
    const msg = screenRequest('Coffee app', null, [], { device: 'a phone screen', edit: { html: '<h1>Menu</h1>', change: 'Add prices' } })
    expect(msg).toBe(`Coffee app\n\nDesign it for a phone screen.\n\nThe screen as it is now:\n<h1>Menu</h1>\n\n${EDIT_REQUEST} Add prices`)
  })

  test('the idea is read from its meta tag', () => {
    expect(screenIdea('<title>Home</title><meta name="idea" content="One big  button &amp; a list">')).toBe('One big button & a list')
    expect(screenIdea("<meta name='idea' content='Cards first'>")).toBe('Cards first')
    expect(screenIdea('<h1>No idea</h1>')).toBe('')
  })

  test('a new screen takes its parent and level from the click, only from a picked screen of the same mockup', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>')
    const cart = screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu.key, label: 'Cart' })
    expect(cart).toMatchObject({ level: 2, parent: { key: menu.key, label: 'Cart' } })
    const pay = screen(cache, 'Cafe', 'Pay', '<h1>Pay</h1>', { key: cart.key, label: 'Pay' })
    expect(pay.level).toBe(3)
    const tea = screen(cache, 'Tea', null, '<h1>T</h1>')
    expect(cache.propose('Cafe', 'X', 0, ver('<h1>x</h1>'), { key: tea.key, label: 'x' })!.parent).toBeNull()
    const open = cache.propose('Cafe', 'Help', 0, ver('<h1>h</h1>'), { key: menu.key, label: 'Help' })!
    expect(cache.propose('Cafe', 'Y', 0, ver('<h1>y</h1>'), { key: open.key, label: 'y' })!.parent).toBeNull()
  })

  test('the cache keeps the first click between two screens and serves one mockup at a time', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>').key
    const cart = screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu, label: 'Cart' }).key
    screen(cache, 'Bakery', null, '<h1>Bread</h1>')
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
    const menu = screen(cache, 'Coffee app', null, '<h1>Menu</h1>', null, '2026-10-20T00:00:00Z')
    screen(cache, 'Tea app', null, '<h1>Tea</h1>', null, '2026-10-21T00:00:00Z')
    screen(cache, 'coffee APP', 'Cart', '<h1>Cart</h1>', { key: menu.key, label: 'Cart' }, '2026-10-22T00:00:00Z')
    expect(cache.apps()).toEqual([
      { app: 'Coffee app', screens: 2, updatedAt: '2026-10-22T00:00:00Z' },
      { app: 'Tea app', screens: 1, updatedAt: '2026-10-21T00:00:00Z' },
    ])
  })

  test('deleting a screen takes the screens only it reached; one reached by another click moves under it', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>').key
    const cart = screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu, label: 'Cart' }).key
    const pay = screen(cache, 'Cafe', 'Pay', '<h1>Pay</h1>', { key: cart, label: 'Pay' }).key
    const help = screen(cache, 'Cafe', 'Help', '<h1>Help</h1>', { key: cart, label: 'Help' }).key
    const faq = screen(cache, 'Cafe', 'FAQ', '<h1>FAQ</h1>', { key: help, label: 'FAQ' }).key
    cache.link(menu, help, 'Help') // the first screen reaches Help too
    expect(cache.delete(cart)!.sort()).toEqual([cart, pay].sort())
    expect(cache.get(help)).toMatchObject({ level: 2, parent: { key: menu, label: 'Help' } })
    expect(cache.get(faq)!.level).toBe(3)
    expect(cache.delete('no such screen')).toBeUndefined()
  })

  test('deleting the first screen deletes the mockup', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>').key
    const cart = screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu, label: 'Cart' }).key
    screen(cache, 'Bakery', null, '<h1>Bread</h1>')
    expect(cache.delete(menu)!.sort()).toEqual([menu, cart].sort())
    expect(cache.apps().map((a) => a.app)).toEqual(['Bakery'])
  })

  test('deleting a mockup removes all its screens and links, and no other', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>').key
    const cart = screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu, label: 'Cart' }).key
    cache.link(cart, menu, 'Back')
    screen(cache, 'Bakery', null, '<h1>Bread</h1>')
    expect(cache.deleteApp('CAFE')).toBe(2)
    expect(cache.map('Cafe')).toEqual({ root: 'cafe', entries: [], links: [] })
    expect(cache.apps().map((a) => a.app)).toEqual(['Bakery'])
  })

  test('a file from before versions keeps each screen\'s pick, and drops what only other variants reached', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uxwoz-'))
    const file = join(dir, 'cache.json')
    const c = (html: string, extra = {}) => ({ ...ver(html), letter: 'A', ...extra })
    writeFileSync(file, JSON.stringify({
      entries: [
        { key: 'cafe', app: 'Cafe', action: null, chosen: 1, level: 1, parent: null, candidates: [c('<h1>A</h1>'), c('<h1>B</h1><meta name="idea" content="Big list">', { alternative: true })] },
        { key: 'cafe » cart', app: 'Cafe', action: 'Cart', chosen: 0, level: 2, parent: { key: 'cafe', variant: 1, label: 'Cart' }, candidates: [c('<h1>Cart</h1>', { deleted: true, html: '' }), c('<h1>Cart 2</h1>')] },
        { key: 'cafe » help', app: 'Cafe', action: 'Help', chosen: 0, level: 2, parent: { key: 'cafe', variant: 0, label: 'Help' }, candidates: [c('<h1>Help</h1>')] },
        { key: 'cafe » faq', app: 'Cafe', action: 'FAQ', chosen: 0, level: 3, parent: { key: 'cafe » help', variant: 0, label: 'FAQ' }, candidates: [c('<h1>FAQ</h1>')] },
        { key: 'cafe » pay', app: 'Cafe', action: 'Pay', chosen: 0, level: 3, parent: { key: 'cafe » help', variant: 0, label: 'Pay' }, candidates: [c('<h1>Pay</h1>')] },
      ],
      links: [
        { from: 'cafe', variant: 0, to: 'cafe » help', label: 'Help', createdAt: '2026-10-23T00:00:00Z' },
        { from: 'cafe » cart', variant: 1, to: 'cafe » pay', label: 'Pay now', createdAt: '2026-10-24T00:00:00Z' },
        { from: 'cafe » cart', variant: 0, to: 'cafe » faq', label: 'FAQ', createdAt: '2026-10-24T00:00:00Z' },
      ],
      letters: { 'cafe\n1': 2 },
    }))
    const cache = new ScreenCache(file)
    expect(existsSync(`${file}.before-versions`)).toBe(true)
    const map = cache.map('Cafe')
    // Help came from variant A, which was not picked; Pay is still reached from Cart's pick.
    expect(map.entries.map((e) => e.key).sort()).toEqual(['cafe', 'cafe » cart', 'cafe » pay'])
    expect(cache.get('cafe')!.versions).toEqual([{ ...ver('<h1>B</h1><meta name="idea" content="Big list">'), idea: 'Big list' }])
    expect(cache.get('cafe » cart')).toMatchObject({ parent: { key: 'cafe', label: 'Cart' }, versions: [{ html: '<h1>Cart 2</h1>' }] })
    expect(cache.get('cafe » pay')).toMatchObject({ level: 3, parent: { key: 'cafe » cart', label: 'Pay now' } })
    expect(map.links).toEqual([{ from: 'cafe » cart', to: 'cafe » pay', label: 'Pay now', createdAt: '2026-10-24T00:00:00Z' }])
    // The new file loads as it is.
    expect(new ScreenCache(file).map('Cafe')).toEqual(map)
  })

  test('a file from before links existed still loads', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    writeFileSync(file, JSON.stringify([{ key: 'cafe', app: 'Cafe', action: null, chosen: 0, candidates: [ver('<h1>Menu</h1>')] }]))
    const cache = new ScreenCache(file)
    expect(cache.map('Cafe').entries).toHaveLength(1)
    expect(cache.map('Cafe').links).toEqual([])
  })

  test('a cache file survives a restart, open A OR B included', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const cache = new ScreenCache(file)
    const menu = screen(cache, 'Coffee app', null, '<h1>Menu</h1>')
    cache.propose('Coffee app', 'Cart', 1, ver('<h1>Cart</h1>'), { key: menu.key, label: 'Cart' })
    const again = new ScreenCache(file)
    expect(again.get(menu.key)?.versions[0]?.html).toBe('<h1>Menu</h1>')
    expect(again.get(screenKey('coffee app', 'cart'))?.proposals).toEqual([null, ver('<h1>Cart</h1>')])
  })
})
