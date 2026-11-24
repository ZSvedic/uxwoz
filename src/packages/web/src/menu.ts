// The menu (spec/behavior.md, The menu): the panel at the window's left edge that the logo opens, with New project,
// Recent, Tour, This project and UXWoz (Theme, Sound, the account, Model in the private app, Privacy); and the New
// project panel (the examples, the prompt box, Design for, Draw it), which also opens on `uxwoz:new-project`.

import { normalizePrompt } from '@uxwoz/core/keys'
import { STARTERS } from '../../core/src/starters.ts'
import { el } from './boxes.ts'
import { openLast, openTour, start } from './app.ts'
import { closeMenus, sizeFor } from './bar.ts'
import { closeCard } from './cards.ts'
import { talkButton } from './voice.ts'
import { showPage } from './sharing.ts'
import { beginHint, hint, post, showError, themeCss } from './net.ts'
import { draw } from './screens.ts'
import { needsAccount, renderAccountLine } from './account-ui.ts'
import { $, deviceSelect, enterSubmits, generate, modelSelect, promptInput, state, store } from './state.ts'

// ---- The panel

const panel = $('menuPanel')

export function openMenu() {
  renderRecent()
  renderMenu()
  renderAccountLine()
  showPage(null)
  panel.hidden = false
  panel.querySelector<HTMLElement>('.item')?.focus({ preventScroll: true })
}
export const closeMenu = () => { panel.hidden = true }

$('menuClose').addEventListener('click', closeMenus)
$('menuNew').addEventListener('click', () => { closeMenus(); openGenerate() })
$('menuTour').addEventListener('click', () => { closeMenus(); openTour().catch((e) => showError(String(e))) })

/** This project only with a project open (not the tour); Model only in the private app; the sound's word. */
function renderMenu() {
  $('menuProject').hidden = !state.app || state.tour
  $('soundState').textContent = $('sound').getAttribute('aria-pressed') === 'true' ? 'on' : 'off'
  $<HTMLSelectElement>('themeSelect').value = state.theme
}

/** The sound's word follows fx.ts's switch, which toggles on the same click. */
$('sound').addEventListener('click', () => setTimeout(renderMenu))

/** Every project, newest first. */
let recentApps: { app: string; screens: number; id?: string }[] = []
export const recent = () => recentApps

/** Fill Recent, and place the examples for a newcomer or not. */
export async function loadRecent() {
  const res = await fetch('/api/apps').catch(() => null)
  if (!res?.ok) return
  recentApps = (await res.json() as { apps: typeof recentApps }).apps
  placeStarters(recentApps.length === 0)
  beginHint(recentApps.length > 0)
  renderRecent()
}

/** The last ten projects, the open one ticked. */
function renderRecent() {
  const now = state.app && !state.tour && normalizePrompt(state.app)
  $('menuRecent').replaceChildren(...recentApps.slice(0, 10).map((a) => {
    const here = normalizePrompt(a.app) === now
    const b = item(`${here ? '✓ ' : ''}${a.app}`, () => { if (!here) open(a.app) })
    b.classList.toggle('current', here)
    return b
  }))
  $('menuRecentHead').hidden = !recentApps.length
}

/** A row of the menu: a button with its words, cut short; a click closes the menu first. */
export function item(label: string, run: () => void): HTMLButtonElement {
  const b = el('button', 'item')
  b.type = 'button'
  b.title = label
  b.append(el('span', '', label))
  b.addEventListener('click', () => { closeMenus(); run() })
  return b
}

/** Open a project by its sentence, as if typed. */
function open(app: string) {
  start(app, false).then(() => { if (!state.app) return openLast(true) }).catch((err) => showError(String(err)))
}

// A press outside the panel closes it; Esc closes it, the New project panel and a flipped card.
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Node
  if (!panel.hidden && !panel.contains(t) && !$('logo').contains(t)) closeMenu()
  if (generate.classList.contains('open') && state.app && !generate.contains(t) && !panel.contains(t) && !$('account').contains(t)) closeGenerate()
})
addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  closeMenus()
  if (generate.classList.contains('open')) closeGenerate()
  if (state.flip) closeCard()
})

// ---- UXWoz: Theme and Model

/** Theme: every mock redraws in it at once; kept in this browser. */
$('themeSelect').addEventListener('change', (e) => {
  const id = (e.target as HTMLSelectElement).value
  state.theme = id
  store.set('uxwoz:theme', id)
  themeCss(id).then(draw).catch((err) => showError(`Could not load the theme: ${err.message}`))
})

export const warmUp = (model: string) => post('/api/warmup', { model }).catch(() => {})
modelSelect.addEventListener('change', () => { store.set('uxwoz:model', modelSelect.value); warmUp(modelSelect.value) })

/** Once the config is known: the themes, the models (the private app only), the sizes, the model last chosen here. */
export function initMenu(cfg: { public?: boolean; models: { id: string; label: string }[]; defaultModel: string; themes: { id: string; label: string }[]; devices: { id: string; label: string }[]; defaultDevice: string }) {
  const theme = $<HTMLSelectElement>('themeSelect')
  for (const t of cfg.themes) theme.add(new Option(t.label, t.id))
  for (const m of cfg.models) modelSelect.add(new Option(m.label, m.id))
  const saved = store.get('uxwoz:model')
  modelSelect.value = cfg.models.some((m) => m.id === saved) ? saved! : cfg.defaultModel
  $('modelLine').hidden = !!cfg.public
  for (const s of cfg.devices) deviceSelect.add(new Option(s.label, s.id))
  sizeHere(cfg.defaultDevice)
}

/** Design for starts at this window's size, so a laptop can design a phone app. */
function sizeHere(fallback = deviceSelect.value) {
  const want = sizeFor(innerWidth)
  deviceSelect.value = [...deviceSelect.options].some((o) => o.value === want) ? want : fallback
}

// ---- This project: Export project (Share…, Feedback and Export the boxes are wired in sharing.ts and cards.ts)

/** Export project: the whole project as a zip for a coding or design agent, from the server; a brief hint names the file. */
$('exportProject').addEventListener('click', () => {
  closeMenus()
  if (!state.app || state.tour || needsAccount('export')) return
  fetch(`/api/export?app=${encodeURIComponent(state.app)}`).then(async (res) => {
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
    const a = el('a')
    a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'project.zip'
    a.href = URL.createObjectURL(await res.blob())
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    hint(`Saved ${a.download} to your downloads.`)
  }).catch((e) => showError(`Could not export: ${e.message}`))
})

// ---- New project

generate.addEventListener('submit', (e) => {
  e.preventDefault()
  const app = promptInput.value.trim()
  if (app) start(app).catch((err) => showError(String(err)))
})
enterSubmits(promptInput, generate)
// 🎙️ Hold to talk beside the prompt box, where the browser can turn speech into text.
$('promptTalk').append(...[talkButton(promptInput, (m) => showError(m))].filter((b) => b != null))
$('genClose').addEventListener('click', closeGenerate)
document.addEventListener('uxwoz:new-project', () => openGenerate())

// The examples: a card opens its project at the size in Design for, and the server replays its recording.
$('starters').replaceChildren(...STARTERS.map((s) => {
  const b = el('button', 'starter')
  b.type = 'button'
  b.title = s.prompt
  b.append(el('b', '', s.label))
  b.addEventListener('click', () => { start(s.prompt).catch((err) => showError(String(err))) })
  return b
}))

/** A newcomer (no projects) sees the examples first, under their own heading; anyone else the prompt box first. */
function placeStarters(first: boolean) {
  const box = $('startersBox')
  if (first) $('genLead').after(box)
  else generate.querySelector('.go')!.after(box)
  $('genTitle').textContent = first ? 'Turn one sentence into a clickable mock' : 'What should we mock up?'
  $('genLead').hidden = !first
  $('startersTitle').hidden = first
  $('ownTitle').hidden = !first
}

/** New project over what is open; Esc or ✕ closes it and shows what was open before. */
export function openGenerate() {
  closeMenus()
  if (generate.classList.contains('open')) return promptInput.focus()
  sizeHere()
  generate.classList.add('open')
  promptInput.value = ''
  draw()
  promptInput.focus()
}

/** Closed with nothing open under it: what `/` opens. */
export function closeGenerate() {
  generate.classList.remove('open')
  if (!state.app) return void openLast(true).catch((e) => showError(String(e)))
  draw()
}
