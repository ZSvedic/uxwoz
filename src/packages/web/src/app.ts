// The browser side: prompt box, the feed of screens (one row per step, variants side by side),
// streaming two variants at once, click-to-navigate, picking, pickers, history, metrics.

import { DEVICES, LEGACY_WIDTH, REBUILD_MS, extractFragment, hasVisibleText, isDevice, type Device } from '@uxwoz/core/frame'
import { normalizePrompt, screenKey } from '@uxwoz/core/keys'
import type { CacheEntry, Candidate } from '@uxwoz/core'
import { Feed, type FeedRow, type FeedVariant } from './feed.ts'
import type { ScreenEvent } from './server.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const promptForm = $<HTMLFormElement>('promptForm')
const promptInput = $<HTMLInputElement>('prompt')
const modelSelect = $<HTMLSelectElement>('model')
const themeSelect = $<HTMLSelectElement>('theme')
const deviceSelect = $<HTMLSelectElement>('device')
const historySelect = $<HTMLSelectElement>('history')
const metrics = $('metrics')
const errorBox = $('error')

/** One step of the flow: a screen and its variants. */
interface Row {
  key: string
  action: string | null
  /** The control clicked in the row above to get here; null for the first row. */
  via: string | null
  /** Null until the screen arrives the first time. */
  entry: CacheEntry | null
  /** The variants streaming into this row now, one renderer each. */
  streaming: StreamRenderer[]
}

const state = {
  app: null as string | null,
  rows: [] as Row[],
  busy: null as AbortController | null,
  /** Counts prompts started, so a slower earlier start gives way to a newer one. */
  starts: 0,
  spent: 0,
  css: {} as Record<string, string>,
}

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

const feed = new Feed($('stage'), {
  pick: (rowKey, id) => { const r = rowOf(rowKey); if (r) choose(r, indexOf(id)) },
  regenerate: (rowKey, feedback) => { const r = rowOf(rowKey); if (r && !state.busy) load(r, { regenerate: true, feedback }) },
  action: onAction,
})

const rowOf = (key: string) => state.rows.find((r) => r.key === key)
/** The candidate index in a variant id `key#3`; NaN for a variant still streaming (`key#s0`). */
const indexOf = (id: string) => Number(id.slice(id.lastIndexOf('#') + 1))
const streamId = (key: string, slot: number) => `${key}#s${slot}`
const candidateId = (key: string, index: number) => `${key}#${index}`

// ---- Rendering --------------------------------------------------------------------------------

/** A row's title: the picked screen's first heading, else its prompt. */
function titleOf(r: Row): string {
  const html = r.entry?.candidates[r.entry.chosen]?.html
  const h = html?.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1]
  // Parsed, not just stripped of tags, so entities like &amp; read as text.
  const text = h && new DOMParser().parseFromString(h, 'text/html').body.textContent?.trim()
  return (text || r.action || state.app || '').slice(0, 80)
}

const widthOf = (c: Candidate) => (c.device ? DEVICES[c.device].width : LEGACY_WIDTH)

function feedRow(r: Row): FeedRow {
  const cands = r.entry?.candidates ?? []
  const variants: FeedVariant[] = cands.map((c, i) => ({
    id: candidateId(r.key, i),
    width: widthOf(c),
    caption: `Variant ${i + 1} · ${modelLabel(c.model)} · ${fmtCost(c)}`,
    tooltip: c.feedback ? `Asked for: ${c.feedback}` : '',
    chosen: r.entry!.chosen === i,
    streaming: false,
  }))
  const device = deviceSelect.value as Device
  r.streaming.forEach((_, slot) => variants.push({
    id: streamId(r.key, slot),
    width: DEVICES[device]?.width ?? LEGACY_WIDTH,
    caption: `Variant ${cands.length + slot + 1} · making…`,
    tooltip: '',
    chosen: false,
    streaming: true,
  }))
  const note = r.streaming.length ? `making ${r.streaming.length} variants…` : `${cands.length} variant${cands.length === 1 ? '' : 's'}`
  return { key: r.key, title: r.entry ? titleOf(r) : 'Making this screen…', via: r.via, note, variants }
}

/** Draw every row and put each stored variant in its frame. Streaming frames are left to their streams. */
async function draw() {
  feed.render(state.rows.map(feedRow), !!state.busy)
  const theme = themeSelect.value
  const css = await themeCss(theme)
  if (theme !== themeSelect.value) return // a newer draw shows the newer theme
  for (const r of state.rows) r.entry?.candidates.forEach((c, i) => feed.show(candidateId(r.key, i), c.html, true, css))
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

/** Rebuilds one variant's frame at most every REBUILD_MS while it streams. */
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
    feed.show(this.id, fragment, false, this.css, this.visible ? undefined : () => { this.visible = true; this.onVisible() })
  }
}

// ---- Screens ----------------------------------------------------------------------------------

const fmtS = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`
const fmtUsd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`
function fmtCost(c: Candidate) {
  if (c.costUsd == null) return 'cost unknown'
  return `${c.costEstimated ? '~' : ''}${fmtUsd(c.costUsd)}${c.costEstimated ? ' (est.)' : ''}`
}
const modelLabel = (id: string) => [...modelSelect.options].find((o) => o.value === id)?.text ?? id

function showError(msg: string | null) {
  errorBox.hidden = !msg
  errorBox.textContent = msg ?? ''
}

function setMetrics(html: string) {
  metrics.innerHTML = html
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

/**
 * Fill a row: from the cache when its screen is there, else two variants streamed side by side.
 * With `regenerate`, two more variants join the row, shaped by the user's feedback if any.
 */
async function load(row: Row, { regenerate = false, feedback = '', from = null as Row | null } = {}) {
  state.busy?.abort()
  const ctrl = new AbortController()
  state.busy = ctrl
  const app = state.app!
  const t0 = performance.now()
  const model = modelSelect.value
  let firstVisible: number | null = null
  let cached = false
  showError(null)
  setMetrics(regenerate ? `Making 2 more variants with ${modelLabel(model)}…` : 'Asking for the screen…')
  draw()
  try {
    const css = await themeCss(themeSelect.value)
    const res = await fetch('/api/screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app, action: row.action, model, device: deviceSelect.value, regenerate, feedback,
        from: from?.key ?? null, label: from ? row.via : null,
      }),
      signal: ctrl.signal,
    })
    let finished = false
    for await (const ev of readEvents(res)) {
      if (ev.type === 'meta') {
        cached = ev.cached
        row.key = ev.key // the server's key is the truth (it was computed the same way)
        row.streaming = Array.from({ length: ev.variants }, (_, slot) => new StreamRenderer(streamId(row.key, slot), css, () => {
          firstVisible ??= performance.now() - t0
          setMetrics(`First visible screen <b>${fmtS(firstVisible)}</b> · streaming ${ev.variants} variants from ${modelLabel(model)}…`)
        }))
        if (!cached) {
          await draw()
          if (regenerate) feed.scrollToVariant(streamId(row.key, 0))
          else feed.scrollToRow(row.key)
        }
      } else if (ev.type === 'chunk') row.streaming[ev.variant]?.push(ev.text)
      else if (ev.type === 'error') throw new Error(ev.message)
      else if (ev.type === 'done') {
        finished = true
        for (const s of row.streaming) s.cancel()
        row.streaming = []
        row.entry = ev.entry
        const added = ev.variants.filter((i): i is number => i != null)
        if (added.length) loadHistory()
        ev.variants.forEach((i, slot) => { if (i != null) feed.rename(streamId(row.key, slot), candidateId(row.key, i)) })
        const cost = added.reduce((s, i) => s + (ev.entry.candidates[i]!.costUsd ?? 0), 0)
        state.spent += cost
        savePath(app)
        if (regenerate && added.length) feed.clearFeedback(row.key)
        if (ev.failed.length) showError(`${ev.failed.length} of ${ev.variants.length} variants failed: ${ev.failed[0]}`)
        // The metrics line is final once every new variant has loaded with its script.
        let waiting = added.length
        const css = await themeCss(themeSelect.value)
        for (const i of added) feed.show(candidateId(row.key, i), ev.entry.candidates[i]!.html, true, css, () => {
          if (--waiting > 0) return
          const total = performance.now() - t0
          const est = added.some((i) => ev.entry.candidates[i]!.costEstimated)
          setMetrics(`First visible screen <b>${fmtS(firstVisible ?? total)}</b> · ${added.length === 1 ? 'interactive' : 'all variants interactive'} <b>${fmtS(total)}</b>`
            + ` · <b>${est ? '~' : ''}${fmtUsd(cost)}${est ? ' (est.)' : ''}</b> for ${added.length} · ${modelLabel(model)} · this session $${state.spent.toFixed(4)}`)
        })
        await draw()
        if (cached) {
          const c = ev.entry.candidates[ev.entry.chosen]!
          setMetrics(`<b>Cached</b> · shown in <b>${fmtS(performance.now() - t0)}</b> · $0 now (made by ${modelLabel(c.model)} for ${fmtCost(c)})`)
          if (from) feed.scrollToRow(row.key)
        }
      }
    }
    if (!finished && !ctrl.signal.aborted) throw new Error('the stream ended early')
  } catch (err) {
    if (!ctrl.signal.aborted) {
      showError(`Could not make this screen: ${err instanceof Error ? err.message : err}`)
      setMetrics('')
    }
    for (const s of row.streaming) s.cancel()
    row.streaming = []
    // A new row whose screen never arrived goes away; a regenerated row keeps the variants it had.
    // After an abort the rows may already belong to another prompt, so they are left alone.
    if (!row.entry && !ctrl.signal.aborted) { state.rows = state.rows.filter((r) => r !== row); savePath(app) }
  } finally {
    if (state.busy === ctrl) state.busy = null
    draw().catch((e) => showError(String(e)))
  }
}

/** A click inside a variant picks it and opens the next row; a link to a screen already in the flow scrolls to it. */
function onAction(rowKey: string, id: string, prompt: string, label: string) {
  const app = state.app
  const r = state.rows.findIndex((x) => x.key === rowKey)
  const index = indexOf(id)
  if (!app || r < 0 || !Number.isInteger(index)) return
  const row = state.rows[r]!
  const key = screenKey(app, prompt)
  const known = !!rowOf(key)
  if (state.busy && !known) return
  if (row.entry && row.entry.chosen !== index) choose(row, index)
  if (known) { feed.scrollToRow(key); return }
  // A new screen from an earlier row replaces the rows below it.
  const next: Row = { key, action: prompt, via: label, entry: null, streaming: [] }
  state.rows = [...state.rows.slice(0, r + 1), next]
  savePath(app)
  load(next, { from: row })
}

/** Make a variant the one revisits show. */
async function choose(row: Row, index: number) {
  const entry = row.entry
  if (!entry || !Number.isInteger(index) || entry.chosen === index) return
  const before = entry.chosen
  entry.chosen = index // at once, so the row shows it; undone below if the server says no
  draw()
  const res = await fetch('/api/choose', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: entry.key, index }),
  }).catch(() => null)
  if (!res?.ok) {
    if (entry.chosen === index) entry.chosen = before
    showError('Could not save the pick')
  }
  draw()
}

// ---- The flow, remembered per mockup in this browser --------------------------------------------

const pathKey = (app: string) => `uxwoz:path:${normalizePrompt(app)}`
interface SavedRow { key: string; action: string | null; via: string | null }

/** Save the rows shown now, if they still belong to `app` (a newer prompt may have replaced them). */
function savePath(app: string) {
  if (state.app !== app) return
  const rows: SavedRow[] = state.rows.filter((r) => r.entry).map(({ key, action, via }) => ({ key, action, via }))
  store.set(pathKey(app), JSON.stringify(rows))
}

/** Start a mockup: the rows saved for it last time (those still in the cache), else its first screen. */
async function start(app: string) {
  state.busy?.abort()
  state.busy = null
  state.app = app
  const n = ++state.starts
  showError(null)
  const res = await fetch(`/api/map?app=${encodeURIComponent(app)}`)
  if (!res.ok) throw new Error(`could not load the mockup: HTTP ${res.status}`)
  const entries = new Map((await res.json() as { entries: CacheEntry[] }).entries.map((e) => [e.key, e]))
  if (n !== state.starts) return // a newer prompt was submitted meanwhile
  let saved: SavedRow[] = []
  try { saved = JSON.parse(store.get(pathKey(app)) ?? '[]') } catch { /* start fresh */ }
  const root = screenKey(app, null)
  const rows: Row[] = []
  for (const s of saved) {
    const entry = entries.get(s.key)
    if (!entry || (rows.length === 0 && s.key !== root)) break
    rows.push({ ...s, entry, streaming: [] })
  }
  state.rows = rows.length ? rows : [{ key: root, action: null, via: null, entry: null, streaming: [] }]
  const first = state.rows[0]!
  if (first.entry) {
    await draw()
    feed.scrollToRow(first.key, false)
    setMetrics(`<b>Cached</b> · ${state.rows.length} screen${state.rows.length === 1 ? '' : 's'} in this flow · $0 now`)
  } else await load(first)
}

// ---- Wiring -----------------------------------------------------------------------------------

promptForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const app = promptInput.value.trim()
  if (app) start(app).catch((err) => showError(String(err)))
})

// An example with a long prompt shows a short name and keeps the full prompt in data-prompt.
for (const b of document.querySelectorAll<HTMLButtonElement>('.example')) {
  b.addEventListener('click', () => { promptInput.value = b.dataset.prompt ?? b.textContent ?? ''; promptForm.requestSubmit() })
}

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

/** Fill the History list with every mockup in the cache, newest first. */
async function loadHistory() {
  const res = await fetch('/api/apps').catch(() => null)
  if (!res?.ok) return
  const { apps } = await res.json() as { apps: { app: string; screens: number }[] }
  historySelect.replaceChildren(new Option(`History (${apps.length})`, ''))
  for (const a of apps) {
    const o = new Option(`${a.app.length > 60 ? a.app.slice(0, 59) + '…' : a.app} · ${a.screens} screen${a.screens === 1 ? '' : 's'}`, a.app)
    o.title = a.app
    historySelect.add(o)
  }
  historySelect.hidden = apps.length === 0
}

historySelect.addEventListener('change', () => {
  if (!historySelect.value) return
  promptInput.value = historySelect.value
  historySelect.value = ''
  promptForm.requestSubmit()
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
  for (const d of cfg.devices) deviceSelect.add(new Option(d.label, d.id))
  const savedModel = store.get('uxwoz:model')
  modelSelect.value = cfg.models.some((m: { id: string }) => m.id === savedModel) ? savedModel! : cfg.defaultModel
  const savedTheme = store.get('uxwoz:theme')
  themeSelect.value = cfg.themes.some((t: { id: string }) => t.id === savedTheme) ? savedTheme! : cfg.defaultTheme
  const savedDevice = store.get('uxwoz:device')
  deviceSelect.value = isDevice(savedDevice) ? savedDevice : cfg.defaultDevice
  warmUp(modelSelect.value)
  loadHistory()
  await themeCss(themeSelect.value)
}

init().catch((e) => showError(`Could not load the app config: ${e.message}`))
