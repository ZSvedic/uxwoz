// The tree of a mockup: levels are the fewest clicks from the first screen, worked out from the screens.
import { expect, test } from 'bun:test'
import { ScreenCache, linksIn, nameFrom, screenTree, treeLines, uniqueName, type Version } from '@uxwoz/core'

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
  const home = screen(cache, null, '<title>Home</title><button data-action="Record sleep">Record</button>')
  const record = screen(cache, 'Record sleep', '<title>Recording</title>', home.key, 'Record')
  const report = screen(cache, 'Sleep report of last night', '<title>Sleep report</title>', record.key, 'Report')
  const settings = screen(cache, 'Settings', '<title>Settings</title>', home.key, 'Settings')
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
  cache.addVersion(home.key, ver('<title>Home</title><button data-action="Record sleep">Record</button><button data-action="@sleep-report">Last night</button>'))
  expect(levels()).toEqual([1, 2, 2, 2])
  expect(screenTree(cache.map('Sleep app').entries).get(report.key)).toEqual({ level: 2, parent: home.key, label: 'Last night' })
  cache.undo(home.key)
  expect(levels()).toEqual([1, 2, 3, 2])
})

test('a link by the prompt a screen was made from counts too; an unknown @name and back do not', () => {
  const { cache, settings, levels } = sleepApp()
  cache.addVersion(settings.key, ver('<button data-action="Sleep report of last night">Report</button><button data-action="@nothing">x</button><button data-action="back">Back</button>'))
  expect(levels()).toEqual([1, 2, 3, 2])
})

test('of two shortest paths, a screen hangs under the screen that made it', () => {
  const { cache, home, record, report } = sleepApp()
  const other = screen(cache, 'History', '<button data-action="@sleep-report">Report</button>', home.key, 'History')
  const t = screenTree(cache.map('Sleep app').entries)
  expect(t.get(report.key)).toMatchObject({ level: 3, parent: record.key })
  expect(t.get(other.key)?.level).toBe(2)
})

test('the model gets the picked screens as an indented tree of names', () => {
  const { cache } = sleepApp()
  cache.propose('Sleep app', 'Open choice', 0, ver('<h1>x</h1>'), { key: 'sleep app', label: 'x' })
  expect(treeLines(cache.map('Sleep app').entries)).toEqual([
    '@home: the first screen of Sleep app',
    '  @recording: Record sleep',
    '    @sleep-report: Sleep report of last night',
    '  @settings: Settings',
  ])
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

test('names drop filler words and apostrophes; a name that is taken comes from the prompt first', () => {
  expect(nameFrom("Mochi's profile")).toBe('mochis-profile')
  expect(nameFrom('Settings screen of a cat app')).toBe('settings-cat')
  expect(uniqueName('notes', new Set(['notes']), 'Meeting notes for the Q3 review')).toBe('meeting-notes-q3-review')
  expect(uniqueName('notes', new Set(['notes', 'notes-from-q3']), 'Notes from Q3')).toBe('notes-2')
})

test('a long tree drops its deepest levels first', () => {
  const cache = new ScreenCache()
  const home = screen(cache, null, '<title>Home</title>')
  let deep = home.key
  for (const t of ['One', 'Two', 'Three']) deep = screen(cache, `Level ${t}`, `<title>${t}</title>`, deep, t).key
  screen(cache, 'Side section', '<title>Side</title>', home.key, 'Side')
  expect(treeLines(cache.map('Sleep app').entries, 3)).toEqual(['@home: the first screen of Sleep app', '  @one: Level One', '  @side: Side section'])
})
