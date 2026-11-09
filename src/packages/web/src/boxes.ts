// The boxes right of the first screen, each with a rail: Rules, the fixer's notes, Components (the
// canvas puts the cards in) and Data. Rules and tables are edited in place. Export writes markdown.

import type { BoxName, Boxes, CacheEntry, Table } from '@uxwoz/core'
import { BOX_TITLES, LIMITS } from '@uxwoz/core/keys'

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
  b.type = 'button'
  b.title = title
  b.addEventListener('click', run)
  return b
}

/** A rail: big icon buttons right of a screen or a box, kept at 40 px on screen; each tool is [name, icon, tip]. */
export function railOf(tools: string[][], run: (tool: string) => void) {
  const buttons = tools.map(([tool, icon, tip]) => {
    const b = button(icon!, tip!, () => run(tool!), 'tool')
    b.dataset.tool = tool
    b.setAttribute('aria-label', tip!.split(':')[0]!)
    return b
  })
  return { el: el('div', 'rail', ...buttons), tools: buttons }
}

/** Text the user types in place: Enter or leaving the field saves it, Esc puts it back. */
function editable(e: HTMLElement, save: (text: string) => void) {
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
}

const HINTS: Record<Box, string> = {
  components: 'Parts that look the same on every screen that pastes them. Filing takes them from your picks.',
  rules: 'One sentence each that several screens follow. Click one to change it.',
  data: 'Example data that several screens show. Click a cell to change it.',
  notes: 'Every 5 picks the fixer tidies the boxes and redraws screens that break a rule.',
}
const BOXES = Object.keys(BOX_TITLES) as Box[]
/** Each box's own first button on its rail. */
const OWN: Partial<Record<Box, string[]>> = {
  rules: ['add', '+', 'Add a rule'],
  notes: ['visit', '▶', 'Visit now'],
  data: ['add', '+', 'Add a table'],
}

export interface Side {
  el: HTMLElement
  /** Where the canvas puts the component cards. */
  components: HTMLElement
  sections: Record<Box, HTMLElement>
  rails: Record<Box, HTMLButtonElement[]>
}

export function createSide(op: (o: BoxOp) => void): Side {
  const root = el('div', 'boxes')
  const sections = {} as Side['sections'], rails = {} as Side['rails']
  for (const name of BOXES) {
    const undo = name === 'notes' ? 'Undo the newest visit' : 'Undo the last change'
    const rail = railOf([...OWN[name] ? [OWN[name]] : [], ['edit', '✎', 'Edit: ask the fixer'], ['undo', '↶', undo]], (tool) => {
      if (tool === 'undo') return op({ op: 'undo-box', box: name })
      if (tool === 'visit') return op({ op: 'visit' })
      const text = prompt(tool === 'edit' ? `What should change in ${BOX_TITLES[name]}?` : name === 'rules' ? 'A new rule, one sentence' : 'Name of the new table, e.g. nights')?.trim()
      if (text) op(tool === 'edit' ? { op: 'edit', box: name, text } : name === 'rules' ? { op: 'add', box: 'rules', text } : { op: 'add', box: 'data', text, columns: ['name', 'value'], rows: [['', '']] })
    })
    const s = el('section', `box box-${name}`, el('h3'), el('p', 'box-hint', HINTS[name]), el('div', 'box-body'), rail.el)
    sections[name] = s
    rails[name] = rail.tools
    root.append(s)
  }
  return { el: root, components: sections.components.querySelector('.box-body')!, sections, rails }
}

export interface SideView { boxes: Boxes; components: CacheEntry[]; undos: Record<BoxName, number>; visiting: boolean }

/** True while the user types in a field inside `box`. */
const typing = (box: HTMLElement) => document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable && box.contains(document.activeElement)

/** Draw the boxes' headers and rails, the rules and the tables. A box the user is typing in is left alone. */
export function renderSide(side: Side, v: SideView, op: (o: BoxOp) => void) {
  const visits = [...v.boxes.visits ?? []].reverse()
  const counts = { components: v.components.length, rules: v.boxes.rules.length, data: v.boxes.data.length, notes: visits.length }
  for (const name of BOXES) {
    const s = side.sections[name]
    s.querySelector('h3')!.replaceChildren(BOX_TITLES[name], el('small', '', name === 'notes' ? ` ${counts[name]} visits` : ` ${counts[name]} of ${LIMITS[name]}`))
    s.querySelector<HTMLElement>('.box-hint')!.hidden = counts[name] > 0
    // Undo shows when there is something to undo; Visit now and Edit wait while the fixer visits.
    for (const b of side.rails[name]) {
      b.hidden = b.dataset.tool === 'undo' && !(name === 'notes' ? visits.some((x) => !x.undone && x.changes.some((c) => c.undo && !c.undone)) : v.undos[name])
      b.disabled = v.visiting && /visit|edit/.test(b.dataset.tool!)
    }
  }
  const rules = side.sections.rules.querySelector<HTMLElement>('.box-body')!
  if (!typing(rules)) rules.replaceChildren(...v.boxes.rules.map((r) => {
    const li = el('div', `rule${r.seen ? '' : ' fresh'}`)
    const text = el('span', 'rule-text', r.text)
    editable(text, (t) => op(t ? { op: 'set', box: 'rules', id: r.id, text: t } : { op: 'delete', box: 'rules', id: r.id }))
    li.append(el('b', '', `${r.id}:`), ' ', text, yours(r), button('✕', `Delete rule ${r.id}`, () => op({ op: 'delete', box: 'rules', id: r.id })))
    return li
  }))
  const data = side.sections.data.querySelector<HTMLElement>('.box-body')!
  if (!typing(data)) data.replaceChildren(...v.boxes.data.map((t) => tableView(t, op)))
  // The fixer's notes, newest visit first: what it changed, each with an Undo, and what code refused.
  side.sections.notes.querySelector('.box-body')!.replaceChildren(...visits.map((x) => {
    const d = el('div', `visit${x.seen ? '' : ' fresh'}`)
    const cost = x.costUsd == null ? '' : ` · ~$${x.costUsd.toFixed(4)}`
    d.append(el('b', '', new Date(x.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })), x.ask ? ` You asked: "${x.ask}".` : '',
      el('span', '', x.error ? ` The visit failed: ${x.error}` : ` Read ${x.screens} screens, ${x.changes.length ? `made ${x.changes.length} changes` : 'changed nothing'} · ${(x.ms / 1000).toFixed(1)} s${cost}`))
    const ul = el('ul')
    x.changes.forEach((c, i) => {
      const li = el('li', c.undone ? 'undone' : '', c.text)
      if (c.note) li.append(el('small', '', ` ${c.note}`))
      if (c.undo && !c.undone) li.append(' ', button('Undo', 'Undo this change', () => op({ op: 'undo', at: x.at, i })))
      ul.append(li)
    })
    for (const r of x.refused) ul.append(el('li', 'refused', `Refused ${r}`))
    d.append(ul)
    return d
  }))
}

/** An entry the user wrote is marked: filing and the fixer leave it alone. */
const yours = (x: { by: string }) => el('small', 'yours', x.by === 'user' ? ' yours' : '')

function tableView(t: Table, op: (o: BoxOp) => void): HTMLElement {
  const set = (columns: string[], rows: string[][]) => op({ op: 'set', box: 'data', id: t.id, columns, rows })
  const head = el('div', 'table-head', el('b', '', t.id), yours(t),
    button('+ row', 'Add a row', () => set(t.columns, [...t.rows, t.columns.map(() => '')])),
    button('+ column', 'Add a column', () => set([...t.columns, `column ${t.columns.length + 1}`], t.rows.map((r) => [...r, '']))),
    button('✕', `Delete table ${t.id}`, () => op({ op: 'delete', box: 'data', id: t.id })))
  const table = el('table')
  // Each cell saves the whole table: rows left empty and columns without a name go.
  const save = () => {
    const read = (tr: Element) => [...tr.children].map((c) => (c.textContent ?? '').trim())
    const [cols = [], ...rows] = [...table.querySelectorAll('tr')].map(read)
    const keep = cols.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
    if (!keep.length) return op({ op: 'delete', box: 'data', id: t.id })
    set(keep.map((i) => cols[i]!), rows.map((r) => keep.map((i) => r[i] ?? '')).filter((r) => r.some(Boolean)))
  }
  for (const [i, r] of [t.columns, ...t.rows].entries()) {
    const tr = el('tr')
    for (const c of r) {
      const cell = el(i ? 'td' : 'th', '', c)
      editable(cell, save)
      tr.append(cell)
    }
    table.append(tr)
  }
  return el('div', `data-table${t.seen ? '' : ' fresh'}`, head, table)
}

/** The three boxes as markdown, for Export. */
export function boxesMarkdown(app: string, components: CacheEntry[], b: Boxes): string {
  const row = (r: string[]) => `| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`
  return [
    `# Boxes of ${app}`, '', '## Components', '',
    ...components.flatMap((c) => [`### ${c.name}`, '', `Where it belongs: ${c.action ?? ''}`, '', '```html', c.versions.at(-1)?.html ?? '', '```', '']),
    '## Rules', '', ...b.rules.map((r) => `- **${r.id}**: ${r.text}`), '',
    '## Data', '',
    ...b.data.flatMap((t) => [`### ${t.id}`, '', row(t.columns), row(t.columns.map(() => '---')), ...t.rows.map(row), '']),
  ].join('\n')
}
