// The browser side: builds the canvas and the boxes beside it, opens and closes projects and the tour, and starts the
// page. screens.ts, nav.ts, cards.ts, bar.ts, menu.ts and net.ts do the rest; state.ts holds what they share.
// Those modules import each other in a circle, so the code at their top level (listeners, loops) may use only
// its own module and state.ts; anything else waits inside a function. Bun's dev server fails the page otherwise.

import { screenKey } from '@uxwoz/core/keys'
import { plannedScreens } from '@uxwoz/core/tree'
import type { CacheEntry } from '@uxwoz/core'
import type { Device } from '@uxwoz/core/frame'
import { createSide, openField, type Box } from './boxes.ts'
import { Canvas } from './canvas.ts'
import { focusBox, focusComponent, onTool, unseen } from './cards.ts'
import { hint, mapOf, post, showError, themeCss } from './net.ts'
import { landing, readAddress } from './address.ts'
import { address, applyMap, boxShown, currentKey, followAddress, goTo, notHere, resetTrail, setCurrent, showBox, syncAddress, trailStep, walkTrail } from './nav.ts'
import { again, all, cardClosed, components, draw, labelOf, onAction, openScreen, stopMaking, treeParent } from './screens.ts'
import { closeMenus, initBar } from './bar.ts'
import { closeMenu, initMenu, loadRecent, openMenu, recent, warmUp } from './menu.ts'
import { editLinkApp, loadShared, shareToken } from './sharing.ts'
import { initAccount } from './account-ui.ts'
import { $, generate, modelSelect, state, store } from './state.ts'
import './design/fx.ts' // the speaker and the whoosh

export const side = createSide()
// A press in a box makes it current (a step); one on a component's card makes that component current instead. Its
// buttons and the card it flipped to leave things as they are. Only a press on a box already current edits a field.
for (const [name, s] of Object.entries(side.sections)) s.addEventListener('pointerdown', (e) => {
  const t = e.target as Element
  if (t.closest('.acts, .flip')) return
  const comp = t.closest<HTMLElement>('.card[data-id]')
  if (comp) return focusComponent(comp.dataset.id!)
  if (state.box === name && !state.component) openField(t)
  focusBox(name as Box)
  boxShown()
})
export const canvas = new Canvas($('stage'), {
  action: onAction,
  // A press in a component's frame makes that component current, in its box.
  focus: (key) => (state.entries.get(key)?.kind === 'component' ? focusComponent(key) : setCurrent(key)),
  tool: onTool,
  zoomed: (z) => { $('zoomPct').textContent = `${Math.round(z * 100)}%` },
}, side.el, side.components)

// ---- Projects

/**
 * Open a project: its mocks from the cache, else (unless `make` is false) its Home. `at`: the mock (`sid`) or box its
 * address names (else the mock last looked at here), and whether the address changes in place.
 */
export async function start(app: string, make = true, at: { sid?: string | null; box?: Box | null; inPlace?: boolean; device?: Device } = {}) {
  // Its draws write no address until it is open: then one, as a new step unless in place.
  address.hold++
  try { await openProject(app, make, at.sid, at.box ?? null, at.device) } finally { address.hold--; syncAddress(at.inPlace) }
}

/** A project's boxes and their Undo, as none: the map of the project opened brings its own. */
const noBoxes = () => { state.boxes = null; state.past = { components: [], rules: [], data: [] } }

async function openProject(app: string, make: boolean, sid: string | null | undefined, box: Box | null, device?: Device) {
  showError(null)
  const n = ++state.starts
  const res = await mapOf(app)
  // 401: a first-time visitor of the public app, who has no person (and so no projects) until the first mock.
  if (!res.ok && res.status !== 401) throw new Error(`could not load the project: HTTP ${res.status}`)
  const map = res.ok ? await res.json() as { entries: CacheEntry[] } : { entries: [] }
  if (n !== state.starts) return // a newer project was opened meanwhile
  if (!make && !map.entries.length) {
    store.set('uxwoz:app', '')
    if (sid !== undefined) await notHere()
    return
  }
  // The project is there (or is to be made): a design still drawn for the one open before stops.
  stopMaking()
  noBoxes()
  state.app = app
  state.tour = false
  state.flip = state.box = state.component = state.boxEdit = null
  store.set('uxwoz:app', app)
  generate.classList.remove('open')
  applyMap(map)
  const root = screenKey(app, null)
  // The mock the address names; one deleted since lands on Home, with a word why.
  const l = sid !== undefined && !box ? landing(app, state.entries, sid) : null
  if (sid !== undefined && !box && !l) return notHere()
  const named = l?.entry
  if (l?.why) hint(l.why)
  const saved = named?.key ?? store.get(currentKey(app))
  state.current = saved && state.entries.get(saved)?.versions.length ? saved : state.entries.get(root)?.versions.length ? root : null
  resetTrail()
  // A first Home: the address stays as it is until Home is stored (`start` writes it then).
  if (!state.entries.has(root)) return openScreen(null, null, null, device)
  await draw()
  loadShared()
  // The current mock at 100%.
  canvas.fit(state.current ?? root)
  if (box) showBox(box)
}

/** The tour: a read-only project from /api/tour, at the mock (by name) or box its address names, else its first mock. */
export async function openTour(at: { at?: string | null; box?: Box | null } = {}, inPlace = false) {
  address.hold++
  try {
    showError(null)
    const n = ++state.starts
    const res = await fetch('/api/tour')
    if (!res.ok) throw new Error(`could not load the tour: HTTP ${res.status}`)
    const map = await res.json() as { entries: CacheEntry[] }
    if (n !== state.starts) return
    const app = map.entries[0]?.app
    if (!app) throw new Error('the tour is missing')
    stopMaking()
    noBoxes()
    Object.assign(state, { app, tour: true, flip: null, box: null, component: null, boxEdit: null })
    generate.classList.remove('open')
    applyMap(map)
    const l = landing(app, state.entries, at.at ?? null, true)
    if (l?.why) hint(l.why)
    state.current = null
    resetTrail()
    if (l) { setCurrent(l.entry.key); canvas.fit(l.entry.key) } else await draw()
    if (at.box) showBox(at.box)
  } finally { address.hold--; syncAddress(inPlace) }
}

/** What `/` opens: the project open last here, else the newest in Recent (`except` one just deleted), else the tour. */
export async function openLast(inPlace = false, except?: string) {
  const last = store.get('uxwoz:app')
  if (last && last !== except) { await start(last, false, { inPlace }); if (state.app) return }
  await loadRecent()
  const newest = recent().find((a) => a.app !== except)
  if (newest) { await start(newest.app, false, { inPlace }); if (state.app) return }
  await openTour({}, inPlace)
}

export function closeMockup() {
  state.busy?.abort()
  store.set('uxwoz:app', '')
  noBoxes()
  Object.assign(state, { app: null, tour: false, entries: new Map(), filing: false, visiting: false, boxEdit: null, current: null, box: null, making: null, revising: null, flip: null, component: null })
  resetTrail()
  loadRecent()
  draw()
}

$('startOver').addEventListener('click', () => { closeMenus(); deleteApp(true).catch((e) => showError(String(e))) })
$('deleteApp').addEventListener('click', () => { closeMenus(); deleteApp(false).catch((e) => showError(String(e))) })

/** Delete every mock of the open project, after asking; then draw Home again, or open the newest other project, or the tour. */
async function deleteApp(again: boolean) {
  const app = state.app
  if (!app || state.tour) return
  const n = state.entries.size - components().length
  const what = `${n === 1 ? 'the only mock of this project' : `all ${n} mocks of this project`} and its boxes (components, rules, data), with its reviewer links and their feedback`
  if (!confirm(again ? `Start over? This deletes ${what} and draws Home again.` : `Delete ${what}?`)) return
  state.busy?.abort()
  // Start over draws Home again at the project's size, not the window's.
  const device = state.entries.get(screenKey(app, null))?.versions[0]?.device
  const res = await post('/api/delete-app', { app }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the project')
  store.set(currentKey(app), '')
  if (again) { loadRecent(); return start(app, true, { inPlace: true, device }) } // the dead address leaves the history
  store.set('uxwoz:app', '')
  await openLast(true, app)
}


async function init() {
  const cfg = await (await fetch('/api/config')).json()
  if (cfg.warning) showError(cfg.warning)
  initBar({
    canvas,
    canStep: (dir) => trailStep(dir) != null,
    walk: walkTrail,
    look: showBox,
    go: goTo,
    make: (e) => { if (state.tour) return; if (state.busy) return hint(); openScreen(`@${e.name}`, e.parent!.key, e.parent!.label) },
    view: () => ({
      app: state.app, current: state.current, box: state.box, making: state.making && (state.making.version?.name || state.making.name), hasBoxes: !!state.boxes && !side.el.hidden,
      mocks: [...all(), ...plannedScreens(all()).map((e) => ({ ...e, planned: true }))],
    }),
    parentOf: treeParent,
    nameOf: labelOf,
    unseen: (box) => (state.tour ? 0 : unseen(box).length), // the tour counts nothing new
    openMenu,
    closeMenu,
  })
  initMenu(cfg)
  initAccount({ post, showError, loadRecent, closeMenus, signedUp: again, dismissed: cardClosed, say: (t) => hint(t) }, cfg)
  state.themes = cfg.themes
  const theme = store.get('uxwoz:theme')
  state.theme = state.themes.some((t) => t.id === theme) ? theme! : cfg.defaultTheme
  warmUp(modelSelect.value)
  await loadRecent()
  await themeCss(state.theme)
  // An address opens its project or the tour at its mock or box; else `/` opens the project open last, the newest,
  // or the tour. An edit link keeps its own address. Until then no draw writes an address; then it replaces this one.
  try {
    if (!shareToken && readAddress(location.pathname)) return await followAddress()
    if (shareToken) { const last = await editLinkApp(); if (last) return await start(last, false, { inPlace: true }) }
    else return await openLast(true)
    draw()
  } finally { address.hold--; syncAddress(true) }
}

init().catch((e) => showError(`Could not load the app config: ${e.message}`))
