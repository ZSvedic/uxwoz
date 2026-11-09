// The canvas: every screen on one panning, zooming surface, laid out as a tree. Each level is a row;
// a first child sits below its parent when there is room. Each parent's lines branch at a height of
// their own, so lines never cross. A new screen shows as A OR B; a click on a finished side picks it.
// Names and rails keep their size on screen at any zoom. Right of the first screen: the boxes (boxes.ts).

import { DEFAULT_DEVICE, DEVICES, FRAME_SANDBOX, framePage, type Device } from '@uxwoz/core/frame'
import { el, railOf } from './boxes.ts'

/** Bounds on a reported height, so a broken screen cannot make a huge frame; components may be shorter. */
const MIN_SCREEN_H = 160
const MIN_COMPONENT_H = 80
const MAX_SCREEN_H = 8000
/** Height until a screen reports its size. */
const START_H = 600
/** Height of a failed side. */
const FAILED_H = 220
/** Gaps between columns (for the rails) and rows (for the names), in canvas pixels. */
const GAP_X = 120
const GAP_Y = 150
/** Room for the OR between two sides. */
const OR_W = 160
/** A rail's width and the OR's least width, in pixels on screen. */
const RAIL_W = 60
const OR_MIN = 120
/** Margin so any screen can be scrolled to the middle. */
const PAD = 600
/** Where lines leave and bent lines enter a screen: different, so a line into a screen below another parent does not run on from that parent's. */
const LINE_X = 40
const ENTRY_X = 110
/** Spacing of parents' branch heights, in pixels on screen. */
const LANE = 14
/** Label height above a screen and above a side, in pixels on screen. */
const LABEL_H = 62
const IDEA_H = 76
/** Below this zoom a screen shows only its name (.surface.far). */
const FAR = 0.5
const NAME_H = 26
const labelH = (z: number) => (z < FAR ? NAME_H : LABEL_H)
/** Line corner radius. */
const BEND = 10
const SVG_NS = 'http://www.w3.org/2000/svg'
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2
const STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2]

export interface CardView {
  /** Unique on the canvas: the screen's key, or `key#0` and `key#1` for the sides of its A OR B. */
  id: string
  width: number
  /** Absent for screens made before devices. */
  device?: Device
  /** e.g. "L2 Camera"; '' for a side. */
  name: string
  /** The design idea in one sentence. */
  idea: string
  /** For a side: which one, and whether it finished (may be picked). */
  side?: { index: number; pickable: boolean }
  /** Why a side failed; shown instead of the screen. */
  error?: string
  streaming: boolean
  /** A component: as tall as its content. */
  fit?: boolean
}

export interface ScreenView {
  key: string
  /** null for the first screen. */
  parent: string | null
  /** One card for a picked screen; two for an open A OR B. */
  cards: CardView[]
  current: boolean
  undo: boolean
  /** e.g. "Making the change…"; '' for nothing. */
  note: string
  /** In the Components box, not the tree; no Regenerate. */
  component?: boolean
  /** Changed since the user last looked at its box. */
  fresh?: boolean
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
  zoomed: (zoom: number) => void
}

export interface Box { x: number; y: number; w: number; h: number }
export interface View { z: number; left: number; top: number }

interface Card {
  /** Name, screen and rail. Positioned, never moved in the DOM (that reloads the frame). */
  el: HTMLElement
  name: HTMLElement
  idea: HTMLElement
  /** Unfolds an idea longer than two lines. */
  more: HTMLButtonElement
  note: HTMLElement
  screen: HTMLElement
  frame: HTMLIFrameElement
  /** Over a side's frame: takes the click that picks it. */
  shield: HTMLElement
  error: HTMLElement
  rail: HTMLElement
  undo: HTMLButtonElement
  tools: HTMLButtonElement[]
  key: string
  view: CardView | null
  width: number
  height: number
  shown: { html: string; final: boolean; css: string } | null
  /** The final screen has reported its size since it was shown. */
  sized: boolean
  onLoad: (() => void) | null
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
  /** The OR of each open A OR B, by screen key. */
  private ors = new Map<string, HTMLElement>()
  private screens: ScreenView[] = []
  /** From the last layout: each screen's parent and row bottom, each parent's branch height (0 highest). */
  private parentOf = new Map<string, string>()
  private rowBottom = new Map<string, number>()
  private lanes = new Map<string, number>()
  /** Each screen's place from the last layout, in canvas pixels. */
  private boxes = new Map<string, Box>()
  private extent: Box = { x: 0, y: 0, w: 0, h: 0 }
  private queued = false
  /** The surface's CSS zoom. Its own coordinates (positions, lines) are unzoomed. */
  private z = 1

  /** `stage` scrolls (its content is replaced on first render); `side` holds the boxes; component cards go in `components`. */
  constructor(private stage: HTMLElement, private on: CanvasHandlers, private side: HTMLElement, private components: HTMLElement) {
    this.lines.classList.add('lines')
    this.surface.append(this.lines, side)
    new ResizeObserver(() => this.queue()).observe(side)
    this.surface.style.setProperty('--z', '1')
    addEventListener('message', (e) => this.onFrameMessage(e))
    new ResizeObserver(() => this.queue()).observe(stage)
    // Pinch (a wheel with ctrlKey in Chrome and Firefox) and Ctrl/Cmd + scroll zoom around the pointer.
    stage.addEventListener('wheel', (e) => {
      this.moved = performance.now()
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
      this.moved = performance.now()
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

  /** When the user last scrolled, dragged or zoomed the canvas (performance.now()); fits do not count. */
  moved = 0

  /** Zoom to `z`, keeping the point under (x, y) (the middle of the stage by default) in place. */
  setZoom(z: number, x?: number, y?: number) {
    this.moved = performance.now()
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
    if (z === this.z) return
    const st = this.stage, r = st.getBoundingClientRect()
    const ax = x == null ? st.clientWidth / 2 : x - r.left, ay = y == null ? st.clientHeight / 2 : y - r.top
    let px = (st.scrollLeft + ax) / this.z, py = (st.scrollTop + ay) / this.z
    // Names and rails keep their size on screen, so screens shift with the zoom: follow the nearest one.
    const near = this.nearest(px, py), before = near && { ...this.boxes.get(near)! }
    this.applyZoom(z)
    const after = near && this.boxes.get(near)
    if (before && after) { px += after.x - before.x; py += after.y - before.y }
    st.scrollLeft = px * z - ax
    st.scrollTop = py * z - ay
  }

  private nearest(px: number, py: number): string | undefined {
    let best: string | undefined, dist = Infinity
    for (const [k, b] of this.boxes) {
      const dx = Math.max(b.x - px, 0, px - b.x - b.w), dy = Math.max(b.y - py, 0, py - b.y - b.h)
      if (dx * dx + dy * dy < dist) { dist = dx * dx + dy * dy; best = k }
    }
    return best
  }

  step(dir: 1 | -1) {
    const next = dir > 0 ? STEPS.find((s) => s > this.z + 0.001) : [...STEPS].reverse().find((s) => s < this.z - 0.001)
    this.setZoom(next ?? this.z)
  }

  private applyZoom(z: number) {
    this.z = z
    this.surface.style.zoom = String(z)
    this.surface.style.setProperty('--z', String(z))
    this.surface.classList.toggle('far', z < FAR)
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
    const comp = this.cards.get(key)
    const b = this.boxes.get(key) ?? (comp && this.components.contains(comp.el) ? this.elBox(comp.el) : undefined)
    if (!b) return undefined
    const choice = !!this.screens.find((s) => s.key === key)?.cards[0]?.side
    const above = (choice ? IDEA_H : labelH(this.z)) / this.z
    return { x: b.x, y: b.y - above, w: b.w + (choice ? 0 : RAIL_W / this.z), h: b.h + above }
  }

  /**
   * Zoom and scroll so a screen (or the tree) fills the stage, at most `max`. `top`: fit the width and
   * show the top (an A OR B's heights still change). `snug`: fit the height too, but not below 60% of
   * the width's fit, so a tall screen shows its top readably.
   */
  fit(key?: string, { max = 1, top = false, snug = false } = {}) {
    const st = this.stage, m = 48
    if (this.queued) this.layout() // sizes that arrived since the last frame count
    // Names and rails keep their size on screen, so the box changes with the zoom; a few rounds settle it.
    for (let i = 0; i < 4; i++) {
      const box = this.box(key)
      if (!box) return
      const zw = (st.clientWidth - 2 * m) / box.w, zh = (st.clientHeight - 2 * m) / box.h
      const z = Math.min(max, MAX_ZOOM, zw, top ? Infinity : snug ? Math.max(zh, 0.6 * zw) : zh)
      const next = Math.max(MIN_ZOOM, Math.floor(z * 100) / 100)
      if (next === this.z) break
      this.applyZoom(next)
    }
    const box = this.box(key)
    if (box) this.center(top ? { ...box, h: Infinity } : box)
  }

  /** Resolves once every card of a screen has its final screen and its size (or after 4 s). */
  async sized(key: string): Promise<void> {
    for (let t = 0; t < 40; t++) {
      const cards = this.screens.find((s) => s.key === key)?.cards.map((v) => this.cards.get(v.id))
      const done = !cards || cards.every((c) => !c || c.view?.error || (c.shown?.final && c.sized))
      await new Promise((r) => setTimeout(r, done ? 150 : 100)) // once done, a late report may still come
      if (done) return
    }
  }

  /** Where an element inside the surface sits, in canvas pixels. */
  private elBox(el: HTMLElement): Box {
    let x = 0, y = 0
    for (let e: HTMLElement | null = el; e && e !== this.surface; e = e.offsetParent as HTMLElement | null) { x += e.offsetLeft; y += e.offsetTop }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight }
  }

  /** Move the view to a box: its width fits (at most 100%), its top shows. */
  showBox(el: HTMLElement) {
    this.moved = performance.now()
    if (this.queued) this.layout()
    for (let i = 0; i < 3; i++) {
      const z = Math.max(MIN_ZOOM, Math.min(1, Math.floor(((this.stage.clientWidth - 96) / this.elBox(el).w) * 100) / 100))
      if (z === this.z) break
      this.applyZoom(z)
    }
    this.center({ ...this.elBox(el), h: Infinity })
  }

  /** Fit a screen's width (at most 200%) and scroll to its top. */
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
    if (this.queued) this.layout()
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
        const c = this.card(v.id, s.key, s.component ? this.components : this.surface)
        c.key = s.key
        c.view = v
        if (c.width !== v.width) { c.width = v.width; c.frame.style.width = `${v.width}px` }
        // A component card flows in its box: only its width is set.
        if (s.component) c.el.style.width = c.screen.style.width = `${v.width}px`
        c.el.classList.toggle('fresh', !!s.fresh)
        c.el.classList.toggle('side', !!v.side)
        c.el.classList.toggle('pickable', !!v.side?.pickable)
        c.el.classList.toggle('streaming', v.streaming)
        c.el.classList.toggle('failed', !!v.error)
        c.el.classList.toggle('current', s.current && !v.side)
        c.name.textContent = v.name
        c.name.title = v.name
        c.name.hidden = !v.name
        // A new idea (after an Edit or a Regenerate) starts folded again.
        if (c.idea.title !== v.idea) { c.el.querySelector('.head')!.classList.remove('open'); c.more.textContent = 'more' }
        c.idea.textContent = v.idea || (v.side ? (v.streaming ? 'Making a design…' : v.error ? '' : 'A design') : '')
        c.idea.title = v.idea
        c.note.textContent = v.side ? '' : s.note
        c.note.hidden = !c.note.textContent
        // While a screen is being changed, the note takes the idea's line, so the names keep their room.
        c.idea.parentElement!.hidden = !c.note.hidden
        c.error.textContent = v.error ?? ''
        c.error.hidden = !v.error
        c.screen.hidden = !!v.error
        c.shield.title = v.side ? (v.side.pickable ? 'Pick this design' : 'Wait until it is finished') : ''
        c.rail.hidden = !!v.side
        c.undo.hidden = !s.undo
        c.tools[1]!.hidden = !!s.component
        c.tools[4]!.title = s.component ? 'Delete this component: screens that paste it show nothing in its place' : RAIL[4]![2]
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
    c.shown = { html, final, css }
    c.sized = false
    c.frame.srcdoc = framePage(html, css, final, c.view?.device, c.view?.fit)
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

  private size(c: Card) {
    return { w: c.width, h: c.view?.error ? FAILED_H : c.height }
  }

  /** Place the tree and the boxes, size the canvas, draw the lines. */
  private layout() {
    const z = this.z
    // At a low zoom, rails and the OR need more of the canvas than the fixed gaps give.
    const gapX = Math.max(GAP_X, (RAIL_W + 24) / z), orW = Math.max(OR_W, OR_MIN / z)
    const screens = this.screens.filter((s) => !s.component)
    // The Components box is as wide as a screen of the mockup and its rail; the boxes' rails go in the gaps.
    const devW = Math.max(DEVICES[DEFAULT_DEVICE].width, ...this.screens.filter((s) => s.component || !s.parent).map((s) => s.cards[0]?.width ?? 0))
    this.components.parentElement!.style.width = `${devW + 40 + (z < FAR ? 0 : (RAIL_W + 10) / z)}px`
    this.side.style.gap = `${gapX}px`
    const sizes = new Map<string, { w: number; h: number; parts: { id: string; w: number; h: number }[] }>()
    for (const s of screens) {
      const parts = s.cards.map((v) => ({ id: v.id, ...this.size(this.cards.get(v.id)!) }))
      const w = parts.reduce((t, p) => t + p.w, 0) + orW * (parts.length - 1)
      sizes.set(s.key, { w, h: Math.max(...parts.map((p) => p.h)), parts })
    }
    // The tree from the parents; a screen whose parent is not here starts a tree of its own, to the right.
    const keys = new Set(screens.map((s) => s.key))
    const kids = new Map<string, string[]>()
    const roots: string[] = []
    this.parentOf.clear()
    for (const s of screens) {
      if (s.parent && keys.has(s.parent) && s.parent !== s.key) {
        kids.set(s.parent, [...(kids.get(s.parent) ?? []), s.key])
        this.parentOf.set(s.key, s.parent)
      } else roots.push(s.key)
    }
    const depth = new Map<string, number>()
    const walk = (k: string, d: number) => {
      if (depth.has(k)) return
      depth.set(k, d)
      for (const c of kids.get(k) ?? []) walk(c, d + 1)
    }
    for (const r of roots) walk(r, 0)
    // Rows top down: each the children of the row above, in order.
    const rows: string[][] = [roots.filter((r) => depth.get(r) === 0)]
    while (rows.at(-1)!.length) rows.push(rows.at(-1)!.flatMap((k) => (kids.get(k) ?? []).filter((c) => depth.get(c) === rows.length)))
    rows.pop()
    // Across: side by side, a first child below its parent when that place is free. The boxes go
    // right of the first screen and its rail, in its row.
    this.boxes.clear()
    const xs = new Map<string, number>()
    const side = !this.side.hidden && rows.length > 0
    let maxX = PAD, sideX = PAD
    for (const row of rows) {
      let cursor = PAD
      for (const k of row) {
        const p = this.parentOf.get(k), first = p != null && kids.get(p)![0] === k
        const x = Math.max(cursor, first ? xs.get(p)! : cursor)
        xs.set(k, x)
        cursor = x + sizes.get(k)!.w + gapX
        if (side && k === rows[0]![0]) { sideX = cursor; cursor += this.side.offsetWidth + gapX }
        maxX = Math.max(maxX, cursor - gapX)
      }
    }
    // Each bending parent gets its own branch height, the leftmost lowest, so no lines cross; the gap grows.
    const lane = Math.max(LANE / z, 10)
    this.lanes.clear()
    const lanesIn = rows.map((row) => {
      const bending = row.filter((k) => (kids.get(k) ?? []).some((c) => Math.abs(xs.get(c)! - xs.get(k)!) >= 1))
      bending.forEach((k, i) => this.lanes.set(k, bending.length - 1 - i))
      return bending.length
    })
    // Each row holds the names above its screens, which keep their size on screen.
    const rowH = rows.map((row, d) => Math.max(d || !side ? 0 : this.side.offsetHeight, ...row.map((k) => sizes.get(k)!.h)))
    const above = (d: number) => (rows[d]!.some((k) => sizes.get(k)!.parts.length > 1) ? IDEA_H : labelH(z)) / z
    const rowY: number[] = []
    let y = PAD
    for (let d = 0; d < rows.length; d++) {
      y += above(d)
      rowY[d] = y
      y += rowH[d]! + GAP_Y + Math.max(0, lanesIn[d]! - 1) * lane
    }
    this.rowBottom.clear()
    rows.forEach((row, d) => row.forEach((k) => {
      this.boxes.set(k, { x: xs.get(k)!, y: rowY[d]!, w: sizes.get(k)!.w, h: sizes.get(k)!.h })
      this.rowBottom.set(k, rowY[d]! + rowH[d]!)
    }))
    y -= rows.length ? GAP_Y + Math.max(0, lanesIn.at(-1)! - 1) * lane : 0
    Object.assign(this.side.style, { left: `${sideX}px`, top: `${rowY[0] ?? PAD}px` })
    this.extent = { x: PAD, y: PAD, w: Math.max(0, maxX - PAD), h: Math.max(0, y - PAD) }
    for (const s of screens) {
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
    this.queueMore()
  }

  private moreQueued = false

  /** Show "more" by each idea cut off at two lines; the room it has changes with the zoom. */
  private queueMore() {
    if (this.moreQueued) return
    this.moreQueued = true
    requestAnimationFrame(() => {
      this.moreQueued = false
      for (const c of this.cards.values()) {
        if (c.view?.side) { c.more.hidden = true; continue }
        const open = c.more.textContent === 'less'
        c.more.hidden = !open && c.idea.scrollHeight <= c.idea.clientHeight + 1
      }
    })
  }

  /** A line from each screen to its parent: straight down, else an elbow at the parent's branch height. */
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
        const x1 = a.x + LINE_X, y1 = a.y + a.h, x2 = b.x + (Math.abs(b.x - a.x) < 1 ? LINE_X : ENTRY_X), y2 = b.y - (choice ? IDEA_H : labelH(z)) / z - 6 / z
        const lane = Math.max(LANE / z, 10) * (this.lanes.get(p) ?? 0)
        const mid = Math.min((this.rowBottom.get(p) ?? y1) + GAP_Y / 2 + lane, y2 - 1)
        parts.push(svgEl('path', { d: elbow(x1, y1, x2, mid, y2), class: 'line' }))
      }
    }
    svg.replaceChildren(...parts)
  }

  private card(id: string, key: string, parent: HTMLElement): Card {
    const have = this.cards.get(id)
    if (have) return have
    const root = el('article', 'card')
    const head = el('div', 'head')
    const name = el('b', 'name')
    const idea = el('span', 'idea')
    const more = el('button', 'more', 'more') as HTMLButtonElement
    more.type = 'button'
    more.hidden = true
    more.addEventListener('click', () => {
      const open = head.classList.toggle('open')
      more.textContent = open ? 'less' : 'more'
    })
    const ideaRow = el('div', 'idea-row')
    ideaRow.append(idea, more)
    const note = el('span', 'note')
    head.append(name, ideaRow, note)
    const screen = el('div', 'screen')
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', FRAME_SANDBOX)
    frame.title = 'Generated screen'
    frame.style.height = `${START_H}px`
    const shield = el('div', 'shield')
    shield.append(el('span', 'pick-hint', 'Pick this design'))
    screen.append(frame, shield)
    const error = el('div', 'error-box')
    const { el: rail, tools } = railOf(RAIL, (tool) => this.on.tool(c.key, tool))
    root.append(head, screen, error, rail)
    const c: Card = {
      el: root, name, idea, more, note, screen, frame, shield, error, rail, undo: tools[2]!, tools, key, view: null,
      width: 0, height: START_H, shown: null, sized: false, onLoad: null,
    }
    shield.addEventListener('click', () => { if (c.view?.side?.pickable) this.on.pick(c.key, c.view.side.index) })
    frame.addEventListener('load', () => this.loaded(c))
    parent.append(root)
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
      if (c.shown?.final) c.sized = true
      const h = Math.min(MAX_SCREEN_H, Math.max(c.view?.fit ? MIN_COMPONENT_H : MIN_SCREEN_H, Math.round(d.height)))
      if (c.height === h) return
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
      this.moved = performance.now()
      this.stage.scrollBy(Number(d.dx) || 0, Number(d.dy) || 0)
    } else if (d.uxwoz === 'action' && typeof d.prompt === 'string' && !c.view?.side) {
      this.on.action(c.key, d.prompt.slice(0, 500), typeof d.label === 'string' ? d.label.slice(0, 80) : '')
    }
  }
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
