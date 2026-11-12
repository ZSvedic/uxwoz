// The toolbar and the generate panel: menus, Recent, theme, zoom and its keys, the pickers.

import { normalizePrompt } from '@uxwoz/core/keys'
import { STARTERS } from '../../core/src/starters.ts'
import { MAX_ZOOM } from './canvas.ts'
import { el, type Box } from './boxes.ts'
import { canvas, restorePickers, side, start } from './app.ts'
import { closeDrawer, unseen } from './drawer.ts'
import { coach, hint, post, showError, themeCss } from './net.ts'
import { currentAt, renderNav, trailStep, walkTrail } from './nav.ts'
import { draw, labelOf } from './screens.ts'
import { initVoice } from './voice-ui.ts'
import { needsAccount, renderAccountMenu } from './account-ui.ts'
import { $, deviceSelect, enterSubmits, generate, modelSelect, promptInput, state, store } from './state.ts'

// ---- Wiring

/** The pickers and the name each is kept under in this browser. */
export const PICKERS = [[modelSelect, 'model'], [deviceSelect, 'device']] as const
const keepPicker = (s: HTMLSelectElement, name: string) => store.set(`uxwoz:${name}`, s.value)

generate.addEventListener('submit', (e) => {
  e.preventDefault()
  // The pickers as they are now are the ones to keep, also if a change event was missed.
  for (const [s, name] of PICKERS) keepPicker(s, name)
  const app = promptInput.value.trim()
  if (app) start(app).catch((err) => showError(String(err)))
})
enterSubmits(promptInput, generate)

// The starters, in place of templates: a card opens its mockup with the starter's device, and the server replays its
// recording. The device is for that mockup only: the saved choice stays.
$('starters').replaceChildren(...STARTERS.map((s) => {
  const b = el('button', 'starter')
  b.type = 'button'
  b.title = s.prompt
  b.append(el('b', '', s.label), el('small', '', s.kind))
  b.addEventListener('click', () => {
    deviceSelect.value = s.device
    start(s.prompt).catch((err) => showError(String(err)))
  })
  return b
}))

/** A first-time visitor (no mockups) sees the starters above the prompt box; anyone else the prompt box first. */
function placeStarters(first: boolean) {
  const box = $('startersBox')
  if (first) $('genTitle').after(box)
  else generate.querySelector('.go')!.after(box)
  $('genTitle').textContent = first ? 'Turn one sentence into a clickable mockup' : 'What should we mock up?'
  $('genLead').hidden = !first
  $('startersTitle').hidden = first
  $('ownTitle').hidden = !first
}


for (const [s, name] of PICKERS) s.addEventListener('change', () => keepPicker(s, name))

/** Theme: every screen redraws in it at once (one that streams, when it finishes); kept in this browser. */
function setTheme(id: string) {
  state.theme = id
  store.set('uxwoz:theme', id)
  themeCss(id).then(draw).catch((e) => showError(`Could not load the theme: ${e.message}`))
}

/** A zoom from a key or a button: in, out, a level, or a fit. The user's own fits count as moving the canvas, so a refit waiting for sizes does not undo them. */
function zoomTo(z: string) {
  canvas.moved = performance.now()
  if (z === 'in' || z === 'out') canvas.step(z === 'in' ? 1 : -1)
  else if (z === 'all') canvas.fit()
  else if (z === 'screen') canvas.fit(currentAt(), { snug: !state.box, top: !!state.box })
  else if (z !== 'width') canvas.setZoom(Number(z))
  else if (currentAt()) canvas.fit(currentAt(), { max: MAX_ZOOM, top: true })
}

// Zoom keys as in Figma: ⌘+ and ⌘− (Ctrl on other systems), ⌘0 for 100%, ⇧1 fit all, ⇧2 fit screen, ⇧3 fit width.
const ZOOM_KEYS: Record<string, string> = { '=': 'in', '+': 'in', '-': 'out', 0: '1', Digit1: 'all', Digit2: 'screen', Digit3: 'width' }
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
addEventListener('keydown', (e: KeyboardEvent) => {
  const mod = e.metaKey || e.ctrlKey
  if (mod && ZOOM_KEYS[e.key]) { e.preventDefault(); zoomTo(ZOOM_KEYS[e.key]!) }
  else if (mod && (e.key === '[' || e.key === ']') && !editable(e.target)) { e.preventDefault(); walkTrail(e.key === '[' ? -1 : 1) }
  else if (!editable(e.target) && !mod && !e.altKey && e.shiftKey && ZOOM_KEYS[e.code]) zoomTo(ZOOM_KEYS[e.code]!)
})

/** Every mockup, newest first. */
let recentApps: { app: string; screens: number }[] = []
const screensNote = (n: number) => `${n} screen${n === 1 ? '' : 's'}`

/** Fill the Recent list and the project menu's. */
export async function loadRecent() {
  const res = await fetch('/api/apps').catch(() => null)
  if (!res?.ok) return
  recentApps = (await res.json() as { apps: { app: string; screens: number }[] }).apps
  $('recent').replaceChildren(...recentApps.map((a) => item(a.app, screensNote(a.screens), () => open(a.app))))
  $('recentBox').hidden = recentApps.length === 0
  placeStarters(recentApps.length === 0)
  coach.begin(recentApps.length > 0)
  renderRecentMenu()
}

/** The project menu's recent mockups, the open one ticked. */
function renderRecentMenu() {
  const now = state.app && normalizePrompt(state.app)
  const rows = recentApps.slice(0, 10).map((a) => {
    const here = normalizePrompt(a.app) === now
    const b = item(a.app, here ? '✓' : screensNote(a.screens), () => { if (!here) open(a.app) })
    b.classList.toggle('current', here)
    return b
  })
  $('menuRecent').replaceChildren(...(rows.length ? [el('h3', '', 'Recent mockups'), ...rows] : []))
}

/** A row in a list or menu: label, note on the right, click action. */
export function item(label: string, note: string, run: () => void): HTMLButtonElement {
  const b = el('button', 'item')
  b.type = 'button'
  b.title = label
  b.append(el('span', '', label), el('small', '', note))
  b.addEventListener('click', () => { closeMenus(); run() })
  return b
}

/** Open a mockup by its prompt, as if typed. */
function open(app: string) {
  promptInput.value = app
  generate.requestSubmit()
}

// ---- The toolbar: project menu, Nav, zoom

const MENUS: [string, string][] = [['projectButton', 'projectMenu'], ['navButton', 'navMenu'], ['themeButton', 'themeMenu'], ['zoomValue', 'zoomMenu'], ['boxesButton', 'boxNav'], ['accountButton', 'accountMenu']]

export function closeMenus() {
  for (const [, m] of MENUS) $(m).hidden = true
}

for (const [b, m] of MENUS) $(b).addEventListener('click', () => {
  const show = $(m).hidden
  closeMenus()
  if (!show) return
  renderToolbar()
  if (m === 'navMenu') renderNav()
  if (m === 'projectMenu') renderRecentMenu()
  if (m === 'accountMenu') renderAccountMenu()
  if (m === 'themeMenu') $(m).replaceChildren(...state.themes.map((t) => {
    const b = item(t.label, t.id === state.theme ? '✓' : '', () => setTheme(t.id))
    b.classList.toggle('current', t.id === state.theme)
    return b
  }))
  $(m).hidden = false
  $(m).querySelector<HTMLElement>('.current, .item')?.focus()
})

// A press outside a menu closes it; so does a click into a screen (the page loses focus to the frame).
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Node
  if (!MENUS.some(([b, m]) => $(b).contains(t) || $(m).contains(t))) closeMenus()
  if (state.app && generate.classList.contains('open') && !generate.contains(t) && !$('menuNew').contains(t)) closeGenerate()
})
addEventListener('blur', closeMenus)
addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  closeMenus()
  if (state.app && generate.classList.contains('open')) closeGenerate()
  if (state.drawer) closeDrawer()
})

export function openGenerate() {
  coach.did('own')
  if (state.app && generate.classList.contains('open')) return promptInput.focus() // already over a mockup: keep what was typed
  restorePickers()
  generate.classList.add('open')
  promptInput.value = ''
  draw()
  promptInput.focus()
}

function closeGenerate() {
  generate.classList.remove('open')
  draw()
}

/** Project button, Nav, trail arrows and box buttons. */
export function renderToolbar() {
  const app = state.app
  $('projectName').textContent = app ? (app.length > 40 ? app.slice(0, 39) + '…' : app) : 'New mockup'
  $('projectButton').title = app ?? 'Make a new mockup'
  $('menuFoot').hidden = !app
  const nav = $<HTMLButtonElement>('navButton')
  nav.hidden = !app || !state.entries.size
  const cur = state.current ? state.entries.get(state.current) : undefined
  for (const [id, dir] of [['trailBack', -1], ['trailForward', 1]] as const) {
    const b = $<HTMLButtonElement>(id)
    b.hidden = nav.hidden
    b.disabled = trailStep(dir) == null
  }
  $('navName').textContent = cur ? labelOf(cur) : 'Screens'
  $('themeName').textContent = state.themes.find((t) => t.id === state.theme)?.label ?? state.theme
  nav.title = cur ? labelOf(cur) : 'Every screen of this mockup'
  $('exportBoxes').hidden = $('exportProject').hidden = !app
  $('shareMenu').hidden = $('feedbackMenu').hidden = !app
  // Each box button counts entries new since the user last looked; Boxes (a narrow window's menu of them) shows the sum.
  let sum = 0
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-box]')) {
    const n = unseen(b.dataset.box as Box).length
    b.querySelector('b')!.textContent = n ? String(n) : ''
    sum += n
  }
  $('toolbar').classList.toggle('has-boxes', !side.el.hidden)
  $('boxesSum').textContent = sum ? String(sum) : ''
  if (!$('navMenu').hidden) renderNav()
  fitBar()
}

/**
 * Short of room, the bar gives way in steps, each tried in turn until the bar is one row and the mockup's name shows
 * whole or at least four letters' width: first the wordmark and the zoom icons go (tight), then the boxes fold into
 * the Boxes menu with them back, then both. A phone (two rows by design) is always tight and folded.
 */
const STEPS = [[], ['tight'], ['fold'], ['tight', 'fold']]
const phone = matchMedia('(max-width: 720px)')
function fitBar() {
  const bar = $('toolbar'), name = $('projectName')
  const fits = () => {
    const tops = [...bar.querySelectorAll<HTMLElement>('.bar > * > *')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().top)
    return Math.max(...tops) - Math.min(...tops) < 20 && name.clientWidth >= Math.min(name.scrollWidth, 4 * parseFloat(getComputedStyle(name).fontSize))
  }
  for (const step of phone.matches ? [STEPS[3]!] : STEPS) {
    bar.classList.remove('tight', 'fold')
    bar.classList.add(...step)
    if (phone.matches || fits()) return
  }
}
new ResizeObserver(() => setTimeout(fitBar)).observe($('toolbar').querySelector('.bar')!)
addEventListener('resize', fitBar)
document.fonts.ready.then(fitBar)

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) b.addEventListener('click', () => { closeMenus(); zoomTo(b.dataset.zoom!) })

// The microphone, after the speaker and before the account (voice-ui.ts).
const mic = el('button')
$('accountPop').before(mic)
initVoice(mic)

export const warmUp = (model: string) => post('/api/warmup', { model }).catch(() => {})
modelSelect.addEventListener('change', () => warmUp(modelSelect.value))

/** Export project: the whole mockup as a zip for a coding or design agent, from the server; a brief hint names the file. */
const exportProject = item('⇩ Export project…', 'zip', () => {
  if (!state.app || needsAccount('export')) return
  fetch(`/api/export?app=${encodeURIComponent(state.app)}`).then(async (res) => {
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
    const a = el('a')
    a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'mockup.zip'
    a.href = URL.createObjectURL(await res.blob())
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    hint(`Saved ${a.download} to your downloads.`)
  }).catch((e) => showError(`Could not export: ${e.message}`))
})
exportProject.id = 'exportProject'
exportProject.title = 'Download the prompt, the boxes and every screen as a zip, to hand to a coding or design agent'
$('exportBoxes').after(exportProject)
