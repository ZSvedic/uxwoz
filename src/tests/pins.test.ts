// The pins' helpers: the anchor a comment sends its frame, and the pin numbers of a screen's comments.
import { expect, test } from 'bun:test'
import type { Feedback } from '@uxwoz/core'
import { anchorOf, dayOf, inLayer, numbered, partLabel, playerFit, SHARE_REFRESH_MS, trailOf, whereOf, whileOpen } from '../packages/web/src/pins.ts'

const f = (id: string, at: string, more: Partial<Feedback> = {}): Feedback =>
  ({ id, at, visitor: 'v', name: 'Ana', screen: 's', title: 'Home', kind: 'comment', text: id, ...more })

test('an anchor is the part\'s words, tag and place; a whole-screen comment has none', () => {
  expect(anchorOf(f('a', '1', { about: 'Save', tag: 'button', nth: 2 }))).toEqual({ id: 'a', text: 'Save', tag: 'button', nth: 2 })
  expect(anchorOf(f('b', '1', { about: 'Save' }))).toEqual({ id: 'b', text: 'Save', tag: '', nth: 0 })
  expect(anchorOf(f('c', '1'))).toBeNull()
})

test('the open comments count 1, 2, 3 by time; resolved ones and thumbs get no number', () => {
  const list = [f('late', '2026-11-03'), f('thumb', '2026-11-01', { kind: 'thumb', up: true }), f('first', '2026-11-01'),
    f('done', '2026-11-02', { resolved: '2026-11-04' }), f('old', '2026-11-02T01', { kind: 'dead', label: 'Pair' })]
  expect(numbered(list).map((x) => [x.f.id, x.n])).toEqual([['first', 1], ['done', null], ['old', 2], ['late', 3]])
})

test('a part\'s label has one space between words and is cut at about 40 characters', () => {
  expect(partLabel('  Desk 1\n Desk 2   Desk 3 ')).toBe('Desk 1 Desk 2 Desk 3')
  const long = partLabel('Desk 1 Desk 2 Desk 3 Desk 4 Desk 5 Desk 6 Desk 7 Desk 8')
  expect(long.length).toBeLessThanOrEqual(40)
  expect(long).toBe('Desk 1 Desk 2 Desk 3 Desk 4 Desk 5 Desk…')
  expect(whereOf(f('a', '1', { about: 'x'.repeat(60) }))).toBe(`${'x'.repeat(39)}…`)
})

test('the trail shows only once it says more than the name; a link\'s day reads "Nov 12"', () => {
  expect(trailOf(['home'])).toEqual([])
  expect(trailOf(['home', 'stats'])).toEqual(['home', 'stats'])
  const now = new Date('2026-11-12T15:00:00')
  expect(dayOf('2026-11-12T12:01:00', now)).toBe('Nov 12')
  expect(dayOf('2025-03-04T12:01:00', now)).toBe('Mar 4, 2025')
})

test('the Share pane reads its list again only while it is open', () => {
  let open = false, loads = 0
  const tick = whileOpen(() => open, () => { loads++ })
  tick()
  open = true
  tick(); tick()
  expect(loads).toBe(2)
  expect(SHARE_REFRESH_MS).toBe(10_000)
})

test('a pin hides while its part is scrolled outside the frame\'s view, and shows when any of it is inside', () => {
  const spot = (y: number, h = 40) => ({ id: 'a', x: 10, y, w: 100, h })
  expect(inLayer(spot(100), 360, 500)).toBe(true)
  expect(inLayer(spot(480), 360, 500)).toBe(true) // half in view at the bottom
  expect(inLayer(spot(-30), 360, 500)).toBe(true) // half in view at the top
  expect(inLayer(spot(-40), 360, 500)).toBe(false) // scrolled above the frame
  expect(inLayer(spot(500), 360, 500)).toBe(false) // still below it
  expect(inLayer({ id: 'b', x: 400, y: 10, w: 20, h: 20 }, 360, 500)).toBe(false)
})

test('the player\'s frame has the mock\'s size, old sizes too, and a mock wider than the window shrinks to fit', () => {
  expect(playerFit('small-phone', 1248)).toEqual({ w: 360, h: 500, k: 1 })
  expect(playerFit('laptop', 1248)).toEqual({ w: 1280, h: 560, k: 1248 / 1280 })
  expect(playerFit('laptop', 358).k).toBeCloseTo(358 / 1280)
  expect(playerFit('phone', 1000)).toEqual({ w: 390, h: 844, k: 1 })
  expect(playerFit('desktop', 512)).toEqual({ w: 1024, h: 768, k: 0.5 })
  expect(playerFit(undefined, 1000)).toEqual({ w: 800, h: 800, k: 1 })
})
