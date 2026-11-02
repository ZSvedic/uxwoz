// The feed: the mockup as rows, one per step of the flow, top to bottom. A row is a stack of the
// variants of one screen: the pick in front, live, and the others behind it to the right, like
// windows in Time Machine, each showing only its right edge with its name. Clicking an edge brings
// that variant to the front and picks it, and so does its letter by the row's title; the cards slide
// to their new places, so a swap reads as one. Compare (a row's button, or holding Alt/Option for every
// row) fans a stack out side by side, in letter order so nothing moves while you pick. A click that
// opens another screen opens the next row. Each variant's bar has Edit, Refresh, Delete and Info.
// The feed is one surface: the page scrolls both ways, also over a screen.
// Screens always show at 100% and only as wide as their content: the frame keeps the device's
// width, so the screen's layout never changes, and the part it does not use is cut off. A line joins
// the front variant of each row to the next, labelled with the control that was clicked; other
// clicks between rows (back links, skips ahead) are arcs in a gutter on the left.

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
/** The gutter left of the rows that holds the arcs (matches .feed's padding-left). */
const GUTTER = 32
/** How far right of a variant's left edge the flow line meets it: picks come first, so the line is straight. */
const FLOW_X = 48
/** How much of each variant behind the front one shows, on the right of the stack. */
const EDGE = 112
/** How long cards take to slide to their new places when a stack changes. */
const SLIDE_MS = 260
/** The radius of a stepped line's corners. */
const BEND = 8
const SVG_NS = 'http://www.w3.org/2000/svg'
/** The zoom range: 10% shows a whole mockup, 150% a detail. */
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 1.5

export interface FeedVariant {
  /** Unique in the feed: `key#index` for a stored candidate, `key#sN` for a variant still streaming. */
  id: string
  /** Width of the window the screen is designed for: the most it shows. */
  width: number
  caption: string
  tooltip: string
  chosen: boolean
  streaming: boolean
  /** The prompt it was made with, to start over from in the Edit panel; '' while it streams. */
  prompt: string
  /** Name and value pairs for Info. */
  info: [string, string][]
  /** What its edge says behind the front variant: "L2-B", its name, a note. */
  edge: [string, string, string]
  /** Its letter on the row's tabs, e.g. "B". */
  tab: string
}

export interface FeedRow {
  key: string
  title: string
  /** The control clicked in the row above to get here. */
  via: string | null
  note: string
  /** In letter order: the order they take when compared. */
  variants: FeedVariant[]
  /** The variant in front of the stack. */
  front: string | null
  /** The front cannot change now: an Edit streams its variant in front. */
  fixed: boolean
}

/** A click in one row's screen that opens another row's screen. */
export interface FeedLink { from: string; to: string; label: string }

export interface FeedHandlers {
  pick: (rowKey: string, id: string) => void
  /** Without `prompt`, refresh this variant in place; with it, make a new variant from that prompt. */
  regenerate: (rowKey: string, id: string, prompt: string | null) => void
  /** Make a new variant by changing this one as `change` asks. */
  edit: (rowKey: string, id: string, change: string) => void
  remove: (rowKey: string, id: string) => void
  action: (rowKey: string, id: string, prompt: string, label: string) => void
  /** The zoom changed, by a gesture or a call. */
  zoomed: (zoom: number) => void
}

interface Frame {
  el: HTMLElement
  caption: HTMLElement
  /** Cuts the frame to the width the screen uses. */
  screen: HTMLElement
  /** Holds the open Edit or Info panel, if any, between the bar and the screen. */
  panel: HTMLElement
  /** What shows of it behind the front variant. */
  edge: HTMLElement
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

/** `sig` is the stack's layout as last drawn: when it changes, the cards slide to their new places. */
interface RowEl { el: HTMLElement; head: HTMLElement; strip: HTMLElement; sig: string | null }

export class Feed {
  private list = el('div', 'feed')
  private rows = new Map<string, RowEl>()
  private frames = new Map<string, Frame>()
  /** The rows and clicks the lines are drawn from. */
  private drawn: { rows: FeedRow[]; links: FeedLink[] } = { rows: [], links: [] }
  private lines = document.createElementNS(SVG_NS, 'svg')
  private linesQueued = false
  private busy = false
  /** The feed's CSS zoom. Rects inside it come back zoomed; its own coordinates (the lines) do not. */
  private z = 1
  /** Rows fanned out by their Compare button. */
  private fanned = new Set<string>()
  /** Alt/Option is held: every row is fanned out until it is let go. */
  private peek = false

  /** `stage` is the scrolling page area; the feed replaces what it holds on the first render. */
  constructor(private stage: HTMLElement, private on: FeedHandlers) {
    this.lines.classList.add('lines')
    this.list.append(this.lines)
    addEventListener('message', (e) => this.onFrameMessage(e))
    new ResizeObserver(() => this.queueLines()).observe(stage)
    // Pinch (a wheel with ctrlKey in Chrome and Firefox) and Ctrl/Cmd + scroll zoom around the pointer.
    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      this.zoomBy(e.deltaY, e.clientX, e.clientY)
    }, { passive: false })
    // Safari reports a pinch as gesture events instead.
    let z0 = 1
    stage.addEventListener('gesturestart', (e) => { e.preventDefault(); z0 = this.z })
    stage.addEventListener('gesturechange', (e) => {
      e.preventDefault()
      const g = e as Event & { scale: number; clientX: number; clientY: number }
      this.setZoom(z0 * g.scale, g.clientX, g.clientY)
    })
    // Holding Alt/Option alone compares every row; a screen with the focus reports the key too.
    // Alt with another key (Option types characters on a Mac) or in a text field is not a peek.
    addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Alt') this.setPeek(!editable(e.target))
      else if (this.peek) this.setPeek(false)
    })
    addEventListener('keyup', (e: KeyboardEvent) => { if (e.key === 'Alt') this.setPeek(false) })
    // Clicking into a screen blurs the page, but the key is still held: the screen reports its release.
    addEventListener('blur', () => { if (!(document.activeElement instanceof HTMLIFrameElement)) this.setPeek(false) })
  }

  private setPeek(on: boolean) {
    if (this.peek === on) return
    this.peek = on
    this.render(this.drawn.rows, this.busy, this.drawn.links)
  }

  get zoom() { return this.z }

  /** Zoom to `z`, keeping the point under (x, y) (the middle of the page by default) in place. */
  setZoom(z: number, x?: number, y?: number) {
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
    if (z === this.z) return
    const st = this.stage, r = st.getBoundingClientRect()
    const ax = x == null ? st.clientWidth / 2 : x - r.left, ay = y == null ? st.clientHeight / 2 : y - r.top
    const px = (st.scrollLeft + ax) / this.z, py = (st.scrollTop + ay) / this.z
    this.z = z
    this.list.style.zoom = String(z)
    st.style.setProperty('--z', String(z)) // the dot grid behind the feed scales with it
    st.scrollLeft = px * z - ax
    st.scrollTop = py * z - ay
    this.queueLines()
    this.on.zoomed(z)
  }

  /** The zoom at which the whole flow fits the page, at most 100%. */
  fitZoom(): number {
    // The width the variants take (with the gutter), not the feed's: the feed is as wide as the page.
    const base = this.list.getBoundingClientRect().left
    let w = 0
    for (const f of this.frames.values()) w = Math.max(w, (f.el.getBoundingClientRect().right - base) / this.z)
    const h = this.list.scrollHeight
    if (!w || !h) return 1
    const { left, right } = this.visible()
    return Math.min(1, (right - left - 16) / w, (this.stage.clientHeight - 16) / h)
  }

  /** The part of the page the feed shows in, left and right: the stage's padding keeps room for the tree. */
  private visible() {
    const st = this.stage, s = st.getBoundingClientRect(), css = getComputedStyle(st)
    return { left: s.left + parseFloat(css.paddingLeft), right: s.left + st.clientWidth - parseFloat(css.paddingRight) }
  }

  private zoomBy(dy: number, x: number, y: number) {
    this.setZoom(this.z * Math.exp(-dy * 0.01), x, y)
  }

  /** Draw the rows. Frames are kept and moved as little as possible, so unchanged screens do not reload. */
  render(rows: FeedRow[], busy: boolean, links: FeedLink[] = []) {
    if (this.list.parentElement !== this.stage) this.stage.replaceChildren(this.list)
    this.busy = busy
    const keep = new Set(rows.map((r) => r.key))
    for (const [k, r] of this.rows) if (!keep.has(k)) { r.el.remove(); this.rows.delete(k) }
    for (const k of this.fanned) if (!keep.has(k)) this.fanned.delete(k)
    const ids = new Set(rows.flatMap((r) => r.variants.map((v) => v.id)))
    for (const [id, f] of this.frames) if (!ids.has(id)) { f.el.remove(); this.frames.delete(id) }
    const slides: Map<HTMLElement, DOMRect>[] = []
    rows.forEach((r, i) => {
      const row = this.row(r.key)
      placeAt(this.list, row.el, i + 1) // after the lines
      const fan = this.peek || this.fanned.has(r.key)
      const sig = `${fan}|${r.front}|${r.variants.map((v) => v.id).join()}`
      if (row.sig != null && row.sig !== sig && !matchMedia('(prefers-reduced-motion: reduce)').matches) slides.push(where(row.strip))
      row.sig = sig
      const head: HTMLElement[] = [el('b', 'row-title', r.title)]
      if (r.note) head.push(el('span', 'row-note', r.note))
      if (r.variants.length > 1) {
        // One tab per variant, in the order Compare shows them; the front one is lit. A click brings
        // it forward. The tabs are made anew each time, so a focused one hands its focus on.
        const focused = row.head.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.id : undefined
        const tabs = el('span', 'tabs')
        for (const v of r.variants) {
          const t = el('button', 'tab', v.tab) as HTMLButtonElement
          t.type = 'button'
          t.dataset.id = v.id
          t.disabled = r.fixed
          const on = fan ? v.chosen : v.id === r.front
          t.classList.toggle('on', on)
          t.setAttribute('aria-pressed', String(on))
          t.title = on ? `${v.edge[0]} ${v.edge[1]}` : `${v.edge[0]} ${v.edge[1]}: bring it to the front`
          t.addEventListener('click', () => this.on.pick(r.key, v.id))
          tabs.append(t)
        }
        head.push(tabs)
        if (focused) queueMicrotask(() => tabs.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"]`)?.focus())
        const b = el('button', 'compare', this.fanned.has(r.key) ? 'Stack' : 'Compare') as HTMLButtonElement
        b.type = 'button'
        b.title = this.fanned.has(r.key) ? 'Stack the variants again, the pick in front' : 'Show the variants side by side (or hold Alt/Option)'
        b.addEventListener('click', () => {
          if (!this.fanned.delete(r.key)) this.fanned.add(r.key)
          this.render(this.drawn.rows, this.busy, this.drawn.links)
        })
        head.push(b)
      }
      row.head.replaceChildren(...head)
      row.strip.classList.toggle('fanned', fan)
      // The edges behind the front variant stick out on the right; the page scrolls to them.
      row.strip.style.marginRight = fan ? '' : `${Math.max(0, r.variants.length - 1) * EDGE}px`
      // Variants are placed with CSS order, not moved: moving an iframe reloads it.
      let k = 0
      r.variants.forEach((v, j) => {
        const f = this.frame(v.id, r.key)
        if (f.el.parentElement !== row.strip) row.strip.append(f.el)
        const front = v.id === r.front
        const depth = fan || front ? 0 : ++k
        f.el.style.order = String(fan ? j : depth)
        f.el.style.setProperty('--k', String(depth))
        f.el.style.zIndex = fan ? '' : String(r.variants.length - depth)
        f.el.classList.toggle('back', depth > 0)
        f.data = v
        for (const b of f.tools) b.disabled = v.streaming || (busy && b.dataset.tool !== 'info')
        // A variant being refreshed is about to be replaced: an open Edit would change the old one.
        if (v.streaming) f.panel.hidden = true
        for (const b of f.panel.querySelectorAll<HTMLButtonElement>('button.make')) b.disabled = busy
        f.el.classList.toggle('chosen', v.chosen)
        f.el.classList.toggle('streaming', v.streaming)
        f.el.title = depth ? `${v.edge[0]}: ${v.edge[1]}. Click to bring it to the front.` : v.tooltip
        f.caption.textContent = v.caption
        f.edge.replaceChildren(el('b', '', v.edge[0]), el('span', '', v.edge[1]), el('small', '', v.edge[2]))
        if (f.width !== v.width) { f.width = v.width; f.frame.style.width = f.screen.style.width = `${v.width}px` }
      })
    })
    // Each card that moved within its stack slides from where it was (FLIP); the feed's zoom scales the move.
    for (const before of slides) {
      for (const [card, a] of before) {
        if (!card.isConnected) continue
        const b = card.getBoundingClientRect(), s = card.parentElement!.getBoundingClientRect()
        const dx = (a.left - (b.left - s.left)) / this.z, dy = (a.top - (b.top - s.top)) / this.z
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
        const slide = card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' })
        // The lines are measured from where the cards show: draw them again once a card has arrived.
        slide.finished.then(() => this.queueLines(), () => {})
      }
    }
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

  /** Drop the callback waiting for a frame's next load, once its stream is cancelled. */
  forgetLoad(id: string) {
    const f = this.frames.get(id)
    if (f) f.onLoad = null
  }

  /** A streamed variant became a stored candidate: keep its frame under the new id. */
  rename(from: string, to: string) {
    const f = this.frames.get(from)
    if (!f || from === to) return
    this.frames.delete(from)
    this.frames.set(to, f)
    f.el.dataset.id = to
    // A redraw from the rows already drawn (Compare, Alt) must not take the frame for a gone one.
    for (const r of this.drawn.rows) {
      if (r.front === from) r.front = to
      for (const v of r.variants) if (v.id === from) v.id = to
    }
  }


  /** Bring a row to the top of the page. */
  scrollToRow(key: string, smooth = true) {
    const r = this.rows.get(key)
    if (r) this.stage.scrollTo({ top: this.stage.scrollTop + r.el.getBoundingClientRect().top - this.stage.getBoundingClientRect().top - 8, behavior: smooth ? 'smooth' : 'auto' })
  }

  /** Bring a variant into view sideways, if it is out of view. */
  scrollToVariant(id: string, smooth = true) {
    const f = this.frames.get(id)
    if (!f) return
    const st = this.stage, s = this.visible(), v = f.el.getBoundingClientRect()
    if (v.left >= s.left && v.right <= s.right) return
    st.scrollTo({ left: Math.max(0, st.scrollLeft + v.left - s.left - GAP), behavior: smooth ? 'smooth' : 'auto' })
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
    const base = this.list.getBoundingClientRect(), z = this.z
    const X = (vx: number) => (vx - base.left) / z, Y = (vy: number) => (vy - base.top) / z
    const svg = this.lines
    // The lines are part of what the feed measures, so they shrink first: else the size only grows.
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('width', String(this.list.scrollWidth))
    svg.setAttribute('height', String(this.list.scrollHeight))
    const marker = svgEl('marker', { id: 'uxwoz-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })
    marker.append(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', class: 'arrow' }))
    const defs = svgEl('defs', {})
    defs.append(marker)
    const parts: SVGElement[] = [defs]
    /** Where a line meets a variant: near its left edge. */
    const at = (f: Frame, edge: 'top' | 'bottom') => {
      const v = f.el.getBoundingClientRect()
      return { x: X(v.left + FLOW_X * z), y: Y(v[edge]) }
    }
    // The line runs through the front variant; in a fanned row, through the pick.
    const pick = (r: FeedRow) => {
      const id = this.peek || this.fanned.has(r.key) ? r.variants.find((x) => x.chosen)?.id ?? r.front : r.front
      return id ? this.frames.get(id) : undefined
    }
    for (let i = 1; i < rows.length; i++) {
      const a = pick(rows[i - 1]!), b = pick(rows[i]!), row = this.rows.get(rows[i]!.key)
      if (!a || !b || !row) continue
      const p = at(a, 'bottom'), q = at(b, 'top')
      const mid = Y(row.el.getBoundingClientRect().top) - 20
      parts.push(svgEl('path', { d: stepped(p.x, p.y, q.x, mid, q.y), class: 'step', 'marker-end': 'url(#uxwoz-arrow)' }))
      const label = svgEl('text', { x: String(p.x + (q.x < p.x ? -8 : 8)), y: String(mid - 6), class: 'via', 'text-anchor': q.x < p.x ? 'end' : 'start' })
      label.textContent = rows[i]!.via || 'next'
      parts.push(label)
    }
    const index = new Map(rows.map((r, i) => [r.key, i]))
    const headY = (i: number) => {
      const h = this.rows.get(rows[i]!.key)!.head.getBoundingClientRect()
      return Y(h.top + h.height / 2)
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
    r.append(head, strip)
    const row = { el: r, head, strip, sig: null }
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
    const edge = el('div', 'edge')
    const tool = (name: string, icon: string, tip: string) => {
      const b = el('button', 'tool', icon) as HTMLButtonElement
      b.type = 'button'
      b.title = tip
      b.dataset.tool = name
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onTool(f, name) })
      return b
    }
    const tools = [
      tool('change', '✎', 'Edit: say what to change in this screen, and get it changed as a new variant'),
      tool('regenerate', '↻', 'Refresh: make this variant again, in its place, the way it was made'),
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
    v.append(bar, panel, screen, edge)
    const f: Frame = {
      el: v, caption, screen, panel, edge, tools, data: null, frame, rowKey, width: 0, shown: null, onLoad: null,
      growth: { count: 0, at: 0 }, frozen: false,
    }
    bar.addEventListener('click', () => this.on.pick(f.rowKey, v.dataset.id!))
    // A variant behind the front one shows only its edge: a click anywhere on it brings it forward.
    v.addEventListener('click', () => { if (v.classList.contains('back')) this.on.pick(f.rowKey, v.dataset.id!) })
    frame.addEventListener('load', () => this.loaded(f))
    this.frames.set(id, f)
    return f
  }

  /** A tool button in a variant's bar. Edit and Info toggle a panel above the screen. */
  private onTool(f: Frame, name: string) {
    // The id is read when a button is clicked: a refresh renames the frame while the panel is open.
    const v = f.data, id = () => f.el.dataset.id!
    if (!v) return
    if (name === 'regenerate') return this.on.regenerate(f.rowKey, id(), null)
    if (name === 'delete') return this.on.remove(f.rowKey, id())
    const open = !f.panel.hidden && f.panel.dataset.tool === name
    f.panel.hidden = open
    f.panel.dataset.tool = name
    if (open) return this.queueLines()
    if (name === 'info') {
      const dl = el('dl', 'info')
      for (const [k, val] of v.info) dl.append(el('dt', '', k), el('dd', '', val))
      f.panel.replaceChildren(dl)
    } else {
      // Edit: what to change in this screen. Below it, folded: start over from an edited prompt.
      const close = () => { f.panel.hidden = true; this.queueLines() }
      const button = (label: string, cls: string, run: () => void) => {
        const b = el('button', cls, label) as HTMLButtonElement
        b.type = 'button'
        b.disabled = cls === 'make' && this.busy
        b.addEventListener('click', run)
        return b
      }
      const change = document.createElement('textarea')
      change.maxLength = 1000
      change.rows = 3
      change.placeholder = 'e.g. Show one level indicator instead of four'
      const buttons = el('div', 'panel-buttons')
      buttons.append(button('Make the change', 'make', () => {
        const ask = change.value.trim()
        if (!ask) return change.focus()
        if (this.busy) return // the button is disabled meanwhile; keep what was typed
        close()
        this.on.edit(f.rowKey, id(), ask)
      }), button('Cancel', '', close))
      const text = document.createElement('textarea')
      text.value = v.prompt
      text.maxLength = 2000
      text.rows = Math.min(8, Math.max(3, Math.ceil(v.prompt.length / 40)))
      const again = el('div', 'panel-buttons')
      again.append(button('Make a new variant', 'make', () => {
        const prompt = text.value.trim()
        if (!prompt) return text.focus()
        if (this.busy) return
        close()
        this.on.regenerate(f.rowKey, id(), prompt)
      }))
      const more = el('details', 'restart')
      more.append(el('summary', '', 'Or start over from an edited prompt'), text, again)
      more.addEventListener('toggle', () => this.queueLines())
      f.panel.replaceChildren(el('label', '', 'What should change in this screen?'), change, buttons, more)
      change.focus()
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
      this.on.pick(f.rowKey, id)
    } else if (d.uxwoz === 'peek') {
      this.setPeek(!!d.on)
    } else if (d.uxwoz === 'zoom') {
      // Coordinates inside the frame, in its own pixels; the frame is shown at the feed's zoom.
      const r = f.frame.getBoundingClientRect(), k = r.width / (f.frame.offsetWidth || 1)
      this.zoomBy(Number(d.dy) || 0, r.left + (Number(d.x) || 0) * k, r.top + (Number(d.y) || 0) * k)
    } else if (d.uxwoz === 'wheel') {
      // The frame never scrolls itself: its gestures scroll the page.
      this.stage.scrollBy(Number(d.dx) || 0, Number(d.dy) || 0)
    } else if (d.uxwoz === 'action' && typeof d.prompt === 'string') {
      this.on.action(f.rowKey, id, d.prompt.slice(0, 500), typeof d.label === 'string' ? d.label.slice(0, 80) : '')
    }
  }
}

/** Where each card of a stack shows now, relative to the stack (mid-slide too); its slide stops there. */
function where(strip: HTMLElement): Map<HTMLElement, DOMRect> {
  const s = strip.getBoundingClientRect(), m = new Map<HTMLElement, DOMRect>()
  for (const card of strip.children) {
    const r = card.getBoundingClientRect()
    m.set(card as HTMLElement, new DOMRect(r.left - s.left, r.top - s.top, r.width, r.height))
    for (const a of card.getAnimations()) a.cancel()
  }
  return m
}

const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

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
