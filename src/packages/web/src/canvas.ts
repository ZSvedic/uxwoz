// The canvas: every screen of the mockup on one panning, zooming surface, laid out as a tree. Each
// level is a row, as tall as its tallest screen. A screen's first child sits straight below it, in
// the same column; each later child starts a new column to the right of the subtrees before it.
// A thin line joins each parent to each child it made. A new screen shows as A OR B: two locked
// previews side by side, with its idea above each; a click on a finished one picks it. Right of
// each picked screen is a rail of tools, kept at the same size on screen whatever the zoom.
// Screens show only as wide as their content: the frame keeps the device's width, so the screen's
// layout never changes, and the part it does not use is cut off.

import { FRAME_SANDBOX, framePage } from '@uxwoz/core/frame'

/** Limits on the height a screen may report, so a broken screen cannot make a huge frame. */
const MIN_SCREEN_H = 160
const MAX_SCREEN_H = 8000
/** The narrowest a screen gets, so its name stays readable. */
const MIN_SCREEN_W = 280
/** The height of a frame whose screen has not reported its size yet. */
const START_H = 600
/** The height of a failed side of an A OR B. */
const FAILED_H = 220
/** A frame that grows this many times in a row, each within GROWTH_MS of the last, stops growing. */
const GROWTH_LIMIT = 4
const GROWTH_MS = 1500
/** Space between columns (it holds the rails) and between rows (it holds the names), in canvas pixels. */
const GAP_X = 120
const GAP_Y = 150
/** The space between the two sides of an A OR B, where the OR sits. */
const OR_W = 160
/** The room a rail takes right of its screen, and the least room the OR needs, in pixels on screen. */
const RAIL_W = 60
const OR_MIN = 120
/** Empty canvas around the tree, so any screen can be scrolled to the middle. */
const PAD = 600
/** How far right of a screen's left edge the lines meet it. */
const LINE_X = 40
/** The height of the name and idea above a screen, and of the idea above a side, in pixels on screen. */
const LABEL_H = 44
const IDEA_H = 76
/** The radius of a line's corners. */
const BEND = 10
const SVG_NS = 'http://www.w3.org/2000/svg'
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2
/** The steps of Zoom in and Zoom out. */
const STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2]

export interface CardView {
  /** Unique on the canvas: the screen's key, or `key#0` and `key#1` for the sides of its A OR B. */
  id: string
  /** Width of the window the screen is designed for: the most it shows. */
  width: number
  /** The bold line above a screen, e.g. "L2 Camera"; '' for a side of an A OR B. */
  name: string
  /** One sentence naming the design idea: under the name, or alone above a side. */
  idea: string
  /** For a side of an A OR B: which one, and whether it may be picked (it finished). */
  side?: { index: number; pickable: boolean }
  /** Why a side failed; it shows instead of the screen. */
  error?: string
  streaming: boolean
}

export interface ScreenView {
  key: string
  /** The screen that made it, or null for the first screen. */
  parent: string | null
  /** One card for a picked screen; two for an open A OR B. */
  cards: CardView[]
  current: boolean
  /** The rail shows Undo. */
  undo: boolean
  /** What is happening to it, e.g. "Making the change…"; '' for nothing. */
  note: string
}

export interface CanvasHandlers {
  /** A click in a picked screen on a control that opens another screen. */
  action: (key: string, prompt: string, label: string) => void
  pick: (key: string, side: number) => void
  /** Drop both designs of an open A OR B. */
  cancel: (key: string) => void
  /** A press in a screen: it becomes the current one. */
  focus: (key: string) => void
  /** A rail button: edit, regenerate, undo, info or delete. */
  tool: (key: string, name: string) => void
  /** The zoom changed, by a gesture or a call. */
  zoomed: (zoom: number) => void
}

export interface Box { x: number; y: number; w: number; h: number }
export interface View { z: number; left: number; top: number }

interface Card {
  /** The card's whole block: name above, screen, rail to the right. Positioned on the canvas, never moved in the DOM (that reloads the frame). */
  el: HTMLElement
  name: HTMLElement
  idea: HTMLElement
  note: HTMLElement
  screen: HTMLElement
  frame: HTMLIFrameElement
  /** Over a side's frame: takes the click that picks it. */
  shield: HTMLElement
  error: HTMLElement
  rail: HTMLElement
  undo: HTMLButtonElement
  tools: HTMLButtonElement[]
  /** The screen this card belongs to. */
  key: string
  view: CardView | null
  width: number
  /** The width the screen uses, once it reported it. */
  used: number | null
  height: number
  shown: { html: string; final: boolean; css: string } | null
  onLoad: (() => void) | null
  growth: { count: number; at: number }
  frozen: boolean
}

const RAIL: [string, string, string][] = [
  ['edit', '✎', 'Edit: say what should change in this screen'],
  ['regenerate', '↻', 'Regenerate: a new design of this screen, in its place'],
  ['undo', '↶', 'Undo: bring back the version before'],
  ['info', 'ⓘ', 'Info: name, idea, model, time, cost'],
  ['delete', '✕', 'Delete this screen, and the screens only it leads to'],
]

export class Canvas {
  private surface = el('div', 'surface')
  private lines = document.createElementNS(SVG_NS, 'svg')
  private cards = new Map<string, Card>()
  /** The OR between the sides of each open A OR B, by screen key. */
  private ors = new Map<string, HTMLElement>()
  private screens: ScreenView[] = []
  /** Where each screen sits, from the last layout, in canvas pixels. */
  private boxes = new Map<string, Box>()
  private extent: Box = { x: 0, y: 0, w: 0, h: 0 }
  private queued = false
  /** The surface's CSS zoom. Its own coordinates (positions, lines) are unzoomed. */
  private z = 1

  /** `stage` is the scrolling area; the canvas replaces what it holds on the first render. */
  constructor(private stage: HTMLElement, private on: CanvasHandlers) {
    this.lines.classList.add('lines')
    this.surface.append(this.lines)
    this.surface.style.setProperty('--z', '1')
    addEventListener('message', (e) => this.onFrameMessage(e))
    new ResizeObserver(() => this.queue()).observe(stage)
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
    // Dragging the empty canvas pans it.
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target !== stage && e.target !== this.surface && e.target !== this.lines)) return
      const x0 = e.clientX, y0 = e.clientY, l0 = stage.scrollLeft, t0 = stage.scrollTop
      stage.setPointerCapture(e.pointerId)
      stage.classList.add('panning')
      const move = (m: PointerEvent) => stage.scrollTo(l0 - (m.clientX - x0), t0 - (m.clientY - y0))
      const up = () => { stage.classList.remove('panning'); stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerup', up) }
      stage.addEventListener('pointermove', move)
      stage.addEventListener('pointerup', up)
    })
  }

  get zoom() { return this.z }

  /** Zoom to `z`, keeping the point under (x, y) (the middle of the stage by default) in place. */
  setZoom(z: number, x?: number, y?: number) {
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
    if (z === this.z) return
    const st = this.stage, r = st.getBoundingClientRect()
    const ax = x == null ? st.clientWidth / 2 : x - r.left, ay = y == null ? st.clientHeight / 2 : y - r.top
    let px = (st.scrollLeft + ax) / this.z, py = (st.scrollTop + ay) / this.z
    // Names and rails keep their size on screen, so screens move a little on the canvas as the zoom
    // changes: the point under the pointer follows the screen nearest to it.
    const near = this.nearest(px, py), before = near && { ...this.boxes.get(near)! }
    this.applyZoom(z)
    const after = near && this.boxes.get(near)
    if (before && after) { px += after.x - before.x; py += after.y - before.y }
    st.scrollLeft = px * z - ax
    st.scrollTop = py * z - ay
  }

  /** The screen whose box is nearest to a canvas point. */
  private nearest(px: number, py: number): string | undefined {
    let best: string | undefined, dist = Infinity
    for (const [k, b] of this.boxes) {
      const dx = Math.max(b.x - px, 0, px - b.x - b.w), dy = Math.max(b.y - py, 0, py - b.y - b.h)
      if (dx * dx + dy * dy < dist) { dist = dx * dx + dy * dy; best = k }
    }
    return best
  }

  /** The next zoom step in or out from now. */
  step(dir: 1 | -1) {
    const next = dir > 0 ? STEPS.find((s) => s > this.z + 0.001) : [...STEPS].reverse().find((s) => s < this.z - 0.001)
    this.setZoom(next ?? this.z)
  }

  private applyZoom(z: number) {
    this.z = z
    this.surface.style.zoom = String(z)
    this.surface.style.setProperty('--z', String(z))
    this.stage.style.setProperty('--z', String(z)) // the dot grid behind the canvas scales with it
    this.layout() // names and rails keep their size on screen, so the room they need changes
    this.on.zoomed(z)
  }

  private zoomBy(dy: number, x: number, y: number) {
    this.setZoom(this.z * Math.exp(-dy * 0.01), x, y)
  }

  view(): View {
    return { z: this.z, left: this.stage.scrollLeft, top: this.stage.scrollTop }
  }

  setView(v: View) {
    if (v.z !== this.z) this.applyZoom(v.z)
    this.stage.scrollTo({ left: v.left, top: v.top })
  }

  /** A screen's place with the names above it and its rail, or the whole tree's without a key. */
  box(key?: string): Box | undefined {
    if (key == null) return this.extent.w ? this.extent : undefined
    const b = this.boxes.get(key)
    if (!b) return undefined
    const choice = !!this.screens.find((s) => s.key === key)?.cards[0]?.side
    const above = (choice ? IDEA_H : LABEL_H) / this.z
    return { x: b.x, y: b.y - above, w: b.w + (choice ? 0 : RAIL_W / this.z), h: b.h + above }
  }

  /**
   * Zoom and scroll so a screen (or the whole tree, without a key) fills the stage, at most `max`.
   * With `top`, only its width counts, and its top shows: for an A OR B, whose heights still change.
   */
  fit(key?: string, { max = 1, top = false } = {}) {
    const st = this.stage, m = 48
    // Names and rails keep their size on screen, so they take more of the canvas at a lower zoom:
    // the box changes with the zoom, and a few rounds settle it.
    for (let i = 0; i < 4; i++) {
      const box = this.box(key)
      if (!box) return
      const z = Math.min(max, MAX_ZOOM, (st.clientWidth - 2 * m) / box.w, top ? Infinity : (st.clientHeight - 2 * m) / box.h)
      const next = Math.max(MIN_ZOOM, Math.floor(z * 100) / 100)
      if (next === this.z) break
      this.applyZoom(next)
    }
    const box = this.box(key)
    if (box) this.center(top ? { ...box, h: Infinity } : box)
  }

  /** Zoom so a screen fills the stage's width (at most 200%), and scroll to its top. */
  fitWidth(key: string) {
    this.fit(key, { max: MAX_ZOOM, top: true })
  }

  private center(b: Box, smooth = false) {
    const st = this.stage
    const top = b.h * this.z > st.clientHeight - 48 ? b.y * this.z - 24 : (b.y + b.h / 2) * this.z - st.clientHeight / 2
    st.scrollTo({ left: (b.x + b.w / 2) * this.z - st.clientWidth / 2, top, behavior: smooth ? 'smooth' : 'auto' })
  }

  /** Scroll a screen into view if any of it is out of view (its top first, if it is taller than the stage). */
  reveal(key: string, smooth = true) {
    const b = this.box(key)
    if (!b) return
    const st = this.stage, z = this.z, m = 24
    const l = b.x * z, t = b.y * z, r = (b.x + b.w) * z, btm = (b.y + b.h) * z
    const inX = l >= st.scrollLeft + m && r <= st.scrollLeft + st.clientWidth - m
    const inY = t >= st.scrollTop + m && btm <= st.scrollTop + st.clientHeight - m
    if (inX && inY) return
    const left = inX ? st.scrollLeft : r - l > st.clientWidth - 2 * m ? l - m : (l + r) / 2 - st.clientWidth / 2
    const top = inY ? st.scrollTop : btm - t > st.clientHeight - 2 * m ? t - m : (t + btm) / 2 - st.clientHeight / 2
    st.scrollTo({ left, top, behavior: smooth ? 'smooth' : 'auto' })
  }

  /** Draw the screens. Cards are kept and only moved, so unchanged screens do not reload. */
  render(screens: ScreenView[], busy: boolean) {
    if (this.surface.parentElement !== this.stage) this.stage.replaceChildren(this.surface)
    this.screens = screens
    const ids = new Set(screens.flatMap((s) => s.cards.map((c) => c.id)))
    for (const [id, c] of this.cards) if (!ids.has(id)) { c.el.remove(); this.cards.delete(id) }
    const choices = new Set(screens.filter((s) => s.cards[0]?.side).map((s) => s.key))
    for (const [k, o] of this.ors) if (!choices.has(k)) { o.remove(); this.ors.delete(k) }
    for (const s of screens) {
      for (const v of s.cards) {
        const c = this.card(v.id, s.key)
        c.key = s.key
        c.view = v
        if (c.width !== v.width) { c.width = v.width; c.frame.style.width = `${v.width}px` }
        c.el.classList.toggle('side', !!v.side)
        c.el.classList.toggle('pickable', !!v.side?.pickable)
        c.el.classList.toggle('streaming', v.streaming)
        c.el.classList.toggle('failed', !!v.error)
        c.el.classList.toggle('current', s.current && !v.side)
        c.name.textContent = v.name
        c.name.hidden = !v.name
        c.idea.textContent = v.idea || (v.side ? (v.streaming ? 'Making a design…' : v.error ? '' : 'A design') : '')
        c.idea.title = v.idea
        c.note.textContent = v.side ? '' : s.note
        c.note.hidden = !c.note.textContent
        // While a screen is being changed, the note takes the idea's line, so the names keep their room.
        if (!c.note.hidden) c.idea.hidden = true
        else c.idea.hidden = false
        c.error.textContent = v.error ?? ''
        c.error.hidden = !v.error
        c.screen.hidden = !!v.error
        c.shield.title = v.side ? (v.side.pickable ? 'Pick this design' : 'Wait until it is finished') : ''
        c.rail.hidden = !!v.side
        c.undo.hidden = !s.undo
        for (const b of c.tools) b.disabled = busy && b.dataset.tool !== 'info'
      }
      if (choices.has(s.key) && !this.ors.has(s.key)) {
        const o = el('div', 'or')
        o.append(el('b', '', 'OR'))
        const x = el('button', 'drop', '✕') as HTMLButtonElement
        x.type = 'button'
        x.title = 'Drop both designs'
        x.addEventListener('click', () => this.on.cancel(o.dataset.key!))
        o.append(x)
        o.dataset.key = s.key
        this.surface.append(o)
        this.ors.set(s.key, o)
      }
    }
    this.layout()
  }

  /** Put a screen into a card's frame; `onLoad` runs once the frame has loaded it. */
  show(id: string, html: string, final: boolean, css: string, onLoad?: () => void) {
    const c = this.cards.get(id)
    if (!c) return
    if (onLoad) c.onLoad = onLoad
    const s = c.shown
    if (s && s.html === html && s.final === final && s.css === css) {
      // Nothing to reload, so no load event will come: report it as loaded now.
      if (onLoad) requestAnimationFrame(() => this.loaded(c))
      return
    }
    if (s?.html !== html) { c.frozen = false; c.growth = { count: 0, at: 0 } }
    // While a screen streams it keeps the full width, so its neighbours do not jump with every chunk.
    if (!final && c.used != null) { c.used = null; this.queue() }
    c.shown = { html, final, css }
    c.frame.srcdoc = framePage(html, css, final)
  }

  /** Drop the callback waiting for a card's next load, once its stream is cancelled. */
  forgetLoad(id: string) {
    const c = this.cards.get(id)
    if (c) c.onLoad = null
  }

  /** A card takes another id, keeping its frame: the picked side becomes the screen. */
  rename(from: string, to: string) {
    const c = this.cards.get(from)
    if (!c || from === to) return
    this.cards.get(to)?.el.remove()
    this.cards.delete(from)
    this.cards.set(to, c)
  }

  private queue() {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => { this.queued = false; this.layout() })
  }

  /** The size a card takes on the canvas. */
  private size(c: Card) {
    const w = c.view?.error ? c.width : Math.min(c.width, Math.max(MIN_SCREEN_W, c.used ?? c.width))
    return { w, h: c.view?.error ? FAILED_H : c.height }
  }

  /** Place every screen as a tree, size the canvas, and draw the lines. */
  private layout() {
    const z = this.z
    // At a low zoom, rails and the OR need more of the canvas than the fixed gaps give.
    const gapX = Math.max(GAP_X, (RAIL_W + 24) / z), orW = Math.max(OR_W, OR_MIN / z)
    const sizes = new Map<string, { w: number; h: number; parts: { id: string; w: number; h: number }[] }>()
    for (const s of this.screens) {
      const parts = s.cards.map((v) => ({ id: v.id, ...this.size(this.cards.get(v.id)!) }))
      const w = parts.reduce((t, p) => t + p.w, 0) + orW * (parts.length - 1)
      sizes.set(s.key, { w, h: Math.max(...parts.map((p) => p.h)), parts })
    }
    // The tree from the parents; a screen whose parent is not here starts a tree of its own, to the right.
    const keys = new Set(this.screens.map((s) => s.key))
    const kids = new Map<string, string[]>()
    const roots: string[] = []
    for (const s of this.screens) {
      if (s.parent && keys.has(s.parent) && s.parent !== s.key) kids.set(s.parent, [...(kids.get(s.parent) ?? []), s.key])
      else roots.push(s.key)
    }
    const depth = new Map<string, number>()
    const walk = (k: string, d: number) => {
      if (depth.has(k)) return
      depth.set(k, d)
      for (const c of kids.get(k) ?? []) walk(c, d + 1)
    }
    for (const r of roots) walk(r, 0)
    // Each row holds the names above its screens, which keep their size on screen.
    const rowH: number[] = []
    for (const [k, d] of depth) rowH[d] = Math.max(rowH[d] ?? 0, sizes.get(k)!.h)
    const above = (d: number) => ([...depth].some(([k, dd]) => dd === d && sizes.get(k)!.parts.length > 1) ? IDEA_H : LABEL_H) / z
    const rowY: number[] = []
    let y = PAD
    for (let d = 0; d < rowH.length; d++) { y += above(d); rowY[d] = y; y += (rowH[d] ?? 0) + GAP_Y }
    this.boxes.clear()
    const place = (k: string, x: number): number => {
      if (this.boxes.has(k)) return x
      const s = sizes.get(k)!
      this.boxes.set(k, { x, y: rowY[depth.get(k)!]!, w: s.w, h: s.h })
      let right = x + s.w, cx = x
      for (const c of kids.get(k) ?? []) { right = Math.max(right, place(c, cx)); cx = right + gapX }
      return right
    }
    let x = PAD, maxX = PAD
    for (const r of roots) { maxX = place(r, x); x = maxX + gapX }
    this.extent = { x: PAD, y: PAD, w: Math.max(0, maxX - PAD), h: Math.max(0, y - GAP_Y - PAD) }
    // The cards, and the OR between the sides of an A OR B.
    for (const s of this.screens) {
      const b = this.boxes.get(s.key)
      if (!b) continue
      let cx = b.x
      for (const p of sizes.get(s.key)!.parts) {
        const c = this.cards.get(p.id)!
        Object.assign(c.el.style, { left: `${cx}px`, top: `${b.y}px`, width: `${p.w}px`, height: `${p.h}px` })
        c.screen.style.width = `${p.w}px`
        cx += p.w + orW
      }
      const o = this.ors.get(s.key)
      if (o) {
        const first = sizes.get(s.key)!.parts[0]!
        Object.assign(o.style, { left: `${b.x + first.w}px`, top: `${b.y}px`, width: `${orW}px`, height: `${Math.min(b.h, 700)}px` })
      }
    }
    // The canvas reaches past the tree, and at least fills the stage, so any screen can be centred.
    const w = Math.max(maxX + PAD, this.stage.clientWidth / z), h = Math.max(y + PAD, this.stage.clientHeight / z)
    this.surface.style.width = `${w}px`
    this.surface.style.height = `${h}px`
    this.drawLines(kids)
  }

  /** One line from each parent to each child it made: straight down in its column, else an elbow. */
  private drawLines(kids: Map<string, string[]>) {
    const svg = this.lines
    svg.setAttribute('width', this.surface.style.width)
    svg.setAttribute('height', this.surface.style.height)
    const parts: SVGElement[] = []
    const z = this.z
    for (const [p, list] of kids) {
      const a = this.boxes.get(p)
      if (!a) continue
      for (const k of list) {
        const b = this.boxes.get(k)
        if (!b) continue
        const choice = this.screens.find((s) => s.key === k)!.cards.length > 1
        const x1 = a.x + LINE_X, y1 = a.y + a.h, x2 = b.x + LINE_X, y2 = b.y - (choice ? IDEA_H : LABEL_H) / z - 6 / z
        const mid = Math.min(y1 + GAP_Y / 2, y2 - 1)
        parts.push(svgEl('path', { d: elbow(x1, y1, x2, mid, y2), class: 'line' }))
      }
    }
    svg.replaceChildren(...parts)
  }

  private card(id: string, key: string): Card {
    const have = this.cards.get(id)
    if (have) return have
    const root = el('article', 'card')
    const head = el('div', 'head')
    const name = el('b', 'name')
    const idea = el('span', 'idea')
    const note = el('span', 'note')
    head.append(name, idea, note)
    const screen = el('div', 'screen')
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', FRAME_SANDBOX)
    frame.title = 'Generated screen'
    frame.style.height = `${START_H}px`
    const shield = el('div', 'shield')
    shield.append(el('span', 'pick-hint', 'Pick this design'))
    screen.append(frame, shield)
    const error = el('div', 'error-box')
    const rail = el('div', 'rail')
    const tools = RAIL.map(([tool, icon, tip]) => {
      const b = el('button', 'tool', icon) as HTMLButtonElement
      b.type = 'button'
      b.title = tip
      b.dataset.tool = tool
      b.setAttribute('aria-label', tip.split(':')[0]!)
      b.addEventListener('click', () => this.on.tool(c.key, tool))
      rail.append(b)
      return b
    })
    root.append(head, screen, error, rail)
    const c: Card = {
      el: root, name, idea, note, screen, frame, shield, error, rail, undo: tools[2]!, tools, key, view: null,
      width: 0, used: null, height: START_H, shown: null, onLoad: null, growth: { count: 0, at: 0 }, frozen: false,
    }
    shield.addEventListener('click', () => { if (c.view?.side?.pickable) this.on.pick(c.key, c.view.side.index) })
    frame.addEventListener('load', () => this.loaded(c))
    this.surface.append(root)
    this.cards.set(id, c)
    return c
  }

  private loaded(c: Card) {
    const cb = c.onLoad
    c.onLoad = null
    cb?.()
  }

  /** Screens report their size, clicks and scroll gestures (see the frame script). */
  private onFrameMessage(e: MessageEvent) {
    const d = e.data
    if (typeof d?.uxwoz !== 'string') return
    let c: Card | undefined
    for (const x of this.cards.values()) if (x.frame.contentWindow === e.source) c = x
    if (!c) return
    if (d.uxwoz === 'size' && Number.isFinite(d.height)) {
      if (c.shown?.final && Number.isFinite(d.width) && c.used !== Math.round(d.width)) { c.used = Math.round(d.width); this.queue() }
      const h = Math.min(MAX_SCREEN_H, Math.max(MIN_SCREEN_H, Math.round(d.height)))
      if (c.height === h) return
      // A screen sized by its window (100% heights, script reading innerHeight) grows each time its
      // frame grows. Stop that loop instead of following it to MAX_SCREEN_H.
      if (c.shown && h > c.height) {
        if (c.frozen) return
        const now = performance.now()
        c.growth = { count: now - c.growth.at < GROWTH_MS ? c.growth.count + 1 : 1, at: now }
        if (c.growth.count >= GROWTH_LIMIT) { c.frozen = true; return }
      }
      c.height = h
      c.frame.style.height = `${h}px`
      this.queue()
    } else if (d.uxwoz === 'key' && typeof d.key === 'string' && typeof d.code === 'string') {
      // A key pressed in a screen, handed on as if pressed in the app.
      dispatchEvent(new KeyboardEvent('keydown', { key: d.key, code: d.code, shiftKey: !!d.shift, metaKey: !!d.mod }))
    } else if (d.uxwoz === 'touch') {
      if (!c.view?.side) this.on.focus(c.key)
    } else if (d.uxwoz === 'zoom') {
      // Coordinates inside the frame, in its own pixels; the frame is shown at the canvas's zoom.
      const r = c.frame.getBoundingClientRect(), k = r.width / (c.frame.offsetWidth || 1)
      this.zoomBy(Number(d.dy) || 0, r.left + (Number(d.x) || 0) * k, r.top + (Number(d.y) || 0) * k)
    } else if (d.uxwoz === 'wheel') {
      // The frame never scrolls itself: its gestures scroll the canvas.
      this.stage.scrollBy(Number(d.dx) || 0, Number(d.dy) || 0)
    } else if (d.uxwoz === 'action' && typeof d.prompt === 'string' && !c.view?.side) {
      this.on.action(c.key, d.prompt.slice(0, 500), typeof d.label === 'string' ? d.label.slice(0, 80) : '')
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

/** Down from (x1, y1) to y, across to x2, down to y2, with rounded corners; straight when x1 is x2. */
function elbow(x1: number, y1: number, x2: number, y: number, y2: number): string {
  const dx = x2 - x1
  if (Math.abs(dx) < 2 * BEND) return `M${x1} ${y1} V${y2}`
  const s = Math.sign(dx)
  return `M${x1} ${y1} V${y - BEND} Q${x1} ${y} ${x1 + s * BEND} ${y} H${x2 - s * BEND} Q${x2} ${y} ${x2} ${y + BEND} V${y2}`
}
