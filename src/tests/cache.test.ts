import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALTERNATIVE_REQUEST, ScreenCache, drawRequest, editRequest, isBack, nameFrom, normalizePrompt, paperText, screenIdea, screenKey, screenTree, type Paper, type Version } from '@uxwoz/core'

const ver = (html: string, createdAt = '2026-10-23T00:00:00Z'): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt,
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop',
})

/** A picked screen: one side proposed, then picked. */
function screen(cache: ScreenCache, app: string, action: string | null, html: string, parent: { key: string; label: string } | null = null, at?: string) {
  const e = cache.propose(app, action && `@${nameFrom(action)}: ${action}`, 0, ver(html, at), parent)!
  return cache.pick(e.key, 0)!
}

describe('screen cache', () => {
  test('a key is the normalized product prompt, plus the name of a screen opened by name', () => {
    expect(normalizePrompt('  A Coffee   shop app!! ')).toBe('a coffee shop app')
    expect(screenKey('Coffee app!', '@cart: Show the cart')).toBe('coffee app » @cart')
    expect(screenKey('Coffee app', '@Cart')).toBe(screenKey('coffee app', '@cart: other words'))
  })

  test('a new screen holds both sides until a pick keeps one as its first version', () => {
    const cache = new ScreenCache()
    const e = cache.propose('Coffee app', null, 1, ver('<h1>B</h1>'))!
    expect(e).toMatchObject({ versions: [], proposals: [null, { html: '<h1>B</h1>' }] })
    expect(e.name).toBe('home')
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
    const open = cache.propose('Cafe', '@cart', 0, ver('<h1>c</h1>'), { key, label: 'Cart' })!
    expect(cache.addVersion(open.key, ver('<h1>x</h1>'))).toBeUndefined()
  })

  test('"home" and "@home" as an action mean the first screen; words with no @ open no screen', () => {
    expect(screenKey('Coffee app', 'Home')).toBe(screenKey('Coffee app', '@home: start'))
    expect(new ScreenCache().propose('Coffee app', 'home', 0, ver('<h1>Menu</h1>'))!.action).toBeNull()
    expect(new ScreenCache().propose('Coffee app', 'Show the cart', 0, ver('<h1>Cart</h1>'))).toBeUndefined()
  })

  test('the paper lists the app, its device, the titles and lines, and the three boxes in full', () => {
    const p: Paper = {
      app: 'Coffee app', device: 'phone', titles: ['home: the first screen', 'cart: the cart (no drawing yet)'], lines: ['home -> cart'],
      components: [{ id: 'tab-bar', where: 'every screen', html: '<nav>…</nav>' }], rules: [{ id: 'prices', text: 'Prices show in euros.' }],
      data: [{ id: 'drinks', columns: ['name', 'price'], rows: [['Latte', '3.20']] }],
    }
    expect(paperText(p)).toBe(['App: Coffee app', 'Device: a phone screen, 390 px wide.', '',
      'Screens, the first screen first (id: what it is for):', 'home: the first screen', 'cart: the cart (no drawing yet)', '',
      'Lines (a control on the first screen opens the second):', 'home -> cart', '',
      'Components (1 of 20), each with its ID, where it belongs, and its HTML:', 'tab-bar: every screen', '<nav>…</nav>', '',
      'Rules (1 of 20):', 'prices: Prices show in euros.', '',
      'Data (1 of 10 tables):', 'drinks', 'name | price', 'Latte | 3.20'].join('\n'))
    expect(paperText({ ...p, titles: [], lines: [], components: [], rules: [], data: [] })).toContain('Rules (0 of 20):\n(none)')
  })

  test('a Draw sends the paper, the screen the click came from and the screen to draw; one side asks for a different design', () => {
    const p: Paper = { app: 'Coffee app', titles: [], lines: [], components: [], rules: [], data: [] }
    const from = { id: 'home', line: 'the first screen', html: '<h1>Menu</h1>', label: 'Cart' }
    const msg = drawRequest(p, { id: 'cart', line: 'the cart' }, from, true)
    expect(msg).toEndWith(`The screen the click came from, home (the first screen):\n<h1>Menu</h1>\n\nDraw this screen: cart: the cart\nThe click came from "Cart" on home.\n\n${ALTERNATIVE_REQUEST}`)
    expect(drawRequest(p, { id: 'home', line: 'the first screen' }, null)).toEndWith('(none)\n\nDraw this screen: home: the first screen')
  })

  test('an Edit sends the screen or component as it is now and the change, last', () => {
    const p: Paper = { app: 'Coffee app', titles: [], lines: [], components: [], rules: [], data: [] }
    expect(editRequest(p, { id: 'home', line: 'the first screen', html: '<h1>Menu</h1>' }, 'Add prices'))
      .toMatch(/The screen as it is now, home \(the first screen\):\n<h1>Menu<\/h1>\n\nReply with the HTML of this screen again with one change;.* The change: Add prices$/)
    expect(editRequest(p, { id: 'tab-bar', line: 'every screen', html: '<nav></nav>' }, 'Bigger', true)).toContain('The component as it is now, tab-bar')
  })

  test('only the action back goes back; a label never decides where a click goes', () => {
    expect(isBack('back')).toBe(true)
    expect(isBack(' Back. ')).toBe(true)
    expect(isBack('@home')).toBe(false)
    expect(isBack('Back to cats')).toBe(false)
  })

  test('the idea is read from its meta tag', () => {
    expect(screenIdea('<title>Home</title><meta name="idea" content="One big  button &amp; a list">')).toBe('One big button & a list')
    expect(screenIdea("<meta name='idea' content='Cards first'>")).toBe('Cards first')
    expect(screenIdea('<h1>No idea</h1>')).toBe('')
  })

  test('a new screen takes its parent from the click, only from a picked screen of the same mockup', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>')
    const cart = screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu.key, label: 'Cart' })
    expect(cart.parent).toEqual({ key: menu.key, label: 'Cart' })
    const tea = screen(cache, 'Tea', null, '<h1>T</h1>')
    expect(cache.propose('Cafe', '@x', 0, ver('<h1>x</h1>'), { key: tea.key, label: 'x' })!.parent).toBeNull()
    const open = cache.propose('Cafe', '@help', 0, ver('<h1>h</h1>'), { key: menu.key, label: 'Help' })!
    expect(cache.propose('Cafe', '@y', 0, ver('<h1>y</h1>'), { key: open.key, label: 'y' })!.parent).toBeNull()
  })

  test('the cache serves one mockup at a time', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>').key
    const cart = screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu, label: 'Cart' }).key
    screen(cache, 'Bakery', null, '<h1>Bread</h1>')
    expect(cache.map('cafe').entries.map((e) => e.key)).toEqual([menu, cart])
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

  test('deleting a screen takes the screens only it reached; one a button elsewhere reaches stays, under that screen', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<title>Menu</title>').key
    const cart = screen(cache, 'Cafe', 'Cart', '<title>Cart</title>', { key: menu, label: 'Cart' }).key
    const pay = screen(cache, 'Cafe', 'Pay', '<title>Pay</title>', { key: cart, label: 'Pay' }).key
    const help = screen(cache, 'Cafe', 'Help', '<title>Help</title>', { key: cart, label: 'Help' }).key
    const faq = screen(cache, 'Cafe', 'FAQ', '<title>FAQ</title>', { key: help, label: 'FAQ' }).key
    // The first screen links to Help too, by its name.
    cache.addVersion(menu, ver('<title>Menu</title><button data-action="@help">Help</button>'))
    expect(cache.delete(cart)!.sort()).toEqual([cart, pay].sort())
    expect(cache.get(help)!.parent).toEqual({ key: menu, label: 'Help' })
    expect(screenTree(cache.map('Cafe').entries).get(faq)).toEqual({ level: 3, parent: help, label: 'FAQ' })
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

  test('deleting a mockup removes all its screens, and no other', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<h1>Menu</h1>').key
    screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: menu, label: 'Cart' })
    screen(cache, 'Bakery', null, '<h1>Bread</h1>')
    expect(cache.deleteApp('CAFE')).toBe(2)
    expect(cache.map('Cafe').entries).toEqual([])
    expect(cache.apps().map((a) => a.app)).toEqual(['Bakery'])
  })

  test('a file from before names (format 2, or before versions) is moved aside, and the cache starts empty', () => {
    for (const data of [{ entries: [{ key: 'cafe', app: 'Cafe', action: null, chosen: 0, candidates: [ver('<h1>Menu</h1>')] }], links: [] },
      { version: 2, entries: [{ key: 'cafe', app: 'Cafe', action: null, level: 1, parent: null, versions: [ver('<h1>Menu</h1>')] }] }]) {
      const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
      writeFileSync(file, JSON.stringify(data))
      expect(new ScreenCache(file).size).toBe(0)
      expect(existsSync(`${file}.before-names`)).toBe(true)
    }
  })

  test('a file from a newer app is left alone, and nothing is saved', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const text = JSON.stringify({ version: 99, entries: [] })
    writeFileSync(file, text)
    const cache = new ScreenCache(file)
    expect(cache.warning).toContain('newer version')
    screen(cache, 'Cafe', null, '<h1>Menu</h1>')
    expect(readFileSync(file, 'utf8')).toBe(text)
  })

  test('format 3 and 4 files load with empty boxes; the spec feature\'s fields go at the next save', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const entry = { key: 'cafe', app: 'Cafe', action: null, name: 'home', parent: null, versions: [{ ...ver('<h1>Menu</h1>'), spec: {}, misses: [], plan: 'x' }] }
    for (const version of [3, 4]) {
      writeFileSync(file, JSON.stringify({ version, entries: [entry], specs: { cafe: {} }, reviews: { cafe: {} } }))
      const cache = new ScreenCache(file)
      expect(cache.get('cafe')?.versions[0]?.html).toBe('<h1>Menu</h1>')
      expect(cache.boxesOf('Cafe')).toMatchObject({ rules: [], data: [] })
      screen(cache, 'Cafe', 'Cart', '<h1>Cart</h1>', { key: 'cafe', label: 'Cart' })
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      expect(Object.keys(saved)).toEqual(['version', 'entries', 'boxes'])
      expect(Object.keys(saved.entries[0].versions[0])).not.toContain('spec')
      expect(Object.keys(saved.entries[0].versions[0])).not.toContain('plan')
    }
  })

  test('a cache file survives a restart, open A OR B included', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    const cache = new ScreenCache(file)
    const menu = screen(cache, 'Coffee app', null, '<h1>Menu</h1>')
    cache.propose('Coffee app', '@cart', 1, ver('<h1>Cart</h1>'), { key: menu.key, label: 'Cart' })
    const again = new ScreenCache(file)
    expect(again.get(menu.key)?.versions[0]?.html).toBe('<h1>Menu</h1>')
    expect(again.get(screenKey('coffee app', '@cart'))?.proposals).toEqual([null, ver('<h1>Cart</h1>')])
  })
})
