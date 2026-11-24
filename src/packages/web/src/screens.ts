// The mocks: how each shows on the canvas, a new one drawn into its place, clicks (@names, back, new), Another, Edit,
// Undo, delete.

import { markCurrent, pasteComponents, type Device } from '@uxwoz/core/frame'
import { canonicalAction, isBack, nameWords, screenKey, screenRef } from '@uxwoz/core/keys'
import { componentsOf, isComponent, namesOf, screenTree } from '@uxwoz/core/tree'
import type { CacheEntry, Version } from '@uxwoz/core'
import { renderSide } from './boxes.ts'
import type { ScreenView } from './canvas.ts'
import { canvas, closeMockup, side } from './app.ts'
import { boxOp, renderCards } from './cards.ts'
import { pressedOf } from './flip.ts'
import { commentCount } from './comments.ts'
import { endHint, liveDesign, showLasting, post, showError, hint, note, stream, streamInto, themeCss, type StreamRenderer } from './net.ts'
import { applyMap, filed, saveCurrent, setCurrent, syncAddress } from './nav.ts'
import { renderToolbar } from './bar.ts'
import { loadRecent, openGenerate } from './menu.ts'
import { deviceSelect, generate, modelSelect, promptInput, state, type Making } from './state.ts'

// ---- Views

/** A mock's short name: the one the model gave it, else its first heading, else its prompt. */
function nameOf(e: CacheEntry, v: Version): string {
  if (v.name) return v.name
  const h = v.html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1]
  // Parsed, not just stripped of tags, so entities like &amp; read as text.
  const text = h && new DOMParser().parseFromString(h, 'text/html').body.textContent?.trim()
  return (text || e.action || e.app).slice(0, 60)
}

/** A link's name as words, for a mock not drawn yet: `care-log` is *Care log*; none is Home. */
const wordsOf = (name: string | null | undefined) => (name ? nameWords(name).replace(/^./, (c) => c.toUpperCase()) : 'Home')

/** e.g. "Camera"; a planned mock's from its name; a component's is its ID. */
export const labelOf = (e: CacheEntry) => isComponent(e) ? e.name! : e.versions.length ? nameOf(e, e.versions.at(-1)!) : wordsOf(e.name)

/** The tree parent: the mock fewest clicks from Home that leads here. */
export const treeParent = (key: string) => state.tree.get(key)?.parent ?? null

export const ideaOf = (v: Version) => v.idea ?? ''

/** Every mock and component, as the server last sent them. */
export const all = () => [...state.entries.values()]
export const components = () => all().filter(isComponent)
/** A stored mock as it shows: its components pasted, links to itself marked current. */
export const page = (html: string, name: string | undefined, c = componentsOf(all())) => markCurrent(pasteComponents(html, c), name)
/** The mocks whose showing version pastes a component. */
export const pastedOn = (id: string) => all().filter((e) => !isComponent(e) && new RegExp(`data-component\\s*=\\s*["']?${id}["'\\s>]`, 'i').test(e.versions.at(-1)?.html ?? ''))

export function views(): ScreenView[] {
  const out: ScreenView[] = []
  const m = state.making
  // A new mock is current while it is drawn; a box current leaves no mock current.
  const current = m?.key ?? (state.box ? null : state.current)
  const pressed = state.box ? null : pressedOf(state.flip)
  for (const e of state.entries.values()) {
    const v = e.versions.at(-1)
    if (!v) continue
    const view = { key: e.key, device: v.device, current: current === e.key, streaming: state.revising?.key === e.key, tour: state.tour }
    if (isComponent(e)) out.push({ ...view, current: state.box === 'components' && state.component === e.key, parent: null, name: e.name!, component: true, fresh: !e.seen })
    else out.push({ ...view, parent: treeParent(e.key), name: labelOf(e), pressed: view.current ? pressed : null, comments: view.current ? commentCount(e.key) : 0 })
  }
  if (m && !state.entries.has(m.key)) out.push({ key: m.key, parent: m.parent, name: m.version?.name || m.name, device: m.device, current: true, streaming: !m.version, tour: state.tour })
  return out
}

/** Draw every mock and put each stored design in its frame. Streaming frames are left to their streams. */
export async function draw() {
  syncAddress()
  state.tree = screenTree(all())
  side.el.hidden = !state.app || !state.entries.size || !state.boxes
  if (state.boxes) renderSide(side, { boxes: state.boxes, components: components(), current: state.box, tour: state.tour }, boxOp)
  canvas.render(views(), !!state.busy)
  generate.hidden = !!state.app && !generate.classList.contains('open')
  renderCards()
  renderToolbar()
  showLasting()
  const theme = state.theme
  const css = await themeCss(theme)
  if (theme !== state.theme) return // a newer draw shows the newer theme
  // Today's components, so a changed component redraws the mocks that paste it.
  const c = componentsOf(all())
  for (const e of state.entries.values()) {
    const v = e.versions.at(-1)
    if (v && state.revising?.key !== e.key) canvas.show(e.key, isComponent(e) ? v.html : page(v.html, e.name, c), true, css)
  }
  const m = state.making
  if (m?.version && !state.entries.has(m.key)) canvas.show(m.key, page(m.version.html, undefined, c), true, css)
}

// ---- Mocks

/**
 * A new mock (or a project's Home, with no action): one design streams into its place, where the canvas glides to,
 * while the note says *Drawing <name>…*. One already drawn (another tab) is a cache hit: the canvas glides to it.
 * A design that fails is not kept: the red pill says why, and the canvas glides back to where the click came from;
 * a first Home that failed opens New project with the sentence still in it.
 */
export async function openScreen(action: string | null, from: string | null, label: string | null) {
  if (state.tour) return
  // A project keeps the size its Home was drawn at; the size picked counts for a first Home only.
  const app = state.app, home = app ? state.entries.get(screenKey(app, null)) : undefined
  const device = home ? home.versions[0]?.device : deviceSelect.value as Device
  let m: Making | null = null
  refused = null
  await stream('/api/screen', { app: state.app!, action, model: modelSelect.value, ...(!home && { device }), from, label }, 'draw this mock', async (ev, css) => {
    if (ev.type === 'meta' && !ev.cached) {
      m = { key: ev.key, parent: from, device, name: wordsOf(action ? screenRef(action)?.name : null), version: null, stream: streamInto(ev.key, css) }
      state.making = m
      note(`Drawing ${m.name}…`)
      const first = !state.entries.size
      await draw()
      if (first) canvas.fit(ev.key)
      else canvas.reveal(ev.key)
    } else if (ev.type === 'chunk') m?.stream?.push(ev.text)
    else if (ev.type === 'version' && m) {
      m.stream?.cancel()
      m.stream = null
      m.version = ev.version
      if (ev.version.costUsd !== 0) liveDesign() // a replayed design costs 0
      draw()
    } else if (ev.type === 'done') {
      keep(ev.entry)
      if (state.making === m) state.making = null
      loadRecent()
      note(null)
      state.current = ev.entry.key
      state.box = null
      saveCurrent()
      await draw()
      if (!m) canvas.reveal(ev.entry.key)
      // The server settled the mock clicked in: its filing runs, and the boxes follow once it is done.
      if (from) { state.filing = true; filed() }
    }
  }, (failed, answered) => {
    note(null)
    if (!failed) return
    stopMaking()
    if (answered) refused = { app, run: () => openScreen(action, from, label) }
    if (action == null && !state.entries.size) {
      // A first Home: the sentence goes back into New project (after the account card, if that answered).
      if (answered) refusedFirst = app
      else if (app && app === state.app) { closeMockup(); openGenerate(); promptInput.value = app }
    } else if (from && state.entries.get(from)?.versions.length) {
      setCurrent(from)
      canvas.reveal(from)
    }
  })
}

/** The project whose first Home was refused for lack of free mocks, until a sign-up or the card is closed. */
let refusedFirst: string | null = null
/** The last request the meter refused, in its project, until the next request: sent again after a sign-up. */
let refused: { app: string | null; run: () => unknown } | null = null

/** After a sign-up: the last refused request is sent again (a first Home, a click, an Edit, Another). */
export async function again() {
  const r = refused
  refused = refusedFirst = null
  if (r && r.app === state.app && state.app) await r.run()
}

/** The account card closed with no sign-up: a refused first Home's sentence goes back into New project. */
export function cardClosed() {
  const app = refusedFirst
  refusedFirst = null
  if (!app || app !== state.app || state.entries.size) return
  closeMockup()
  openGenerate()
  promptInput.value = app
}

/** Stop the busy job and the stream of the new mock being drawn, which is dropped. */
export function stopMaking() {
  state.busy?.abort()
  state.busy = null
  state.making?.stream?.cancel()
  state.making = null
}

/** A mock as the server sent it, applied here. */
function keep(e: CacheEntry) {
  state.entries.set(e.key, e)
  state.edits++
}

/** Where a click leads: back to the tree parent, `@name` to that mock (made if missing); words with no `@` nowhere. */
function target(app: string, from: string, prompt: string): { to: string; prompt: string } {
  if (isBack(prompt)) {
    // The mock it hangs under on the canvas; else the one whose click made it.
    const made = state.entries.get(from)?.parent?.key
    return { to: treeParent(from) ?? (made && state.entries.has(made) ? made : screenKey(app, null)), prompt }
  }
  const ref = screenRef(prompt)
  const known = ref && namesOf(all()).get(ref.name)
  return { to: known || (ref || !canonicalAction(prompt) ? screenKey(app, prompt) : from), prompt }
}

/**
 * A click in a drawn mock: `new` opens New project (the event `uxwoz:new-project`); a drawn mock becomes current and
 * the canvas glides to it, and the mock clicked in is settled (not waited for); a new one is drawn.
 */
export function onAction(from: string, action: string, label: string) {
  const app = state.app
  if (!app) return
  endHint()
  if (action.trim().toLowerCase() === 'new') return void document.dispatchEvent(new CustomEvent('uxwoz:new-project'))
  const { to, prompt } = target(app, from, action)
  setCurrent(from)
  if (to === from) return void (screenRef(action) || isBack(action) || hint('This control leads nowhere yet: the fixer redraws it.'))
  const there = state.entries.get(to)
  if (there?.versions.length) {
    setCurrent(to)
    canvas.moved = performance.now()
    canvas.reveal(to)
    if (!state.tour) settle(from)
    return
  }
  // The tour is read-only: a click walks only to its drawn mocks.
  if (state.tour) return
  if (state.busy || state.making) return void hint()
  openScreen(prompt, from, label)
}

/** A click on from a drawn mock: the server files it (the first time, and after a new design), not waited for. */
async function settle(key: string) {
  const app = state.app
  const res = await post('/api/settle', { key }).catch(() => null)
  if (!res?.ok || app !== state.app) return
  const { entry, filing, visiting } = await res.json() as { entry: CacheEntry; filing: boolean; visiting: boolean }
  if (entry) keep(entry)
  if (filing || visiting) { Object.assign(state, { filing: filing || state.filing, visiting: visiting || state.visiting }); filed() }
}

/** What 🎲 does after two designs from the same words: the cards (cards.ts) set it to flip to *Describe it
 *  differently*; until then it draws another. */
export const hooks = { describe: (key: string) => { revise(key, null) } }

/** 🎲 Another: one more design from the same words; after two, the hook `describe`. */
export function another(key: string) {
  const e = state.entries.get(key)
  if (!e?.versions.length || isComponent(e)) return
  if ((e.draws ?? 1) >= 2) return hooks.describe(key)
  revise(key, null)
}

/** One new version of a mock or a component, streamed into its own frame: an Edit with `change`, Draw again with
 *  `prompt` (new words), else Another. The stored entry once done. */
export async function revise(key: string, change: string | null, prompt?: string): Promise<CacheEntry | null> {
  const e = state.entries.get(key)
  if (!e?.versions.length || state.tour) return null
  if (state.busy) { hint(); return null }
  state.revising = { key, change }
  refused = null
  let done: CacheEntry | null = null
  note(change ? 'Making the change…' : `Drawing ${prompt ? 'a new design' : 'another design'} of ${labelOf(e)}…`)
  let frame: StreamRenderer | null = null
  await stream('/api/revise', { key, ...(change && { change }), ...(prompt && { prompt }), model: modelSelect.value }, change ? 'make the change' : 'draw another design', (ev, css) => {
    if (ev.type === 'chunk') (frame ??= streamInto(key, css, isComponent(e))).push(ev.text)
    else if (ev.type === 'done') {
      frame?.cancel()
      keep(ev.entry)
      done = ev.entry
      if (ev.filing) { state.filing = true; filed() }
      state.revising = null
      if (ev.entry.versions.at(-1)?.costUsd !== 0) liveDesign()
    }
  }, (failed, answered) => {
    frame?.cancel()
    note(null)
    if (failed && answered) refused = { app: state.app, run: () => revise(key, change, prompt) }
    // After a failure, draw() puts the mock as it was back into its frame.
    if (state.revising?.key === key) state.revising = null
  })
  return done
}

/** History: the version before the one showing, or the one shown at `at` (Redo, a tap on a version). */
export async function undo(key: string, at?: string) {
  if (state.tour) return
  if (state.busy) return hint()
  const res = await post('/api/undo', { key, ...(at && { at }) }).catch(() => null)
  if (!res?.ok) return showError('Nothing to undo')
  keep((await res.json()).entry)
  draw()
}

/** The question before a delete: what goes with the mock or component. */
export function deleteQuestion(key: string): string {
  const e = state.entries.get(key)
  if (!e || !state.app) return ''
  const root = screenKey(state.app, null) === key
  // The mocks that paste a component, or the mocks Home would no longer reach.
  const rest = screenTree(all().filter((x) => x.key !== key))
  const n = isComponent(e) ? pastedOn(e.name!).length : [...state.tree.keys()].filter((k) => k !== key && state.entries.has(k) && !rest.has(k)).length
  const what = isComponent(e) ? `the component ${e.name}? ${n ? `The ${n === 1 ? 'mock' : `${n} mocks`} that paste it show nothing in its place.` : 'No mock pastes it.'}`
    : root ? `${labelOf(e)}? That deletes the whole project.`
    : `${labelOf(e)}${n ? ` and the ${n === 1 ? 'mock' : `${n} mocks`} only it leads to` : ''}?`
  return `Delete ${what}`
}

/** Delete a mock or a component, after asking (`asked`: its card asked already). Mocks only it leads to go too; Home
 *  takes the project. */
export async function removeScreen(key: string, asked = false) {
  const e = state.entries.get(key)
  if (!e || state.busy || !state.app || state.tour) return
  const root = screenKey(state.app, null) === key
  if (!asked && !confirm(deleteQuestion(key))) return
  const res = await post('/api/delete', { key }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the mock')
  const map = await res.json() as { removed: string[]; entries: CacheEntry[] }
  loadRecent()
  if (root) return closeMockup()
  const parent = treeParent(key)
  applyMap(map)
  if (isComponent(e)) return
  setCurrent(parent && state.entries.has(parent) ? parent : screenKey(state.app, null))
  if (state.current) canvas.reveal(state.current)
}
