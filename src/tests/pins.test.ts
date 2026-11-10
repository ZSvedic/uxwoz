// The pins' helpers: the anchor a comment sends its frame, and the pin numbers of a screen's comments.
import { expect, test } from 'bun:test'
import type { Feedback } from '@uxwoz/core'
import { anchorOf, numbered } from '../packages/web/src/pins.ts'

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
