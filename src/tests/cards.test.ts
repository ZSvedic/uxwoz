// The cards a mock or a box flips to, worked out with no page (web/src/flip.ts): History's list and its marks, when
// Undo and Redo are live, when 🎲 asks for new words, Info's fields, each box's buttons.
import { describe, expect, test } from 'bun:test'
import type { Boxes, CacheEntry, Version } from '@uxwoz/core'
import {
  ago, anotherAsks, boxButtons, boxFields, boxRows, boxUndoLive, componentFields, mockFields, pressedOf, redoAt, titleOf, undoLive, versionRows,
} from '../packages/web/src/flip.ts'

const NOW = Date.parse('2026-11-24T12:00:00Z')
const v = (min: number, more: Partial<Version> = {}): Version => ({
  html: '<h1>x</h1>', model: 'claude-haiku-5.5', servedModel: null, createdAt: new Date(NOW - min * 60_000).toISOString(),
  costUsd: 0.001, costEstimated: false, firstChunkMs: 400, totalMs: 2900, finishReason: 'stop', ...more,
})
const mock = (more: Partial<CacheEntry> = {}): CacheEntry => ({ key: 'plants » @plant-page', app: 'Plants', action: 'A plant\'s page with a care log', name: 'plant-page', parent: { key: 'plants', label: 'Monstera' }, versions: [v(10)], ...more })
const boxes = (more: Partial<Boxes> = {}): Boxes => ({ rules: [], data: [], gone: { components: [], rules: [], data: [] }, ...more })

describe('History', () => {
  test('every version newest first, each with what made it and when, the one showing marked', () => {
    const e = mock({ versions: [v(10), v(9), v(6, { feedback: 'put the care log under the photo' }), v(2, { feedback: 'show the light as three sun icons' })] })
    expect(versionRows(e, NOW).map((r) => [r.label, r.when, r.showing])).toEqual([
      ['Edit: show the light as three sun icons', '2 min ago', true],
      ['Edit: put the care log under the photo', '6 min ago', false],
      ['Another design', '9 min ago', false],
      ['First design', '10 min ago', false],
    ])
  })

  test('after an Undo the newer versions stay in the list above the one showing; new words and the fixer read so', () => {
    const e = mock({ versions: [v(10), v(5, { prompt: 'a camera with one big button' })], redo: [v(3, { feedback: 'paste tab-bar', by: 'fixer' })] })
    expect(versionRows(e, NOW).map((r) => [r.label, r.showing])).toEqual([
      ['Fixer: paste tab-bar', false], ['New words: a camera with one big button', true], ['First design', false],
    ])
  })

  test('Undo is live with a version before the one showing, Redo with one after it, which it shows', () => {
    expect([undoLive(mock()), redoAt(mock())]).toEqual([false, null])
    const after = v(1)
    const e = mock({ versions: [v(10), v(5)], redo: [after, v(0)] })
    expect([undoLive(e), redoAt(e)]).toEqual([true, after.createdAt])
  })

  test('a component\'s first version says where it was taken from', () => {
    const c = mock({ kind: 'component', name: 'tab-bar', versions: [v(8), v(4)] })
    expect(versionRows(c, NOW, 'Home').map((r) => r.label)).toEqual(['Changed by filing', 'Taken from Home'])
  })

  test('a box lists its changes newest first and has Undo only while one can be taken back; the notes list visits', () => {
    const past = [{ what: 'Filing after home', at: new Date(NOW - 90 * 60_000).toISOString() }, { what: 'You changed score-direction', at: new Date(NOW - 30_000).toISOString() }]
    expect(boxRows('rules', boxes(), past, NOW).map((r) => [r.label, r.when])).toEqual([['You changed score-direction', 'just now'], ['Filing after home', '1 h ago']])
    expect([boxUndoLive('rules', boxes(), past), boxUndoLive('rules', boxes(), [])]).toEqual([true, false])
    const visit = (at: string, n: number, more = {}) => ({ at, ms: 1, costUsd: 0, screens: 3, changes: Array.from({ length: n }, () => ({ text: 'x', undo: { drop: 'rules' as const, id: 'a' } })), refused: [], seen: true, ...more })
    const b = boxes({ visits: [visit('2026-11-24T10:00:00Z', 4, { undone: true }), visit('2026-11-24T11:00:00Z', 1, { ask: 'merge the score rules' })] })
    expect(boxRows('notes', b, [], NOW).map((r) => [r.label, !!r.undone])).toEqual([['Edit: merge the score rules, 1 change', false], ['Visit, 4 changes', true]])
    expect(boxUndoLive('notes', b, [])).toBe(true)
    expect(boxUndoLive('notes', boxes({ visits: [visit('2026-11-24T10:00:00Z', 2, { undone: true })] }), [])).toBe(false)
  })

  test('when reads in plain words', () => {
    expect([ago(undefined, NOW), ago(new Date(NOW - 5_000).toISOString(), NOW), ago(new Date(NOW - 3 * 3600_000).toISOString(), NOW)]).toEqual(['', 'just now', '3 h ago'])
  })
})

describe('🎲 Another', () => {
  test('flips to Describe it differently after two designs from the same words; an Edit does not count', () => {
    expect(anotherAsks(mock())).toBe(false)
    expect(anotherAsks(mock({ draws: 1, versions: [v(9), v(5, { feedback: 'x' })] }))).toBe(false)
    expect(anotherAsks(mock({ draws: 2 }))).toBe(true)
    // Its card presses 🎲.
    expect([pressedOf('describe'), pressedOf('edit'), pressedOf(null)]).toEqual(['another', 'edit', null])
    expect(titleOf('describe', 'Monstera')).toBe('Describe it differently')
  })
})

describe('Info', () => {
  test('a mock: exactly Asked for, Drawn as, Link ID, Reached by, Model, Added to the boxes', () => {
    const e = mock({ versions: [v(1, { idea: 'Photo on top, light in one line' })], filed: { at: '', screen: '', ms: 1, costUsd: 0, added: ['light-needs', 'tab-bar'], changed: [], refused: [] } })
    expect(mockFields(e, { name: 'Home', label: 'A plant\'s row' }, () => 'Claude Haiku 5.5')).toEqual([
      ['Asked for', 'A plant\'s page with a care log'],
      ['Drawn as', 'Photo on top, light in one line'],
      ['Link ID', '@plant-page'],
      ['Reached by', 'A plant\'s row in Home'],
      ['Model', 'Claude Haiku 5.5 in 2.9 s for $0.0010'],
      ['Added to the boxes', 'light-needs, tab-bar'],
    ])
  })

  test('Home asks for the project\'s sentence and is reached by nothing; a failed filing says why', () => {
    const home = mock({ key: 'plants', action: null, name: 'home', parent: null, filed: { at: '', screen: '', ms: 1, costUsd: 0, added: [], changed: [], refused: [], error: 'no answer' } })
    const f = Object.fromEntries(mockFields(home, null, (id) => id))
    expect([f['Asked for'], f['Link ID'], f['Reached by'], f['Added to the boxes']]).toEqual(['Plants', '@home', 'Home: the project opens here', 'Filing failed: no answer'])
  })

  test('a component: where it belongs, the mocks that paste it, the mock it was taken from', () => {
    const c = mock({ kind: 'component', name: 'tab-bar', action: 'at the bottom of every mock' })
    expect(componentFields(c, ['Home', 'Schedule'], 'Home')).toEqual([['Where it belongs', 'at the bottom of every mock'], ['Pasted on', 'Home, Schedule'], ['Taken from', 'Home']])
    expect(componentFields(c, [], null)[1]).toEqual(['Pasted on', 'No mock pastes it'])
  })

  test('a box: its count against its limit, the user\'s, the new; the notes: visits kept and mocks before the next', () => {
    const r = (id: string, by: 'user' | 'filing', seen: boolean) => ({ id, text: 'x', by, at: '', seen })
    const f = Object.fromEntries(boxFields('rules', boxes({ rules: [r('a', 'user', true), r('b', 'filing', false), r('c', 'filing', true)] }), [], []))
    expect([f.Rules, f.Yours, f['New since you looked']]).toEqual(['3 of 20', '1', '1'])
    expect(Object.fromEntries(boxFields('data', boxes(), [], []))['Each table']).toBe('at most 6 columns and 8 rows')
    expect(Object.fromEntries(boxFields('notes', boxes({ settled: 7 }), [], []))['Next visit']).toBe('after 3 more mocks')
  })
})

describe('the buttons under a box', () => {
  test('a box\'s own first, then Edit, History, Info; Components has three, which a component current takes as its own', () => {
    const names = (b: ReturnType<typeof boxButtons>) => b.map(([, icon, label]) => `${icon} ${label}`)
    expect(names(boxButtons('rules'))).toEqual(['➕ Add rule', '✏️ Edit', '⏪ History', 'ℹ️ Info'])
    expect(names(boxButtons('data'))).toEqual(['➕ Add table', '✏️ Edit', '⏪ History', 'ℹ️ Info'])
    expect(names(boxButtons('notes'))).toEqual(['▶️ Run fixer', '✏️ Edit', '⏪ History', 'ℹ️ Info'])
    expect(names(boxButtons('components'))).toEqual(['✏️ Edit', '⏪ History', 'ℹ️ Info'])
  })
})
