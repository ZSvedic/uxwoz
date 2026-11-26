// What a flipped card says (spec/behavior.md, The buttons under a mock, and Boxes): History's list and its marks, when
// Undo and Redo are live, when 🎲 asks for new words, Info's fields, each box's buttons, a box's name, the scroll edges.
// No DOM: cards.ts and boxes.ts draw them.

import { BOX_STATES, LIMITS, VISIT_EVERY, VISITS_KEPT } from '@uxwoz/core/keys'
import type { Boxes, CacheEntry, Past, Version } from '@uxwoz/core'
import type { Box } from './boxes.ts'
import { BOXES } from './bar.ts'

/** The card a mock or a box flips to; `describe` is 🎲's *Describe it differently*. */
export type Tool = 'edit' | 'history' | 'info' | 'describe'

/** A button under a mock or a box: name, icon, label, tooltip. */
export type Button = [string, string, string, string]

export const MOCK_BUTTONS: Button[] = [
  ['another', '🎲', 'Another', 'Another design of this mock, from the same words'],
  ['edit', '✏️', 'Edit', 'Say what should change'],
  ['history', '⏪', 'History', 'Undo, Redo and every version'],
  ['info', 'ℹ️', 'Info', 'What it was asked for and how it was drawn'],
]
const OWN: Partial<Record<Box, Button>> = {
  rules: ['add', '➕', 'Add rule', 'Add an empty rule at the end'],
  data: ['add', '➕', 'Add table', 'Add a table with only its name'],
  notes: ['visit', '▶️', 'Run fixer', 'Ask the fixer to visit now'],
}

/** A box's buttons: its own first (none for Components), then Edit, History and Info; a component current in its box
 *  has the three as its own. */
export function boxButtons(box: Box): Button[] {
  const own = OWN[box]
  return [...own ? [own] : [], ...MOCK_BUTTONS.slice(1)]
}

/** The button that shows pressed (dark) while a card is flipped: *Describe it differently* is 🎲's. */
export const pressedOf = (tool: Tool | null) => (tool === 'describe' ? 'another' : tool)

/** 🎲 after two designs from the same words asks for new words; an Edit does not count. */
export const anotherAsks = (e: CacheEntry) => (e.draws ?? 1) >= 2

/** How long ago, in words: *just now*, *6 min ago*, *2 h ago*, else the day. */
export function ago(at: string | undefined, now = Date.now()): string {
  if (!at) return ''
  const s = (now - Date.parse(at)) / 1000
  if (!(s >= 0)) return new Date(at).toLocaleDateString()
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export interface Row { label: string; when: string; at: string; showing: boolean; undone?: boolean }

/** A version's words in History. */
function versionLabel(e: CacheEntry, v: Version, first: boolean, from?: string): string {
  if (v.feedback) return `${v.by === 'fixer' ? 'Fixer' : 'Edit'}: ${v.feedback}`
  if (v.prompt) return `New words: ${v.prompt}`
  if (e.kind === 'component') return first ? (from ? `Taken from ${from}` : 'Added') : 'Changed by filing'
  return first ? 'First design' : 'Another design'
}

/** A mock's or a component's History: every version, newest first, the one showing marked. `from`: the name of the
 *  mock a component was taken from. */
export function versionRows(e: CacheEntry, now = Date.now(), from?: string): Row[] {
  const showing = e.versions.at(-1)
  return [...e.versions, ...e.redo ?? []].map((v, i) => ({ label: versionLabel(e, v, i === 0, from), at: v.createdAt, when: ago(v.createdAt, now), showing: v === showing })).reverse()
}

/** Undo has a version before the one showing; Redo one after it, which it shows (`at`). */
export const undoLive = (e: CacheEntry) => e.versions.length > 1
export const redoAt = (e: CacheEntry) => e.redo?.[0]?.createdAt ?? null

/** A box's History: the changes Undo can take back, newest first; the fixer's notes list its visits, undone ones struck. */
export function boxRows(box: Box, b: Boxes, past: Past[], now = Date.now()): Row[] {
  if (box === 'notes') return [...b.visits ?? []].reverse().map((x) => ({
    label: `${x.ask ? `Edit: ${x.ask}` : 'Visit'}, ${x.error ? 'failed' : `${x.changes.length} change${x.changes.length === 1 ? '' : 's'}`}`,
    at: x.at, when: ago(x.at, now), showing: false, undone: !!x.undone,
  }))
  return [...past].reverse().map((x) => ({ label: x.what, at: x.at ?? '', when: ago(x.at, now), showing: false }))
}

/** True when Undo of the fixer's notes has a visit to undo. */
export const visitToUndo = (boxes: Boxes) => !!boxes.visits?.some((x) => !x.undone && x.changes.some((c) => c.undo && !c.undone))

/** A box's Undo is live: a change to take back (for the notes, a visit not undone). */
export const boxUndoLive = (box: Box, b: Boxes, past: Past[]) => (box === 'notes' ? visitToUndo(b) : past.length > 0)

export type Fields = [string, string][]

const fmtS = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const fmtUsd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`

/** A mock's Info: Asked for, Drawn as, Link ID, Reached by, Model, Added to the boxes. `parent`: its tree parent's name
 *  and the click's words; `model`: a model's label by its ID. */
export function mockFields(e: CacheEntry, parent: { name: string; label: string } | null, model: (id: string) => string): Fields {
  const v = e.versions.at(-1)!
  const f = e.filed
  const filed = !f ? 'Nothing yet: a mock is filed the first time you click on from it'
    : f.error ? `Filing failed: ${f.error}`
    : [...f.added, ...f.changed.map((x) => `${x} (changed)`)].join(', ') || 'Nothing new'
  return [
    ['Asked for', v.prompt ?? e.action ?? e.app],
    ['Drawn as', v.idea || '–'],
    ['Link ID', `@${e.name ?? 'home'}`],
    ['Reached by', parent ? `${parent.label || 'A click'} in ${parent.name}` : e.action ? '–' : 'Home: the project opens here'],
    ['Model', `${model(v.model)} in ${fmtS(v.totalMs)}${v.costUsd == null ? '' : v.costUsd === 0 ? ', free' : ` for ${v.costEstimated ? '~' : ''}${fmtUsd(v.costUsd)}`}`],
    ['Added to the boxes', filed],
  ]
}

/** A component's Info: where it belongs, the mocks that paste it, the mock it was taken from. */
export const componentFields = (e: CacheEntry, pastedOn: string[], from: string | null): Fields => [
  ['Where it belongs', e.action || '–'],
  ['Pasted on', pastedOn.join(', ') || 'No mock pastes it'],
  ['Taken from', from ?? '–'],
]

/** A box's Info: its count against its limit (a table's limits), the user's entries, the new ones; for the fixer's
 *  notes the visits kept and the mocks left before the next one. */
export function boxFields(box: Box, b: Boxes, components: CacheEntry[], past: Past[]): Fields {
  if (box === 'notes') {
    const left = VISIT_EVERY - (b.settled ?? 0) % VISIT_EVERY
    return [
      ['Visits', `${b.visits?.length ?? 0}, the last ${VISITS_KEPT} kept`],
      ['Next visit', `after ${left} more mock${left === 1 ? '' : 's'}`],
      ['New since you looked', String((b.visits ?? []).filter((x) => !x.seen).length)],
    ]
  }
  const list: { by?: string; seen?: boolean }[] = box === 'components' ? components : b[box]
  return [
    [box === 'data' ? 'Tables' : box === 'rules' ? 'Rules' : 'Components', `${list.length} of ${LIMITS[box]}`],
    ...box === 'data' ? [['Each table', `at most ${LIMITS.columns} columns and ${LIMITS.rows} rows`] as [string, string]] : [],
    ...box === 'rules' ? [['Each rule', `at most ${LIMITS.line} characters`] as [string, string]] : [],
    ['Yours', String(list.filter((x) => x.by === 'user').length)],
    ['New since you looked', String(list.filter((x) => x.seen === false).length)],
    ['Undo', `${past.length} of the last ${BOX_STATES} changes can be taken back`],
  ]
}

/** The card's title: *Edit Monstera*, *History of Rules*, *Info on tab-bar*. */
export function titleOf(tool: Tool, name: string): string {
  return tool === 'edit' ? `Edit ${name}` : tool === 'history' ? `History of ${name}` : tool === 'info' ? `Info on ${name}` : 'Describe it differently'
}

/** A box's name, in its header and its cards: the fixer's box is *Fixer*. */
export const boxTitle = (box: Box) => BOXES.find(([b]) => b === box)![2]

/** The scroll edges of a card or a box's page, as a mock's frame works them out: more above, more below. */
export const edgesOf = (s: { scrollTop: number; clientHeight: number; scrollHeight: number }) =>
  ({ above: s.scrollTop > 1, below: s.scrollTop + s.clientHeight < s.scrollHeight - 1 })
