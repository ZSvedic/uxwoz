// The browser side: prompt box, the feed of screens (one row per step, variants side by side),
// streaming two variants at once, click-to-navigate, picking, pickers, history, metrics.

import { DEVICES, LEGACY_WIDTH, REBUILD_MS, extractFragment, hasVisibleText, isDevice, type Device } from '@uxwoz/core/frame'
import { normalizePrompt, screenKey, variantId } from '@uxwoz/core/keys'
import type { CacheEntry, Candidate, Link } from '@uxwoz/core'
import { Feed, type FeedLink, type FeedRow, type FeedVariant } from './feed.ts'
import { Tree } from './tree.ts'
import type { ScreenEvent } from './server.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const promptForm = $<HTMLFormElement>('promptForm')
const promptInput = $<HTMLInputElement>('prompt')
const modelSelect = $<HTMLSelectElement>('model')
const themeSelect = $<HTMLSelectElement>('theme')
const deviceSelect = $<HTMLSelectElement>('device')
const historySelect = $<HTMLSelectElement>('history')
const startOverButton = $<HTMLButtonElement>('startOver')
const deleteAppButton = $<HTMLButtonElement>('deleteApp')
const zoomRange = $<HTMLInputElement>('zoomRange')
const zoom100 = $<HTMLButtonElement>('zoom100')
const metrics = $('metrics')
const errorBox = $('error')

/** One step of the flow: a screen and its variants. */
interface Row {
  key: string
  action: string | null
  /** The control clicked in the row above to get here; null for the first row. */
  via: string | null
  /** The variant of the row above that the click was made in; null for the first row. */
  parent: number | null
  /**
   * The variant shown first: the pick, as it was when the row was last left or opened. Picking by
   * playing with a variant does not move it, so a screen never jumps away under the pointer.
   */
  front?: number
  /** Null until the screen arrives the first time. */
  entry: CacheEntry | null
  /** The variants streaming into this row now, one renderer each. */
  streaming: StreamRenderer[]
}

const state = {
  app: null as string | null,
  rows: [] as Row[],
  /** Every screen of this mockup, by key, as the server last sent it. */
  entries: new Map<string, CacheEntry>(),
  /** Clicks between this mockup's screens, for the lines between rows. */
  links: [] as Link[],
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
  pick: (rowKey, id, bar) => {
    const r = rowOf(rowKey)
    if (!r) return
    choose(r, indexOf(id))
    if (bar && Number.isInteger(indexOf(id))) { r.front = indexOf(id); draw() }
  },
  regenerate: (rowKey, id, prompt) => {
    const r = rowOf(rowKey), c = r?.entry?.candidates[indexOf(id)]
    if (!r?.entry || !c || state.busy) return
    // Regenerate keeps the variant's own prompt; a Change back to the screen's prompt is a plain regenerate.
    const own = r.entry.action ?? r.entry.app
    prompt ??= c.prompt ?? null
    load(r, { regenerate: true, prompt: prompt && normalizePrompt(prompt) !== normalizePrompt(own) ? prompt : null })
  },
  remove: (rowKey, id) => { const r = rowOf(rowKey); if (r) removeVariant(r, indexOf(id)) },
  action: onAction,
  zoomed: (z) => {
    zoomRange.value = String(Math.round(z * 100))
    zoom100.textContent = `${Math.round(z * 100)}%`
    store.set('uxwoz:zoom', String(z))
  },
})

const tree = new Tree($('tree'), { open: openVariant })

const rowOf = (key: string) => state.rows.find((r) => r.key === key)
/** The candidate index in a variant id `key#3`; NaN for a variant still streaming (`key#s0`). */
const indexOf = (id: string) => Number(id.slice(id.lastIndexOf('#') + 1))
const streamId = (key: string, slot: number) => `${key}#s${slot}`
const candidateId = (key: string, index: number) => `${key}#${index}`

// ---- Rendering --------------------------------------------------------------------------------

/** A variant's short name: the one the model gave it, else its first heading, else its prompt. */
function nameOf(e: CacheEntry, c: Candidate): string {
  if (c.name) return c.name
  const h = c.html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1]
  // Parsed, not just stripped of tags, so entities like &amp; read as text.
  const text = h && new DOMParser().parseFromString(h, 'text/html').body.textContent?.trim()
  return (text || e.action || e.app).slice(0, 60)
}

/** A variant's canonical label, e.g. "L2-B Planning sync". */
const labelOf = (e: CacheEntry, c: Candidate) => `${variantId(e.level, c.letter ?? '?')} ${nameOf(e, c)}`

function infoOf(e: CacheEntry, c: Candidate): [string, string][] {
  const info: [string, string][] = [
    ['Name', labelOf(e, c)],
    ['Model', modelLabel(c.model) + (c.servedModel ? ` (served ${c.servedModel})` : '')],
    ['Device', c.device ? DEVICES[c.device].label : 'from before devices'],
    ['Made', new Date(c.createdAt).toLocaleString()],
    ['First text', c.firstChunkMs == null ? '–' : fmtS(c.firstChunkMs)],
    ['Total time', fmtS(c.totalMs)],
    ['Cost', fmtCost(c)],
    ['Finish', c.finishReason ?? '–'],
    ['Size', `${c.html.length.toLocaleString()} characters`],
    ['Prompt', c.prompt ?? e.action ?? e.app],
  ]
  if (c.feedback) info.push(['Asked for', c.feedback])
  return info
}

const widthOf = (c: Candidate) => (c.device ? DEVICES[c.device].width : LEGACY_WIDTH)

function feedRow(r: Row, i: number): FeedRow {
  const e = r.entry
  const fc = e && r.front != null ? e.candidates[r.front] : undefined
  if (e && (!fc || fc.deleted)) r.front = e.chosen
  const variants: FeedVariant[] = []
  e?.candidates.forEach((c, j) => {
    if (c.deleted) return
    variants.push({
      id: candidateId(r.key, j),
      width: widthOf(c),
      caption: labelOf(e, c),
      tooltip: `${modelLabel(c.model)} · ${fmtCost(c)} · ${fmtS(c.totalMs)}`,
      chosen: e.chosen === j,
      streaming: false,
      prompt: c.prompt ?? e.action ?? e.app,
      info: infoOf(e, c),
    })
  })
  const first = variants.findIndex((v) => v.id === candidateId(r.key, r.front!))
  if (first > 0) variants.unshift(...variants.splice(first, 1))
  const device = deviceSelect.value as Device
  r.streaming.forEach((_, slot) => variants.push({
    id: streamId(r.key, slot),
    width: DEVICES[device]?.width ?? LEGACY_WIDTH,
    caption: 'New variant · making…',
    tooltip: '',
    chosen: false,
    streaming: true,
    prompt: '',
    info: [],
  }))
  const live = variants.length - r.streaming.length
  const note = r.streaming.length ? `making ${r.streaming.length === 1 ? 'a variant' : `${r.streaming.length} variants`}…` : `${live} variant${live === 1 ? '' : 's'}`
  return { key: r.key, title: `Step ${i + 1}`, via: r.via, note, variants }
}

/** Draw every row and put each stored variant in its frame. Streaming frames are left to their streams. */
async function draw() {
  feed.render(state.rows.map(feedRow), !!state.busy, state.links.map(({ from, to, label }): FeedLink => ({ from, to, label })))
  startOverButton.hidden = deleteAppButton.hidden = !state.app
  tree.render(state.app ? {
    root: screenKey(state.app, null),
    entries: state.entries,
    flow: new Set(state.rows.filter((r) => r.entry).map((r) => candidateId(r.key, r.entry!.chosen))),
    name: (e, i) => nameOf(e, e.candidates[i]!),
  } : null)
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
 * With `regenerate`, one more variant joins the row, made from `prompt` when given.
 */
async function load(row: Row, { regenerate = false, prompt = null as string | null, from = null as Row | null } = {}) {
  const variant = row.parent
  state.busy?.abort()
  const ctrl = new AbortController()
  state.busy = ctrl
  const app = state.app!
  const t0 = performance.now()
  const model = modelSelect.value
  let firstVisible: number | null = null
  let cached = false
  showError(null)
  setMetrics(regenerate ? `Making a new variant with ${modelLabel(model)}…` : 'Asking for the screen…')
  draw()
  try {
    const css = await themeCss(themeSelect.value)
    const res = await fetch('/api/screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app, action: row.action, model, device: deviceSelect.value, regenerate, prompt,
        from: from?.key ?? null, variant, label: from ? row.via : null,
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
        state.entries.set(ev.entry.key, ev.entry)
        const added = ev.variants.filter((i): i is number => i != null)
        if (added.length) loadHistory()
        ev.variants.forEach((i, slot) => { if (i != null) feed.rename(streamId(row.key, slot), candidateId(row.key, i)) })
        const cost = added.reduce((s, i) => s + (ev.entry.candidates[i]!.costUsd ?? 0), 0)
        state.spent += cost
        if (ev.link) addLink(ev.link)
        savePath(app)
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
  row.front = index
  if (rowOf(key)) {
    feed.scrollToRow(key)
    recordLink(row.key, index, key, label)
    return
  }
  // A new screen from an earlier row replaces the rows below it.
  const next: Row = { key, action: prompt, via: label, parent: index, entry: null, streaming: [] }
  state.rows = [...state.rows.slice(0, r + 1), next]
  savePath(app)
  load(next, { from: row })
}

function addLink(l: Link) {
  if (!state.links.some((x) => x.from === l.from && x.variant === l.variant && x.to === l.to)) state.links.push(l)
}

/** A click to a screen already in the flow: draw it now, and store it with the mockup. */
async function recordLink(from: string, variant: number, to: string, label: string) {
  if (from === to) return
  addLink({ from, variant, to, label, createdAt: new Date().toISOString() })
  draw()
  await fetch('/api/link', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, variant, to, label }),
  }).catch(() => null)
}

/**
 * The rows below a row belong to its pick. After a new pick, the next row stays only if the new
 * pick also leads there; otherwise the rows below go, and the new pick's own path comes back.
 */
function followPick(row: Row) {
  const r = state.rows.indexOf(row)
  const next = state.rows[r + 1]
  const v = row.entry?.chosen
  if (r < 0 || v == null || next?.parent === v) return
  const link = next && state.links.find((l) => l.from === row.key && l.variant === v && l.to === next.key)
  if (next && link) { next.parent = v; next.via = link.label; return }
  if (state.busy && state.rows.slice(r + 1).some((x) => x.streaming.length || !x.entry)) state.busy.abort()
  state.rows = state.rows.slice(0, r + 1)
  extendPath()
  if (state.app) savePath(state.app)
}

/** Walk on from the last row: each pick's newest child screen, as long as there is one. */
function extendPath() {
  for (let last = state.rows.at(-1); last?.entry; last = state.rows.at(-1)) {
    const { key, chosen } = last.entry
    const kids = [...state.entries.values()].filter((e) => e.parent?.key === key && e.parent.variant === chosen && !rowOf(e.key))
    const kid = kids.sort((a, b) => newest(b).localeCompare(newest(a)))[0]
    if (!kid) return
    state.rows.push({ key: kid.key, action: kid.action, via: kid.parent!.label, parent: chosen, entry: kid, streaming: [] })
  }
}

const newest = (e: CacheEntry) => e.candidates.reduce((t, c) => (c.createdAt > t ? c.createdAt : t), '')

/** Delete a variant, after asking. Screens only it reached go too, and their rows with them. */
async function removeVariant(row: Row, index: number) {
  const e = row.entry, c = e?.candidates[index]
  if (!e || !c || state.busy) return
  const last = e.candidates.filter((x) => !x.deleted).length === 1
  const what = last ? (e.action ? `${labelOf(e, c)}, the last variant of this screen` : 'the first screen, and with it this whole mockup') : labelOf(e, c)
  if (!confirm(`Delete ${what}? Screens that only it leads to are deleted too.`)) return
  const res = await fetch('/api/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: e.key, index }),
  }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the variant')
  // The server sends the whole mockup back: a delete can also give other screens new parents.
  const map = await res.json() as { entries: CacheEntry[]; links: Link[] }
  loadHistory()
  if (normalizePrompt(state.app ?? '') !== normalizePrompt(e.app)) return // another mockup opened meanwhile
  state.entries = new Map(map.entries.map((x) => [x.key, x]))
  state.links = map.links
  const cut = state.rows.findIndex((r) => !state.entries.has(r.key))
  if (cut >= 0) state.rows = state.rows.slice(0, cut)
  for (const r of state.rows) r.entry = state.entries.get(r.key)!
  if (state.rows.includes(row)) followPick(row)
  if (state.app) savePath(state.app)
  if (!state.rows.length) setMetrics('This mockup is empty now. Press <b>Generate</b> to start it again.')
  draw()
}

/** Make a variant the one revisits show. */
async function choose(row: Row, index: number) {
  const entry = row.entry
  if (!entry || !Number.isInteger(index) || entry.chosen === index) return
  const before = entry.chosen
  entry.chosen = index // at once, so the row shows it; undone below if the server says no
  followPick(row)
  draw()
  if (!await saveChoice(entry.key, index)) {
    if (entry.chosen === index) entry.chosen = before
    showError('Could not save the pick')
  }
  draw()
}

async function saveChoice(key: string, index: number): Promise<boolean> {
  const res = await fetch('/api/choose', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, index }),
  }).catch(() => null)
  return !!res?.ok
}

/**
 * Show a variant from the tree: the flow becomes the path of first clicks that made its screen, each
 * screen on the way picks the variant the path goes through, and the flow goes on below it.
 */
function openVariant(key: string, index: number) {
  const chain: CacheEntry[] = []
  for (let e = state.entries.get(key); e && !chain.includes(e); e = e.parent ? state.entries.get(e.parent.key) : undefined) chain.unshift(e)
  const app = state.app
  if (!app || !chain.length || chain[0]!.key !== screenKey(app, null)) return
  state.busy?.abort()
  const picks = [...chain.slice(1).map((e) => e.parent!.variant), index]
  chain.forEach((e, i) => {
    if (e.chosen === picks[i]) return
    e.chosen = picks[i]!
    saveChoice(e.key, e.chosen).then((ok) => ok || showError('Could not save the pick'))
  })
  state.rows = chain.map((e) => ({ key: e.key, action: e.action, via: e.parent?.label ?? null, parent: e.parent?.variant ?? null, entry: e, streaming: [] }))
  extendPath()
  savePath(app)
  draw().then(() => { feed.scrollToRow(key); feed.scrollToVariant(candidateId(key, index)) })
}

// ---- The flow, remembered per mockup in this browser --------------------------------------------

const pathKey = (app: string) => `uxwoz:path:${normalizePrompt(app)}`
interface SavedRow { key: string; action: string | null; via: string | null; parent: number | null }

/** Save the rows shown now, if they still belong to `app` (a newer prompt may have replaced them). */
function savePath(app: string) {
  if (state.app !== app) return
  const rows: SavedRow[] = state.rows.filter((r) => r.entry).map(({ key, action, via, parent }) => ({ key, action, via, parent }))
  store.set(pathKey(app), JSON.stringify(rows))
}

/** Start a mockup: the rows saved for it last time (those still in the cache), else its first screen. */
async function start(app: string) {
  state.busy?.abort()
  state.busy = null
  const n = ++state.starts
  showError(null)
  const res = await fetch(`/api/map?app=${encodeURIComponent(app)}`)
  if (!res.ok) throw new Error(`could not load the mockup: HTTP ${res.status}`)
  const map = await res.json() as { entries: CacheEntry[]; links: Link[] }
  const entries = new Map(map.entries.map((e) => [e.key, e]))
  if (n !== state.starts) return // a newer prompt was submitted meanwhile
  // Only now: until the new mockup is here, the rows on screen still belong to the old one, and
  // a click in them must name the old mockup.
  state.app = app
  state.entries = entries
  state.links = map.links
  let saved: SavedRow[] = []
  try { saved = JSON.parse(store.get(pathKey(app)) ?? '[]') } catch { /* start fresh */ }
  const root = screenKey(app, null)
  const rows: Row[] = []
  // A saved row stays while it still follows the pick above it (another browser may have picked again).
  for (const s of saved) {
    const entry = entries.get(s.key), above = rows.at(-1)
    if (!entry || (above ? s.parent !== above.entry!.chosen : s.key !== root)) break
    rows.push({ ...s, entry, streaming: [] })
  }
  state.rows = rows.length ? rows : [{ key: root, action: null, via: null, parent: null, entry: entries.get(root) ?? null, streaming: [] }]
  extendPath()
  const first = state.rows[0]!
  if (first.entry) {
    await draw()
    feed.scrollToRow(first.key, false)
    setMetrics(`<b>Cached</b> · ${state.rows.length} screen${state.rows.length === 1 ? '' : 's'} in this flow · $0 now`)
  } else await load(first)
}

/** Delete every screen of the open mockup, after asking; then make its first screen again, or close it. */
async function deleteApp(again: boolean) {
  const app = state.app
  if (!app) return
  const n = state.entries.size
  const what = n === 1 ? 'the only screen of this mockup' : `all ${n} screens of this mockup`
  if (!confirm(again ? `Start over? This deletes ${what} and makes its first screen again.` : `Delete ${what}?`)) return
  state.busy?.abort()
  const res = await fetch('/api/delete-app', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app }),
  }).catch(() => null)
  if (!res?.ok) return showError('Could not delete the mockup')
  store.set(pathKey(app), '[]')
  loadHistory()
  if (again) return start(app)
  state.app = null
  state.rows = []
  state.entries = new Map()
  state.links = []
  setMetrics(`Deleted ${what}.`)
  draw()
}

// ---- Wiring -----------------------------------------------------------------------------------

startOverButton.addEventListener('click', () => deleteApp(true).catch((e) => showError(String(e))))
deleteAppButton.addEventListener('click', () => deleteApp(false).catch((e) => showError(String(e))))

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

zoomRange.addEventListener('input', () => feed.setZoom(Number(zoomRange.value) / 100))
zoom100.addEventListener('click', () => feed.setZoom(1))
$('zoomFit').addEventListener('click', () => { feed.setZoom(feed.fitZoom()); $('stage').scrollTo({ top: 0, left: 0 }) })
feed.setZoom(Number(store.get('uxwoz:zoom')) || 1)

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
