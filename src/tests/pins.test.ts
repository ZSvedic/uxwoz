// The pins' helpers: the anchor a comment sends its frame, and the pin numbers of a screen's comments.
import { expect, test } from 'bun:test'
import type { Feedback } from '@uxwoz/core'
import { anchorOf, dayOf, numbered, partLabel, SHARE_REFRESH_MS, trailOf, whereOf, whileOpen } from '../packages/web/src/pins.ts'

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
