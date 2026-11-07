import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALTERNATIVE_REQUEST, EDIT_REQUEST, ScreenCache, normalizePrompt, screenIdea, screenKey, screenRequest, screenTree, wayBack, type Version } from '@uxwoz/core'

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
    expect(e).toMatchObject({ versions: [], proposals: [null, { html: '<h1>B</h1>' }] })
    expect(e.name).toBeUndefined()
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

  test('the request lists the picked screens as a tree of names, for links', () => {
    const lines = ['@home: the first screen of Coffee app', '  @cart: Cart']
    expect(screenRequest('Coffee app', 'Pay', lines)).toEndWith('Screens of this mockup, as a tree:\n@home: the first screen of Coffee app\n  @cart: Cart')
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

  test('Back and Home go to screens that exist, whatever prompt the model wrote', () => {
    expect(wayBack('back', 'Return')).toBe('back')
    expect(wayBack('Sleep overview of a snoring tracker app', '← Back')).toBe('back')
    expect(wayBack('Sleep overview of a snoring tracker app', '‹')).toBe('back')
    expect(wayBack('Snoring tracker home screen', ' Home ')).toBe('home')
    expect(wayBack('Cat list of a cat app', 'Back to cats')).toBe('back')
    expect(wayBack('Home screen of a sleep app', '⬅ Back')).toBe('back')
    expect(wayBack('Home screen of a sleep app', 'arrow_back Back')).toBe('back')
    expect(wayBack('Home screen of a sleep app', '«')).toBe('back')
    expect(wayBack('Home screen of a sleep app', '🏠 Home')).toBe('home')
    expect(wayBack('Home screen of a sleep app', 'Back to home')).toBe('home')
    expect(wayBack('Home screen of a sleep app', 'Return to the main menu')).toBe('home')
    expect(wayBack('Settings screen', 'Settings')).toBeNull()
    expect(wayBack('Booking for 2 people', '2 people')).toBeNull()
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
    expect(cache.propose('Cafe', 'X', 0, ver('<h1>x</h1>'), { key: tea.key, label: 'x' })!.parent).toBeNull()
    const open = cache.propose('Cafe', 'Help', 0, ver('<h1>h</h1>'), { key: menu.key, label: 'Help' })!
    expect(cache.propose('Cafe', 'Y', 0, ver('<h1>y</h1>'), { key: open.key, label: 'y' })!.parent).toBeNull()
  })

  test('a pick names the screen from its title, once and uniquely; the first screen is home', () => {
    const cache = new ScreenCache()
    const menu = screen(cache, 'Cafe', null, '<title>Menu</title>')
    expect(menu.name).toBe('home')
    const a = screen(cache, 'Cafe', 'Settings of the cafe', '<title>Settings</title>', { key: menu.key, label: 'Settings' })
    const b = screen(cache, 'Cafe', 'Settings for orders', '<title>Settings</title>', { key: a.key, label: 'Orders' })
    const h = screen(cache, 'Cafe', 'A home page', '<title>Home</title>', { key: a.key, label: 'x' })
    expect([a.name, b.name, h.name]).toEqual(['settings', 'settings-orders', 'home-2'])
    cache.addVersion(a.key, { ...ver('<title>Preferences</title>'), name: 'Preferences' })
    expect(cache.get(a.key)!.name).toBe('settings')
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
    expect(cache.map('Cafe')).toEqual({ root: 'cafe', entries: [] })
    expect(cache.apps().map((a) => a.app)).toEqual(['Bakery'])
  })

  test('a file from before names gets names, and loses its stored levels and clicks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uxwoz-'))
    const file = join(dir, 'cache.json')
    writeFileSync(file, JSON.stringify({
      version: 2,
      entries: [
        { key: 'cafe', app: 'Cafe', action: null, level: 1, parent: null, versions: [{ ...ver('<h1>Menu</h1>'), name: 'Menu' }] },
        { key: 'cafe » cart', app: 'Cafe', action: 'Cart', level: 2, parent: { key: 'cafe', label: 'Cart' }, versions: [{ ...ver('<h1>Cart</h1>'), name: 'Your cart' }] },
        { key: 'cafe » pay', app: 'Cafe', action: 'Pay', level: 2, parent: { key: 'cafe', label: 'Pay' }, versions: [], proposals: [ver('<h1>Pay</h1>'), null] },
      ],
      links: [{ from: 'cafe » cart', to: 'cafe', label: 'Back', createdAt: '2026-10-24T00:00:00Z' }],
    }))
    const cache = new ScreenCache(file)
    expect(cache.map('Cafe').entries.map((e) => [e.name, 'level' in e])).toEqual([['home', false], ['your-cart', false], [undefined, false]])
    expect(new ScreenCache(file).map('Cafe')).toEqual(cache.map('Cafe'))
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(4)
  })

  test('a file from before versions is moved aside, and the cache starts empty', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'uxwoz-')), 'cache.json')
    writeFileSync(file, JSON.stringify({ entries: [{ key: 'cafe', app: 'Cafe', action: null, chosen: 0, candidates: [ver('<h1>Menu</h1>')] }], links: [] }))
    expect(new ScreenCache(file).size).toBe(0)
    expect(existsSync(`${file}.before-versions`)).toBe(true)
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
