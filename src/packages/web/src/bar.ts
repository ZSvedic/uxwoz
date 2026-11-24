// The top bar (spec/behavior.md, Top bar): the logo, ← the name →, the boxes while they fit, the zoom; the name's
// dropdown (the four boxes, the project's sentence, the tree); the zoom menu and its keys. What it shows is worked
// out in functions with no DOM (bun test runs them); the page hands in what it needs at `initBar`, so nothing here
// imports the page's other modules, and the DOM is touched only inside functions.

import type { CacheEntry } from '@uxwoz/core'
import type { Device } from '@uxwoz/core/frame'
import type { Box } from './boxes.ts'

/** A window this wide or wider has the wordmark, the boxes while they fit, and − + ⛶. */
export const WIDE = 720

/** The size a window is offered in Design for: under 400 px a small phone, under 720 a large one, under 1600 a laptop, else a monitor. */
export function sizeFor(width: number): Device {
  return width < 400 ? 'small-phone' : width < WIDE ? 'large-phone' : width < 1600 ? 'laptop' : 'monitor'
}

/** The four boxes, in the bar's order, with their icon and name. */
export const BOXES: [Box, string, string][] = [['rules', '📐', 'Rules'], ['components', '🧩', 'Components'], ['data', '🗄️', 'Data'], ['notes', '🕵️', 'Fixer']]
export const boxName = (b: Box) => { const [, icon, name] = BOXES.find(([x]) => x === b)!; return `${icon} ${name}` }

/** The room the name keeps when the boxes join the bar: about ten letters. */
export const NAME_ROOM = 120
/** Whether the boxes fit the bar: the other buttons, the boxes and the name's room within its width (all in px). */
export const boxesFit = (bar: number, rest: number, boxes: number, name = NAME_ROOM) => rest + boxes + name <= bar

export interface TreeRow { key: string; depth: number; planned: boolean; current: boolean }

/**
 * The dropdown's tree: Home first, each mock under the one it hangs from, a step in a level deeper; mocks whose parent
 * is not listed as trees of their own after it. Components are not in it. `list` holds drawn and planned mocks.
 */
export function treeRows(list: (Pick<CacheEntry, 'key'> & { planned?: boolean; component?: boolean })[], parentOf: (key: string) => string | null, current: string | null): TreeRow[] {
  const mocks = list.filter((e) => !e.component), keys = new Set(mocks.map((e) => e.key))
  const rows: TreeRow[] = [], seen = new Set<string>()
  const walk = (e: (typeof mocks)[number], depth: number) => {
    if (seen.has(e.key)) return
    seen.add(e.key)
    rows.push({ key: e.key, depth, planned: !!e.planned, current: e.key === current })
    for (const c of mocks) if (parentOf(c.key) === e.key) walk(c, depth + 1)
  }
  for (const e of mocks) { const p = parentOf(e.key); if (!p || !keys.has(p)) walk(e, 0) }
  return rows
}

// ---- The page

export interface BarDeps {
  /** The canvas's zoom (canvas.ts). */
  canvas: { step(dir: 1 | -1): void; setZoom(z: number): void; fit(): void; moved: number }
  /** ← and →: whether there is a step that way, and taking it. */
  canStep(dir: 1 | -1): boolean
  walk(dir: 1 | -1): void
  /** A box from the bar or the dropdown becomes current. */
  look(box: Box): void
  /** A mock from the dropdown: a drawn one becomes current, a planned one is made. */
  go(key: string): void
  make(e: CacheEntry): void
  /** What the bar shows: the open project (the tour's too), its drawn and planned mocks, the parent of each, a mock's name. */
  view(): { app: string | null; current: string | null; box: Box | null; making: string | null; hasBoxes: boolean; mocks: (CacheEntry & { planned?: boolean })[] }
  parentOf(key: string): string | null
  nameOf(e: CacheEntry): string
  /** The entries of a box new since the user last looked. */
  unseen(box: Box): number
  /** The logo: the menu. */
  openMenu(): void
  closeMenu(): void
}

let d: BarDeps | null = null
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const MENUS: [string, string][] = [['nameButton', 'dropMenu'], ['zoomValue', 'zoomMenu']]

/** Close the dropdown, the zoom menu and the menu panel. */
export function closeMenus() {
  if (typeof document === 'undefined') return
  for (const [b, m] of MENUS) { $(m).hidden = true; $(b).setAttribute('aria-expanded', 'false') }
  d?.closeMenu()
}

/** A zoom from a key or a button: in, out, a level, or Fit all. The user's own zoom counts as moving the canvas. */
function zoomTo(z: string) {
  const c = d!.canvas
  c.moved = performance.now()
  if (z === 'in' || z === 'out') c.step(z === 'in' ? 1 : -1)
  else if (z === 'all') c.fit()
  else c.setZoom(Number(z))
}

// Zoom keys as in Figma: ⌘+ and ⌘− (Ctrl off a Mac), ⌘0 for 100%, ⇧1 Fit all.
const ZOOM_KEYS: Record<string, string> = { '=': 'in', '+': 'in', '-': 'out', 0: '1', Digit1: 'all' }
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** What a key does: a zoom (in, out, 100%, Fit all) or a step (⌘[ ⌘]); nothing inside a text field, where the keys
 *  are the field's. */
export function keyOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, inField: boolean): string | null {
  if (inField) return null
  const mod = e.metaKey || e.ctrlKey
  if (mod && ZOOM_KEYS[e.key] && ZOOM_KEYS[e.key] !== 'all') return ZOOM_KEYS[e.key]!
  if (mod && (e.key === '[' || e.key === ']')) return e.key === '[' ? 'back' : 'forward'
  if (!mod && !e.altKey && e.shiftKey && ZOOM_KEYS[e.code] === 'all') return 'all'
  return null
}

export function initBar(deps: BarDeps) {
  d = deps
  for (const [b, m] of MENUS) $(b).addEventListener('click', () => {
    const show = $(m).hidden
    closeMenus()
    if (!show) return
    if (m === 'dropMenu') renderDrop()
    $(m).hidden = false
    $(b).setAttribute('aria-expanded', 'true')
    $(m).querySelector<HTMLElement>('.current, .item')?.focus({ preventScroll: true })
  })
  $('logo').addEventListener('click', () => { const open = !$('menuPanel').hidden; closeMenus(); if (!open) d!.openMenu() })
  $('trailBack').addEventListener('click', () => d!.walk(-1))
  $('trailForward').addEventListener('click', () => d!.walk(1))
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-look]')) b.addEventListener('click', () => { closeMenus(); d!.look(b.dataset.look as Box) })
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) b.addEventListener('click', () => { closeMenus(); zoomTo(b.dataset.zoom!) })
  addEventListener('keydown', (e: KeyboardEvent) => {
    const k = keyOf(e, editable(e.target))
    if (!k) return
    if (k !== 'all') e.preventDefault()
    if (k === 'back' || k === 'forward') d!.walk(k === 'back' ? -1 : 1)
    else zoomTo(k)
  })
  // A press outside a menu closes it; so does a click into a mock (the page loses focus to the frame).
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node
    if (!MENUS.some(([b, m]) => $(b).contains(t) || $(m).contains(t))) for (const [b, m] of MENUS) { $(m).hidden = true; $(b).setAttribute('aria-expanded', 'false') }
  })
  addEventListener('blur', () => { for (const [, m] of MENUS) $(m).hidden = true })
  // The mouse's own back and forward buttons walk the steps, instead of leaving the page.
  addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button !== 3 && e.button !== 4) return
    e.preventDefault()
    d!.walk(e.button === 3 ? -1 : 1)
  })
  new ResizeObserver(() => fitBar()).observe($('bar'))
  document.fonts.ready.then(fitBar)
}

/** The bar: the name, ← →, the boxes' counts; the dropdown too while it is open. */
export function renderToolbar() {
  if (!d) return
  const v = d.view()
  const cur = v.current ? v.mocks.find((e) => e.key === v.current) : undefined
  // A new mock is current while it is drawn: its name at once.
  const name = v.making ?? (v.box ? boxName(v.box) : cur ? d.nameOf(cur) : v.app ? 'Home' : 'UXWoz')
  $('nameText').textContent = name
  $('nameButton').title = `${name}: the boxes and every mock`
  $<HTMLButtonElement>('nameButton').disabled = !v.app
  $<HTMLButtonElement>('trailBack').disabled = !d.canStep(-1)
  $<HTMLButtonElement>('trailForward').disabled = !d.canStep(1)
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-look]')) {
    const n = d.unseen(b.dataset.look as Box)
    b.querySelector('b')!.textContent = n ? String(n) : ''
    b.disabled = !v.hasBoxes
    b.classList.toggle('current', v.box === b.dataset.look)
  }
  $('bar').classList.toggle('has-boxes', v.hasBoxes)
  if (!$('dropMenu').hidden) renderDrop()
  fitBar()
}

/** The dropdown: the sentence, then the tree, the current mock marked; a planned mock is grey and says *not made yet*. */
function renderDrop() {
  const v = d!.view()
  $('dropSentence').textContent = v.app ?? ''
  $('dropSentence').title = v.app ?? ''
  const byKey = new Map(v.mocks.map((e) => [e.key, e]))
  const rows = treeRows(v.mocks.map((e) => ({ key: e.key, planned: e.planned, component: e.kind === 'component' })), d!.parentOf, v.box ? null : v.current)
  $('dropTree').replaceChildren(...rows.map((r) => {
    const e = byKey.get(r.key)!
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'item'
    b.classList.toggle('planned', r.planned)
    b.classList.toggle('current', r.current)
    b.style.setProperty('--depth', String(r.depth))
    const label = document.createElement('span')
    label.textContent = d!.nameOf(e)
    b.append(label)
    if (r.planned) b.append(Object.assign(document.createElement('small'), { textContent: 'not made yet' }))
    b.title = label.textContent
    b.addEventListener('click', () => { closeMenus(); if (r.planned) d!.make(e); else d!.go(e.key) })
    return b
  }))
}

/** A wide window shows the boxes in the bar while they fit beside the other buttons and the name's room. */
function fitBar() {
  const bar = $('bar'), boxes = $('barBoxes')
  if (!d || !bar) return
  bar.classList.remove('no-boxes')
  if (innerWidth < WIDE || !bar.classList.contains('has-boxes')) return void bar.classList.add('no-boxes')
  const gap = parseFloat(getComputedStyle(bar).columnGap) || 0
  const items = [...bar.children].filter((c) => (c as HTMLElement).offsetParent && c !== boxes && c.id !== 'namePop') as HTMLElement[]
  const rest = items.reduce((s, c) => s + c.getBoundingClientRect().width, 0) + gap * (items.length + 1)
  const pad = parseFloat(getComputedStyle(bar).paddingLeft) + parseFloat(getComputedStyle(bar).paddingRight)
  if (!boxesFit(bar.clientWidth - pad, rest, boxes.scrollWidth)) bar.classList.add('no-boxes')
}
