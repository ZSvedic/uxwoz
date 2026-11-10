// The owner's Comments tab, worked out: which comments a screen shows and in what order, the count, the line for a
// dead control, a comment whose part is gone, and nothing through an edit link.
import { expect, test } from 'bun:test'
import type { Feedback } from '@uxwoz/core'
import { commentRows, openCount, whereOf } from '../packages/web/src/pins.ts'

const f = (id: string, at: string, more: Partial<Feedback> = {}): Feedback =>
  ({ id, at, visitor: 'v', name: 'Ana', screen: 'home', title: 'Home', kind: 'comment', text: id, ...more })

const list = [
  f('late', '2026-11-03', { about: 'Record', tag: 'button' }),
  f('fixed', '2026-11-01', { resolved: '2026-11-04' }),
  f('first', '2026-11-02'),
  f('thumb', '2026-11-01', { kind: 'thumb', up: true }),
  f('other', '2026-11-01', { screen: 'nights' }),
]

test('a screen shows its open comments by pin number, then the resolved ones; no thumbs, no other screens', () => {
  expect(commentRows(list, 'home', null).map((r) => [r.f.id, r.n])).toEqual([['first', 1], ['late', 2], ['fixed', null]])
})

test('the tab counts the open comments', () => {
  expect(openCount(list, 'home')).toBe(2)
  expect(openCount(list, 'nights')).toBe(1)
  expect(openCount(list, 'settings')).toBe(0)
})

test('where a comment is: a part\'s words, the whole screen, or a dead control', () => {
  expect(whereOf(f('a', '1', { about: 'Record' }))).toBe('Record')
  expect(whereOf(f('b', '1'))).toBe('The whole screen')
  expect(whereOf(f('c', '1', { label: 'Pair watch', about: 'Pair watch' }))).toBe('At "Pair watch", not designed yet')
  expect(whereOf(f('d', '1', { kind: 'dead' }))).toBe('At "a control", not designed yet')
})

test('a pinned comment the frame did not find is about an earlier version and has no pin; a found one has its pin', () => {
  const row = (located: Set<string> | null) => commentRows(list, 'home', located).find((r) => r.f.id === 'late')!
  expect([row(null).pin, row(null).earlier]).toEqual([false, false])
  expect([row(new Set(['late'])).pin, row(new Set(['late'])).earlier]).toEqual([true, false])
  expect([row(new Set()).pin, row(new Set()).earlier]).toEqual([false, true])
  // A comment on the whole screen is never about an earlier version, and has no pin.
  const whole = commentRows(list, 'home', new Set()).find((r) => r.f.id === 'first')!
  expect([whole.pin, whole.earlier]).toEqual([false, false])
})

test('through an edit link there are no comments and no count', () => {
  expect(commentRows(list, 'home', new Set(['late']), true)).toEqual([])
  expect(openCount(list, 'home', true)).toBe(0)
})
