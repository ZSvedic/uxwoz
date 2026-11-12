// The screens: how each shows on the canvas, making one as A OR B, picking, clicks, Regenerate, Edit, Undo, delete.

import { DEVICES, LEGACY_WIDTH, markCurrent, pasteComponents, type Device } from '@uxwoz/core/frame'
import { canonicalAction, isBack, nameWords, screenKey, screenRef } from '@uxwoz/core/keys'
import { componentsOf, isComponent, namesOf, screenTree } from '@uxwoz/core/tree'
import type { CacheEntry, Version } from '@uxwoz/core'
import { renderSide } from './boxes.ts'
import type { CardView, ScreenView } from './canvas.ts'
import { canvas, closeMockup, side } from './app.ts'
import { boxOp, renderDrawer } from './drawer.ts'
import { checkHint, coach, mapOf, post, showError, hint, stream, streamInto, themeCss, type StreamRenderer } from './net.ts'
import { sideAct } from './account-ui.ts'
import { pickFx } from './design/fx.ts'
import { applyMap, filed, saveCurrent, setCurrent, syncAddress } from './nav.ts'
import { loadRecent, openGenerate, renderToolbar } from './toolbar.ts'
import { changeInput, deviceSelect, generate, modelSelect, promptInput, state, type Making, type Side } from './state.ts'

// ---- Views

/** A screen's short name: the one the model gave it, else its first heading, else its prompt. */
function nameOf(e: CacheEntry, v: Version): string {
  if (v.name) return v.name
  const h = v.html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1]
  // Parsed, not just stripped of tags, so entities like &amp; read as text.
  const text = h && new DOMParser().parseFromString(h, 'text/html').body.textContent?.trim()
  return (text || e.action || e.app).slice(0, 60)
}

/** e.g. "L2 Camera"; a planned screen's from its name; a component's is its ID. */
export const labelOf = (e: CacheEntry) => isComponent(e) ? e.name! : `L${state.tree.get(e.key)?.level ?? '?'} ${e.versions.length ? nameOf(e, e.versions.at(-1)!)
  : state.entries.has(e.key) ? 'New screen · pick one' : nameWords(e.name!).replace(/^./, (c) => c.toUpperCase())}`

/** The tree parent: the screen fewest clicks from home that leads here. */
export const treeParent = (key: string) => state.tree.get(key)?.parent ?? null

const widthOf = (d: Device | undefined) => (d ? DEVICES[d].width : LEGACY_WIDTH)
export const ideaOf = (v: Version) => v.idea ?? ''

/** Every screen and component, as the server last sent them. */
export const all = () => [...state.entries.values()]
export const components = () => all().filter(isComponent)
/** A stored screen as it shows: its components pasted, links to itself marked current. */
export const page = (html: string, name: string | undefined, c = componentsOf(all())) => markCurrent(pasteComponents(html, c), name)
/** The screens whose newest version pastes a component. */
export const pastedOn = (id: string) => all().filter((e) => !isComponent(e) && new RegExp(`data-component\\s*=\\s*["']?${id}["'\\s>]`, 'i').test(e.versions.at(-1)?.html ?? ''))

function sideCard(key: string, index: number, side: Side | null, stored: Version | null, device: Device | undefined): CardView {
  const version = stored ?? side?.version ?? null
  const id = `${key}#${index}`
  const error = version ? undefined : side ? side.error ?? undefined : state.failed.get(id) ?? 'This design was not finished.'
  // A new screen waits for the last filing first (at most 5 s), so its paper holds what was filed.
  const idea = version ? ideaOf(version) : side && state.filing ? 'Waiting for filing, then drawing…' : ''
  return {
    id, width: widthOf(version?.device ?? device), device: version?.device ?? device, name: '', idea,
    side: { index, pickable: !!version }, error, act: error ? sideAct(error) ?? (stored === null && !side ? { text: 'Try again', run: () => redraw(key) } : undefined) : undefined,
    streaming: !version && !error,
  }
}

export function views(): ScreenView[] {
  const out: ScreenView[] = []
  const m = state.making
  for (const e of state.entries.values()) {
    const v = e.versions.at(-1)
    const making = m?.key === e.key ? m : null
    const revising = state.revising?.key === e.key ? state.revising : null
    const shown = v && { key: e.key, current: state.current === e.key && !state.box, undo: e.versions.length > 1, note: revising ? (revising.change ? 'Making the change…' : 'Making a new design…') : '' }
    const card = v && { id: e.key, width: widthOf(v.device), device: v.device, streaming: !!revising }
    if (isComponent(e)) {
      if (v) out.push({ ...shown!, parent: null, component: true, fresh: !e.seen, cards: [{ ...card!, name: e.name!, idea: e.action ?? '', fit: true }] })
      continue
    }
    out.push(v ? { ...shown!, parent: treeParent(e.key), cards: [{ ...card!, name: labelOf(e), idea: ideaOf(v) }] } : {
      key: e.key, parent: treeParent(e.key), current: false, undo: false, note: '',
      cards: (e.proposals ?? []).map((p, i) => sideCard(e.key, i, making?.sides[i] ?? null, p, making?.device)),
    })
  }
  if (m && !state.entries.has(m.key)) out.push({
    key: m.key, parent: m.parent, current: false, undo: false, note: '',
    cards: m.sides.map((s, i) => sideCard(m.key, i, s, null, m.device)),
  })
  return out
}

/** Draw every screen and put each stored design in its frame. Streaming frames are left to their streams. */
export async function draw() {
  syncAddress()
  state.tree = screenTree(all())
  side.el.hidden = !state.app || !state.entries.size || !state.boxes
  if (state.boxes) renderSide(side, { boxes: state.boxes, components: components(), past: state.past, visiting: state.visiting, current: state.box }, boxOp)
  canvas.render(views(), !!state.busy)
  generate.hidden = !!state.app && !generate.classList.contains('open')
  renderDrawer()
  renderToolbar()
  checkHint()
  const theme = state.theme
  const css = await themeCss(theme)
  if (theme !== state.theme) return // a newer draw shows the newer theme
  // Today's components, so a changed component redraws the screens that paste it.
  const c = componentsOf(all())
  for (const e of state.entries.values()) {
    const v = e.versions.at(-1)
    if (v) { if (state.revising?.key !== e.key) canvas.show(e.key, isComponent(e) ? v.html : page(v.html, e.name, c), true, css) }
    else e.proposals?.forEach((p, i) => { if (p) canvas.show(`${e.key}#${i}`, page(p.html, undefined, c), true, css) })
  }
  state.making?.sides.forEach((s, i) => { if (s.version) canvas.show(`${state.making!.key}#${i}`, page(s.version.html, undefined, c), true, css) })
}

// ---- Screens

/** Open a screen from the cache, else as A OR B: remember the view, fit both, stream them. */
export async function openScreen(action: string | null, from: string | null, label: string | null, again = false) {
  const device = deviceSelect.value as Device
  /** When the A OR B was fitted; refitted once both finish unless the canvas moved since. */
  let fitted: number | null = null
  let m: Making | null = null
  await stream('/api/screen', { app: state.app!, action, model: modelSelect.value, device, from, label, ...(again && { again }) }, 'make this screen', async (ev, css) => {
    if (ev.type === 'meta' && !ev.cached) {
      m = { key: ev.key, parent: from, device, sides: [] }
      m.sides = Array.from({ length: ev.variants }, (_, i) => ({
        version: null, error: null,
        stream: streamInto(`${ev.key}#${i}`, css),
      }))
      state.making = m
      // The view to come back to after the pick; a new mockup's first screen has none.
      if (!state.before && state.entries.size) state.before = canvas.view()
      await draw()
      canvas.fit(ev.key, { top: true })
      fitted = performance.now()
    } else if (ev.type === 'chunk') m?.sides[ev.variant]?.stream?.push(ev.text)
    else if (ev.type === 'version' || ev.type === 'failed') {
      const s = m?.sides[ev.variant]
      if (!s) return
      s.stream?.cancel()
      s.stream = null
      if (ev.type === 'version') {
        s.version = ev.version
        if (ev.version.costUsd !== 0) coach.did('live') // a replayed design costs 0
        if (m!.sides.every((x) => x.version)) coach.did('ready')
      } else { s.error = ev.message; state.failed.set(`${m!.key}#${ev.variant}`, ev.message) }
      draw()
    } else if (ev.type === 'done') {
      keep(ev.entry)
      if (state.making === m) state.making = null
      loadRecent()
      await draw()
      if (m) refit(ev.entry.key, fitted)
      else {
        // Already made (another tab, or a reload while its A OR B was open).
        if (ev.entry.versions.length) setCurrent(ev.entry.key)
        else {
          if (!state.before) state.before = canvas.view()
          fitChoice(ev.entry.key)
        }
      }
    }
  }, (failed, answered) => {
    if (failed) { stopMaking(); back() }
    // A new mockup's first screen the account card answered: sent again after a sign-up (`again`).
    if (failed && answered && action == null && !state.entries.size) refusedFirst = state.app
  })
}

/** The mockup whose first screen was refused for lack of free screens, until a sign-up or the card is closed. */
let refusedFirst: string | null = null

/** After a sign-up: a refused first screen is sent again, and each side refused for free screens draws itself. */
export async function again() {
  const app = state.app
  if (!app) return
  if (refusedFirst === app && !state.entries.size) { refusedFirst = null; return openScreen(null, null, null) }
  refusedFirst = null
  const e = all().find((x) => !x.versions.length && x.proposals?.some((p, i) => !p && sideAct(state.failed.get(`${x.key}#${i}`) ?? '')))
  if (e) await redraw(e.key)
}

/** An open A OR B's missing side, drawn again (asked `again`: a paid request); the side there comes back as it is. */
export async function redraw(key: string) {
  const e = state.entries.get(key)
  if (!e || e.versions.length) return
  if (state.busy) return hint()
  e.proposals?.forEach((_, i) => state.failed.delete(`${key}#${i}`))
  await openScreen(e.name && e.action != null ? `@${e.name}` : null, e.parent?.key ?? null, e.parent?.label ?? null, true)
}

/** The account card closed with no sign-up: a refused first screen's prompt goes back into the generate panel. */
export function cardClosed() {
  const app = refusedFirst
  refusedFirst = null
  if (!app || app !== state.app || state.entries.size) return
  closeMockup()
  openGenerate()
  promptInput.value = app
}

/** Once a screen (or an A OR B) has its size, fit it snugly, unless the view moved since `fitted` or the A OR B was picked. */
async function refit(key: string, fitted: number | null, choice = true) {
  await canvas.sized(key)
  const e = state.entries.get(key)
  if (fitted == null || !e || (choice && e.versions.length) || canvas.moved > fitted) return
  canvas.fit(key, { snug: true })
}

/** Fit a finished A OR B by width now, then snugly once both have their size. */
export function fitChoice(key: string, step = true) {
  if (step) coach.did('ready')
  canvas.fit(key, { top: true })
  refit(key, performance.now())
}

/** Fit a picked screen now, and again once it has its size. */
export function fitScreenSoon(key: string) {
  canvas.fit(key, { snug: true })
  refit(key, performance.now(), false)
}

/** Stop the busy job and the streams of the A OR B being made, which is dropped. */
export function stopMaking() {
  state.busy?.abort()
  state.busy = null
  for (const s of state.making?.sides ?? []) { s.stream?.cancel(); s.stream = null }
  state.making = null
}

/** A screen as the server sent it, applied here. */
function keep(e: CacheEntry) {
  state.entries.set(e.key, e)
  state.edits++
}

/** Back to the view from before an A OR B. */
function back() {
  if (state.before) canvas.setView(state.before)
  state.before = null
}

/** Keep one side of an open A OR B; the other stops streaming. */
export async function pick(key: string, index: number) {
  const m = state.making?.key === key ? state.making : null
  if (state.picking || !(m?.sides[index]?.version ?? state.entries.get(key)?.proposals?.[index])) return
  state.picking = true
  const app = state.app, fx = pickFx(key, index)
  try {
    // The other side stops; the A OR B stays drawn until the server answers, so the picked frame
    // is kept (and renamed below) instead of loading again.
    if (m) { stopMaking(); state.making = m }
    const [res] = await Promise.all([post('/api/pick', { key, index }).catch(() => null), fx.wait])
    if (state.making === m) state.making = null
    if (app !== state.app) return
    if (!res?.ok) {
      showError('Could not keep that design')
      // Take the server's copy of the open mockup.
      const map = await mapOf(app!).then((r) => r.json()).catch(() => null)
      return map?.entries && app === state.app && applyMap(map)
    }
    const { entry, filing, visiting } = await res.json() as { entry: CacheEntry; filing: boolean; visiting: boolean }
    keep(entry)
    Object.assign(state, { filing, visiting: visiting || state.visiting })
    if (filing || visiting) filed()
    canvas.rename(`${key}#${index}`, key)
    state.current = key
    saveCurrent()
    coach.did('pick')
    await draw()
    if (state.before) { back(); canvas.reveal(key, false) } else fitScreenSoon(key)
  } finally {
    state.picking = false
    fx.done()
  }
}

/** Drop both designs of an open A OR B; for the first screen, that drops the mockup too. */
export async function dropChoice(key: string) {
  if (state.making?.key === key) stopMaking()
  const root = state.app && screenKey(state.app, null) === key
  await post('/api/delete', { key }).catch(() => null)
  state.entries.delete(key)
  if (root) return closeMockup()
  back()
  await draw()
}

/** Where a click leads: back to the tree parent, `@name` to that screen (made if missing); words with no `@` nowhere. */
function target(app: string, from: string, prompt: string): { to: string; prompt: string } {
  if (isBack(prompt)) {
    // The screen it hangs under on the canvas; else the one whose click made it.
    const made = state.entries.get(from)?.parent?.key
    return { to: treeParent(from) ?? (made && state.entries.has(made) ? made : screenKey(app, null)), prompt }
  }
  const ref = screenRef(prompt)
  const known = ref && namesOf(all()).get(ref.name)
  return { to: known || (ref || !canonicalAction(prompt) ? screenKey(app, prompt) : from), prompt }
}

/** A click in a picked screen: go to the screen it leads to, making it if new. */
export function onAction(from: string, action: string, label: string) {
  const app = state.app
  if (!app) return
  coach.did('click')
  const { to, prompt } = target(app, from, action)
  setCurrent(from)
  if (to === from) return void (screenRef(action) || isBack(action) || hint('This control leads nowhere yet: the fixer redraws it.'))
  const there = state.entries.get(to)
  if (there || state.making?.key === to) {
    if (there?.versions.length) { setCurrent(to); canvas.reveal(to) } else fitChoice(to)
    return
  }
  if (state.busy) return void hint()
  openScreen(prompt, from, label)
}

/** One new version of a screen, streamed into its own frame: an Edit with `change`, else a Regenerate. */
export async function revise(key: string, change: string | null) {
  const e = state.entries.get(key)
  if (!e?.versions.length) return
  if (state.busy) return hint()
  state.revising = { key, change }
  if (change) coach.did('editSent')
  const edited = !change && !!e.versions.at(-1)!.feedback && e.versions.at(-1)!.by !== 'fixer'
  let frame: StreamRenderer | null = null
  await stream('/api/revise', { key, change, model: modelSelect.value, device: deviceSelect.value }, change ? 'make the change' : 'make a new design', (ev, css) => {
    if (ev.type === 'chunk') (frame ??= streamInto(key, css, isComponent(e))).push(ev.text)
    else if (ev.type === 'done') {
      frame?.cancel()
      keep(ev.entry)
      if (ev.filing) { state.filing = true; filed() }
      state.revising = null
      if (change) { changeInput.value = ''; coach.did('edited') }
      if (ev.entry.versions.at(-1)?.costUsd !== 0) coach.did('live')
      // A Regenerate over an Edit: say the edit is not lost.
      if (edited) hint('A fresh design. Undo brings your edit back.')
      // The new version may be taller or narrower: keep it in view once it has its size.
      canvas.sized(key).then(() => canvas.reveal(key))
    }
  }, () => {
    frame?.cancel()
    // After a failure, draw() puts the screen as it was back into its frame.
    if (state.revising?.key === key) state.revising = null
  })
}

export async function undo(key: string) {
  if (state.busy) return
  const res = await post('/api/undo', { key }).catch(() => null)
  if (!res?.ok) return showError('Nothing to undo')
  keep((await res.json()).entry)
  coach.did('undo')
  draw()
}

/** Delete a screen, after asking. Screens only it leads to go too; the first screen takes the mockup. */
export async function removeScreen(key: string) {
  const e = state.entries.get(key)
  if (!e || state.busy || !state.app) return
  const root = screenKey(state.app, null) === key
  // The screens that paste a component, or the screens the first screen would no longer reach.
  const rest = screenTree(all().filter((x) => x.key !== key))
  const n = isComponent(e) ? pastedOn(e.name!).length : [...state.tree.keys()].filter((k) => k !== key && state.entries.has(k) && !rest.has(k)).length
  const what = isComponent(e) ? `the component ${e.name}? ${n ? `The ${n === 1 ? 'screen' : `${n} screens`} that paste it show nothing in its place.` : 'No screen pastes it.'}`
    : root ? `${labelOf(e)}, the first screen? That deletes the whole mockup.`
    : `${labelOf(e)}${n ? ` and the ${n === 1 ? 'screen' : `${n} screens`} only it leads to` : ''}?`
  if (!confirm(`Delete ${what}`)) return
  const res = await post('/api/delete', { key }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the screen')
  const map = await res.json() as { removed: string[]; entries: CacheEntry[] }
  loadRecent()
  if (root) return closeMockup()
  const parent = treeParent(key)
  applyMap(map)
  setCurrent(parent && state.entries.has(parent) ? parent : screenKey(state.app, null))
  if (state.current) canvas.reveal(state.current)
}
