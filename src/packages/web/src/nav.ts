// Where the user is: the current mock or box, the ← → steps, the address and Back and Forward, the project from the
// server after filing, and the tour's last mock coming into view.

import { normalizePrompt } from '@uxwoz/core/keys'
import { isComponent } from '@uxwoz/core/tree'
import type { CacheEntry } from '@uxwoz/core'
import type { Box } from './boxes.ts'
import { addStep as addStepTo, addressOf, addressStep, landing, readAddress, stepTo, type Trail } from './address.ts'
import { canvas, openLast, openTour, side, start } from './app.ts'
import { focusBox, lookAt, seenSoon } from './cards.ts'
import { hint, mapOf, post, showError } from './net.ts'
import { shareToken } from './sharing.ts'
import { loadMe } from './account-ui.ts'
import { all, draw } from './screens.ts'
import { renderToolbar } from './bar.ts'
import { state, store } from './state.ts'

export function setCurrent(key: string | null) {
  if (state.current === key && !state.box) return
  state.current = key
  state.box = null
  saveCurrent()
  draw()
  toured()
}

export const currentKey = (app: string) => `uxwoz:current:${normalizePrompt(app)}`
export function saveCurrent() {
  if (!state.app || !state.current) return
  store.set(currentKey(state.app), state.current)
  addStep()
}

// ---- ← and →: every mock or box that became current is a step (address.ts), and an entry of the browser's history

let trail: Trail = { steps: [], at: -1 }
/** A step is being taken by ← →, Back or Forward: it adds none. `pending`: the step ← or → went to, until the
 *  address of it arrives. */
const walk = { moving: false, pending: null as number | null }
const stepNow = () => (state.box ? `box:${state.box}` : state.current)

/** Reaching a mock or box any way but ← and → ends the steps here, as a browser's history does. */
function addStep() {
  const s = stepNow()
  if (s && !walk.moving) trail = addStepTo(trail, s)
}

export function resetTrail() {
  trail = { steps: stepNow() ? [stepNow()!] : [], at: stepNow() ? 0 : -1 }
  walk.pending = null
}

const there = (s: string) => (s.startsWith('box:') ? !!state.boxes && !side.el.hidden : !!state.entries.get(s)?.versions.length)

/** The index of the nearest step in a direction that is still there (mocks deleted since are skipped). */
export const trailStep = (dir: 1 | -1) => stepTo(trail, dir, stepNow(), there)

/** ← and →: the mock or box looked at before, or after. The browser's history moves along, so its Back and Forward
 *  stay the same steps (an edit link writes no address, so it goes there at once). */
export function walkTrail(dir: 1 | -1) {
  const i = trailStep(dir)
  if (i == null) return
  if (!shareToken && !address.hold) {
    walk.pending = i
    return history.go(i - trail.at)
  }
  trail = { ...trail, at: i }
  walk.moving = true
  try { goTo(trail.steps[i]!) } finally { walk.moving = false }
}

/** A box became current (the bar, the dropdown, a press in it, ← →): a step, and its address. */
export function boxShown() {
  addStep()
  syncAddress()
  renderToolbar()
}

/** Bring a box into view and make it current; in the tour nothing is marked seen, since that would change it. A
 *  navigation: the glide ends at 75% of the box's 100% at least. */
export function showBox(box: Box) {
  if (side.el.hidden) return
  canvas.navigate(() => { if (state.tour) { focusBox(box); canvas.showBox(side.sections[box]) } else lookAt(box) })
  boxShown()
}

/** Make a mock current and glide to it, or a box (`box:<name>`): the dropdown, ← →, Back and Forward, so the glide
 *  ends at 75% of the target's 100% at least. */
export function goTo(step: string) {
  if (step.startsWith('box:')) return showBox(step.slice(4) as Box)
  if (!state.entries.get(step)?.versions.length) return
  canvas.moved = performance.now()
  setCurrent(step)
  canvas.navigate(() => canvas.reveal(step))
}

/** The tour's last mock (the deepest) came into view: counted once in this browser. */
function toured() {
  if (!state.tour || !state.current) return
  const mocks = all().filter((e) => !isComponent(e))
  const level = (e: CacheEntry) => state.tree.get(e.key)?.level ?? 0
  const last = mocks.reduce<CacheEntry | undefined>((a, e) => (!a || level(e) >= level(a) ? e : a), undefined)
  if (state.current !== last?.key || store.get('uxwoz:toured')) return
  store.set('uxwoz:toured', '1')
  post('/api/step', { step: 'toured' }).catch(() => {})
}

export function applyMap(map: { entries: CacheEntry[]; boxes?: typeof state.boxes; past?: typeof state.past; filing?: boolean; visiting?: boolean }) {
  Object.assign(state, { entries: new Map(map.entries.map((e) => [e.key, e])), boxes: map.boxes ?? state.boxes, past: map.past ?? state.past, filing: !!map.filing, visiting: !!map.visiting })
  if (!state.visiting) state.boxEdit = null
  state.edits++
  // Filing or a visit runs (after a reload, say) and nothing waits for it yet.
  if ((state.filing || state.visiting) && state.waiting !== state.app && !state.tour) filed()
  if (state.current && !state.entries.has(state.current)) state.current = null
  draw()
  // New entries in the box being looked at count as seen after a moment, as at a look.
  if (state.box && !side.el.hidden) seenSoon(state.box)
}

/** After a settle, an Edit or a visit: fetch the project once filing is done; a map that crosses a change made here
 *  is fetched again. The wait is its project's: another one opened meanwhile ends it and is left as it is. */
export async function filed() {
  const app = state.app
  if (state.tour || !app) return
  state.waiting = app
  try {
    for (let tries = 0, wait = true; tries < 40 && app === state.app; tries++, wait = false) {
      const n = state.edits
      const res = await mapOf(app, wait).catch(() => null)
      if (app !== state.app) return
      const map = res?.ok ? await res.json() : null
      if (map && n === state.edits && !state.busy) {
        state.waiting = null
        return applyMap(map)
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
  } finally {
    if (state.waiting === app) {
      state.waiting = null
      // Given up (no answer, or changes kept crossing it): the lines say filing and visiting no more.
      if (app === state.app) { state.filing = state.visiting = false; state.boxEdit = null; draw() }
    }
    loadMe() // filing, a box's Edit and a visit are live calls: the free screens left
  }
}

// ---- The address: `/m/<project>/<mock>`, `/m/<project>/box-rules`, `/tour/<mock>` (an edit link keeps its own)

/** Counts projects being opened, whose draws are half done, and the page's own opening (from 1, until init has
 * opened what the address names: that never adds a step). */
export const address = { hold: 1 }

/** Write the address of what shows: a new step whenever the mock or box shown changes, or in place of this one (a
 * reload, Back and Forward); a redraw of the same mock writes nothing. */
export function syncAddress(inPlace = false) {
  if (shareToken || address.hold) return
  const want = addressOf(state.app, state.entries, state.current, state.box, state.tour)
  const how = addressStep(location.pathname, want, inPlace)
  if (how) history[how === 'push' ? 'pushState' : 'replaceState'](null, '', want)
}

/** An address that names nothing here (deleted, or another person's): `/`, a word why, and what `/` opens. */
export async function notHere() {
  history.replaceState(null, '', '/')
  hint('That project is not here.')
  await openLast(true)
}

/** Open what the address names (a reload, a pasted address, Back and Forward): a project or the tour at a mock or box, or what `/` opens. */
export async function followAddress() {
  const at = readAddress(location.pathname)
  if (!at) return openLast(true)
  const tour = at.mid === null
  const root = state.app ? state.entries.get(normalizePrompt(state.app)) : undefined
  if (state.app && (tour ? state.tour : !state.tour && root?.mid === at.mid)) {
    const step = at.box ? `box:${at.box}` : undefined
    const l = step ? null : landing(state.app, state.entries, at.at, tour)
    if (!step && !l) return notHere()
    // A mock deleted since: Home, in place of the dead address, and a word why.
    if (l?.why) { history.replaceState(null, '', addressOf(state.app, state.entries, l.entry.key, null, tour) ?? '/'); hint(l.why) }
    const s = step ?? l!.entry.key
    // Along the steps when it is on them (the one ← or → went to first), so ← and → still lead where they did.
    const p = walk.pending
    walk.pending = null
    const i = p != null && trail.steps[p] === s ? p : trail.steps.lastIndexOf(s)
    if (i >= 0) trail = { ...trail, at: i }
    walk.moving = i >= 0
    try { goTo(s) } finally { walk.moving = false }
    renderToolbar()
    return
  }
  if (tour) return openTour({ at: at.at, box: at.box }, true)
  const res = await fetch('/api/apps').catch(() => null)
  const apps = res?.ok ? (await res.json() as { apps: { app: string; id?: string }[] }).apps : []
  const app = apps.find((a) => a.id === at.mid)?.app
  if (!app) return notHere()
  await start(app, false, { sid: at.at, box: at.box, inPlace: true })
}

// An edit link keeps its own address, so it has nothing to follow.
addEventListener('popstate', () => { if (!shareToken) followAddress().catch((e) => showError(String(e))) })
