// The browser side: generate panel, canvas, A OR B, clicks, rail tools and drawer, boxes, toolbar.

import { DEVICES, LEGACY_WIDTH, REBUILD_MS, extractFragment, hasVisibleText, isDevice, markCurrent, pasteComponents, type Device } from '@uxwoz/core/frame'
import { canonicalAction, isBack, nameWords, normalizePrompt, screenKey, screenRef } from '@uxwoz/core/keys'
import { componentsOf, isComponent, namesOf, plannedScreens, screenTree, type TreeNode } from '@uxwoz/core/tree'
import type { BoxName, Boxes, CacheEntry, Version } from '@uxwoz/core'
import { boxesMarkdown, createSide, el, renderSide, type Box, type BoxOp } from './boxes.ts'
import { Canvas, MAX_ZOOM, type CardView, type ScreenView, type View } from './canvas.ts'
import type { ScreenEvent } from './server.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const generate = $<HTMLFormElement>('generate')
const promptInput = $<HTMLTextAreaElement>('prompt')
const modelSelect = $<HTMLSelectElement>('model')
const themeSelect = $<HTMLSelectElement>('theme')
const deviceSelect = $<HTMLSelectElement>('device')
const drawer = $('drawer')
const changeInput = $<HTMLTextAreaElement>('change')

/** One side of a new screen's A OR B while it streams. */
interface Side { stream: StreamRenderer | null; version: Version | null; error: string | null }
/** A new screen whose A OR B streams in before it is stored. */
interface Making { key: string; parent: string | null; device: Device; sides: Side[] }

const state = {
  app: null as string | null,
  entries: new Map<string, CacheEntry>(),
  /** Each screen's level and parent, worked out on every draw. */
  tree: new Map<string, TreeNode>(),
  /** The screen the user last picked, clicked in, or chose in Nav. */
  current: null as string | null,
  making: null as Making | null,
  /** Why a side of an A OR B failed, by card id, so it still shows once the screen is stored. */
  failed: new Map<string, string>(),
  /** A pick on its way to the server, so a second click does not pick again. */
  picking: false,
  /** A picked screen getting a new version: an Edit with `change`, else a Regenerate. */
  revising: null as { key: string; change: string | null } | null,
  drawer: null as 'edit' | 'info' | null,
  busy: null as AbortController | null,
  /** The view before an A OR B was fitted, to go back to after the pick. */
  before: null as View | null,
  /** Counts mockups opened, so a slower earlier open gives way to a newer one. */
  starts: 0,
  /** Rules and Data (components are entries); how many times Undo can put each box back. */
  boxes: null as Boxes | null,
  undos: { components: 0, rules: 0, data: 0 } as Record<BoxName, number>,
  filing: false,
  visiting: false,
  /** A filed() loop is waiting for filing or a visit to end. */
  waiting: false,
  /** Counts changes this page applied, so a map fetched before one of them is not applied after it. */
  edits: 0,
  css: {} as Record<string, string>,
}

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

const side = createSide(boxOp)
const canvas = new Canvas($('stage'), {
  action: onAction,
  pick,
  cancel: dropChoice,
  focus: setCurrent,
  tool: onTool,
  zoomed: (z) => { $('zoomPct').textContent = `${Math.round(z * 100)}%` },
}, side.el, side.components)

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
const labelOf = (e: CacheEntry) => isComponent(e) ? e.name! : `L${state.tree.get(e.key)?.level ?? '?'} ${e.versions.length ? nameOf(e, e.versions.at(-1)!)
  : state.entries.has(e.key) ? 'New screen · pick one' : nameWords(e.name!).replace(/^./, (c) => c.toUpperCase())}`

/** The tree parent: the screen fewest clicks from home that leads here. */
const treeParent = (key: string) => state.tree.get(key)?.parent ?? null

const widthOf = (d: Device | undefined) => (d ? DEVICES[d].width : LEGACY_WIDTH)
const ideaOf = (v: Version) => v.idea ?? ''

/** Every screen and component, as the server last sent them. */
const all = () => [...state.entries.values()]
const components = () => all().filter(isComponent)
/** A stored screen as it shows: its components pasted, links to itself marked current. */
const page = (html: string, name: string | undefined, c = componentsOf(all())) => markCurrent(pasteComponents(html, c), name)
/** The screens whose newest version pastes a component. */
const pastedOn = (id: string) => all().filter((e) => !isComponent(e) && new RegExp(`data-component\\s*=\\s*["']?${id}["'\\s>]`, 'i').test(e.versions.at(-1)?.html ?? ''))

function sideCard(key: string, index: number, side: Side | null, stored: Version | null, device: Device | undefined): CardView {
  const version = stored ?? side?.version ?? null
  const id = `${key}#${index}`
  const error = version ? undefined : side ? side.error ?? undefined : state.failed.get(id) ?? 'This design was not finished.'
  // A new screen waits for the last filing first (at most 5 s), so its paper holds what was filed.
  const idea = version ? ideaOf(version) : side && state.filing ? 'Waiting for filing, then drawing…' : ''
  return {
    id, width: widthOf(version?.device ?? device), device: version?.device ?? device, name: '', idea,
    side: { index, pickable: !!version }, error, streaming: !version && !error,
  }
}

function views(): ScreenView[] {
  const out: ScreenView[] = []
  const m = state.making
  for (const e of state.entries.values()) {
    const v = e.versions.at(-1)
    const making = m?.key === e.key ? m : null
    const revising = state.revising?.key === e.key ? state.revising : null
    const shown = v && { key: e.key, current: state.current === e.key, undo: e.versions.length > 1, note: revising ? (revising.change ? 'Making the change…' : 'Making a new design…') : '' }
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
async function draw() {
  state.tree = screenTree(all())
  side.el.hidden = !state.app || !state.entries.size || !state.boxes
  if (state.boxes) renderSide(side, { boxes: state.boxes, components: components(), undos: state.undos, visiting: state.visiting }, boxOp)
  canvas.render(views(), !!state.busy)
  generate.hidden = !!state.app && !generate.classList.contains('open')
  renderDrawer()
  renderToolbar()
  const theme = themeSelect.value
  const css = await themeCss(theme)
  if (theme !== themeSelect.value) return // a newer draw shows the newer theme
  // Today's components, so a changed component redraws the screens that paste it.
  const c = componentsOf(all())
  for (const e of state.entries.values()) {
    const v = e.versions.at(-1)
    if (v) { if (state.revising?.key !== e.key) canvas.show(e.key, isComponent(e) ? v.html : page(v.html, e.name, c), true, css) }
    else e.proposals?.forEach((p, i) => { if (p) canvas.show(`${e.key}#${i}`, page(p.html, undefined, c), true, css) })
  }
  state.making?.sides.forEach((s, i) => { if (s.version) canvas.show(`${state.making!.key}#${i}`, page(s.version.html, undefined, c), true, css) })
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

async function themeCss(theme: string): Promise<string> {
  if (state.css[theme] == null) {
    const pico = state.css.pico ?? (state.css.pico = await fetchText('/themes/pico.css'))
    // `clean` is Pico alone; any other theme is a drop-in stylesheet loaded after Pico.
    state.css[theme] = theme === 'clean' ? pico : pico + '\n' + await fetchText(`/themes/${theme}.css`)
  }
  return state.css[theme]!
}

/** A card's frame while it streams, rebuilt at most every REBUILD_MS. `bare`: a component, shown as it streams; a screen gets its components pasted. */
function streamInto(id: string, css: string, bare = false) {
  let raw = '', shown = '', last = 0, timer: ReturnType<typeof setTimeout> | undefined
  const build = (force: boolean) => {
    const now = Date.now()
    if (!force && now - last < REBUILD_MS) return void (timer ??= setTimeout(() => { timer = undefined; build(true) }, REBUILD_MS - (now - last)))
    const fragment = extractFragment(raw)
    if (fragment === shown || !hasVisibleText(fragment)) return
    last = now
    shown = fragment
    canvas.show(id, bare ? fragment : page(fragment, undefined), false, css)
  }
  return {
    push: (text: string) => { raw += text; build(false) },
    cancel: () => { clearTimeout(timer); timer = undefined },
  }
}
type StreamRenderer = ReturnType<typeof streamInto>

// ---- Errors

const fmtS = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`
const fmtUsd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`
const modelLabel = (id: string) => [...modelSelect.options].find((o) => o.value === id)?.text ?? id

/** A red pill at the bottom of the canvas, until closed or replaced. */
function showError(msg: string | null) {
  $('errorText').textContent = msg ?? ''
  $('error').hidden = !msg
}

$('errorClose').addEventListener('click', () => showError(null))

let hintTimer: ReturnType<typeof setTimeout> | undefined
/** Briefly say why a click does nothing: a screen is being made, or the control leads nowhere. */
function hint(text = 'One screen at a time: wait until this one is made.') {
  const h = $('hint')
  h.textContent = text
  h.hidden = false
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => { h.hidden = true }, 2500)
}

async function* readEvents(res: Response): AsyncGenerator<ScreenEvent> {
  if (!res.ok || !res.body) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.error ?? `HTTP ${res.status}`)
  }
  const decoder = new TextDecoder()
  let buf = ''
  for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(bytes, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (line.trim()) yield JSON.parse(line)
    }
  }
}

const mapOf = (app: string, wait = false) => fetch(`/api/map?app=${encodeURIComponent(app)}${wait ? '&wait=1' : ''}`)
const post = (url: string, body: object, signal?: AbortSignal) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })

/**
 * Stream a screen request as the one busy job: each event to `on` (with the theme's CSS), an error or
 * a stream that ends early to the red pill as "Could not `what`", then `after(failed)`.
 */
async function stream(url: string, body: object, what: string, on: (ev: ScreenEvent, css: string) => unknown, after: (failed: boolean) => void) {
  showError(null)
  state.busy?.abort()
  const ctrl = new AbortController()
  state.busy = ctrl
  let failed = false
  try {
    const css = await themeCss(themeSelect.value)
    let finished = false
    for await (const ev of readEvents(await post(url, body, ctrl.signal))) {
      if (ev.type === 'error') throw new Error(ev.message)
      finished ||= ev.type === 'done'
      await on(ev, css)
    }
    if (!finished && !ctrl.signal.aborted) throw new Error('the stream ended early')
  } catch (err) {
    failed = !ctrl.signal.aborted
    if (failed) showError(`Could not ${what}: ${err instanceof Error ? err.message : err}`)
  } finally {
    after(failed)
    if (state.busy === ctrl) state.busy = null
    draw().catch((e) => showError(String(e)))
  }
}

// ---- Screens

/** Open a screen from the cache, else as A OR B: remember the view, fit both, stream them. */
async function openScreen(action: string | null, from: string | null, label: string | null) {
  const device = deviceSelect.value as Device
  /** When the A OR B was fitted; refitted once both finish unless the canvas moved since. */
  let fitted: number | null = null
  let m: Making | null = null
  await stream('/api/screen', { app: state.app!, action, model: modelSelect.value, device, from, label }, 'make this screen', async (ev, css) => {
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
      if (ev.type === 'version') s.version = ev.version
      else { s.error = ev.message; state.failed.set(`${m!.key}#${ev.variant}`, ev.message) }
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
  }, (failed) => {
    if (failed) { stopMaking(); back() }
  })
}

/** Once a screen (or an A OR B) has its size, fit it snugly, unless the view moved since `fitted` or the A OR B was picked. */
async function refit(key: string, fitted: number | null, choice = true) {
  await canvas.sized(key)
  const e = state.entries.get(key)
  if (fitted == null || !e || (choice && e.versions.length) || canvas.moved > fitted) return
  canvas.fit(key, { snug: true })
}

/** Fit a finished A OR B by width now, then snugly once both have their size. */
function fitChoice(key: string) {
  canvas.fit(key, { top: true })
  refit(key, performance.now())
}

/** Fit a picked screen now, and again once it has its size. */
function fitScreenSoon(key: string) {
  canvas.fit(key, { snug: true })
  refit(key, performance.now(), false)
}

/** Stop the busy job and the streams of the A OR B being made, which is dropped. */
function stopMaking() {
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
async function pick(key: string, index: number) {
  const m = state.making?.key === key ? state.making : null
  if (state.picking || !(m?.sides[index]?.version ?? state.entries.get(key)?.proposals?.[index])) return
  state.picking = true
  try {
    // The other side stops; the A OR B stays drawn until the server answers, so the picked frame
    // is kept (and renamed below) instead of loading again.
    if (m) { stopMaking(); state.making = m }
    const res = await post('/api/pick', { key, index }).catch(() => null)
    if (state.making === m) state.making = null
    if (!res?.ok) {
      showError('Could not keep that design')
      // Take the server's copy of the open mockup.
      const app = state.app!, map = await mapOf(app).then((r) => r.json()).catch(() => null)
      return map?.entries && app === state.app && applyMap(map)
    }
    const { entry, filing, visiting } = await res.json() as { entry: CacheEntry; filing: boolean; visiting: boolean }
    keep(entry)
    Object.assign(state, { filing, visiting: visiting || state.visiting })
    if (filing || visiting) filed()
    canvas.rename(`${key}#${index}`, key)
    state.current = key
    saveCurrent()
    await draw()
    if (state.before) { back(); canvas.reveal(key, false) } else fitScreenSoon(key)
  } finally {
    state.picking = false
  }
}

/** Drop both designs of an open A OR B; for the first screen, that drops the mockup too. */
async function dropChoice(key: string) {
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
function onAction(from: string, action: string, label: string) {
  const app = state.app
  if (!app) return
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

function setCurrent(key: string | null) {
  if (state.current === key) return
  state.current = key
  saveCurrent()
  draw()
}

const currentKey = (app: string) => `uxwoz:current:${normalizePrompt(app)}`
function saveCurrent() {
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

function resetTrail() {
  trail.keys = state.current ? [state.current] : []
  trail.at = trail.keys.length - 1
}

/** The trail index of the nearest screen in a direction that still exists. */
function trailStep(dir: 1 | -1): number | null {
  for (let i = trail.at + dir; i >= 0 && i < trail.keys.length; i += dir) {
    const k = trail.keys[i]!
    if (k !== state.current && state.entries.get(k)?.versions.length) return i
  }
  return null
}

/** ← and →: the screen looked at before, or after. */
function walkTrail(dir: 1 | -1) {
  const i = trailStep(dir)
  if (i == null) return
  trail.at = i
  trail.moving = true
  try { goTo(trail.keys[i]!) } finally { trail.moving = false }
}

function applyMap(map: { entries: CacheEntry[]; boxes?: Boxes; undos?: Record<BoxName, number>; filing?: boolean; visiting?: boolean }) {
  Object.assign(state, { entries: new Map(map.entries.map((e) => [e.key, e])), boxes: map.boxes ?? state.boxes, undos: map.undos ?? state.undos, filing: !!map.filing, visiting: !!map.visiting })
  state.edits++
  // Filing or a visit runs (after a reload, say) and nothing waits for it yet.
  if ((state.filing || state.visiting) && !state.waiting) filed()
  if (state.current && !state.entries.has(state.current)) state.current = null
  draw()
}

/** After a pick, an Edit or a visit: fetch the mockup once filing is done; a map that crosses a change made here is fetched again. */
async function filed() {
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
  }
}

/** A change to the boxes, an Undo, or a visit asked for (an Edit is one); the server answers with the whole mockup. */
async function boxOp(o: BoxOp | { op: 'seen'; box: Box; ids: string[] }) {
  const app = state.app
  if (!app) return
  const res = await post('/api/box', { app, ...o }).catch(() => null)
  const body = await res?.json().catch(() => null)
  // The fixer's Undo sends the map with the changes it could not undo.
  if (body?.entries && app === state.app) applyMap(body)
  if (!res?.ok || body?.error) { showError(`Could not change the box: ${body?.error ?? 'no answer'}`); draw() }
}

/** What is new in a box since the user last looked: entries by ID, visits by when they started. */
const unseen = (box: Box): string[] => (((box === 'components' ? components() : box === 'notes' ? state.boxes?.visits : state.boxes?.[box]) ?? []) as { seen?: boolean; id?: string; name?: string; at?: string }[])
  .filter((x) => !x.seen).map((x) => x.id ?? x.name ?? x.at!)

/** A toolbar button: move the view to a box; after a moment its new entries are no longer marked. */
function lookAt(box: Box) {
  if (side.el.hidden) return
  canvas.showBox(side.sections[box])
  // Only the entries new at the look count as seen: one filed meanwhile stays marked.
  const ids = unseen(box)
  if (ids.length) setTimeout(() => boxOp({ op: 'seen', box, ids }), 3000)
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-box]')) b.addEventListener('click', () => { closeMenus(); lookAt(b.dataset.box as Box) })

/** Export: the three boxes as a markdown file. */
$('exportBoxes').addEventListener('click', () => {
  closeMenus()
  if (!state.app || !state.boxes) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([boxesMarkdown(state.app, components(), state.boxes)], { type: 'text/markdown' }))
  a.download = `${state.app.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'mockup'}-boxes.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
})

// ---- The rail and the drawer

function onTool(key: string, tool: string) {
  if (!state.entries.get(key)?.versions.length) return
  setCurrent(key)
  if (tool === 'edit' || tool === 'info') return openDrawer(tool)
  if (tool === 'regenerate' && !isComponent(state.entries.get(key)!)) return revise(key, null)
  if (tool === 'undo') return undo(key)
  if (tool === 'delete') return removeScreen(key)
}

/** One new version of a screen, streamed into its own frame: an Edit with `change`, else a Regenerate. */
async function revise(key: string, change: string | null) {
  const e = state.entries.get(key)
  if (!e?.versions.length) return
  if (state.busy) return hint()
  state.revising = { key, change }
  draw()
  let frame: StreamRenderer | null = null
  await stream('/api/revise', { key, change, model: modelSelect.value, device: deviceSelect.value }, change ? 'make the change' : 'make a new design', (ev, css) => {
    if (ev.type === 'chunk') (frame ??= streamInto(key, css, isComponent(e))).push(ev.text)
    else if (ev.type === 'done') {
      frame?.cancel()
      keep(ev.entry)
      if (ev.filing) { state.filing = true; filed() }
      state.revising = null
      if (change) changeInput.value = ''
      // The new version may be taller or narrower: keep it in view once it has its size.
      canvas.sized(key).then(() => canvas.reveal(key))
    }
  }, () => {
    frame?.cancel()
    // After a failure, draw() puts the screen as it was back into its frame.
    if (state.revising?.key === key) state.revising = null
  })
}

async function undo(key: string) {
  if (state.busy) return
  const res = await post('/api/undo', { key }).catch(() => null)
  if (!res?.ok) return showError('Nothing to undo')
  keep((await res.json()).entry)
  draw()
}

/** Delete a screen, after asking. Screens only it leads to go too; the first screen takes the mockup. */
async function removeScreen(key: string) {
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

function openDrawer(tab: 'edit' | 'info') {
  state.drawer = tab
  renderDrawer()
  if (tab === 'edit') changeInput.focus()
  // The canvas got narrower: keep the current screen in view beside the drawer.
  requestAnimationFrame(() => { if (state.current) canvas.reveal(state.current) })
}

const closeDrawer = () => { state.drawer = null; renderDrawer() }

/** The drawer shows the current screen: Edit (the change box and the past changes) or Info. */
function renderDrawer() {
  const e = state.current ? state.entries.get(state.current) : undefined
  const v = e?.versions.at(-1)
  const open = !!(state.drawer && e && v)
  if (drawer.hidden === open) {
    drawer.hidden = !open
    if (!open && state.current) requestAnimationFrame(() => canvas.reveal(state.current!))
  }
  if (!open) return
  for (const b of drawer.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === state.drawer))
  $('editPane').hidden = state.drawer !== 'edit'
  $('infoPane').hidden = state.drawer !== 'info'
  $('drawerName').textContent = labelOf(e)
  $<HTMLButtonElement>('makeChange').disabled = !!state.busy
  const history = $('history')
  const comp = isComponent(e)
  const node = state.tree.get(e.key)
  const parent = node?.parent ? state.entries.get(node.parent) : undefined
  const from = comp && e.parent ? state.entries.get(e.parent.key) : undefined, f = e.filed
  const versions: [string, string] = ['Versions', `${e.versions.length}${e.versions.length > 1 ? ' (↶ Undo goes back one)' : ''}`]
  history.replaceChildren(...e.versions.map((x, i) => el('li', i === e.versions.length - 1 ? 'now' : '', x.feedback ? `${x.by === 'fixer' ? 'Fixer' : 'Edit'}: ${x.feedback}`
    : comp ? (i === 0 ? (from ? `Taken from ${labelOf(from)} by ${e.by === 'fixer' ? 'the fixer' : 'filing'}` : 'Added') : 'Changed by filing')
      : i === 0 ? 'The design you picked' : 'Regenerated')).reverse())
  const info: [string, string][] = comp ? [
    ['Component', e.name!],
    ['Where it belongs', e.action ?? '–'],
    ['Pasted on', pastedOn(e.name!).map(labelOf).join(', ') || 'no screen'],
    ['Taken from', from ? labelOf(from) : '–'],
    ['Last written by', `${e.by === 'user' ? 'you' : e.by === 'fixer' ? 'the fixer' : 'filing'}, ${e.at ? new Date(e.at).toLocaleString() : '–'}`],
    versions,
    ['Model', modelLabel(v.model)],
    ['Size', `${v.html.length.toLocaleString()} characters`],
  ] : [
    ['Name', labelOf(e)],
    ['Idea', ideaOf(v) || '–'],
    ['Name in links', e.name ? `@${e.name}` : '–'],
    ['Reached by', parent ? `${node!.label || 'a click'} in ${labelOf(parent)}` : e.action ? '–' : 'the first screen'],
    ['Made by', v.feedback ? `${v.by === 'fixer' ? 'The fixer' : 'Edit'}: ${v.feedback}` : e.versions.length > 1 ? 'Regenerate' : 'your pick of two designs'],
    versions,
    ['Model', modelLabel(v.model) + (v.servedModel ? ` (served ${v.servedModel})` : '')],
    ['Device', v.device ? DEVICES[v.device].label : 'from before devices'],
    ['Made', new Date(v.createdAt).toLocaleString()],
    ['First text', v.firstChunkMs == null ? '–' : fmtS(v.firstChunkMs)],
    ['Total time', fmtS(v.totalMs)],
    ['Cost', v.costUsd == null ? 'unknown' : `${v.costEstimated ? '~' : ''}${fmtUsd(v.costUsd)}${v.costEstimated ? ' (est.)' : ''}`],
    ['All versions', fmtUsd(e.versions.reduce((t, x) => t + (x.costUsd ?? 0), 0))],
    ['Finish', v.finishReason ?? '–'],
    ['Size', `${v.html.length.toLocaleString()} characters`],
    ['Prompt', e.action ?? e.app],
    // What filing made of the screen's last decision, and the lines it refused.
    ...(f ? [['Filing', f.error ? `failed: ${f.error}` : `${[...f.added.map((x) => `added ${x}`), ...f.changed.map((x) => `changed ${x}`)].join(', ') || 'nothing new'}, `
      + `${fmtS(f.ms)}${f.costUsd == null ? '' : `, ~${fmtUsd(f.costUsd)}`}`], ...f.refused.map((r) => ['Refused', r])] as [string, string][] : []),
  ]
  $('info').replaceChildren(...info.flatMap(([k, val]) => [el('dt', '', k), el('dd', '', val)]))
}

$('editPane').addEventListener('submit', (ev) => {
  ev.preventDefault()
  const change = changeInput.value.trim()
  if (!change) return changeInput.focus()
  if (state.current) revise(state.current, change)
})
/** Enter sends the form; Shift+Enter adds a line. */
function enterSubmits(input: HTMLTextAreaElement, form: HTMLFormElement) {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit() } })
}
enterSubmits(changeInput, $('editPane') as HTMLFormElement)
for (const b of drawer.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.addEventListener('click', () => openDrawer(b.dataset.tab as 'edit' | 'info'))
$('drawerClose').addEventListener('click', closeDrawer)

// ---- Mockups

/** Open a mockup: its screens from the cache, else (unless `make` is false) its first screen as A OR B. */
async function start(app: string, make = true) {
  showError(null)
  stopMaking()
  state.before = null
  const n = ++state.starts
  const res = await mapOf(app)
  if (!res.ok) throw new Error(`could not load the mockup: HTTP ${res.status}`)
  const map = await res.json() as { entries: CacheEntry[] }
  if (n !== state.starts) return // a newer mockup was opened meanwhile
  if (!make && !map.entries.length) { store.set('uxwoz:app', ''); return draw() }
  state.app = app
  state.drawer = null
  state.failed.clear()
  store.set('uxwoz:app', app)
  generate.classList.remove('open')
  applyMap(map)
  const root = screenKey(app, null)
  const saved = store.get(currentKey(app))
  state.current = saved && state.entries.get(saved)?.versions.length ? saved : state.entries.get(root)?.versions.length ? root : null
  resetTrail()
  // A mockup keeps the device it was made for: new screens in it, and Start over, use it too.
  const made = state.entries.get(root)
  const device = made?.versions[0]?.device ?? made?.proposals?.find(Boolean)?.device
  if (device) deviceSelect.value = device // for this mockup only: the saved choice stays
  if (!state.entries.has(root)) return openScreen(null, null, null)
  await draw()
  const open = all().find((e) => !e.versions.length)
  if (open) fitChoice(open.key)
  else fitScreenSoon(state.current ?? root)
}

/** The pickers as last chosen in this browser. */
function restorePickers() {
  const d = store.get('uxwoz:device')
  if (isDevice(d)) deviceSelect.value = d
}

function closeMockup() {
  state.busy?.abort()
  restorePickers()
  store.set('uxwoz:app', '')
  Object.assign(state, { app: null, entries: new Map(), boxes: null, filing: false, current: null, making: null, revising: null, drawer: null, before: null })
  resetTrail()
  loadRecent()
  draw()
}

// ---- Wiring

/** The pickers and the name each is kept under in this browser. */
const PICKERS = [[modelSelect, 'model'], [deviceSelect, 'device'], [themeSelect, 'theme']] as const
const keepPicker = (s: HTMLSelectElement, name: string) => store.set(`uxwoz:${name}`, s.value)

generate.addEventListener('submit', (e) => {
  e.preventDefault()
  // The pickers as they are now are the ones to keep, also if a change event was missed.
  for (const [s, name] of PICKERS) keepPicker(s, name)
  const app = promptInput.value.trim()
  if (app) start(app).catch((err) => showError(String(err)))
})
enterSubmits(promptInput, generate)

// A template with a long prompt shows a short name and keeps the full prompt in data-prompt.
for (const b of document.querySelectorAll<HTMLButtonElement>('.example')) {
  const prompt = b.dataset.prompt ?? b.textContent ?? ''
  b.title = b.dataset.prompt ?? ''
  b.addEventListener('click', () => open(prompt))
}


for (const [s, name] of PICKERS) s.addEventListener('change', () => keepPicker(s, name))
// While a screen streams, the new theme applies when it finishes.
themeSelect.addEventListener('change', () => themeCss(themeSelect.value).then(draw).catch((e) => showError(`Could not load the theme: ${e.message}`)))

/** A zoom from a key or a button: in, out, a level, or a fit. The user's own fits count as moving the canvas, so a refit waiting for sizes does not undo them. */
function zoomTo(z: string) {
  canvas.moved = performance.now()
  if (z === 'in' || z === 'out') canvas.step(z === 'in' ? 1 : -1)
  else if (z === 'all') canvas.fit()
  else if (z === 'screen') canvas.fit(state.current ?? undefined, { snug: true })
  else if (z !== 'width') canvas.setZoom(Number(z))
  else if (state.current) canvas.fit(state.current, { max: MAX_ZOOM, top: true })
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
async function loadRecent() {
  const res = await fetch('/api/apps').catch(() => null)
  if (!res?.ok) return
  recentApps = (await res.json() as { apps: { app: string; screens: number }[] }).apps
  $('recent').replaceChildren(...recentApps.map((a) => item(a.app, screensNote(a.screens), () => open(a.app))))
  $('recentBox').hidden = recentApps.length === 0
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
function item(label: string, note: string, run: () => void): HTMLButtonElement {
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

const MENUS: [string, string][] = [['projectButton', 'projectMenu'], ['navButton', 'navMenu'], ['zoomValue', 'zoomMenu'], ['boxesButton', 'boxNav']]

function closeMenus() {
  for (const [, m] of MENUS) $(m).hidden = true
}

for (const [b, m] of MENUS) $(b).addEventListener('click', () => {
  const show = $(m).hidden
  closeMenus()
  if (!show) return
  renderToolbar()
  if (m === 'navMenu') renderNav()
  if (m === 'projectMenu') renderRecentMenu()
  $(m).hidden = false
  $(m).querySelector<HTMLElement>('.current, .item')?.focus()
})

// A press outside a menu closes it; so does a click into a screen (the page loses focus to the frame).
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Node
  if (!MENUS.some(([b, m]) => $(b).contains(t) || $(m).contains(t))) closeMenus()
  if (state.app && generate.classList.contains('open') && !generate.contains(t) && !$('projectMenu').contains(t)) closeGenerate()
})
addEventListener('blur', closeMenus)
addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  closeMenus()
  if (state.app && generate.classList.contains('open')) closeGenerate()
  if (state.drawer) closeDrawer()
})

function openGenerate() {
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
function renderToolbar() {
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
  nav.title = cur ? labelOf(cur) : 'Every screen of this mockup'
  $('exportBoxes').hidden = !app
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
}

/** Every screen as an indented tree, planned screens greyed (a click makes one), the current path marked. */
function renderNav() {
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

$('menuNew').addEventListener('click', () => { closeMenus(); openGenerate() })
$('startOver').addEventListener('click', () => { closeMenus(); deleteApp(true).catch((e) => showError(String(e))) })
$('deleteApp').addEventListener('click', () => { closeMenus(); deleteApp(false).catch((e) => showError(String(e))) })

/** Delete every screen of the open mockup, after asking; then make its first screen again, or close it. */
async function deleteApp(again: boolean) {
  const app = state.app
  if (!app) return
  const n = state.entries.size - components().length
  const what = `${n === 1 ? 'the only screen of this mockup' : `all ${n} screens of this mockup`} and its boxes (components, rules, data)`
  if (!confirm(again ? `Start over? This deletes ${what} and makes its first screen again.` : `Delete ${what}?`)) return
  state.busy?.abort()
  const res = await post('/api/delete-app', { app }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the mockup')
  store.set(currentKey(app), '')
  loadRecent()
  if (again) return start(app)
  closeMockup()
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) b.addEventListener('click', () => { closeMenus(); zoomTo(b.dataset.zoom!) })

const warmUp = (model: string) => post('/api/warmup', { model }).catch(() => {})
modelSelect.addEventListener('change', () => warmUp(modelSelect.value))

async function init() {
  const cfg = await (await fetch('/api/config')).json()
  if (cfg.warning) showError(cfg.warning)
  for (const [s, name] of PICKERS) {
    const list: { id: string; label: string }[] = cfg[`${name}s`], saved = store.get(`uxwoz:${name}`)
    for (const x of list) s.add(new Option(x.label, x.id))
    s.value = list.some((x) => x.id === saved) ? saved! : cfg[`default${name[0]!.toUpperCase()}${name.slice(1)}`]
  }
  warmUp(modelSelect.value)
  loadRecent()
  await themeCss(themeSelect.value)
  // A reload opens the mockup that was open, with its A OR B if one was waiting for a pick.
  const last = store.get('uxwoz:app')
  if (last) return start(last, false)
  draw()
  promptInput.focus()
}

init().catch((e) => showError(`Could not load the app config: ${e.message}`))
