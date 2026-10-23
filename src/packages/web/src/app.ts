// The browser side: prompt box, streaming renderer, click-to-navigate, versions, pickers, metrics.

import { FRAME_SANDBOX, REBUILD_MS, extractFragment, framePage, hasVisibleText } from '@uxwoz/core/frame'
import type { CacheEntry, Candidate } from '@uxwoz/core'
import type { ScreenEvent } from './server.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const promptForm = $<HTMLFormElement>('promptForm')
const promptInput = $<HTMLInputElement>('prompt')
const modelSelect = $<HTMLSelectElement>('model')
const themeSelect = $<HTMLSelectElement>('theme')
const stage = $('stage')
const metrics = $('metrics')
const errorBox = $('error')

interface Nav { app: string; action: string | null }

const state = {
  nav: null as Nav | null,
  history: [] as Nav[],
  entry: null as CacheEntry | null,
  /** The candidate on screen; may differ from entry.chosen while comparing versions. */
  index: 0,
  busy: null as AbortController | null,
  spent: 0,
  css: {} as Record<string, string>,
}

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

// ---- Rendering --------------------------------------------------------------------------------

let frame: HTMLIFrameElement | null = null
let onFrameLoad: (() => void) | null = null

function getFrame(): HTMLIFrameElement {
  if (frame) return frame
  stage.replaceChildren()
  frame = document.createElement('iframe')
  frame.title = 'Generated screen'
  frame.setAttribute('sandbox', FRAME_SANDBOX)
  frame.addEventListener('load', () => onFrameLoad?.())
  stage.appendChild(frame)
  return frame
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

async function themeCss(theme: string): Promise<string> {
  if (state.css[theme] == null) {
    const pico = state.css.pico ?? (state.css.pico = await fetchText('/themes/pico.css'))
    // A theme other than Pico is a drop-in stylesheet loaded after Pico.
    state.css[theme] = theme === 'pico' ? pico : pico + '\n' + await fetchText(`/themes/${theme}.css`)
  }
  return state.css[theme]!
}

/** Rebuilds the frame at most every REBUILD_MS while streaming, then once more when final. */
class StreamRenderer {
  private raw = ''
  private shown: string | null = null
  private lastBuild = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private visible = false
  constructor(private css: string, private onVisible: () => void) {}

  push(text: string) {
    this.raw += text
    this.build(false)
  }

  /** Show the final screen in the theme picked now; `onLoaded` runs once the frame has loaded it. */
  finish(html: string, css: string, onLoaded: () => void) {
    this.cancel()
    showFinal(html, css, () => { this.notify(); onLoaded() })
  }

  private notify() {
    if (this.visible) return
    this.visible = true
    this.onVisible()
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
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
    const f = getFrame()
    onFrameLoad = this.visible ? null : () => { onFrameLoad = null; this.notify() }
    f.srcdoc = framePage(fragment, this.css, false)
  }
}

/** Without `onLoad`, a callback still waiting for a load is kept: it fires on this load instead. */
function showFinal(html: string, css: string, onLoad: (() => void) | null = null) {
  const f = getFrame()
  if (onLoad) onFrameLoad = () => { onFrameLoad = null; onLoad() }
  f.srcdoc = framePage(html, css, true)
}

// ---- Screens ----------------------------------------------------------------------------------

const fmtS = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`
function fmtCost(c: Candidate) {
  if (c.costUsd == null) return 'cost unknown'
  const v = c.costUsd < 0.01 ? c.costUsd.toFixed(4) : c.costUsd.toFixed(3)
  return `${c.costEstimated ? '~' : ''}$${v}${c.costEstimated ? ' (est.)' : ''}`
}
const modelLabel = (id: string) => [...modelSelect.options].find((o) => o.value === id)?.text ?? id

function showError(msg: string | null) {
  errorBox.hidden = !msg
  errorBox.textContent = msg ?? ''
}

function setMetrics(html: string) {
  metrics.innerHTML = html
}

function updateToolbar() {
  const e = state.entry
  $('toolbar').hidden = !state.nav
  $<HTMLButtonElement>('back').disabled = state.history.length === 0 || !!state.busy
  $<HTMLButtonElement>('home').disabled = !state.nav?.action || !!state.busy
  $<HTMLButtonElement>('regen').disabled = !!state.busy || !e
  $('where').textContent = state.nav ? (state.nav.action ?? state.nav.app) : ''
  $('where').title = $('where').textContent ?? ''
  const n = e?.candidates.length ?? 0
  $('versions').hidden = n < 2
  $<HTMLButtonElement>('prev').disabled = !!state.busy || state.index <= 0
  $<HTMLButtonElement>('next').disabled = !!state.busy || state.index >= n - 1
  const isChosen = e ? state.index === e.chosen : true
  $('versionLabel').textContent = `Version ${state.index + 1} of ${n}${isChosen ? ' (shown on revisit)' : ''}`
  $('choose').hidden = isChosen || !!state.busy
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

/** Open a screen: from the cache when it is there, else streamed from the model. */
async function open(nav: Nav, { push = true, regenerate = false } = {}) {
  state.busy?.abort()
  const ctrl = new AbortController()
  state.busy = ctrl
  const t0 = performance.now()
  // What to go back to if this screen fails.
  const before = { nav: state.nav, entry: state.entry, index: state.index, historyLength: state.history.length }
  if (push && state.nav && !regenerate) state.history.push(state.nav)
  state.nav = nav
  showError(null)
  updateToolbar()
  const model = modelSelect.value
  let firstVisible: number | null = null
  let cached = false
  let renderer: StreamRenderer | null = null
  setMetrics(regenerate ? `Making a new version with ${modelLabel(model)}…` : 'Asking for the screen…')
  try {
    const css = await themeCss(themeSelect.value)
    renderer = new StreamRenderer(css, () => {
      firstVisible ??= performance.now() - t0
      if (!cached && state.busy === ctrl) setMetrics(`First visible screen <b>${fmtS(firstVisible)}</b> · streaming from ${modelLabel(model)}…`)
    })
    const res = await fetch('/api/screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nav, model, regenerate }),
      signal: ctrl.signal,
    })
    for await (const ev of readEvents(res)) {
      if (ev.type === 'meta') cached = ev.cached
      else if (ev.type === 'chunk') renderer.push(ev.text)
      else if (ev.type === 'error') throw new Error(ev.message)
      else if (ev.type === 'done') {
        state.entry = ev.entry
        state.index = ev.index
        const c = ev.entry.candidates[ev.index]!
        if (!cached) state.spent += c.costUsd ?? 0
        renderer.finish(c.html, await themeCss(themeSelect.value), () => {
          if (state.busy && state.busy !== ctrl) return // a newer screen is on its way
          const total = performance.now() - t0
          if (cached) {
            setMetrics(`<b>Cached</b> · shown in <b>${fmtS(total)}</b> · $0 now (made by ${modelLabel(c.model)} for ${fmtCost(c)})`)
            return
          }
          setMetrics(`First visible screen <b>${fmtS(firstVisible ?? total)}</b> · interactive <b>${fmtS(total)}</b>`
            + ` · <b>${fmtCost(c)}</b> · ${modelLabel(c.model)} · this session $${state.spent.toFixed(4)}`)
        })
      }
    }
  } catch (err) {
    renderer?.cancel()
    if (ctrl.signal.aborted) return
    showError(`Could not make this screen: ${err instanceof Error ? err.message : err}`)
    setMetrics('')
    // Put the previous screen back, working, so the toolbar and the frame agree again.
    state.nav = before.nav
    state.entry = before.entry
    state.index = before.index
    state.history.length = before.historyLength
    const c = state.entry?.candidates[state.index]
    if (c) themeCss(themeSelect.value).then((css) => showFinal(c.html, css)).catch(() => {})
    else if (frame) { frame.remove(); frame = null } // no earlier screen: drop the half-built one
  } finally {
    if (state.busy === ctrl) state.busy = null
    updateToolbar()
  }
}

function showVersion(i: number) {
  const e = state.entry
  if (!e || i < 0 || i >= e.candidates.length) return
  state.index = i
  const c = e.candidates[i]!
  themeCss(themeSelect.value).then((css) => showFinal(c.html, css)).catch((e) => showError(String(e)))
  setMetrics(`Version ${i + 1} · made by ${modelLabel(c.model)} in ${fmtS(c.totalMs)} for ${fmtCost(c)}`)
  updateToolbar()
}

// ---- Wiring -----------------------------------------------------------------------------------

promptForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const app = promptInput.value.trim()
  if (!app) return
  state.history = []
  state.entry = null
  open({ app, action: null }, { push: false })
})

for (const b of document.querySelectorAll<HTMLButtonElement>('.example')) {
  b.addEventListener('click', () => { promptInput.value = b.textContent ?? ''; promptForm.requestSubmit() })
}

// Clicks inside the screen arrive as postMessage from our bootstrap script in the frame.
addEventListener('message', (e) => {
  if (!frame || e.source !== frame.contentWindow) return
  const d = e.data
  if (d?.uxwoz !== 'action' || typeof d.prompt !== 'string' || !state.nav || state.busy) return
  open({ app: state.nav.app, action: d.prompt.slice(0, 500) })
})

$('back').addEventListener('click', () => {
  const prev = state.history.pop()
  if (prev) open(prev, { push: false })
})
$('home').addEventListener('click', () => {
  if (state.nav) open({ app: state.nav.app, action: null })
})
$('regen').addEventListener('click', () => { if (state.nav) open(state.nav, { push: false, regenerate: true }) })
$('prev').addEventListener('click', () => showVersion(state.index - 1))
$('next').addEventListener('click', () => showVersion(state.index + 1))
$('choose').addEventListener('click', async () => {
  const e = state.entry
  if (!e) return
  const res = await fetch('/api/choose', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: e.key, index: state.index }),
  })
  if (res.ok) state.entry = (await res.json()).entry
  else showError('Could not save the version choice')
  updateToolbar()
})

// While a screen streams, the new theme applies when it finishes.
themeSelect.addEventListener('change', async () => {
  store.set('uxwoz:theme', themeSelect.value)
  const c = state.entry?.candidates[state.index]
  try {
    const css = await themeCss(themeSelect.value)
    if (c && !state.busy) showFinal(c.html, css)
  } catch (e) {
    showError(`Could not load the theme: ${e instanceof Error ? e.message : e}`)
  }
})

const warmUp = (model: string) =>
  fetch('/api/warmup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }).catch(() => {})

modelSelect.addEventListener('change', () => {
  store.set('uxwoz:model', modelSelect.value)
  warmUp(modelSelect.value)
})

async function init() {
  const cfg = await (await fetch('/api/config')).json()
  for (const m of cfg.models) modelSelect.add(new Option(m.label + (m.costEstimated ? ' (cost est.)' : ''), m.id))
  for (const t of cfg.themes) themeSelect.add(new Option(t.label, t.id))
  const savedModel = store.get('uxwoz:model')
  modelSelect.value = cfg.models.some((m: { id: string }) => m.id === savedModel) ? savedModel! : cfg.defaultModel
  const savedTheme = store.get('uxwoz:theme')
  if (savedTheme && cfg.themes.some((t: { id: string }) => t.id === savedTheme)) themeSelect.value = savedTheme
  warmUp(modelSelect.value)
  await themeCss(themeSelect.value)
  updateToolbar()
}

init().catch((e) => showError(`Could not load the app config: ${e.message}`))
