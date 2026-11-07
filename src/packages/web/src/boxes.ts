// The boxes column left of the first screen: Components (cards the canvas puts in it), Rules and
// Data, with a line on the last filing above them. The user edits rules and tables in place; each
// change goes to the server as one /api/box request. Export writes the boxes as markdown.

import type { BoxName, Boxes, CacheEntry, Table } from '@uxwoz/core'
import { LIMITS } from '@uxwoz/core/keys'

export interface BoxOp { op: 'add' | 'set' | 'delete'; box: 'rules' | 'data'; id?: string; text?: string; columns?: string[]; rows?: string[][] }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function button(text: string, title: string, run: () => void) {
  const b = el('button', 'box-btn', text)
  b.type = 'button'
  b.title = title
  b.addEventListener('click', run)
  return b
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

const HINTS: Record<BoxName, string> = {
  components: 'Parts that look the same on every screen that has them. Filing takes them from the screens you pick; screens paste them by ID.',
  rules: 'One sentence each that several screens follow. Filing adds them; click a sentence to change it.',
  data: 'Example data that several screens show. Click a cell to change it; clear a row or a column name to remove it.',
}
const TITLES: Record<BoxName, string> = { components: 'Components', rules: 'Rules', data: 'Data' }

export interface Side {
  el: HTMLElement
  /** Where the canvas puts the component cards. */
  components: HTMLElement
  sections: Record<BoxName, HTMLElement>
}

export function createSide(): Side {
  const root = el('div', 'boxes')
  root.append(el('p', 'box-status'), el('ul', 'box-refused'))
  const sections = {} as Record<BoxName, HTMLElement>
  for (const name of ['components', 'rules', 'data'] as BoxName[]) {
    const s = el('section', `box box-${name}`)
    s.append(el('h3'), el('p', 'box-hint', HINTS[name]), el('div', 'box-body'))
    sections[name] = s
    root.append(s)
  }
  return { el: root, components: sections.components.querySelector('.box-body')!, sections }
}

export interface SideView { boxes: Boxes; components: CacheEntry[]; filing: boolean }

/** True while the user types in a field inside `box`. */
const typing = (box: HTMLElement) => document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable && box.contains(document.activeElement)

/** Draw the boxes' headers, the rules and the tables. A box the user is typing in is left alone. */
export function renderSide(side: Side, v: SideView, op: (o: BoxOp) => void) {
  const status = side.el.querySelector<HTMLElement>('.box-status')!
  const f = v.boxes.filed
  status.textContent = v.filing ? 'Filing your last decision…' : f?.error ? `The last filing failed: ${f.error}`
    : f ? `Last filing, after ${f.screen}: ${[...f.added.map((x) => `added ${x}`), ...f.changed.map((x) => `changed ${x}`)].join(', ') || 'nothing new'}`
      + `${f.refused.length ? `, refused ${f.refused.length}` : ''} · ${(f.ms / 1000).toFixed(1)} s${f.costUsd == null ? '' : ` · ~$${f.costUsd.toFixed(4)}`}` : ''
  status.hidden = !status.textContent
  // What filing's reply said that code refused, and why, in plain words under the line.
  const refused = side.el.querySelector<HTMLElement>('.box-refused')!
  refused.replaceChildren(...(v.filing ? [] : f?.refused ?? []).map((r) => el('li', '', `Refused ${r}`)))
  refused.hidden = !refused.children.length
  const counts = { components: v.components.length, rules: v.boxes.rules.length, data: v.boxes.data.length }
  for (const name of ['components', 'rules', 'data'] as BoxName[]) {
    const s = side.sections[name]
    const h = s.querySelector('h3')!
    h.replaceChildren(TITLES[name], el('small', '', ` ${counts[name]} of ${LIMITS[name]}`))
    if (name === 'rules') h.append(button('+ Rule', 'Add a rule', () => {
      const text = prompt('A new rule: one sentence that several screens follow')?.trim()
      if (text) op({ op: 'add', box: 'rules', text })
    }))
    if (name === 'data') h.append(button('+ Table', 'Add a table of example data', () => {
      const text = prompt('Name of the new table, e.g. nights')?.trim()
      if (text) op({ op: 'add', box: 'data', text, columns: ['name', 'value'], rows: [['', '']] })
    }))
    s.querySelector<HTMLElement>('.box-hint')!.hidden = counts[name] > 0
  }
  const rules = side.sections.rules.querySelector<HTMLElement>('.box-body')!
  if (!typing(rules)) rules.replaceChildren(...v.boxes.rules.map((r) => {
    const li = el('div', `rule${r.seen ? '' : ' fresh'}`)
    const text = el('span', 'rule-text', r.text)
    editable(text, (t) => op(t ? { op: 'set', box: 'rules', id: r.id, text: t } : { op: 'delete', box: 'rules', id: r.id }))
    li.append(el('b', '', `${r.id}:`), ' ', text, button('✕', `Delete rule ${r.id}`, () => op({ op: 'delete', box: 'rules', id: r.id })))
    return li
  }))
  const data = side.sections.data.querySelector<HTMLElement>('.box-body')!
  if (!typing(data)) data.replaceChildren(...v.boxes.data.map((t) => tableView(t, op)))
}

function tableView(t: Table, op: (o: BoxOp) => void): HTMLElement {
  const wrap = el('div', `data-table${t.seen ? '' : ' fresh'}`)
  const set = (columns: string[], rows: string[][]) => op({ op: 'set', box: 'data', id: t.id, columns, rows })
  const head = el('div', 'table-head')
  head.append(el('b', '', t.id),
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
  wrap.append(head, table)
  return wrap
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
