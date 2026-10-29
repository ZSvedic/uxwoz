// The feed: the mockup as rows, one per step of the flow, top to bottom. A row holds the variants
// of one screen side by side, the picked one first. Every variant is live: any click in one picks
// it, and a click that opens another screen also opens the next row. Each variant's bar has
// Change, Regenerate, Delete and Info. The page scrolls normally, also over a screen.
// Screens always show at 100% and only as wide as their content: the frame keeps the device's
// width, so the screen's layout never changes, and the part it does not use is cut off. A row
// that is too wide scrolls sideways. A stepped line joins the picked variant of each row to the
// picked variant of the next, labelled with the control that was clicked; other clicks between rows
// (back links, skips ahead) are arcs in a gutter on the left.

import { FRAME_SANDBOX, framePage } from '@uxwoz/core/frame'

/** Limits on the height a screen may report, so a broken screen cannot make a huge frame. */
const MIN_SCREEN_H = 160
const MAX_SCREEN_H = 8000
/** The narrowest a variant gets, so its bar stays readable. */
const MIN_SCREEN_W = 280
/** The height of a frame whose screen has not reported its size yet. */
const START_H = 600
/** A frame that grows this many times in a row, each within GROWTH_MS of the last, stops growing. */
const GROWTH_LIMIT = 4
const GROWTH_MS = 1500
const GAP = 16
/** How far a line keeps from the ends of a row, when its variant is scrolled out of view. */
const LINE_INSET = 24
/** The gutter left of the rows that holds the arcs (matches .feed's padding-left). */
const GUTTER = 32
/** How far right of a variant's left edge the flow line meets it: picks come first, so the line is straight. */
const FLOW_X = 48
/** The radius of a stepped line's corners. */
const BEND = 8
const SVG_NS = 'http://www.w3.org/2000/svg'

export interface FeedVariant {
  /** Unique in the feed: `key#index` for a stored candidate, `key#sN` for a variant still streaming. */
  id: string
  /** Width of the window the screen is designed for: the most it shows. */
  width: number
  caption: string
  tooltip: string
  chosen: boolean
  streaming: boolean
  /** The prompt it was made with, for Change; '' while it streams. */
  prompt: string
  /** Name and value pairs for Info. */
  info: [string, string][]
}

export interface FeedRow {
  key: string
  title: string
  /** The control clicked in the row above to get here. */
  via: string | null
  note: string
  variants: FeedVariant[]
}

/** A click in one row's screen that opens another row's screen. */
export interface FeedLink { from: string; to: string; label: string }

export interface FeedHandlers {
  /** `bar` is true for a click on the variant's bar, false for a press inside its screen. */
  pick: (rowKey: string, id: string, bar: boolean) => void
  /** Make one more variant like this one; with `prompt`, made from that prompt instead. */
  regenerate: (rowKey: string, id: string, prompt: string | null) => void
  remove: (rowKey: string, id: string) => void
  action: (rowKey: string, id: string, prompt: string, label: string) => void
}

interface Frame {
  el: HTMLElement
  caption: HTMLElement
  /** Cuts the frame to the width the screen uses. */
  screen: HTMLElement
  /** Holds the open Change or Info panel, if any, between the bar and the screen. */
  panel: HTMLElement
  tools: HTMLButtonElement[]
  /** The variant as last rendered, for its panels. */
  data: FeedVariant | null
  frame: HTMLIFrameElement
  rowKey: string
  width: number
  shown: { html: string; final: boolean; css: string } | null
  onLoad: (() => void) | null
  growth: { count: number; at: number }
  frozen: boolean
}

interface RowEl {
  el: HTMLElement; head: HTMLElement; strip: HTMLElement
  /** The variant shown first, so a new one there scrolls the row back to its start. */
  front: string | null
}

export class Feed {
  private list = el('div', 'feed')
  private rows = new Map<string, RowEl>()
  private frames = new Map<string, Frame>()
  /** The rows and clicks the lines are drawn from. */
  private drawn: { rows: FeedRow[]; links: FeedLink[] } = { rows: [], links: [] }
  private lines = document.createElementNS(SVG_NS, 'svg')
  private linesQueued = false
  private busy = false

  /** `stage` is the scrolling page area; the feed replaces what it holds on the first render. */
  constructor(private stage: HTMLElement, private on: FeedHandlers) {
    this.lines.classList.add('lines')
    this.list.append(this.lines)
    addEventListener('message', (e) => this.onFrameMessage(e))
    new ResizeObserver(() => this.queueLines()).observe(stage)
  }

  /** Draw the rows. Frames are kept and moved as little as possible, so unchanged screens do not reload. */
  render(rows: FeedRow[], busy: boolean, links: FeedLink[] = []) {
    if (this.list.parentElement !== this.stage) this.stage.replaceChildren(this.list)
    this.busy = busy
    const keep = new Set(rows.map((r) => r.key))
    for (const [k, r] of this.rows) if (!keep.has(k)) { r.el.remove(); this.rows.delete(k) }
    const ids = new Set(rows.flatMap((r) => r.variants.map((v) => v.id)))
    for (const [id, f] of this.frames) if (!ids.has(id)) { f.el.remove(); this.frames.delete(id) }
    rows.forEach((r, i) => {
      const row = this.row(r.key)
      placeAt(this.list, row.el, i + 1) // after the lines
      row.head.replaceChildren(el('b', 'row-title', r.title), el('span', 'row-note', r.note))
      // Variants are placed with CSS order, not moved: moving an iframe reloads it.
      r.variants.forEach((v, j) => {
        const f = this.frame(v.id, r.key)
        if (f.el.parentElement !== row.strip) row.strip.append(f.el)
        f.el.style.order = String(j)
        f.data = v
        for (const b of f.tools) b.disabled = v.streaming || (busy && b.dataset.tool !== 'info')
        f.el.classList.toggle('chosen', v.chosen)
        f.el.classList.toggle('streaming', v.streaming)
        f.el.title = v.tooltip
        f.caption.textContent = v.caption
        if (f.width !== v.width) { f.width = v.width; f.frame.style.width = f.screen.style.width = `${v.width}px` }
      })
      const front = r.variants[0]?.id ?? null
      if (front !== row.front) { row.front = front; row.strip.scrollTo({ left: 0 }) }
    })
    this.drawn = { rows, links }
    this.queueLines()
  }

  /** Put a screen into a variant's frame; `onLoad` runs once the frame has loaded it. */
  show(id: string, html: string, final: boolean, css: string, onLoad?: () => void) {
    const f = this.frames.get(id)
    if (!f) return
    if (onLoad) f.onLoad = onLoad
    const s = f.shown
    if (s && s.html === html && s.final === final && s.css === css) {
      // Nothing to reload, so no load event will come: report it as loaded now.
      if (onLoad) requestAnimationFrame(() => this.loaded(f))
      return
    }
    if (s?.html !== html) { f.frozen = false; f.growth = { count: 0, at: 0 } }
    // While a screen streams it keeps the full width, so the row does not jump with every chunk.
    if (!final) f.screen.style.width = `${f.width}px`
    f.shown = { html, final, css }
    f.frame.srcdoc = framePage(html, css, final)
  }

  /** A streamed variant became a stored candidate: keep its frame under the new id. */
  rename(from: string, to: string) {
    const f = this.frames.get(from)
    if (!f || from === to) return
    this.frames.delete(from)
    this.frames.set(to, f)
    f.el.dataset.id = to
  }


  /** Bring a row to the top of the page. */
  scrollToRow(key: string, smooth = true) {
    const r = this.rows.get(key)
    if (r) this.stage.scrollTo({ top: r.el.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' })
  }

  /** Bring a variant into view within its row. */
  scrollToVariant(id: string, smooth = true) {
    const f = this.frames.get(id)
    const strip = f?.el.parentElement
    if (f && strip) strip.scrollTo({ left: Math.max(0, f.el.offsetLeft - strip.offsetLeft - GAP), behavior: smooth ? 'smooth' : 'auto' })
  }

  /** Redraw the lineage lines once, before the next paint. */
  private queueLines() {
    if (this.linesQueued) return
    this.linesQueued = true
    requestAnimationFrame(() => { this.linesQueued = false; this.drawLines() })
  }

  /**
   * The flow's lines, in the feed's own coordinates. Between neighbouring rows: down from the pick,
   * across, and down into the next row's pick. Any other click between two rows: an arc in the
   * gutter from the row it was made in to the row it opened, wider the more rows it spans.
   */
  private drawLines() {
    const { rows, links } = this.drawn
    const base = this.list.getBoundingClientRect()
    const svg = this.lines
    svg.setAttribute('width', String(this.list.scrollWidth))
    svg.setAttribute('height', String(this.list.scrollHeight))
    const marker = svgEl('marker', { id: 'uxwoz-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })
    marker.append(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', class: 'arrow' }))
    const defs = svgEl('defs', {})
    defs.append(marker)
    const parts: SVGElement[] = [defs]
    /** Where a line meets a variant: near its left edge, kept inside the visible part of the row. */
    const at = (f: Frame, edge: 'top' | 'bottom') => {
      const s = f.el.parentElement!.getBoundingClientRect(), v = f.el.getBoundingClientRect()
      return {
        x: Math.min(Math.max(v.left + FLOW_X, s.left + LINE_INSET), s.right - LINE_INSET) - base.left,
        y: v[edge] - base.top,
      }
    }
    const pick = (r: FeedRow) => {
      const v = r.variants.find((x) => x.chosen) ?? r.variants[0]
      return v ? this.frames.get(v.id) : undefined
    }
    for (let i = 1; i < rows.length; i++) {
      const a = pick(rows[i - 1]!), b = pick(rows[i]!), row = this.rows.get(rows[i]!.key)
      if (!a || !b || !row) continue
      const p = at(a, 'bottom'), q = at(b, 'top')
      const mid = row.el.getBoundingClientRect().top - base.top - 20
      parts.push(svgEl('path', { d: stepped(p.x, p.y, q.x, mid, q.y), class: 'step', 'marker-end': 'url(#uxwoz-arrow)' }))
      const label = svgEl('text', { x: String(p.x + (q.x < p.x ? -8 : 8)), y: String(mid - 6), class: 'via', 'text-anchor': q.x < p.x ? 'end' : 'start' })
      label.textContent = rows[i]!.via || 'next'
      parts.push(label)
    }
    const index = new Map(rows.map((r, i) => [r.key, i]))
    const headY = (i: number) => {
      const h = this.rows.get(rows[i]!.key)!.head.getBoundingClientRect()
      return h.top + h.height / 2 - base.top
    }
    for (const l of links) {
      const i = index.get(l.from), j = index.get(l.to)
      if (i == null || j == null || i === j || j === i + 1) continue
      const ya = headY(i), yb = headY(j), w = Math.min(GUTTER - 4, 6 + 4 * Math.abs(i - j))
      const arc = svgEl('path', { d: `M${GUTTER - 4} ${ya} C${GUTTER - 4 - w} ${ya} ${GUTTER - 4 - w} ${yb} ${GUTTER - 4} ${yb}`, class: 'back', 'marker-end': 'url(#uxwoz-arrow)' })
      const title = svgEl('title', {})
      title.textContent = `${l.label || 'link'}: row ${i + 1} → row ${j + 1}`
      arc.append(title)
      parts.push(arc)
    }
    svg.replaceChildren(...parts)
  }

  private row(key: string): RowEl {
    const have = this.rows.get(key)
    if (have) return have
    const r = el('section', 'row')
    const head = el('div', 'row-head')
    const strip = el('div', 'strip')
    strip.addEventListener('scroll', () => this.queueLines(), { passive: true })
    r.append(head, strip)
    const row = { el: r, head, strip, front: null }
    this.rows.set(key, row)
    return row
  }

  private frame(id: string, rowKey: string): Frame {
    const have = this.frames.get(id)
    if (have) return have
    const v = el('article', 'variant')
    v.dataset.id = id
    const bar = el('div', 'variant-bar')
    const caption = el('span', 'caption')
    bar.title = 'Click anything in a variant to pick it'
    const tool = (name: string, icon: string, tip: string) => {
      const b = el('button', 'tool', icon) as HTMLButtonElement
      b.type = 'button'
      b.title = tip
      b.dataset.tool = name
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onTool(f, name) })
      return b
    }
    const tools = [
      tool('change', '✎', 'Change: edit the prompt and make a new variant from it'),
      tool('regenerate', '↻', 'Regenerate: one more variant from the same prompt'),
      tool('delete', '✕', 'Delete this variant'),
      tool('info', 'ⓘ', 'Info: model, time, cost, prompt'),
    ]
    bar.append(caption, el('span', 'picked', '✓'), ...tools)
    const panel = el('div', 'panel')
    panel.hidden = true
    const screen = el('div', 'screen')
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', FRAME_SANDBOX)
    frame.title = 'Generated screen'
    frame.style.height = `${START_H}px`
    screen.append(frame)
    v.append(bar, panel, screen)
    const f: Frame = {
      el: v, caption, screen, panel, tools, data: null, frame, rowKey, width: 0, shown: null, onLoad: null,
      growth: { count: 0, at: 0 }, frozen: false,
    }
    bar.addEventListener('click', () => this.on.pick(f.rowKey, v.dataset.id!, true))
    frame.addEventListener('load', () => this.loaded(f))
    this.frames.set(id, f)
    return f
  }

  /** A tool button in a variant's bar. Change and Info toggle a panel above the screen. */
  private onTool(f: Frame, name: string) {
    const v = f.data, id = f.el.dataset.id!
    if (!v) return
    if (name === 'regenerate') return this.on.regenerate(f.rowKey, id, null)
    if (name === 'delete') return this.on.remove(f.rowKey, id)
    const open = !f.panel.hidden && f.panel.dataset.tool === name
    f.panel.hidden = open
    f.panel.dataset.tool = name
    if (open) return this.queueLines()
    if (name === 'info') {
      const dl = el('dl', 'info')
      for (const [k, val] of v.info) dl.append(el('dt', '', k), el('dd', '', val))
      f.panel.replaceChildren(dl)
    } else {
      const text = document.createElement('textarea')
      text.value = v.prompt
      text.maxLength = 2000
      text.rows = Math.min(8, Math.max(3, Math.ceil(v.prompt.length / 40)))
      const make = el('button', 'make', 'Make a new variant') as HTMLButtonElement
      make.type = 'button'
      make.disabled = this.busy
      make.addEventListener('click', () => {
        const prompt = text.value.trim()
        if (!prompt) return
        f.panel.hidden = true
        this.queueLines()
        this.on.regenerate(f.rowKey, id, prompt)
      })
      const cancel = el('button', '', 'Cancel') as HTMLButtonElement
      cancel.type = 'button'
      cancel.addEventListener('click', () => { f.panel.hidden = true; this.queueLines() })
      const buttons = el('div', 'panel-buttons')
      buttons.append(make, cancel)
      f.panel.replaceChildren(el('label', '', 'The prompt this variant was made from:'), text, buttons)
      text.focus()
    }
    this.queueLines()
  }

  private loaded(f: Frame) {
    const cb = f.onLoad
    f.onLoad = null
    cb?.()
  }

  /** Screens report their height, clicks and scroll gestures (see the frame script). */
  private onFrameMessage(e: MessageEvent) {
    const d = e.data
    if (typeof d?.uxwoz !== 'string') return
    let id: string | null = null
    for (const [k, f] of this.frames) if (f.frame.contentWindow === e.source) id = k
    if (!id) return
    const f = this.frames.get(id)!
    if (d.uxwoz === 'size' && Number.isFinite(d.height)) {
      if (f.shown?.final && Number.isFinite(d.width)) {
        f.screen.style.width = `${Math.min(f.width, Math.max(MIN_SCREEN_W, Math.round(d.width)))}px`
        this.queueLines()
      }
      const h = Math.min(MAX_SCREEN_H, Math.max(MIN_SCREEN_H, Math.round(d.height)))
      const old = parseFloat(f.frame.style.height)
      if (old === h) return
      // A screen sized by its window (100% heights, script reading innerHeight) grows each time its
      // frame grows. Stop that loop instead of following it to MAX_SCREEN_H.
      if (f.shown && h > old) {
        if (f.frozen) return
        const now = performance.now()
        f.growth = { count: now - f.growth.at < GROWTH_MS ? f.growth.count + 1 : 1, at: now }
        if (f.growth.count >= GROWTH_LIMIT) { f.frozen = true; return }
      }
      f.frame.style.height = `${h}px`
      this.queueLines()
    } else if (d.uxwoz === 'touch') {
      this.on.pick(f.rowKey, id, false)
    } else if (d.uxwoz === 'wheel') {
      // The frame never scrolls itself: its gestures scroll the page and the row.
      this.stage.scrollBy(0, Number(d.dy) || 0)
      f.el.parentElement?.scrollBy(Number(d.dx) || 0, 0)
    } else if (d.uxwoz === 'action' && typeof d.prompt === 'string') {
      this.on.action(f.rowKey, id, d.prompt.slice(0, 500), typeof d.label === 'string' ? d.label.slice(0, 80) : '')
    }
  }
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

/** Down from (x1, y1) to y, across to x2, down to y2, with rounded corners. */
function stepped(x1: number, y1: number, x2: number, y: number, y2: number): string {
  const dx = x2 - x1
  if (Math.abs(dx) < 2 * BEND) return `M${x1} ${y1} V${y2}`
  const s = Math.sign(dx)
  return `M${x1} ${y1} V${y - BEND} Q${x1} ${y} ${x1 + s * BEND} ${y} H${x2 - s * BEND} Q${x2} ${y} ${x2} ${y + BEND} V${y2}`
}

/** Put a child at position i without moving the others (moving an iframe reloads it). */
function placeAt(parent: HTMLElement, child: HTMLElement, i: number) {
  if (parent.children[i] !== child) parent.insertBefore(child, parent.children[i] ?? null)
}
