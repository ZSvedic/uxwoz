// The browser side: the generate panel, the canvas of picked screens, a new screen's A OR B
// (streamed side by side, then picked), click-to-navigate, the rail's tools (Edit, Regenerate, Undo,
// Info, Delete) with the drawer for Edit and Info, pickers, recent mockups, the status pill.

import { DEVICES, LEGACY_WIDTH, REBUILD_MS, extractFragment, hasVisibleText, isDevice, screenIdea, type Device } from '@uxwoz/core/frame'
import { normalizePrompt, screenKey } from '@uxwoz/core/keys'
import type { CacheEntry, Link, Version } from '@uxwoz/core'
import { Canvas, type CardView, type ScreenView, type View } from './canvas.ts'
import type { ScreenEvent } from './server.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const generate = $<HTMLFormElement>('generate')
const promptInput = $<HTMLTextAreaElement>('prompt')
const modelSelect = $<HTMLSelectElement>('model')
const themeSelect = $<HTMLSelectElement>('theme')
const deviceSelect = $<HTMLSelectElement>('device')
const zoomValue = $<HTMLButtonElement>('zoomValue')
const statusBox = $('status')
const statusText = $('statusText')
const statusClose = $<HTMLButtonElement>('statusClose')
const drawer = $('drawer')
const changeInput = $<HTMLTextAreaElement>('change')

/** One side of a new screen's A OR B while it streams. */
interface Side { stream: StreamRenderer | null; version: Version | null; error: string | null }
/** A new screen being made: its A OR B streams in before the screen is stored. */
interface Making { key: string; parent: string | null; device: Device; sides: Side[] }

const state = {
  app: null as string | null,
  /** Every screen of this mockup, by key, as the server last sent it. */
  entries: new Map<string, CacheEntry>(),
  links: [] as Link[],
  /** The screen the user last picked, clicked in, or chose in Nav. */
  current: null as string | null,
  making: null as Making | null,
  /** A picked screen getting a new version: an Edit with `change`, else a Regenerate. */
  revising: null as { key: string; change: string | null } | null,
  /** The open drawer tab, if any. It shows the current screen. */
  drawer: null as 'edit' | 'info' | null,
  busy: null as AbortController | null,
  /** The view before an A OR B was fitted, to go back to after the pick. */
  before: null as View | null,
  /** Counts mockups opened, so a slower earlier open gives way to a newer one. */
  starts: 0,
  spent: 0,
  css: {} as Record<string, string>,
}

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

const canvas = new Canvas($('stage'), {
  action: onAction,
  pick,
  cancel: dropChoice,
  focus: (key) => setCurrent(key),
  tool: onTool,
  zoomed: (z) => { zoomValue.textContent = `${Math.round(z * 100)}%` },
})

// ---- Views ------------------------------------------------------------------------------------

/** A screen's short name: the one the model gave it, else its first heading, else its prompt. */
function nameOf(e: CacheEntry, v: Version): string {
  if (v.name) return v.name
  const h = v.html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1]
  // Parsed, not just stripped of tags, so entities like &amp; read as text.
  const text = h && new DOMParser().parseFromString(h, 'text/html').body.textContent?.trim()
  return (text || e.action || e.app).slice(0, 60)
}

/** A screen's label, e.g. "L2 Camera". */
const labelOf = (e: CacheEntry) => (e.versions.length ? `L${e.level} ${nameOf(e, e.versions.at(-1)!)}` : `L${e.level} New screen`)

const widthOf = (d: Device | undefined) => (d ? DEVICES[d].width : LEGACY_WIDTH)
const ideaOf = (v: Version) => v.idea ?? screenIdea(v.html)

function sideCard(key: string, index: number, side: Side | null, stored: Version | null, device: Device | undefined): CardView {
  const version = stored ?? side?.version ?? null
  const error = version ? undefined : side ? side.error ?? undefined : 'This design was not finished.'
  return {
    id: `${key}#${index}`, width: widthOf(version?.device ?? device), name: '', idea: version ? ideaOf(version) : '',
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
    out.push(v ? {
      key: e.key, parent: e.parent?.key ?? null, current: state.current === e.key, undo: e.versions.length > 1,
      note: revising ? (revising.change ? 'Making the change…' : 'Making a new design…') : '',
      cards: [{ id: e.key, width: widthOf(v.device), name: labelOf(e), idea: ideaOf(v), streaming: !!revising }],
    } : {
      key: e.key, parent: e.parent?.key ?? null, current: false, undo: false, note: '',
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
  canvas.render(views(), !!state.busy)
  generate.hidden = !!state.app && !generate.classList.contains('open')
  generate.classList.toggle('pop', !!state.app)
  renderDrawer()
  const theme = themeSelect.value
  const css = await themeCss(theme)
  if (theme !== themeSelect.value) return // a newer draw shows the newer theme
  for (const e of state.entries.values()) {
    const v = e.versions.at(-1)
    if (v) { if (state.revising?.key !== e.key) canvas.show(e.key, v.html, true, css) }
    else e.proposals?.forEach((p, i) => { if (p) canvas.show(`${e.key}#${i}`, p.html, true, css) })
  }
  state.making?.sides.forEach((s, i) => { if (s.version) canvas.show(`${state.making!.key}#${i}`, s.version.html, true, css) })
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

/** Rebuilds one card's frame at most every REBUILD_MS while it streams. */
class StreamRenderer {
  private raw = ''
  private shown: string | null = null
  private lastBuild = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private visible = false
  constructor(private id: string, private css: string, private onVisible: () => void) {}

  push(text: string) {
    this.raw += text
    this.build(false)
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    canvas.forgetLoad(this.id)
  }

  private build(force: boolean) {
    const now = Date.now()
    if (!force && now - this.lastBuild < REBUILD_MS) {
      this.timer ??= setTimeout(() => { this.timer = null; this.build(true) }, REBUILD_MS - (now - this.lastBuild))
      return
    }
    const fragment = extractFragment(this.raw)
    if (fragment === this.shown || !hasVisibleText(fragment)) return
    this.lastBuild = now
    this.shown = fragment
    canvas.show(this.id, fragment, false, this.css, this.visible ? undefined : () => { this.visible = true; this.onVisible() })
  }
}

// ---- Status -----------------------------------------------------------------------------------

const fmtS = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`
const fmtUsd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`
const modelLabel = (id: string) => [...modelSelect.options].find((o) => o.value === id)?.text ?? id

/** The pill at the bottom of the canvas. An error stays until closed; anything else replaces it. */
function status(html: string) {
  statusBox.classList.remove('error')
  statusClose.hidden = true
  statusText.innerHTML = html
  statusBox.hidden = !html
}

function showError(msg: string) {
  statusBox.classList.add('error')
  statusClose.hidden = false
  statusText.textContent = msg
  statusBox.hidden = false
}

statusClose.addEventListener('click', () => status(''))

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

const post = (url: string, body: object, signal?: AbortSignal) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })

// ---- Screens ----------------------------------------------------------------------------------

/**
 * Open a screen: from the cache when it is there, else as A OR B, two designs streamed side by
 * side. Before they show, the view is remembered and both are fitted to the stage.
 */
async function openScreen(action: string | null, from: string | null, label: string | null) {
  const app = state.app!
  state.busy?.abort()
  const ctrl = new AbortController()
  state.busy = ctrl
  const t0 = performance.now()
  const model = modelSelect.value
  const device = deviceSelect.value as Device
  let first: number | null = null
  status('Asking for the screen…')
  try {
    const css = await themeCss(themeSelect.value)
    const res = await post('/api/screen', { app, action, model, device, from, label }, ctrl.signal)
    let m: Making | null = null
    let finished = false
    for await (const ev of readEvents(res)) {
      if (ev.type === 'meta' && !ev.cached) {
        m = { key: ev.key, parent: from, device, sides: [] }
        m.sides = Array.from({ length: ev.variants }, (_, i) => ({
          version: null, error: null,
          stream: new StreamRenderer(`${ev.key}#${i}`, css, () => {
            first ??= performance.now() - t0
            status(`First design in <b>${fmtS(first)}</b> · making ${ev.variants} with ${modelLabel(model)}…`)
          }),
        }))
        state.making = m
        if (!state.before && state.app) state.before = canvas.view()
        await draw()
        canvas.fit(ev.key, { top: true })
      } else if (ev.type === 'chunk') m?.sides[ev.variant]?.stream?.push(ev.text)
      else if (ev.type === 'version' || ev.type === 'failed') {
        const s = m?.sides[ev.variant]
        if (!s) continue
        s.stream?.cancel()
        s.stream = null
        if (ev.type === 'version') { s.version = ev.version; state.spent += ev.version.costUsd ?? 0 }
        else s.error = ev.message
        draw()
      } else if (ev.type === 'error') throw new Error(ev.message)
      else if (ev.type === 'done') {
        finished = true
        state.entries.set(ev.entry.key, ev.entry)
        if (ev.link) addLink(ev.link)
        if (state.making === m) state.making = null
        loadRecent()
        await draw()
        if (m) {
          const made = (ev.entry.proposals ?? []).filter(Boolean) as Version[]
          const cost = made.reduce((t, v) => t + (v.costUsd ?? 0), 0), est = made.some((v) => v.costEstimated)
          status(`${made.length === 1 ? 'One design' : `${made.length} designs`} in <b>${fmtS(performance.now() - t0)}</b> · `
            + `<b>${est ? '~' : ''}${fmtUsd(cost)}</b> · this session ${fmtUsd(state.spent)} · pick one`)
        } else {
          // Already made (another tab, or a reload while its A OR B was open).
          status('<b>Cached</b> · $0')
          if (ev.entry.versions.length) setCurrent(ev.entry.key)
          else {
            if (!state.before) state.before = canvas.view()
            canvas.fit(ev.entry.key, { top: true })
          }
        }
      }
    }
    if (!finished && !ctrl.signal.aborted) throw new Error('the stream ended early')
  } catch (err) {
    if (ctrl.signal.aborted) return
    showError(`Could not make this screen: ${err instanceof Error ? err.message : err}`)
    for (const s of state.making?.sides ?? []) s.stream?.cancel()
    state.making = null
    back()
  } finally {
    if (state.busy === ctrl) state.busy = null
    draw().catch((e) => showError(String(e)))
  }
}

/** Go back to the view from before an A OR B, if there was one. */
function back() {
  if (state.before) canvas.setView(state.before)
  state.before = null
}

/** Keep one side of an open A OR B. If the other one is still streaming, it stops. */
async function pick(key: string, index: number) {
  const m = state.making?.key === key ? state.making : null
  if (!(m?.sides[index]?.version ?? state.entries.get(key)?.proposals?.[index])) return
  if (m) {
    state.busy?.abort()
    state.busy = null
    for (const s of m.sides) s.stream?.cancel()
    state.making = null
  }
  const res = await post('/api/pick', { key, index }).catch(() => null)
  if (!res?.ok) {
    showError('Could not keep that design')
    return reloadMap()
  }
  const { entry } = await res.json() as { entry: CacheEntry }
  state.entries.set(key, entry)
  canvas.rename(`${key}#${index}`, key)
  state.current = key
  saveCurrent()
  status(`Kept <b>${labelOf(entry)}</b>`)
  await draw()
  back()
  canvas.reveal(key, false)
}

/** Drop both designs of an open A OR B; for the first screen, that drops the mockup too. */
async function dropChoice(key: string) {
  if (state.making?.key === key) {
    state.busy?.abort()
    state.busy = null
    for (const s of state.making.sides) s.stream?.cancel()
    state.making = null
  }
  const root = state.app && screenKey(state.app, null) === key
  await post('/api/delete', { key }).catch(() => null)
  state.entries.delete(key)
  if (root) return closeMockup('Dropped both designs.')
  back()
  status('Dropped both designs.')
  await draw()
}

/** A click inside a picked screen: open the screen it leads to, or go to it when it is already there. */
function onAction(from: string, prompt: string, label: string) {
  const app = state.app
  if (!app) return
  const to = screenKey(app, prompt)
  setCurrent(from)
  if (to === from) return
  const there = state.entries.get(to)
  if (there || state.making?.key === to) {
    if (there) recordLink(from, to, label)
    if (there?.versions.length) { setCurrent(to); canvas.reveal(to) } else canvas.fit(to, { top: true })
    return
  }
  if (state.busy) return status('One screen at a time: wait until this one is made.')
  openScreen(prompt, from, label)
}

function addLink(l: Link) {
  if (!state.links.some((x) => x.from === l.from && x.to === l.to)) state.links.push(l)
}

/** A click to a screen already on the canvas: store it with the mockup. */
async function recordLink(from: string, to: string, label: string) {
  addLink({ from, to, label, createdAt: new Date().toISOString() })
  await post('/api/link', { from, to, label }).catch(() => null)
}

function setCurrent(key: string | null) {
  if (state.current === key) return
  state.current = key
  saveCurrent()
  draw()
}

const currentKey = (app: string) => `uxwoz:current:${normalizePrompt(app)}`
function saveCurrent() {
  if (state.app && state.current) store.set(currentKey(state.app), state.current)
}

/** Take the server's copy of the open mockup. */
async function reloadMap() {
  const app = state.app
  if (!app) return
  const res = await fetch(`/api/map?app=${encodeURIComponent(app)}`).catch(() => null)
  if (!res?.ok || state.app !== app) return
  applyMap(await res.json())
}

function applyMap(map: { entries: CacheEntry[]; links: Link[] }) {
  state.entries = new Map(map.entries.map((e) => [e.key, e]))
  state.links = map.links
  if (state.current && !state.entries.has(state.current)) state.current = null
  draw()
}

// ---- The rail and the drawer --------------------------------------------------------------------

function onTool(key: string, tool: string) {
  if (!state.entries.get(key)?.versions.length) return
  setCurrent(key)
  if (tool === 'edit' || tool === 'info') return openDrawer(tool)
  if (tool === 'regenerate') return revise(key, null)
  if (tool === 'undo') return undo(key)
  if (tool === 'delete') return removeScreen(key)
}

/** One new version of a screen, streamed into its own frame: an Edit with `change`, else a Regenerate. */
async function revise(key: string, change: string | null) {
  const e = state.entries.get(key)
  if (!e?.versions.length) return
  if (state.busy) return status('One screen at a time: wait until this one is made.')
  const ctrl = new AbortController()
  state.busy = ctrl
  state.revising = { key, change }
  const t0 = performance.now()
  const model = modelSelect.value
  status(change ? `Making the change with ${modelLabel(model)}…` : `Making a new design with ${modelLabel(model)}…`)
  draw()
  try {
    const css = await themeCss(themeSelect.value)
    const stream = new StreamRenderer(key, css, () => {})
    const res = await post('/api/revise', { key, change, model, device: deviceSelect.value }, ctrl.signal)
    let finished = false
    try {
      for await (const ev of readEvents(res)) {
        if (ev.type === 'chunk') stream.push(ev.text)
        else if (ev.type === 'error') throw new Error(ev.message)
        else if (ev.type === 'done') {
          finished = true
          stream.cancel()
          state.entries.set(key, ev.entry)
          const v = ev.entry.versions.at(-1)!
          state.spent += v.costUsd ?? 0
          state.revising = null
          if (change) changeInput.value = ''
          status(`${change ? 'Changed' : 'New design'} in <b>${fmtS(performance.now() - t0)}</b> · <b>${v.costEstimated ? '~' : ''}${fmtUsd(v.costUsd ?? 0)}</b>`
            + ` · ↶ Undo brings the old one back`)
        }
      }
    } finally {
      stream.cancel()
    }
    if (!finished && !ctrl.signal.aborted) throw new Error('the stream ended early')
  } catch (err) {
    if (!ctrl.signal.aborted) showError(`Could not ${change ? 'make the change' : 'make a new design'}: ${err instanceof Error ? err.message : err}`)
  } finally {
    // After a failure, draw() puts the screen as it was back into its frame.
    if (state.revising?.key === key) state.revising = null
    if (state.busy === ctrl) state.busy = null
    draw().catch((e) => showError(String(e)))
  }
}

async function undo(key: string) {
  if (state.busy) return
  const res = await post('/api/undo', { key }).catch(() => null)
  if (!res?.ok) return showError('Nothing to undo')
  const { entry } = await res.json() as { entry: CacheEntry }
  state.entries.set(key, entry)
  status("Back to the version before")
  draw()
}

/** The screens a screen's clicks made, and theirs: what a delete takes with it (at most). */
function below(key: string): CacheEntry[] {
  const kids = [...state.entries.values()].filter((e) => e.parent?.key === key && e.key !== key)
  return kids.flatMap((k) => [k, ...below(k.key)])
}

/** Delete a screen, after asking. Screens only it leads to go too; the first screen takes the mockup. */
async function removeScreen(key: string) {
  const e = state.entries.get(key)
  if (!e || state.busy || !state.app) return
  const root = screenKey(state.app, null) === key
  const n = below(key).length
  const what = root ? `${labelOf(e)}, the first screen? That deletes the whole mockup.`
    : `${labelOf(e)}${n ? ` and the ${n === 1 ? 'screen' : `${n} screens`} below it` : ''}?`
  if (!confirm(`Delete ${what}`)) return
  const res = await post('/api/delete', { key }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the screen')
  const map = await res.json() as { removed: string[]; entries: CacheEntry[]; links: Link[] }
  loadRecent()
  if (root) return closeMockup('Deleted the mockup.')
  const parent = e.parent?.key
  applyMap(map)
  setCurrent(parent && state.entries.has(parent) ? parent : screenKey(state.app, null))
  status(`Deleted ${map.removed.length === 1 ? 'one screen' : `${map.removed.length} screens`}`)
  if (state.current) canvas.reveal(state.current)
}

function openDrawer(tab: 'edit' | 'info') {
  state.drawer = tab
  renderDrawer()
  if (tab === 'edit') changeInput.focus()
  // The canvas got narrower: keep the current screen in view beside the drawer.
  requestAnimationFrame(() => { if (state.current) canvas.reveal(state.current) })
}

function closeDrawer() {
  state.drawer = null
  renderDrawer()
}

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
  history.replaceChildren(...e.versions.map((x, i) => {
    const li = document.createElement('li')
    li.textContent = i === 0 ? 'The design you picked' : x.feedback ? `Edit: ${x.feedback}` : 'Regenerated'
    li.classList.toggle('now', i === e.versions.length - 1)
    return li
  }).reverse())
  const parent = e.parent && state.entries.get(e.parent.key)
  const info: [string, string][] = [
    ['Name', labelOf(e)],
    ['Idea', ideaOf(v) || '–'],
    ['Opened by', parent ? `${e.parent!.label || 'a click'} in ${labelOf(parent)}` : e.action ? '–' : 'the first screen'],
    ['Version', `${e.versions.length} of ${e.versions.length}${v.feedback ? ` (Edit: ${v.feedback})` : e.versions.length > 1 ? ' (Regenerated)' : ''}`],
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
  ]
  $('info').replaceChildren(...info.flatMap(([k, val]) => {
    const dt = document.createElement('dt'), dd = document.createElement('dd')
    dt.textContent = k
    dd.textContent = val
    return [dt, dd]
  }))
}

$('editPane').addEventListener('submit', (ev) => {
  ev.preventDefault()
  const change = changeInput.value.trim()
  if (!change) return changeInput.focus()
  if (state.current) revise(state.current, change)
})
// Enter makes the change; Shift+Enter adds a line.
changeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $<HTMLFormElement>('editPane').requestSubmit() }
})
for (const b of drawer.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.addEventListener('click', () => openDrawer(b.dataset.tab as 'edit' | 'info'))
$('drawerClose').addEventListener('click', closeDrawer)
addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && state.drawer) closeDrawer() })

// ---- Mockups ----------------------------------------------------------------------------------

/** Open a mockup: its screens from the cache, else its first screen as A OR B. */
async function start(app: string) {
  state.busy?.abort()
  state.busy = null
  state.making = null
  state.before = null
  const n = ++state.starts
  const res = await fetch(`/api/map?app=${encodeURIComponent(app)}`)
  if (!res.ok) throw new Error(`could not load the mockup: HTTP ${res.status}`)
  const map = await res.json() as { entries: CacheEntry[]; links: Link[] }
  if (n !== state.starts) return // a newer mockup was opened meanwhile
  state.app = app
  generate.classList.remove('open')
  applyMap(map)
  const root = screenKey(app, null)
  const saved = store.get(currentKey(app))
  state.current = saved && state.entries.get(saved)?.versions.length ? saved : state.entries.get(root)?.versions.length ? root : null
  if (!state.entries.has(root)) return openScreen(null, null, null)
  await draw()
  const open = [...state.entries.values()].find((e) => !e.versions.length)
  status(`<b>Cached</b> · ${state.entries.size} screen${state.entries.size === 1 ? '' : 's'} · $0`)
  canvas.fit(open?.key ?? state.current ?? root, { top: !!open })
}

function closeMockup(msg: string) {
  state.busy?.abort()
  state.app = null
  state.entries = new Map()
  state.links = []
  state.current = null
  state.making = null
  state.revising = null
  state.drawer = null
  state.before = null
  loadRecent()
  status(msg)
  draw()
}

// ---- Wiring -----------------------------------------------------------------------------------

generate.addEventListener('submit', (e) => {
  e.preventDefault()
  const app = promptInput.value.trim()
  if (app) start(app).catch((err) => showError(String(err)))
})
// Enter makes the mockup; Shift+Enter adds a line.
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); generate.requestSubmit() }
})

// A template with a long prompt shows a short name and keeps the full prompt in data-prompt.
for (const b of document.querySelectorAll<HTMLButtonElement>('.example')) {
  b.title = b.dataset.prompt ?? ''
  b.addEventListener('click', () => { promptInput.value = b.dataset.prompt ?? b.textContent ?? ''; generate.requestSubmit() })
}

$('newMockup').addEventListener('click', () => {
  generate.classList.toggle('open')
  draw()
  if (!generate.hidden) promptInput.focus()
})

// While a screen streams, the new theme applies when it finishes.
themeSelect.addEventListener('change', async () => {
  store.set('uxwoz:theme', themeSelect.value)
  try {
    await themeCss(themeSelect.value)
    await draw()
  } catch (e) {
    showError(`Could not load the theme: ${e instanceof Error ? e.message : e}`)
  }
})
deviceSelect.addEventListener('change', () => store.set('uxwoz:device', deviceSelect.value))

$('zoomIn').addEventListener('click', () => canvas.step(1))
$('zoomOut').addEventListener('click', () => canvas.step(-1))
zoomValue.addEventListener('click', () => canvas.setZoom(1))
$('fitScreen').addEventListener('click', () => fitScreen())

const fitAll = () => canvas.fit()
const fitScreen = () => canvas.fit(state.current ?? undefined)
const fitWidth = () => { if (state.current) canvas.fitWidth(state.current) }

// Zoom keys as in Figma: ⌘+ and ⌘− (Ctrl on other systems), ⌘0 for 100%, ⇧1 fit all, ⇧2 fit screen, ⇧3 fit width.
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
addEventListener('keydown', (e: KeyboardEvent) => {
  const mod = e.metaKey || e.ctrlKey
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); canvas.step(1) }
  else if (mod && e.key === '-') { e.preventDefault(); canvas.step(-1) }
  else if (mod && e.key === '0') { e.preventDefault(); canvas.setZoom(1) }
  else if (editable(e.target) || mod || e.altKey || !e.shiftKey) return
  else if (e.code === 'Digit1') fitAll()
  else if (e.code === 'Digit2') fitScreen()
  else if (e.code === 'Digit3') fitWidth()
})

/** Fill the Recent list with every mockup in the cache, newest first. */
async function loadRecent() {
  const res = await fetch('/api/apps').catch(() => null)
  if (!res?.ok) return
  const { apps } = await res.json() as { apps: { app: string; screens: number }[] }
  const list = $('recent')
  list.replaceChildren(...apps.map((a) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = a.app
    const name = document.createElement('span'), n = document.createElement('small')
    name.textContent = a.app
    n.textContent = `${a.screens} screen${a.screens === 1 ? '' : 's'}`
    b.append(name, n)
    b.addEventListener('click', () => { promptInput.value = a.app; generate.requestSubmit() })
    return b
  }))
  $('recentBox').hidden = apps.length === 0
}

const warmUp = (model: string) => post('/api/warmup', { model }).catch(() => {})

modelSelect.addEventListener('change', () => {
  store.set('uxwoz:model', modelSelect.value)
  warmUp(modelSelect.value)
})

async function init() {
  const cfg = await (await fetch('/api/config')).json()
  for (const m of cfg.models) modelSelect.add(new Option(m.label + (m.costEstimated ? ' (cost est.)' : ''), m.id))
  for (const t of cfg.themes) themeSelect.add(new Option(t.label, t.id))
  for (const d of cfg.devices) deviceSelect.add(new Option(d.label, d.id))
  const savedModel = store.get('uxwoz:model')
  modelSelect.value = cfg.models.some((m: { id: string }) => m.id === savedModel) ? savedModel! : cfg.defaultModel
  const savedTheme = store.get('uxwoz:theme')
  themeSelect.value = cfg.themes.some((t: { id: string }) => t.id === savedTheme) ? savedTheme! : cfg.defaultTheme
  const savedDevice = store.get('uxwoz:device')
  deviceSelect.value = isDevice(savedDevice) ? savedDevice : cfg.defaultDevice
  warmUp(modelSelect.value)
  loadRecent()
  await themeCss(themeSelect.value)
  draw()
  promptInput.focus()
}

init().catch((e) => showError(`Could not load the app config: ${e.message}`))
