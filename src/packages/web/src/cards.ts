// The cards a mock, a box or a component flips to (spec/behavior.md, The buttons under a mock, and Boxes): Edit,
// History, Info and 🎲's Describe it differently, laid over the mock's screen or the box in place, the same size. The
// buttons under the current box. The boxes' changes (`boxOp`), what is new in a box, and Export the boxes.
// What the cards say is worked out in flip.ts (no DOM).

import { screenKey } from '@uxwoz/core/keys'
import { isComponent } from '@uxwoz/core/tree'
import type { CacheEntry } from '@uxwoz/core'
import { addEmpty, boxesMarkdown, button, el, markBox, type Box, type BoxOp } from './boxes.ts'
import { canvas, side } from './app.ts'
import { hint, post, showError } from './net.ts'
import { loadMe, refused } from './account-ui.ts'
import { applyMap, boxShown, setCurrent } from './nav.ts'
import { another, components, deleteQuestion, draw, hooks, labelOf, pastedOn, removeScreen, revise, undo, views } from './screens.ts'
import { closeMenus } from './bar.ts'
import { isShared, loadShared, screenFeedback, shareToken } from './sharing.ts'
import { commentsList, commentsSig, showRing } from './comments.ts'
import { talkButton } from './voice.ts'
import { $, enterSubmits, modelSelect, state } from './state.ts'
import {
  anotherAsks, boxButtons, boxFields, boxRows, boxTitle, boxUndoLive, componentFields, mockFields, pressedOf, redoAt, titleOf,
  undoLive, versionRows, type Fields, type Row, type Tool,
} from './flip.ts'

// ---- The boxes' changes

/** A change to the boxes, an Undo, or a visit asked for (an Edit is one); the server answers with the whole project. True when it was done. */
export async function boxOp(o: BoxOp | { op: 'seen'; box: Box; ids: string[] }): Promise<boolean> {
  const app = state.app
  if (!app) return false
  // The tour is read-only: nothing is sent that would change it.
  if (state.tour) { if (o.op !== 'seen') hint('Off in the tour.'); return false }
  // A change starts: an earlier red pill goes.
  if (o.op !== 'seen') showError(null)
  const res = await post('/api/box', { app, ...o }).catch(() => null)
  const body = await res?.json().catch(() => null)
  // The fixer's Undo sends the map with the changes it could not undo.
  if (body?.entries && app === state.app) applyMap(body)
  // A box's Edit and Run fixer call the models: the free screens left.
  if (o.op === 'edit' || o.op === 'visit') loadMe()
  if (res?.ok && !body?.error) return true
  if (res && refused(res.status, body)) { draw(); return false }
  showError(`Could not change the box: ${body?.error ?? 'no answer'}`)
  draw()
  return false
}

/** What is new in a box since the user last looked: entries by ID, visits by when they started. */
export const unseen = (box: Box): string[] => (((box === 'components' ? components() : box === 'notes' ? state.boxes?.visits : state.boxes?.[box]) ?? []) as { seen?: boolean; id?: string; name?: string; at?: string }[])
  .filter((x) => !x.seen).map((x) => x.id ?? x.name ?? x.at!)

/** The bar or the dropdown: glide to a box, which becomes current; after a moment its new entries are no longer marked. */
export function lookAt(box: Box) {
  if (side.el.hidden) return
  focusBox(box)
  canvas.showBox(side.sections[box])
  // Only the entries new at the look count as seen: one filed meanwhile stays marked. The tour changes nothing.
  const ids = unseen(box), app = state.app
  if (ids.length && !state.tour) setTimeout(() => { if (state.app === app && !state.tour) boxOp({ op: 'seen', box, ids }) }, 3000)
}

/** Export the boxes: the three boxes as a markdown file. */
$('exportBoxes').addEventListener('click', () => {
  closeMenus()
  if (!state.app || !state.boxes) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([boxesMarkdown(state.app, components(), state.boxes)], { type: 'text/markdown' }))
  a.download = `${state.app.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'mockup'}-boxes.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
})

// ---- What is current

/** Make a box current, its buttons its own. The boxes' content is not redrawn, so the press still lands. */
export function focusBox(box: Box) {
  if (state.box === box && !state.component) return
  state.box = box
  state.component = null
  markBox(side, box)
  canvas.render(views(), !!state.busy)
  renderCards()
}

/** A tap on a component: the Components box is current with the line round that component, and the box's three
 *  buttons are the component's. */
export function focusComponent(key: string) {
  if (state.box === 'components' && state.component === key) return
  state.box = 'components'
  state.component = key
  markBox(side, 'components')
  canvas.render(views(), !!state.busy)
  renderCards()
  boxShown()
}

type Target = { kind: 'mock'; key: string } | { kind: 'component'; key: string } | { kind: 'box'; box: Box }

/** What the buttons are under now: a box, a component in its box, or the current mock. */
function current(): Target | null {
  if (state.box) return state.box === 'components' && state.component && state.entries.has(state.component) ? { kind: 'component', key: state.component } : { kind: 'box', box: state.box }
  const key = state.making?.key ?? state.current
  return key ? { kind: 'mock', key } : null
}
const idOf = (t: Target | null) => (!t ? '' : t.kind === 'box' ? `box:${t.box}` : t.key)

/** Which target the card is flipped on: another one current flips it back. */
let flippedOn = ''

/** Flip what is current to a card, or back (null). */
function flip(tool: Tool | null) {
  state.flip = tool
  flippedOn = tool ? idOf(current()) : ''
  if (tool === 'info' && current()?.kind === 'mock') loadShared() // its comments, fresh
  canvas.render(views(), !!state.busy) // the pressed button under the mock
  renderCards()
}
export const closeCard = () => flip(null)

/** A mock made current and flipped to a card at once (a pin, a comment in Feedback). */
export function flipTo(key: string, tool: Tool) {
  if (state.current !== key || state.box) setCurrent(key)
  flip(tool)
}

/** A button under the current mock (canvas.ts): Edit, History and Info flip it (the same again flips back), 🎲 draws
 *  another design or, after two, flips to Describe it differently. All grey in the tour; only Info while a design is drawn. */
export function onTool(key: string, tool: string) {
  if (state.tour) return hint('Off in the tour.')
  const e = state.entries.get(key)
  if (!e?.versions.length) return
  if (state.current !== key || state.box) setCurrent(key)
  const want: Tool = tool === 'another' ? 'describe' : tool as Tool
  if (state.flip === want) return closeCard()
  if (tool !== 'info' && (state.busy || state.revising?.key === key)) return hint()
  if (tool !== 'another') return flip(want)
  // After two designs from the same words 🎲 asks for new words (screens.ts calls the hook); else one more design.
  hooks.describe = (k) => flipTo(k, 'describe')
  if (anotherAsks(e)) return flip('describe')
  if (state.flip) closeCard()
  another(key)
}

/** A button under the current box, or under a component current in it. */
function onBoxTool(box: Box, tool: string) {
  if (state.tour) return hint('Off in the tour.')
  if (tool === 'add') { closeCard(); return addEmpty(side.sections[box], box === 'rules', boxOp) }
  if (tool === 'visit') {
    closeCard()
    if (state.visiting) return hint('The fixer is visiting now.')
    return void boxOp({ op: 'visit' })
  }
  const want = tool as Tool
  if (state.flip === want) return closeCard()
  flip(want)
}

// ---- The cards

/** The card on show: where it lies, what it shows (`sig`: drawn again only when that changed), and its element. */
let shown: { host: HTMLElement; sig: string; el: HTMLElement } | null = null
/** What was typed in an Edit or Describe field, by target, kept while the card flips back and forth. */
const drafts = new Map<string, string>()

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Lay the card for what is current, take away one that no longer fits, and put the buttons under the current box.
 *  Called on every draw. */
export function renderCards() {
  renderBoxButtons()
  const t = current()
  if (state.flip && (idOf(t) !== flippedOn || !t || (t.kind !== 'box' && !state.entries.get(t.key)?.versions.length))) { state.flip = null; flippedOn = '' }
  const host = !state.flip || !t ? null : t.kind === 'mock' ? canvas.face(t.key)?.screen ?? null : side.sections[t.kind === 'box' ? t.box : 'components']
  if (!host || !t || !state.flip) return drop()
  const sig = `${idOf(t)}|${state.flip}|${signature(t, state.flip)}`
  if (shown && shown.host === host && shown.sig === sig) return update(t)
  const typing = shown?.host === host && shown.el.contains(document.activeElement) && document.activeElement?.matches('textarea')
  if (typing && shown!.sig.startsWith(`${idOf(t)}|${state.flip}|`)) return update(t) // a field being typed in stays as it is
  const scroll = shown?.host === host ? shown.el.scrollTop : 0
  const fresh = !shown || shown.host !== host || !shown.sig.startsWith(`${idOf(t)}|${state.flip}|`)
  drop()
  const card = el('div', 'flip')
  card.append(...build(t, state.flip))
  if (!fresh) card.scrollTop = scroll
  else if (!reduced()) card.classList.add('turn')
  host.append(card)
  host.closest('.card, .box')?.classList.add('flipped')
  shown = { host, sig, el: card }
  update(t)
  if (state.flip === 'info') showRing(card)
  if (fresh) card.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })
}

function drop() {
  if (!shown) return
  shown.host.closest('.card, .box')?.classList.remove('flipped')
  shown.el.remove()
  shown = null
}

/** The buttons that wait: Make the change and Draw again while a design is drawn (a box's while the fixer visits). */
function update(t: Target) {
  const wait = t.kind === 'box' ? state.visiting : !!state.busy
  for (const b of shown?.el.querySelectorAll<HTMLButtonElement>('button.primary') ?? []) b.disabled = wait
}

const entryOf = (t: Target) => (t.kind === 'box' ? undefined : state.entries.get(t.key))
const modelLabel = (id: string) => [...modelSelect.options].find((o) => o.value === id)?.text ?? ({ 'claude-haiku-5.5': 'Claude Haiku 5.5' } as Record<string, string>)[id] ?? id

/** What a card shows, as a string: Edit and Describe hold a field, so only their target counts. */
function signature(t: Target, tool: Tool): string {
  if (tool === 'edit' || tool === 'describe') return ''
  if (tool === 'history') return t.kind === 'box' ? JSON.stringify([boxRowsOf(t.box).map((r) => [r.label, r.at, r.undone]), boxUndoLive(t.box, state.boxes!, state.past[t.box as 'rules'] ?? [])]) : JSON.stringify(rowsOf(t).map((r) => [r.label, r.at, r.showing]))
  return JSON.stringify(fieldsOf(t)) + (t.kind === 'mock' ? commentsSig(t.key) : '')
}

const fromOf = (e: CacheEntry) => (e.parent ? state.entries.get(e.parent.key) : undefined)
const rowsOf = (t: Target): Row[] => { const e = entryOf(t)!; const from = fromOf(e); return versionRows(e, Date.now(), isComponent(e) && from ? labelOf(from) : undefined) }
const pastOf = (box: Box) => (box === 'notes' ? [] : state.past[box])
const boxRowsOf = (box: Box) => boxRows(box, state.boxes!, pastOf(box))

function fieldsOf(t: Target): Fields {
  if (t.kind === 'box') return boxFields(t.box, state.boxes!, components(), pastOf(t.box))
  const e = entryOf(t)!
  if (isComponent(e)) { const from = fromOf(e); return componentFields(e, pastedOn(e.name!).map(labelOf), from ? labelOf(from) : null) }
  const node = state.tree.get(e.key), parent = node?.parent ? state.entries.get(node.parent) : undefined
  return [...mockFields(e, parent ? { name: labelOf(parent), label: node!.label } : null, modelLabel), ...shareToken ? [] : screenFeedback(e.key)]
}

const nameOf = (t: Target) => (t.kind === 'box' ? boxTitle(t.box) : labelOf(entryOf(t)!))

/** The card's parts: its title with ✕, then what the tool shows. */
function build(t: Target, tool: Tool): Node[] {
  const head = el('h4', '', el('span', '', titleOf(tool, nameOf(t))), button('✕', 'Flip back (Esc)', closeCard, 'close'))
  return [head, ...tool === 'edit' ? editCard(t) : tool === 'describe' ? describeCard(t) : tool === 'history' ? historyCard(t) : infoCard(t)]
}

/** A field, 🎙️ Hold to talk and its button, in a form: Enter sends, Shift+Enter adds a line. */
function fieldForm(t: Target, label: string, text: string, go: string, send: (text: string) => void, placeholder = '') {
  const id = `${idOf(t)}|${state.flip}`
  const field = el('textarea')
  Object.assign(field, { rows: 4, maxLength: state.flip === 'describe' ? 500 : 1000, placeholder, value: drafts.get(id) ?? text })
  field.addEventListener('input', () => drafts.set(id, field.value))
  const make = el('button', 'primary', go)
  make.type = 'submit'
  const form = el('form', 'pane', el('label', '', label), field, el('div', 'row', ...[talkButton(field, showError)].filter((b) => b != null), make))
  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const v = field.value.trim()
    if (!v) return field.focus()
    if (make.disabled) return hint(t.kind === 'box' ? 'The fixer is visiting now.' : undefined)
    drafts.delete(id)
    send(v)
  })
  enterSubmits(field, form)
  return form
}

function editCard(t: Target): Node[] {
  const e = entryOf(t)
  const form = fieldForm(t, t.kind === 'box' ? `What should change in ${boxTitle(t.box)}?` : 'What should change?', '', 'Make the change', (text) => {
    if (t.kind === 'box') return void boxOp({ op: 'edit', box: t.box, text }).then((ok) => { if (ok) closeCard() })
    closeCard()
    revise(t.key, text)
  }, t.kind === 'box' ? 'e.g. Merge the two rules about scores' : 'e.g. Show one level indicator, not four')
  // Delete at the bottom, asked in the card; Home has none (the project's is in the menu), nor an edit link's Home.
  const home = !!e && !!state.app && e.key === screenKey(state.app, null)
  if (!e || home) return [form]
  const what = isComponent(e) ? 'component' : 'mock'
  const del = el('div', 'del')
  const ask = () => del.replaceChildren(el('p', '', deleteQuestion(e.key)),
    el('div', 'row', button('Delete', `Delete this ${what}`, () => { closeCard(); removeScreen(e.key, true) }, 'danger'), button('Cancel', 'Keep it', offer)))
  const offer = () => del.replaceChildren(button(`Delete this ${what}…`, `Asks first`, ask, 'link'))
  offer()
  return [form, del]
}

function describeCard(t: Target): Node[] {
  const e = entryOf(t)!
  const v = e.versions.at(-1)
  return [el('p', '', 'Neither design fits? Say what this mock should be.'), fieldForm(t, 'The mock\'s words', v?.prompt ?? e.action ?? e.app, 'Draw again', async (words) => {
    closeCard()
    revise(e.key, null, words)
  })]
}

function historyCard(t: Target): Node[] {
  if (t.kind === 'box') {
    const box = t.box
    const undoB = button('↶ Undo', box === 'notes' ? 'Undo every change of the newest visit not undone' : 'Put the box back as it was before its last change', () => boxOp({ op: 'undo-box', box }))
    undoB.disabled = !boxUndoLive(box, state.boxes!, pastOf(box))
    const rows = boxRowsOf(box)
    return [el('div', 'row', undoB), rows.length ? el('ol', 'versions', ...rows.map((r) => el('li', r.undone ? 'undone' : '', el('b', '', r.label), el('small', '', r.when)))) : el('p', 'none', 'No changes yet')]
  }
  const e = entryOf(t)!
  const back = (at?: string) => { closeCard(); undo(e.key, at) }
  const undoB = button('↶ Undo', 'Show the version before', () => back())
  const redo = redoAt(e)
  const redoB = button('↷ Redo', 'Show the version after', () => back(redo!))
  undoB.disabled = !undoLive(e)
  redoB.disabled = !redo
  const items = rowsOf(t).map((r) => {
    const b = el('button', r.showing ? 'now' : '', el('b', '', r.label), el('small', '', r.showing ? `showing · ${r.when}` : r.when))
    b.type = 'button'
    b.title = r.showing ? 'The version showing' : 'Show this version'
    b.addEventListener('click', () => { if (!r.showing) back(r.at) })
    return el('li', '', b)
  })
  return [el('div', 'row', undoB, redoB), el('ol', 'versions', ...items)]
}

function infoCard(t: Target): Node[] {
  const dl = el('dl', 'info', ...fieldsOf(t).flatMap(([k, v]) => [el('dt', '', k), el('dd', '', v)]))
  const comments = t.kind === 'mock' && isShared() && !shareToken ? commentsList(t.key) : []
  return [dl, ...comments]
}

// ---- The buttons under the current box

function renderBoxButtons() {
  const t = current()
  for (const [name, s] of Object.entries(side.sections) as [Box, HTMLElement][]) {
    const acts = s.querySelector<HTMLElement>('.box-acts')!
    if (state.box !== name) { if (acts.childElementCount) acts.replaceChildren(); delete acts.dataset.sig; continue }
    const pressed = pressedOf(state.flip)
    const comp = t?.kind === 'component'
    const list = boxButtons(comp ? 'components' : name)
    const sig = JSON.stringify([name, comp, pressed, state.tour, state.visiting, !!state.busy])
    if (acts.dataset.sig === sig) continue
    acts.dataset.sig = sig
    acts.replaceChildren(...list.map(([tool, icon, label, title]) => {
      const b = el('button', 'act', el('i', '', icon), label)
      b.type = 'button'
      b.title = state.tour ? 'Off in the tour.' : title
      b.dataset.act = tool
      const off = state.tour || (tool === 'visit' && state.visiting) || (comp && !!state.busy && tool !== 'info')
      b.classList.toggle('off', off)
      b.setAttribute('aria-disabled', String(off))
      b.classList.toggle('on', pressed === tool)
      b.addEventListener('click', () => onBoxTool(name, tool))
      return b
    }))
  }
}
