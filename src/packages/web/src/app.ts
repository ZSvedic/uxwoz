// The browser side: builds the canvas and the boxes beside it, opens and closes mockups, and starts the page.
// screens.ts, nav.ts, drawer.ts, toolbar.ts and net.ts do the rest; state.ts holds what they share.
// Those modules import each other in a circle, so the code at their top level (listeners, loops) may use only
// its own module and state.ts; anything else waits inside a function. Bun's dev server fails the page otherwise.

import { isDevice } from '@uxwoz/core/frame'
import { screenKey } from '@uxwoz/core/keys'
import type { CacheEntry } from '@uxwoz/core'
import { createSide, type Box } from './boxes.ts'
import { Canvas } from './canvas.ts'
import { boxOp, focusBox, onTool, openDrawer } from './drawer.ts'
import { hint, mapOf, post, showError, themeCss } from './net.ts'
import { landing, readAddress } from './address.ts'
import { address, applyMap, currentKey, followAddress, notHere, resetTrail, setCurrent, showsAt, syncAddress, toStart } from './nav.ts'
import { again, all, cardClosed, components, dropChoice, draw, fitChoice, fitScreenSoon, onAction, openScreen, pick, stopMaking } from './screens.ts'
import { PICKERS, closeMenus, loadRecent, openGenerate, warmUp } from './toolbar.ts'
import { editLinkApp, loadShared, shareToken } from './sharing.ts'
import { initAccount } from './account-ui.ts'
import { $, deviceSelect, generate, modelSelect, promptInput, state, store } from './state.ts'

export const side = createSide(boxOp, (box, tab) => { focusBox(box); openDrawer(tab) })
// A press in a box makes it current; one in a component card makes that card current instead.
for (const [name, s] of Object.entries(side.sections)) s.addEventListener('pointerdown', (e) => { if (!(e.target as Element).closest('.card')) focusBox(name as Box) })
export const canvas = new Canvas($('stage'), {
  action: onAction,
  pick,
  cancel: dropChoice,
  focus: setCurrent,
  tool: onTool,
  zoomed: (z) => { $('zoomPct').textContent = `${Math.round(z * 100)}%` },
}, side.el, side.components)

// ---- Mockups

/**
 * Open a mockup: its screens from the cache, else (unless `make` is false) its first screen as A OR B. `at`: the
 * screen its address names (else the one last looked at here), and whether the address changes in place.
 */
export async function start(app: string, make = true, at: { sid?: string | null; inPlace?: boolean } = {}) {
  // Its draws write no address until it is open: then one, as a new step unless in place.
  address.hold++
  try { await openMockup(app, make, at.sid, !!at.inPlace) } finally { address.hold--; syncAddress(at.inPlace) }
}

async function openMockup(app: string, make: boolean, sid: string | null | undefined, inPlace: boolean) {
  showError(null)
  stopMaking()
  state.before = null
  const n = ++state.starts
  const res = await mapOf(app)
  // 401: a first-time visitor of the public app, who has no person (and so no mockups) until the first screen.
  if (!res.ok && res.status !== 401) throw new Error(`could not load the mockup: HTTP ${res.status}`)
  const map = res.ok ? await res.json() as { entries: CacheEntry[] } : { entries: [] }
  if (n !== state.starts) return // a newer mockup was opened meanwhile
  if (!make && !map.entries.length) { store.set('uxwoz:app', ''); return sid !== undefined ? notHere() : draw() }
  state.app = app
  state.drawer = state.box = null
  state.failed.clear()
  store.set('uxwoz:app', app)
  generate.classList.remove('open')
  applyMap(map)
  const root = screenKey(app, null)
  // The screen the address names; one deleted since lands on the first screen, with a word why.
  const l = sid !== undefined ? landing(app, state.entries, sid) : null
  if (sid !== undefined && !l) return notHere()
  const named = l?.entry
  if (l?.why) hint(l.why)
  const saved = named?.key ?? store.get(currentKey(app))
  state.current = saved && state.entries.get(saved)?.versions.length ? saved : state.entries.get(root)?.versions.length ? root : null
  resetTrail()
  // A mockup keeps the device it was made for: new screens in it, and Start over, use it too.
  const made = state.entries.get(root)
  const device = made?.versions[0]?.device ?? made?.proposals?.find(Boolean)?.device
  if (device) deviceSelect.value = device // for this mockup only: the saved choice stays
  if (!state.entries.has(root)) { toStart(inPlace); return openScreen(null, null, null) }
  await draw()
  loadShared()
  // An open A OR B is fitted, unless the address named a drawn screen: then that screen, and the address stays.
  const open = all().find((e) => !e.versions.length)
  if (open && !named?.versions.length) fitChoice(open.key, false) // a reload or another mockup opened: no hint
  else fitScreenSoon(state.current ?? root)
  if (named) showsAt(named.key)
}

/** The pickers as last chosen in this browser. */
export function restorePickers() {
  const d = store.get('uxwoz:device')
  if (isDevice(d)) deviceSelect.value = d
}

export function closeMockup() {
  state.busy?.abort()
  restorePickers()
  store.set('uxwoz:app', '')
  Object.assign(state, { app: null, entries: new Map(), boxes: null, filing: false, current: null, box: null, making: null, revising: null, drawer: null, before: null })
  resetTrail()
  loadRecent()
  draw()
}

$('menuNew').addEventListener('click', () => { closeMenus(); openGenerate() })
$('startOver').addEventListener('click', () => { closeMenus(); deleteApp(true).catch((e) => showError(String(e))) })
$('deleteApp').addEventListener('click', () => { closeMenus(); deleteApp(false).catch((e) => showError(String(e))) })

/** Delete every screen of the open mockup, after asking; then make its first screen again, or close it. */
async function deleteApp(again: boolean) {
  const app = state.app
  if (!app) return
  const n = state.entries.size - components().length
  const what = `${n === 1 ? 'the only screen of this mockup' : `all ${n} screens of this mockup`} and its boxes (components, rules, data), with its reviewer links and their feedback`
  if (!confirm(again ? `Start over? This deletes ${what} and makes its first screen again.` : `Delete ${what}?`)) return
  state.busy?.abort()
  const res = await post('/api/delete-app', { app }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the mockup')
  store.set(currentKey(app), '')
  loadRecent()
  if (again) return start(app, true, { inPlace: true }) // the dead address leaves the history
  closeMockup()
}

async function init() {
  const cfg = await (await fetch('/api/config')).json()
  if (cfg.warning) showError(cfg.warning)
  initAccount({ post, showError, loadRecent, closeMenus, signedUp: again, dismissed: cardClosed }, cfg)
  for (const [s, name] of PICKERS) {
    const list: { id: string; label: string }[] = cfg[`${name}s`], saved = store.get(`uxwoz:${name}`)
    for (const x of list) s.add(new Option(x.label, x.id))
    s.value = list.some((x) => x.id === saved) ? saved! : cfg[`default${name[0]!.toUpperCase()}${name.slice(1)}`]
  }
  state.themes = cfg.themes
  const theme = store.get('uxwoz:theme')
  state.theme = state.themes.some((t) => t.id === theme) ? theme! : cfg.defaultTheme
  warmUp(modelSelect.value)
  loadRecent()
  await themeCss(state.theme)
  // An address opens its mockup at its screen; else a reload opens the mockup that was open, with its A OR B if
  // one was waiting for a pick. An edit link keeps its own address.
  // Until then no draw writes an address (one with no mockup yet would add `/` as a step); then it replaces this one.
  try {
    if (!shareToken && readAddress(location.pathname)) return await followAddress()
    const last = shareToken ? await editLinkApp() : store.get('uxwoz:app')
    if (last) return await start(last, false, { inPlace: true })
    draw()
    promptInput.focus()
  } finally { address.hold--; syncAddress(true) }
}

init().catch((e) => showError(`Could not load the app config: ${e.message}`))
