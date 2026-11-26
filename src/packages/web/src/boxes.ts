// The boxes right of Home: Rules, Components (the canvas puts the cards in), Data and Fixer (the fixer's notes), each
// a page of the ruled pad with its buttons under it while current (cards.ts draws them and the cards a box flips to).
// Rules and tables are edited in place, and added there empty. Export writes markdown. A page or a card that scrolls
// shows its scroll corners (`watchEdges`).

import type { BoxName, Boxes, CacheEntry, Table } from '@uxwoz/core'
import { LIMITS, VISIT_EVERY, tableMarkdown } from '@uxwoz/core/keys'
import { BOXES as BAR } from './bar.ts'
import { boxTitle, edgesOf } from './flip.ts'

/** A box: the three the models read, and the fixer's notes. */
export type Box = BoxName | 'notes'
export type BoxOp = { op: 'add' | 'set' | 'delete'; box: 'rules' | 'data'; id?: string; text?: string; columns?: string[]; rows?: string[][] }
  | { op: 'undo'; at: string; i: number } | { op: 'visit' } | { op: 'undo-box'; box: Box } | { op: 'edit'; box: Box; text: string }

/** An element with its class and its children (text or elements). */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string)[]) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.append(...kids)
  return e
}

export function button(text: string, title: string, run: () => void, cls = 'box-btn') {
  const b = el('button', cls, text)
  b.title = title
  b.addEventListener('click', run)
  return b
}

/** The boxes shown are the tour's: nothing in them can be typed into. */
let readOnly = false

/** An entry new since the user looked: marked (` fresh`); nothing is new in the tour. */
const fresh = (x: { seen?: boolean }) => (readOnly || x.seen ? '' : ' fresh')

/** Buttons that change a box (✕, + row, + column, the fixer's Undo): none in the tour. */
const changes = <T,>(kids: T[]): T[] => (readOnly ? [] : kids)

/** Text the user types in place: Enter or leaving the field saves it, Esc puts it back. Plain text in the tour. */
function editable<E extends HTMLElement>(e: E, save: (text: string) => void): E {
  if (readOnly) return e
  e.contentEditable = 'plaintext-only'
  e.spellcheck = false
  const was = () => e.dataset.was ?? ''
  e.dataset.was = e.textContent ?? ''
  e.addEventListener('keydown', (k) => {
    if (k.key === 'Enter') { k.preventDefault(); e.blur() }
    if (k.key === 'Escape') { e.textContent = was(); e.blur(); k.stopPropagation() }
  })
  e.addEventListener('blur', () => {
    const t = (e.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (t !== was().trim()) save(t)
  })
  return e
}

const HINTS: Record<Box, string> = {
  components: 'Parts that look the same on every mock that pastes them. Filing takes them from your mocks.',
  rules: 'One sentence each that several mocks follow. Tap one to change it.',
  data: 'Example data that several mocks show. Tap a cell to change it.',
  notes: 'Every 5 mocks the fixer tidies the boxes and redraws mocks that break a rule.',
}
/** The boxes left to right, in the bar's and the dropdown's order: Fixer last. */
export const BOX_ORDER: Box[] = BAR.map(([b]) => b)

/** Scroll corners, as a mock's: `el` gets `above` and `below` while it has more beyond that edge, checked as it
 *  scrolls, changes size or gets new content (at most once a frame). Returns what stops it. */
export function watchEdges(el: HTMLElement): () => void {
  let queued = false
  const now = () => { queued = false; const e = edgesOf(el); el.classList.toggle('above', e.above); el.classList.toggle('below', e.below) }
  const soon = () => { if (!queued) { queued = true; requestAnimationFrame(now) } }
  const sizes = new ResizeObserver(soon)
  const watch = () => { sizes.disconnect(); for (const x of [el, ...el.children]) sizes.observe(x); soon() }
  const content = new MutationObserver(watch)
  content.observe(el, { childList: true, subtree: true, characterData: true })
  el.addEventListener('scroll', soon, { passive: true })
  watch()
  return () => { sizes.disconnect(); content.disconnect(); el.removeEventListener('scroll', soon) }
}

/** The boxes: their sections, each with a place for its buttons (`.acts`), and where the canvas puts the component
 *  cards (`components`). */
export function createSide() {
  const root = el('div', 'boxes')
  const sections = {} as Record<Box, HTMLElement>
  for (const name of BOX_ORDER) {
    const body = el('div', 'box-body')
    const s = el('section', `box box-${name}`, el('h3'), el('p', 'box-hint', HINTS[name]), body, el('div', 'acts box-acts'))
    s.dataset.box = name
    watchEdges(body)
    sections[name] = s
    root.append(s)
  }
  return { el: root, components: sections.components.querySelector<HTMLElement>('.box-body')!, sections }
}

/** Add rule and Add table: an empty rule, or a table with only its name, in place with the cursor in it; left empty, it goes. */
export function addEmpty(box: HTMLElement, rule: boolean, op: (o: BoxOp) => void) {
  const body = box.querySelector<HTMLElement>('.box-body')!
  const text = editable(el('span', rule ? 'rule-text' : ''), (t) => op(rule ? { op: 'add', box: 'rules', text: t } : { op: 'add', box: 'data', text: t, columns: ['name', 'value'], rows: [['', '']] }))
  text.dataset.placeholder = rule ? 'A new rule, one sentence' : 'Name of the new table, e.g. nights'
  const row = rule ? el('div', 'rule', el('b', '', 'new:'), ' ', text) : el('div', 'data-table', el('div', 'table-head', text))
  const hint = box.querySelector<HTMLElement>('.box-hint')!
  text.addEventListener('blur', () => { if (!text.textContent?.trim()) { row.remove(); hint.hidden = body.children.length > 0 } })
  body.append(row)
  hint.hidden = true
  body.scrollTop = body.scrollHeight
  text.focus()
}

/** True while the user types in a field inside `box`. */
const typing = (box: HTMLElement) => document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable && box.contains(document.activeElement)

/** How many entries (or visits) a box has, and that against its limit: the fixer's notes have none. */
export const countOf = (boxes: Boxes, components: CacheEntry[], name: Box) => name === 'notes' ? boxes.visits?.length ?? 0 : name === 'components' ? components.length : boxes[name].length
export const countLabel = (n: number, name: Box) => name === 'notes' ? `${n} visits` : `${n} of ${LIMITS[name]}`

/** Mark the current box: a gold border. */
export const markBox = (side: ReturnType<typeof createSide>, current: Box | null) => { for (const [name, s] of Object.entries(side.sections)) s.classList.toggle('current', name === current) }

/** Draw the boxes' headers, the rules, the tables and the fixer's notes. A box the user is typing in is left alone. */
export function renderSide(side: ReturnType<typeof createSide>, v: { boxes: Boxes; components: CacheEntry[]; current: Box | null; tour?: boolean }, op: (o: BoxOp) => void) {
  readOnly = !!v.tour
  const visits = [...v.boxes.visits ?? []].reverse()
  markBox(side, v.current)
  for (const name of BOX_ORDER) {
    const s = side.sections[name]
    const n = countOf(v.boxes, v.components, name)
    s.querySelector('h3')!.replaceChildren(boxTitle(name), el('small', '', ` ${countLabel(n, name)}`))
    if (!typing(s)) s.querySelector<HTMLElement>('.box-hint')!.hidden = n > 0
  }
  const rules = side.sections.rules.querySelector<HTMLElement>('.box-body')!
  if (!typing(rules)) rules.replaceChildren(...v.boxes.rules.map((r) => el('div', `rule${fresh(r)}`, el('b', '', `${r.id}:`), ' ',
    editable(el('span', 'rule-text', r.text), (t) => op(t ? { op: 'set', box: 'rules', id: r.id, text: t } : { op: 'delete', box: 'rules', id: r.id })),
    yours(r), ...changes([button('✕', `Delete rule ${r.id}`, () => op({ op: 'delete', box: 'rules', id: r.id }))]))))
  const data = side.sections.data.querySelector<HTMLElement>('.box-body')!
  if (!typing(data)) data.replaceChildren(...v.boxes.data.map((t) => tableView(t, op)))
  // The fixer's notes, newest visit first: what it changed, each with an Undo, and what code refused.
  side.sections.notes.querySelector('.box-body')!.replaceChildren(...visits.map((x) => el('div', `visit${fresh(x)}`,
    el('b', '', new Date(x.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })), x.ask ? ` You asked: "${x.ask}".` : '',
    el('span', '', ` ${visitLine(x)}`),
    el('ul', '', ...x.changes.map((c, i) => el('li', c.undone ? 'undone' : '', c.text, c.note ? el('small', '', ` ${c.note}`) : '',
      ...c.undo && !c.undone ? changes([' ', button('Undo', 'Undo this change', () => op({ op: 'undo', at: x.at, i }))]) : [])),
    ...x.refused.map((r) => el('li', 'refused', `Refused ${r}`))))),
    ...visits.length ? [el('p', 'box-hint', nextVisit(v.boxes))] : [])
}

/** A visit's line: what it read and changed, its time and cost when it had them (the tour's has neither). */
export function visitLine(x: { error?: string; screens: number; changes: unknown[]; ms?: number; costUsd?: number | null }): string {
  if (x.error) return `The visit failed: ${x.error}`
  const n = x.changes.length
  return [`Read ${x.screens} mock${x.screens === 1 ? '' : 's'}, ${n ? `made ${n} change${n === 1 ? '' : 's'}` : 'changed nothing'}`,
    ...x.ms ? [`${(x.ms / 1000).toFixed(1)} s`] : [], ...x.costUsd ? [`~$${x.costUsd.toFixed(4)}`] : []].join(' · ')
}

/** The fixer's notes end with when it comes next. */
export const nextVisit = (b: Boxes) => {
  const left = VISIT_EVERY - (b.settled ?? 0) % VISIT_EVERY
  return `The next visit comes after ${left} more mock${left === 1 ? '' : 's'}.`
}

/** An entry the user wrote is marked: filing and the fixer leave it alone. */
const yours = (x: { by: string }) => el('small', 'yours', x.by === 'user' ? ' yours' : '')

function tableView(t: Table, op: (o: BoxOp) => void): HTMLElement {
  const set = (columns: string[], rows: string[][]) => op({ op: 'set', box: 'data', id: t.id, columns, rows })
  const head = el('div', 'table-head', el('b', '', t.id), yours(t), ...changes([
    button('+ row', 'Add a row', () => set(t.columns, [...t.rows, t.columns.map(() => '')])),
    button('+ column', 'Add a column', () => set([...t.columns, `column ${t.columns.length + 1}`], t.rows.map((r) => [...r, '']))),
    button('✕', `Delete table ${t.id}`, () => op({ op: 'delete', box: 'data', id: t.id }))]))
  // Each cell saves the whole table: rows left empty and columns without a name go.
  const save = () => {
    const read = (tr: Element) => [...tr.children].map((c) => (c.textContent ?? '').trim())
    const [cols = [], ...rows] = [...table.querySelectorAll('tr')].map(read)
    const keep = cols.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
    if (!keep.length) return op({ op: 'delete', box: 'data', id: t.id })
    set(keep.map((i) => cols[i]!), rows.map((r) => keep.map((i) => r[i] ?? '')).filter((r) => r.some(Boolean)))
  }
  const table = el('table', '', ...[t.columns, ...t.rows].map((r, i) => el('tr', '', ...r.map((c) => editable(el(i ? 'td' : 'th', '', c), save)))))
  return el('div', `data-table${fresh(t)}`, head, table)
}

/** The three boxes as markdown, for Export. */
export function boxesMarkdown(app: string, components: CacheEntry[], b: Boxes): string {
  return [
    `# Boxes of ${app}`, '', '## Components', '',
    ...components.flatMap((c) => [`### ${c.name}`, '', `Where it belongs: ${c.action ?? ''}`, '', '```html', c.versions.at(-1)?.html ?? '', '```', '']),
    '## Rules', '', ...b.rules.map((r) => `- **${r.id}**: ${r.text}`), '',
    '## Data', '',
    ...b.data.flatMap((t) => [`### ${t.id}`, '', ...tableMarkdown(t), '']),
  ].join('\n')
}
