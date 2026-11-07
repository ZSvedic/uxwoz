// The tree of a mockup: levels are the fewest clicks from the first screen, worked out from the screens.
import { expect, test } from 'bun:test'
import { ScreenCache, linksIn, nameFrom, plannedScreens, screenKey, screenList, screenTree, uniqueName, type Version } from '@uxwoz/core'

const ver = (html: string): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-05T00:00:00Z',
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop',
})

function screen(cache: ScreenCache, action: string | null, html: string, from: string | null = null, label = '') {
  const e = cache.propose('Sleep app', action, 0, ver(html), from ? { key: from, label } : null)!
  return cache.pick(e.key, 0)!
}

/** Home → Record → Report, and Home → Settings. */
function sleepApp() {
  const cache = new ScreenCache()
  const home = screen(cache, null, '<title>Home</title><button data-action="@recording">Record</button>')
  const record = screen(cache, '@recording: Record sleep', '<title>Recording</title>', home.key, 'Record')
  const report = screen(cache, '@sleep-report: Sleep report of last night', '<title>Sleep report</title>', record.key, 'Report')
  const settings = screen(cache, '@settings: Settings', '<title>Settings</title>', home.key, 'Settings')
  const levels = () => {
    const t = screenTree(cache.map('Sleep app').entries)
    return [home, record, report, settings].map((e) => t.get(e.key)?.level)
  }
  return { cache, home, record, report, settings, levels }
}

test('controls with an action prompt are found with their words', () => {
  expect(linksIn('<button data-action="@report" class="x">See <b>report</b></button><a href="#" data-action=\'Help &amp; FAQ\'>Help</a><p>no</p>'))
    .toEqual([{ action: '@report', label: 'See report' }, { action: 'Help & FAQ', label: 'Help' }])
  expect(linksIn('<button aria-label="Back" data-action="back">←</button>')).toEqual([{ action: 'back', label: 'Back' }])
  expect(nameFrom('Sleep report')).toBe('sleep-report')
  expect(nameFrom('Café — Menü!')).toBe('cafe-menu')
})

test('a level is the fewest clicks from the first screen, and follows an Edit and its Undo', () => {
  const { cache, home, report, levels } = sleepApp()
  expect(levels()).toEqual([1, 2, 3, 2])
  // An Edit adds a direct link from Home to the report: it is one click away now.
  cache.addVersion(home.key, ver('<title>Home</title><button data-action="@recording">Record</button><button data-action="@sleep-report">Last night</button>'))
  expect(levels()).toEqual([1, 2, 2, 2])
  expect(screenTree(cache.map('Sleep app').entries).get(report.key)).toEqual({ level: 2, parent: home.key, label: 'Last night' })
  cache.undo(home.key)
  expect(levels()).toEqual([1, 2, 3, 2])
})

test('words with no @, an unknown @name and back are no links in the tree', () => {
  const { cache, home, levels } = sleepApp()
  cache.addVersion(home.key, ver('<button data-action="@recording">R</button><button data-action="Sleep report of last night">Report</button><button data-action="@nothing">x</button><button data-action="back">Back</button>'))
  expect(levels()).toEqual([1, 2, 3, 2])
})

test('of two shortest paths, a screen hangs under the screen that made it', () => {
  const { cache, home, record, report } = sleepApp()
  const other = screen(cache, '@history: History', '<button data-action="@sleep-report">Report</button>', home.key, 'History')
  const t = screenTree(cache.map('Sleep app').entries)
  expect(t.get(report.key)).toMatchObject({ level: 3, parent: record.key })
  expect(t.get(other.key)?.level).toBe(2)
})

test('the paper lists the screens as titles in tree order, and a line for each link between two of them', () => {
  const { cache, home } = sleepApp()
  cache.addVersion(home.key, ver('<button data-action="@recording">R</button><button data-action="@settings">S</button><button data-action="@tips: Sleep tips">T</button>'))
  expect(screenList(cache.map('Sleep app').entries)).toEqual({
    titles: ['home: the first screen', 'recording: Record sleep', 'sleep-report: Sleep report of last night', 'settings: Settings', 'tips: Sleep tips (no drawing yet)'],
    lines: ['home -> recording', 'home -> settings', 'home -> tips'],
  })
})

test('a component is no screen: its links count on each screen that pastes it', () => {
  const { cache, home, settings, levels } = sleepApp()
  const bar = cache.addComponent('Sleep app', 'tab-bar', 'every main screen', ver('<nav><a data-action="@sleep-report">Report</a></nav>'), 'user')
  expect(typeof bar).toBe('object')
  cache.addVersion(settings.key, ver('<title>Settings</title><div data-component="tab-bar"></div>'))
  expect(levels()).toEqual([1, 2, 3, 2])
  cache.addVersion(home.key, ver('<button data-action="@recording">R</button><div data-component="tab-bar"></div>'))
  expect(levels()).toEqual([1, 2, 2, 2])
  const all = cache.map('Sleep app').entries
  expect(screenTree(all).has((bar as { key: string }).key)).toBe(false)
  expect(screenList(all).lines).toEqual(['home -> recording', 'home -> sleep-report', 'settings -> sleep-report'])
  expect(cache.find('Sleep app', '@tab-bar')).toBeUndefined()
})

test('links are found in nested controls, with > in a quoted attribute, and in self-closing and void tags', () => {
  const html = '<div data-action="Details"><b>Latte</b><button data-action="Cart">Add</button></div>'
    + '<button onclick="if(n>0)go()" data-action="Pay">Pay</button><span data-action="@home"/><a data-action="Help">Help</a>'
    + '<input type="submit" value="Send" data-action="Sent">'
  expect(linksIn(html)).toEqual([
    { action: 'Details', label: 'Latte Add' }, { action: 'Cart', label: 'Add' }, { action: 'Pay', label: 'Pay' },
    { action: '@home', label: '' }, { action: 'Help', label: 'Help' }, { action: 'Sent', label: 'Send' },
  ])
})

test('names drop filler words and apostrophes; a taken name gets a number', () => {
  expect(nameFrom("Mochi's profile")).toBe('mochis-profile')
  expect(nameFrom('Settings screen of a cat app')).toBe('settings-cat')
  expect(uniqueName('notes', new Set(['notes', 'notes-2']))).toBe('notes-3')
})

test('a link names its screen: one not made yet is planned, in the tree, and goes with its last link', () => {
  const { cache, home, record } = sleepApp()
  cache.addVersion(home.key, ver('<title>Home</title><button data-action="@recording">Record</button>'
    + '<button data-action="@remedies-log: Remedies tried, with dates and effects">Remedies</button><button data-action="@tips">Tips</button>'))
  cache.addVersion(record.key, ver('<title>Recording</title><button data-action="@remedies-log: Every remedy ever tried">All remedies</button>'))
  const planned = plannedScreens(cache.map('Sleep app').entries)
  expect(planned.map((p) => [p.name, p.action, p.parent!.key])).toEqual([
    ['remedies-log', 'Remedies tried, with dates and effects', home.key], ['tips', 'The tips screen', home.key],
  ])
  expect(planned[0]!.key).toBe(screenKey('Sleep app', '@remedies-log'))
  expect(screenTree(cache.map('Sleep app').entries).get(planned[0]!.key)).toEqual({ level: 2, parent: home.key, label: 'Remedies' })
  expect(screenList(cache.map('Sleep app').entries).titles).toContain('remedies-log: Remedies tried, with dates and effects (no drawing yet)')
  cache.undo(home.key)
  expect(plannedScreens(cache.map('Sleep app').entries).map((p) => [p.name, p.parent!.key])).toEqual([['remedies-log', record.key]])
})

test('a screen opened by name keeps that name, and every link with the name finds it', () => {
  const { cache, home } = sleepApp()
  const e = cache.propose('Sleep app', '@remedies-log: Remedies tried', 0, ver('<title>Remedy history</title>'), { key: home.key, label: 'Remedies' })!
  expect(e).toMatchObject({ key: 'sleep app » @remedies-log', name: 'remedies-log', action: 'Remedies tried' })
  expect(cache.pick(e.key, 0)!.name).toBe('remedies-log')
  expect(cache.find('Sleep app', '@Remedies-Log: other words')?.key).toBe(e.key)
  expect(cache.find('Sleep app', '@sleep-report')?.name).toBe('sleep-report')
  expect(cache.find('sleep app', '@home: start')?.key).toBe('sleep app')
  expect(cache.propose('Sleep app', '@remedies-log', 1, ver('<h1>x</h1>'))).toBeUndefined() // picked already
})

test('deleting a named screen that is still linked takes the screens only it leads to; it is planned again', () => {
  const cache = new ScreenCache()
  const home = screen(cache, null, '<title>Shop</title><button data-action="@settings: Settings">Settings</button>')
  const settings = cache.pick(cache.propose('Sleep app', '@settings: Settings', 0, ver('<title>Settings</title><button data-action="@privacy: Privacy">Privacy</button>'), { key: home.key, label: 'Settings' })!.key, 0)!
  const privacy = cache.pick(cache.propose('Sleep app', '@privacy: Privacy', 0, ver('<title>Privacy</title>'), { key: settings.key, label: 'Privacy' })!.key, 0)!
  expect(cache.delete(settings.key)).toEqual([settings.key, privacy.key])
  expect(plannedScreens(cache.map('Sleep app').entries).map((p) => p.name)).toEqual(['settings'])
})
