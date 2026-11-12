// Where the user is: the current screen, the ← → trail, the address and Back and Forward, the mockup from the server
// after filing, and Nav.

import { normalizePrompt } from '@uxwoz/core/keys'
import { isComponent, plannedScreens } from '@uxwoz/core/tree'
import type { Boxes, CacheEntry } from '@uxwoz/core'
import { Shown, addressOf, addressStep, landing, readAddress } from './address.ts'
import { canvas, closeMockup, side, start } from './app.ts'
import { lookAt } from './drawer.ts'
import { hint, mapOf, showError } from './net.ts'
import { shareToken } from './sharing.ts'
import { loadMe } from './account-ui.ts'
import { all, components, draw, fitChoice, labelOf, openScreen, treeParent } from './screens.ts'
import { item } from './toolbar.ts'
import { $, state, store } from './state.ts'

/** The current box's element, else the current screen's key. */
export const currentAt = () => (state.box ? side.sections[state.box] : state.current ?? undefined)

export function setCurrent(key: string | null) {
  if (state.current === key && !state.box) return
  state.current = key
  state.box = null
  saveCurrent()
  draw()
}

export const currentKey = (app: string) => `uxwoz:current:${normalizePrompt(app)}`
export function saveCurrent() {
  if (!state.app || !state.current) return
  store.set(currentKey(state.app), state.current)
  // A screen reached any way but ← and → ends the trail here, as a browser's history does.
  if (!trail.moving && trail.keys[trail.at] !== state.current) {
    trail.keys = [...trail.keys.slice(0, trail.at + 1), state.current]
    trail.at = trail.keys.length - 1
  }
}

/** The screens looked at in the open mockup, in order, for ← and →. */
const trail = { keys: [] as string[], at: -1, moving: false }

export function resetTrail() {
  trail.keys = state.current ? [state.current] : []
  trail.at = trail.keys.length - 1
}

/** The trail index of the nearest screen in a direction that still exists. */
export function trailStep(dir: 1 | -1): number | null {
  for (let i = trail.at + dir; i >= 0 && i < trail.keys.length; i += dir) {
    const k = trail.keys[i]!
    if (k !== state.current && state.entries.get(k)?.versions.length) return i
  }
  return null
}

/** ← and →: the screen looked at before, or after. */
export function walkTrail(dir: 1 | -1) {
  const i = trailStep(dir)
  if (i == null) return
  trail.at = i
  trail.moving = true
  try { goTo(trail.keys[i]!) } finally { trail.moving = false }
}

export function applyMap(map: { entries: CacheEntry[]; boxes?: Boxes; past?: typeof state.past; filing?: boolean; visiting?: boolean }) {
  Object.assign(state, { entries: new Map(map.entries.map((e) => [e.key, e])), boxes: map.boxes ?? state.boxes, past: map.past ?? state.past, filing: !!map.filing, visiting: !!map.visiting })
  state.edits++
  // Filing or a visit runs (after a reload, say) and nothing waits for it yet.
  if ((state.filing || state.visiting) && !state.waiting) filed()
  if (state.current && !state.entries.has(state.current)) state.current = null
  draw()
}

/** After a pick, an Edit or a visit: fetch the mockup once filing is done; a map that crosses a change made here is fetched again. */
export async function filed() {
  const app = state.app
  state.waiting = true
  try {
    for (let tries = 0, wait = true; tries < 40 && app && app === state.app; tries++, wait = false) {
      const n = state.edits
      const res = await mapOf(app, wait).catch(() => null)
      if (app !== state.app) return
      const map = res?.ok ? await res.json() : null
      if (map && n === state.edits && !state.busy && !state.picking) {
        state.waiting = false
        return applyMap(map)
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
  } finally {
    // Given up (no answer, or changes kept crossing it): the lines say filing and visiting no more.
    if (state.waiting) { state.waiting = state.filing = state.visiting = false; draw() }
    loadMe() // filing, a box's Edit and a visit are live calls: the free screens left
  }
}

/** Every screen as an indented tree, planned screens greyed (a click makes one), the current path marked. */
export function renderNav() {
  const menu = $('navMenu')
  const list = [...all(), ...plannedScreens(all())]
  const path = new Set<string>()
  for (let k = state.current; k && !path.has(k); k = treeParent(k)) path.add(k)
  const rows: HTMLElement[] = []
  const seen = new Set<string>()
  const walk = (e: CacheEntry, depth: number) => {
    if (seen.has(e.key)) return
    seen.add(e.key)
    const via = state.tree.get(e.key)?.label
    const planned = !state.entries.has(e.key)
    const b = planned
      ? item(labelOf(e), 'not made yet', () => (state.busy ? hint() : openScreen(`@${e.name}`, e.parent!.key, e.parent!.label)))
      : item(labelOf(e), via ? `via ${via}` : '', () => goTo(e.key))
    for (const [cls, on] of Object.entries({ planned, path: path.has(e.key), current: e.key === state.current })) b.classList.toggle(cls, on)
    b.style.setProperty('--depth', String(depth))
    rows.push(b)
    for (const k of list) if (treeParent(k.key) === e.key) walk(k, depth + 1)
  }
  // The first screen first; screens the first screen does not reach after it, as their own trees.
  for (const e of list) if (!treeParent(e.key) && !isComponent(e)) walk(e, 0)
  // Then the components.
  const comps = components()
  if (comps.length) {
    const head = item('Components', `${comps.length}`, () => lookAt('components'))
    rows.push(head)
    for (const c of comps) {
      const b = item(c.name!, 'component', () => goTo(c.key))
      b.style.setProperty('--depth', '1')
      b.classList.toggle('current', c.key === state.current)
      rows.push(b)
    }
  }
  menu.replaceChildren(...rows)
}

// ---- The address: `/m/<mockup>/<screen>` (an edit link keeps its own)

/** The screen the address names; `hold` counts mockups being opened, whose draws are half done, and the page's
 * own opening (from 1, until init has opened what the address names: that never adds a step). */
let shown = new Shown()
export const address = { hold: 1 }

/** The address names this screen (Back or Forward went there, or it was opened by its address). */
export const showsAt = (key: string) => shown.went(key, state.current, state.entries)

/** Write the address of what is shown: a new step whenever the screen shown changes (a click, Nav, ← →, the tree), or
 * in place of this one (a reload, Back and Forward); a redraw of the same screen writes nothing. */
export function syncAddress(inPlace = false) {
  if (shareToken || address.hold) return
  // With no mockup open, what was shown is forgotten: a mockup opened again starts afresh.
  if (!state.app) shown = new Shown()
  const want = addressOf(state.app, state.entries, state.app ? shown.next(state.current, state.entries) : null)
  const how = addressStep(location.pathname, want, inPlace)
  if (how) history[how === 'push' ? 'pushState' : 'replaceState'](null, '', want)
}

/** A new mockup, or Start over: the address is the start page at once, until the mockup's own ID arrives. */
export function toStart(inPlace: boolean) {
  if (!shareToken && location.pathname !== '/') history[inPlace ? 'replaceState' : 'pushState'](null, '', '/')
}

/** An address that names nothing here (deleted, or another person's): the start page, and a word why. */
export function notHere() {
  if (state.app) closeMockup()
  history.replaceState(null, '', '/')
  hint('That mockup is not here.')
}

/** Open what the address names (a reload, a pasted address, Back and Forward): a mockup at a screen, or the start page. */
export async function followAddress() {
  const at = readAddress(location.pathname)
  if (!at) { if (state.app) closeMockup(); return }
  const root = state.app ? state.entries.get(normalizePrompt(state.app)) : undefined
  if (root?.mid === at.mid) {
    const l = landing(state.app!, state.entries, at.sid)
    if (!l) return notHere()
    const e = l.entry
    // A screen deleted since: the first screen, in place of the dead address, and a word why.
    if (l.why) { history.replaceState(null, '', addressOf(state.app, state.entries, e.key) ?? '/'); hint(l.why) }
    // Along the trail when the screen is on it, so ← and → still lead where they did.
    const i = trail.keys.lastIndexOf(e.key)
    if (i >= 0) trail.at = i
    trail.moving = i >= 0
    showsAt(e.key)
    try { goTo(e.key) } finally { trail.moving = false }
    return
  }
  const res = await fetch('/api/apps').catch(() => null)
  const apps = res?.ok ? (await res.json() as { apps: { app: string; id?: string }[] }).apps : []
  const app = apps.find((a) => a.id === at.mid)?.app
  if (!app) return notHere()
  await start(app, false, { sid: at.sid, inPlace: true })
}

// An edit link keeps its own address, so it has nothing to follow.
addEventListener('popstate', () => { if (!shareToken) followAddress().catch((e) => showError(String(e))) })

/** Make a screen current and bring it into view; an open A OR B is fitted instead. */
function goTo(key: string) {
  const e = state.entries.get(key)
  if (!e) return
  canvas.moved = performance.now()
  if (e.versions.length) { setCurrent(key); canvas.reveal(key) } else fitChoice(key)
}

$('trailBack').addEventListener('click', () => walkTrail(-1))
$('trailForward').addEventListener('click', () => walkTrail(1))
// The mouse's own back and forward buttons do the same, instead of leaving the page.
addEventListener('mouseup', (e: MouseEvent) => {
  if (e.button !== 3 && e.button !== 4) return
  e.preventDefault()
  walkTrail(e.button === 3 ? -1 : 1)
})
