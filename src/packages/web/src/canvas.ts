// The canvas: every mock of a project on one panning, zooming sky, a tree with a row per level. Every mock of a project
// has one size, so every row is as tall as the others; a first child sits below its parent when there is room, and a
// rope from each mock to its parent bends only in the gap below. Names keep a readable size zoomed out. Right of Home:
// the boxes (boxes.ts). Under the current mock: its four buttons. 100% is the current mock fitted with its name, its
// buttons and its ropes; another mock or box becoming current is a glide there at the zoom the user has.

import { DEVICES, FRAME_SANDBOX, LEGACY_WIDTH, VIEWPORT_H, framePage, type Device } from '@uxwoz/core/frame'
import { el } from './boxes.ts'

/** Gaps between columns and between a row's buttons and the next row's names, in canvas pixels. */
const GAP_X = 120
const GAP_Y = 110
/** Margin round the tree, at least, so any mock can be scrolled to the middle; more on a stage wider than that. */
const PAD = 600
/** The room for a name above a mock at zoom 1 and more, in canvas pixels; zoomed out it keeps its size on screen. */
export const NAME_H = 34
/** The buttons' row under a mock, in canvas pixels: they zoom with it. */
export const BUTTONS_H = 80
/** How much of the ropes 100% shows above a mock's name and below its buttons, in canvas pixels. */
export const ROPE_SHOW = 36
/** A component's card in its box: as wide as a mock, this tall; its content scrolls inside. */
const COMPONENT_H = 200
/** A box's buttons stand right of it, today (boxes.ts). */
const RAIL_W = 60
const SVG_NS = 'http://www.w3.org/2000/svg'
/** Zoom levels, as the bar shows them: 100% is the current mock fitted (`hundred`). */
const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2
const STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2]
/** 100% never shows a mock larger than this many times its real size. */
const MAX_REAL = 1.5
/** Below this scale the boxes show less (.surface.far). */
const FAR = 0.5
/** The glide to another mock or box, in ms. */
const GLIDE_MS = 600
/** A narrow window (a phone); the drawer closes after an Edit there. */
export const PHONE = '(max-width: 720px)'

/** The room kept between a mock and the stage's edge: thin on a phone, where a mock fills the window. */
export const margin = (stageW: number) => (stageW < 720 ? 8 : 24)
/** The room above a mock for its name, in canvas pixels at scale z. */
export const headH = (z: number) => NAME_H / Math.min(1, z)
/** A mock's size from its project's device; a mock from before devices is 800 × 800. */
export const sizeOf = (d?: Device) => (d ? { w: DEVICES[d].width, h: DEVICES[d].height } : { w: LEGACY_WIDTH, h: VIEWPORT_H })

export interface Box { x: number; y: number; w: number; h: number }

/**
 * The scale of 100% on a stage w × h for mocks of a size: the mock with its name above, its buttons under it and some
 * of its ropes, as large as the stage allows, at most MAX_REAL. A name keeps its size on screen below scale 1.
 */
export function hundred(stageW: number, stageH: number, mock: { w: number; h: number }): number {
  const m = margin(stageW), W = stageW - 2 * m, H = stageH - 2 * m, k = mock.h + BUTTONS_H + 2 * ROPE_SHOW
  let zh = (H - NAME_H) / k
  if (zh > 1) zh = Math.max(1, H / (k + NAME_H))
  return Math.max(0.05, Math.floor(Math.min(MAX_REAL, W / mock.w, zh) * 100) / 100)
}

/** What 100% shows of a mock whose card is `card`: its name, the card, its buttons, and ropes above and below. */
export const frameOf = (card: Box, z: number): Box => {
  const top = headH(z) + ROPE_SHOW
  return { x: card.x, y: card.y - top, w: card.w, h: top + card.h + BUTTONS_H + ROPE_SHOW }
}

/** Where the view lands on a box (canvas pixels) at zoom z on a stage w × h: per axis centred when it fits, else its start `m` from the edge. */
export function landing(b: Box, z: number, w: number, h: number, m = margin(w)): { left: number; top: number } {
  const axis = (lo: number, size: number, room: number) => (size * z <= room - 2 * m ? (lo + size / 2) * z - room / 2 : lo * z - m)
  return { left: axis(b.x, b.w, w), top: axis(b.y, b.h, h) }
}

/** Where the glide to a mock ends: its 100% view (`frameOf`) centred at scale z. */
export const glideEnd = (card: Box, z: number, stageW: number, stageH: number) => landing(frameOf(card, z), z, stageW, stageH)

/** A point of the glide, a fraction t of its time in: a straight line, eased at both ends. */
export function glideAt(from: { left: number; top: number }, to: { left: number; top: number }, t: number) {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
  return { left: from.left + (to.left - from.left) * k, top: from.top + (to.top - from.top) * k }
}

/** Whether a point (canvas pixels) lies on one of the boxes. */
export const hit = (boxes: Box[], x: number, y: number) => boxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)

/** One step of two fingers: their middle and spread, before and now. The canvas follows the middle (scrolled by its
 *  way back, so the content moves with the fingers) and zooms by how the spread grew. */
export function touchStep(last: { x: number; y: number; d: number }, now: { x: number; y: number; d: number }) {
  return { zoom: last.d > 0 && now.d > 0 ? now.d / last.d : 1, dx: last.x - now.x, dy: last.y - now.y }
}

/**
 * The tree's places at scale z: rows top down, each the children of the row above in order, every row as tall as the
 * others; across, side by side, a first child below its parent when that place is free. `side` (the boxes) goes
 * right of the first root, in its row. A key whose parent is not here starts a tree of its own.
 */
export function placeTree(nodes: { key: string; parent: string | null }[], mock: { w: number; h: number }, z: number, sideW = 0, pad = PAD) {
  const keys = new Set(nodes.map((n) => n.key))
  const kids = new Map<string, string[]>(), parentOf = new Map<string, string>(), roots: string[] = []
  for (const n of nodes) {
    if (n.parent && keys.has(n.parent) && n.parent !== n.key) {
      kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.key])
      parentOf.set(n.key, n.parent)
    } else roots.push(n.key)
  }
  const depth = new Map<string, number>()
  const walk = (k: string, d: number) => {
    if (depth.has(k)) return
    depth.set(k, d)
    for (const c of kids.get(k) ?? []) walk(c, d + 1)
  }
  for (const r of roots) walk(r, 0)
  const rows: string[][] = [roots.filter((r) => depth.get(r) === 0)]
  while (rows.at(-1)!.length) rows.push(rows.at(-1)!.flatMap((k) => (kids.get(k) ?? []).filter((c) => depth.get(c) === rows.length)))
  rows.pop()
  const head = headH(z), pitch = head + mock.h + BUTTONS_H + GAP_Y
  const cards = new Map<string, Box>()
  let maxX = pad, side: { x: number; y: number } | null = null
  rows.forEach((row, d) => {
    let cursor = pad
    const y = pad + head + d * pitch
    for (const k of row) {
      const p = parentOf.get(k), first = p != null && kids.get(p)![0] === k
      const x = Math.max(cursor, first ? cards.get(p)!.x : cursor)
      cards.set(k, { x, y, w: mock.w, h: mock.h })
      cursor = x + mock.w + GAP_X
      if (sideW && d === 0 && k === row[0]) { side = { x: cursor, y }; cursor += sideW + GAP_X }
      maxX = Math.max(maxX, cursor - GAP_X)
    }
  })
  const extent: Box = { x: pad, y: pad, w: Math.max(0, maxX - pad), h: rows.length ? rows.length * pitch - GAP_Y : 0 }
  return { cards, kids, rows, side: side as { x: number; y: number } | null, extent }
}

/** Down from (x1, y1) to yRow, then one S-curve to (x2, yEnd), upright at both ends, then straight down to y2; straight
 *  all the way when x1 is x2. */
export function curve(x1: number, y1: number, x2: number, yRow: number, y2: number, yEnd = y2): string {
  if (Math.abs(x2 - x1) < 1) return `M${x1} ${y1} V${y2}`
  const m = (yRow + yEnd) / 2
  return `M${x1} ${y1} V${yRow} C${x1} ${m} ${x2} ${m} ${x2} ${yEnd}` + (y2 > yEnd ? ` V${y2}` : '')
}

/** The rope from parent card a to child card b: from a's bottom middle down past its buttons, one S-curve in the gap
 *  above b's name, then down to b's top middle. Every row is as tall as the others, so the ropes into a row bend alike. */
export function rope(a: Box, b: Box, z: number): string {
  const yEnd = b.y - headH(z) - 6 / z
  return curve(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, Math.min(a.y + a.h + BUTTONS_H, yEnd), b.y, yEnd)
}

export interface ScreenView {
  key: string
  parent: string | null
  /** The short name on its tag (*Camera*); a component's ID. */
  name: string
  /** Its project's size; none for a mock from before devices. */
  device?: Device
  current: boolean
  /** A design streams into it: its controls do nothing, and 🎲 ✏️ ⏪ are grey. */
  streaming: boolean
  /** In the Components box, not the tree. */
  component?: boolean
  /** Changed since the user last looked at its box. */
  fresh?: boolean
  /** The tour: every button grey. */
  tour?: boolean
  /** The button whose card shows (cards.ts): dark. */
  pressed?: string | null
  /** Open comments on it, counted on ℹ️ (*ℹ️ 2*). */
  comments?: number
}

interface CanvasHandlers {
  /** A click in a drawn mock on a control with an action. */
  action: (key: string, prompt: string, label: string) => void
  /** A press in a mock: it becomes the current one. */
  focus: (key: string) => void
  /** One of the buttons under the current mock, pressed; grey ones too (the handler says why they wait). */
  tool: (key: string, name: string) => void
  /** The zoom level changed, as the bar shows it (1 is 100%). */
  zoomed: (level: number) => void
}

/** The buttons under the current mock: name, icon, label, tooltip. */
export const BUTTONS: [string, string, string, string][] = [
  ['another', '🎲', 'Another', 'Another design of this mock, from the same words'],
  ['edit', '✏️', 'Edit', 'Say what should change in this mock'],
  ['history', '⏪', 'History', 'Undo: bring back the version before'],
  ['info', 'ℹ️', 'Info', 'What this mock was asked for and how it was drawn'],
]

/** A screen by its key, or a box by its element. */
type Target = string | HTMLElement

/** The comments' pins (comments.ts): told when a mock's frame is rebuilt, when it scrolled, and its answers to `locate`. */
export const pinHook = { rebuilt: (_key: string) => {}, size: (_key: string) => {}, located: (_key: string, _d: any) => {} }

/** A card: its name tag and its mock's frame, positioned and never moved in the DOM (that reloads the frame). */
function newCard(key: string) {
  const name = el('b', 'name')
  const frame = el('iframe')
  frame.setAttribute('sandbox', FRAME_SANDBOX)
  frame.title = 'Generated mock'
  // A mock is laid out at its real size and only scaled: its text wraps the same at every zoom.
  Object.assign(frame.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' })
  const pins = el('div', 'pins')
  const screen = el('div', 'screen', frame, pins)
  return { el: el('article', 'card', el('div', 'head', name), screen), name, screen, frame, pins, key, view: null as ScreenView | null,
    w: 0, h: 0, shown: null as { html: string; final: boolean; css: string } | null }
}
type Card = ReturnType<typeof newCard>

/** Undo the canvas's zoom inside a frame and scale it instead: the browser lays the mock out once, unzoomed. */
function unzoom(frame: HTMLIFrameElement, z: number) {
  frame.style.zoom = String(1 / z)
  frame.style.transform = z === 1 ? '' : `scale(${z})`
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export class Canvas {
  private surface = el('div', 'surface')
  private lines = document.createElementNS(SVG_NS, 'svg')
  private cards = new Map<string, Card>()
  private acts = el('div', 'acts')
  private screens: ScreenView[] = []
  private busy = false
  /** Each mock's card from the last layout, in canvas pixels. */
  private places = new Map<string, Box>()
  private extent: Box = { x: 0, y: 0, w: 0, h: 0 }
  /** The size of the project's mocks. */
  private mock = sizeOf('small-phone')
  private queued = false
  /** The surface's CSS zoom, the real scale. Its own coordinates (positions, lines) are unzoomed. */
  private z = 1
  /** The glide under way. */
  private gliding = 0
  /** A tap on the sky left nothing current: no ring, no buttons, until something becomes current again. */
  private loose = false
  /** When the user last scrolled, dragged or zoomed the canvas (performance.now()); fits do not count. */
  moved = 0
  /** The last view was 100% of the current mock or box, and nothing moved by hand since: a resize shows it so again. */
  private fitted = false

  /** `stage` scrolls (its content is replaced on first render); `side` holds the boxes; component cards go in `components`. */
  constructor(private stage: HTMLElement, private on: CanvasHandlers, private side: HTMLElement, private components: HTMLElement) {
    this.lines.classList.add('lines')
    this.surface.append(this.lines, side, this.acts)
    for (const [name, icon, label, title] of BUTTONS) {
      const b = el('button', 'act', el('i', '', icon), label)
      b.type = 'button'
      b.title = title
      b.dataset.act = name
      b.addEventListener('click', () => { const k = this.acts.dataset.key; if (k) this.on.tool(k, name) })
      this.acts.append(b)
    }
    new ResizeObserver(() => this.queue()).observe(side)
    this.surface.style.setProperty('--z', '1')
    addEventListener('message', (e) => this.onFrameMessage(e))
    new ResizeObserver(() => this.queue()).observe(stage)
    // The window really changed size (or moved to another display): 100% again, unless the user zoomed or panned by
    // hand since. A keyboard that opens on a phone changes only the height while a field has the focus: no reason to move.
    let w0 = innerWidth, h0 = innerHeight, timer: ReturnType<typeof setTimeout> | undefined
    const resized = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; this.refit() }, 150)
    }
    addEventListener('resize', () => {
      const typing = document.activeElement?.matches('input, textarea, select, [contenteditable], iframe')
      const across = innerWidth !== w0, down = innerHeight !== h0
      w0 = innerWidth
      h0 = innerHeight
      if (across || (down && !typing)) resized()
    })
    const watchDpr = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { resized(); watchDpr() }, { once: true })
    watchDpr()
    const byHand = () => { this.moved = performance.now(); this.fitted = false; this.stopGlide() }
    // Pinch (a wheel with ctrlKey in Chrome and Firefox) and Ctrl/Cmd + scroll zoom around the pointer.
    stage.addEventListener('wheel', (e) => {
      byHand()
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
      this.setScale(z0 * g.scale, g.clientX, g.clientY)
    })
    // One finger on the sky pans it as the browser scrolls; two fingers pan it too and zoom by their spread, around
    // their middle (a mock hands its two-finger touches on, see the frame).
    let spread: { d: number; z: number } | null = null
    const apart = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY)
    stage.addEventListener('touchstart', (e) => { byHand(); spread = e.touches.length === 2 ? { d: apart(e.touches), z: this.z } : null }, { passive: true })
    stage.addEventListener('touchmove', (e) => {
      byHand()
      if (!spread || e.touches.length !== 2 || !spread.d) return
      e.preventDefault()
      const t = e.touches
      this.setScale(spread.z * apart(t) / spread.d, (t[0]!.clientX + t[1]!.clientX) / 2, (t[0]!.clientY + t[1]!.clientY) / 2)
    }, { passive: false })
    // Dragging the sky pans it; a press on the sky that does not drag leaves nothing current.
    stage.addEventListener('pointerdown', (e) => {
      if ((e.target !== stage && e.target !== this.surface && e.target !== this.lines) || (e.pointerType !== 'touch' && e.button !== 0)) return
      const x0 = e.clientX, y0 = e.clientY, l0 = stage.scrollLeft, t0 = stage.scrollTop
      let dragged = false
      const move = (m: PointerEvent) => {
        if (Math.abs(m.clientX - x0) + Math.abs(m.clientY - y0) > 6) dragged = true
        if (e.pointerType === 'touch' || !dragged) return
        byHand()
        stage.scrollTo(l0 - (m.clientX - x0), t0 - (m.clientY - y0))
      }
      const up = () => {
        stage.classList.remove('panning')
        for (const [n, f] of [['pointermove', move], ['pointerup', up], ['pointercancel', up]] as const) stage.removeEventListener(n, f as EventListener)
        if (!dragged && stage.scrollLeft === l0 && stage.scrollTop === t0) this.setLoose(true)
      }
      if (e.pointerType !== 'touch') { stage.setPointerCapture(e.pointerId); stage.classList.add('panning') }
      stage.addEventListener('pointermove', move)
      stage.addEventListener('pointerup', up)
      stage.addEventListener('pointercancel', up)
    })
  }

  private setLoose(on: boolean) {
    if (this.loose === on) return
    this.loose = on
    this.surface.classList.toggle('loose', on)
    this.layout(false)
  }

  /** The scale of 100% on this stage for this project's mocks. */
  private base = () => hundred(this.stage.clientWidth || innerWidth, this.stage.clientHeight || innerHeight, this.mock)

  /** The current box's element, else the current mock's key. */
  private currentTarget(): Target | undefined {
    return this.side.querySelector<HTMLElement>('.box.current') ?? this.screens.find((s) => s.current && !s.component)?.key
  }

  /** What 100% shows of a mock (its name, buttons and ropes), a box with its buttons, or a component's card. */
  private frame(t: Target): Box | undefined {
    if (t instanceof HTMLElement) { const b = this.elBox(t); return { ...b, h: b.h + BUTTONS_H } } // a box and its buttons
    const card = this.places.get(t)
    if (card) return frameOf(card, this.z)
    const comp = this.cards.get(t)
    return comp && this.components.contains(comp.el) ? this.elBox(comp.el) : undefined
  }

  /** Zoom to a level (1 is 100%), around a point (x, y) on the window, a pinch's; without one (the menu, + and −,
   *  the keys) around the current mock or box when it is in view, else the middle of the view. */
  setZoom(level: number, x?: number, y?: number) {
    const b = this.base()
    level = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(level * 100) / 100))
    // 100% from the menu or ⌘0 is the starting view: the current mock or box with its name, buttons and ropes.
    const t = x == null && level === 1 ? this.currentTarget() : undefined
    if (t && this.frame(t)) return this.fit(t)
    if (x == null || y == null) {
      const st = this.stage, r = st.getBoundingClientRect(), t = this.currentTarget(), f = t && this.frame(t)
      const cx = f ? (f.x + f.w / 2) * this.z - st.scrollLeft : NaN, cy = f ? (f.y + f.h / 2) * this.z - st.scrollTop : NaN
      const seen = cx >= 0 && cx <= st.clientWidth && cy >= 0 && cy <= st.clientHeight
      x = r.left + (seen ? cx : st.clientWidth / 2)
      y = r.top + (seen ? cy : st.clientHeight / 2)
    }
    this.setScale(level * b, x, y)
  }

  /** Zoom to a real scale, around a point on the window: that point stays in place. */
  private setScale(z: number, x: number, y: number) {
    this.moved = performance.now()
    this.fitted = false
    this.stopGlide()
    const b = this.base()
    z = Math.min(MAX_ZOOM * b, Math.max(MIN_ZOOM * b, z))
    if (Math.abs(z - this.z) < 0.001) return
    const st = this.stage, r = st.getBoundingClientRect()
    const ax = x - r.left, ay = y - r.top
    let px = (st.scrollLeft + ax) / this.z, py = (st.scrollTop + ay) / this.z
    // Names keep their size on screen zoomed out, so rows shift with the zoom: follow the nearest mock.
    const near = this.nearest(px, py), before = near && { ...this.places.get(near)! }
    this.applyZoom(z)
    const after = near && this.places.get(near)
    if (before && after) { px += after.x - before.x; py += after.y - before.y }
    st.scrollLeft = px * z - ax
    st.scrollTop = py * z - ay
  }

  private nearest(px: number, py: number): string | undefined {
    let best: string | undefined, dist = Infinity
    for (const [k, b] of this.places) {
      const dx = Math.max(b.x - px, 0, px - b.x - b.w), dy = Math.max(b.y - py, 0, py - b.y - b.h)
      if (dx * dx + dy * dy < dist) { dist = dx * dx + dy * dy; best = k }
    }
    return best
  }

  /** + and −: the next level up or down. */
  step(dir: 1 | -1) {
    const l = this.z / this.base()
    const next = dir > 0 ? STEPS.find((s) => s > l + 0.001) : [...STEPS].reverse().find((s) => s < l - 0.001)
    this.setZoom(next ?? l)
  }

  private applyZoom(z: number) {
    this.z = z
    this.surface.style.zoom = String(z)
    for (const c of this.cards.values()) unzoom(c.frame, z)
    this.surface.style.setProperty('--z', String(z))
    this.surface.classList.toggle('far', z < FAR)
    this.layout(false) // names keep their size on screen zoomed out, so the room they need changes
    this.on.zoomed(z / this.base())
  }

  private zoomBy(dy: number, x: number, y: number) {
    this.setScale(this.z * Math.exp(-dy * 0.01), x, y)
  }

  /** A mock's place with its name, buttons and ropes, a box's with its buttons, or the whole tree's without a key. */
  box(key?: Target): Box | undefined {
    if (key == null) return this.extent.w ? this.extent : undefined
    return this.frame(key)
  }

  /**
   * Without a key, Fit all: the whole tree and the boxes. With one, 100%: that mock (or box) with its name, buttons
   * and ropes as large as the stage allows, at once. Options from before are taken and ignored.
   */
  fit(key?: Target, _old?: object) {
    if (this.queued) this.layout(false)
    const st = this.stage
    if (key === undefined) {
      // Names keep their size on screen, so the tree's height changes with the zoom; a few rounds settle it.
      for (let i = 0; i < 4; i++) {
        const e = this.box()
        if (!e) return
        const m = margin(st.clientWidth), b = this.base()
        const z = Math.min(MAX_ZOOM * b, Math.max(MIN_ZOOM * b, Math.floor(Math.min((st.clientWidth - 2 * m) / e.w, (st.clientHeight - 2 * m) / e.h, MAX_REAL) * 100) / 100))
        if (Math.abs(z - this.z) < 0.001) break
        this.applyZoom(z)
      }
      const e = this.box()!, to = landing(e, this.z, st.clientWidth, st.clientHeight)
      this.stopGlide()
      st.scrollTo({ left: to.left, top: to.top })
      this.fitted = false
      return
    }
    const b = this.base()
    if (Math.abs(b - this.z) >= 0.001) this.applyZoom(b)
    else this.on.zoomed(1)
    this.setLoose(false)
    const f = this.frame(key)
    if (!f) return
    const to = landing(f, this.z, st.clientWidth, st.clientHeight)
    this.stopGlide()
    st.scrollTo({ left: to.left, top: to.top })
    this.fitted = true
  }

  /** After the window changed size: 100% of the current mock or box again, unless the user moved the canvas since. */
  private refit() {
    const t = this.currentTarget()
    if (this.fitted && t) return this.fit(t)
    this.on.zoomed(this.z / this.base())
  }

  /** Where an element inside the surface sits, in canvas pixels. */
  private elBox(el: HTMLElement): Box {
    let x = 0, y = 0
    for (let e: HTMLElement | null = el; e && e !== this.surface; e = e.offsetParent as HTMLElement | null) { x += e.offsetLeft; y += e.offsetTop }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight }
  }

  /** The glide to a box that became current. */
  showBox(el: HTMLElement) {
    this.reveal(el)
  }

  /** Glide to a mock or a box that became current, at the zoom the user has: a straight line, 0.6 s; a jump with the
   *  system's reduced motion, or with `smooth` false. */
  reveal(key: Target, smooth = true) {
    if (this.queued) this.layout(false)
    this.setLoose(false)
    const f = this.frame(key)
    if (!f) return
    const st = this.stage, to = landing(f, this.z, st.clientWidth, st.clientHeight)
    // The canvas can show no more than its own size: the glide ends where the scroll can go.
    to.left = Math.max(0, Math.min(to.left, st.scrollWidth - st.clientWidth))
    to.top = Math.max(0, Math.min(to.top, st.scrollHeight - st.clientHeight))
    this.glide(to, smooth && !reduced())
  }

  private stopGlide() {
    if (this.gliding) cancelAnimationFrame(this.gliding)
    this.gliding = 0
  }

  private glide(to: { left: number; top: number }, smooth: boolean) {
    this.stopGlide()
    const st = this.stage, from = { left: st.scrollLeft, top: st.scrollTop }
    if (!smooth || (Math.abs(to.left - from.left) < 1 && Math.abs(to.top - from.top) < 1)) return st.scrollTo(to)
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = (now - t0) / GLIDE_MS, p = glideAt(from, to, t)
      st.scrollTo(p)
      this.gliding = t < 1 ? requestAnimationFrame(tick) : 0
    }
    this.gliding = requestAnimationFrame(tick)
  }

  /** Draw the mocks. Cards are kept and only moved, so unchanged mocks do not reload. */
  render(screens: ScreenView[], busy: boolean) {
    if (this.surface.parentElement !== this.stage) this.stage.replaceChildren(this.surface)
    const before = this.currentTarget()
    this.screens = screens
    this.busy = busy
    const first = screens.find((s) => !s.component && !s.parent) ?? screens.find((s) => !s.component)
    const mock = sizeOf(first?.device)
    const sized = mock.w !== this.mock.w || mock.h !== this.mock.h
    this.mock = mock
    const ids = new Set(screens.map((s) => s.key))
    for (const [id, c] of this.cards) if (!ids.has(id)) { c.el.remove(); this.cards.delete(id) }
    for (const s of screens) {
      const c = this.card(s.key, s.component ? this.components : this.surface)
      c.view = s
      c.el.dataset.id = s.key
      const size = s.component ? { w: mock.w, h: COMPONENT_H } : mock
      if (c.w !== size.w || c.h !== size.h) {
        c.w = size.w
        c.h = size.h
        Object.assign(c.frame.style, { width: `${size.w}px`, height: `${size.h}px` })
        Object.assign(c.screen.style, { width: `${size.w}px`, height: `${size.h}px` })
        if (s.component) c.el.style.width = `${size.w}px`
      }
      for (const [cls, on] of Object.entries({ fresh: s.fresh, streaming: s.streaming, current: s.current })) c.el.classList.toggle(cls, !!on)
      c.name.textContent = s.name
      c.name.title = s.name
      c.name.hidden = !s.name
      c.pins.hidden = s.streaming
    }
    // Something else became current: the sky's tap is forgotten.
    if (this.currentTarget() !== before) this.setLoose(false)
    this.layout()
    if (sized) this.on.zoomed(this.z / this.base())
  }

  /** Put a mock into its card's frame, unless it shows it already. */
  show(id: string, html: string, final: boolean, css: string) {
    const c = this.cards.get(id), s = c?.shown
    if (!c || (s && s.html === html && s.final === final && s.css === css)) return
    c.shown = { html, final, css }
    c.pins.replaceChildren()
    c.el.classList.remove('above', 'below')
    pinHook.rebuilt(c.key)
    c.frame.srcdoc = framePage(html, css, final)
  }

  /** A mock's card and its screen, where cards.ts lays the card it flips to. */
  face(key: string) {
    const c = this.cards.get(key)
    return c ? { el: c.el, screen: c.screen } : null
  }

  /** A drawn, finished mock's frame and the layer of its pins; null while it streams. */
  pinTarget(key: string) {
    const c = this.cards.get(key)
    return c?.view && !c.view.streaming && c.shown?.final ? { win: c.frame.contentWindow, layer: c.pins } : null
  }

  private queue() {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => { this.queued = false; this.layout() })
  }

  /** The current target was in view before a layout: if the layout moved it out, it comes back. */
  private seen(t: Target | undefined): boolean {
    const b = t && this.frame(t), st = this.stage, z = this.z
    return !!b && b.x * z < st.scrollLeft + st.clientWidth && (b.x + b.w) * z > st.scrollLeft && b.y * z < st.scrollTop + st.clientHeight && (b.y + b.h) * z > st.scrollTop
  }

  /** Place the tree, the boxes and the buttons, size the canvas, draw the ropes; `keep`: a current mock or box that
   *  was in view stays in view. */
  private layout(keep = true) {
    const t = keep ? this.currentTarget() : undefined, was = keep && !this.gliding && this.seen(t)
    const z = this.z, mock = this.mock
    const screens = this.screens.filter((s) => !s.component)
    // The Components box is as wide as a mock and its rail; a box is as tall as Home.
    this.components.parentElement!.style.width = `${mock.w + 50 + RAIL_W}px`
    const side = !this.side.hidden && screens.length > 0
    if (side) this.side.style.setProperty('--box-h', `${mock.h}px`)
    const st = this.stage, pad = Math.ceil(Math.max(PAD, st.clientWidth / z / 2, st.clientHeight / z / 2))
    const p = placeTree(screens, mock, z, side ? this.side.offsetWidth + RAIL_W : 0, pad)
    this.places = p.cards
    this.extent = { ...p.extent }
    if (side && p.side) {
      Object.assign(this.side.style, { left: `${p.side.x}px`, top: `${p.side.y}px` })
      this.extent.h = Math.max(this.extent.h, p.side.y - pad + this.side.offsetHeight)
    }
    for (const s of screens) {
      const b = p.cards.get(s.key), c = this.cards.get(s.key)
      if (b && c) Object.assign(c.el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` })
    }
    this.placeButtons()
    // The canvas reaches past the tree, and at least fills the stage, so any mock can be centred.
    const w = this.extent.x + this.extent.w + pad, h = this.extent.y + this.extent.h + pad
    this.surface.style.width = `${w}px`
    this.surface.style.height = `${h}px`
    this.drawLines(p.kids)
    if (was && t && !this.seen(t)) this.reveal(t, false)
  }

  /** The four buttons under the current mock, centred; none with nothing current, or a box or a component current. */
  private placeButtons() {
    const s = this.screens.find((x) => x.current && !x.component), b = s && this.places.get(s.key)
    this.acts.hidden = !b || this.loose
    if (!s || !b) return void delete this.acts.dataset.key
    this.acts.dataset.key = s.key
    Object.assign(this.acts.style, { left: `${b.x}px`, top: `${b.y + b.h}px`, width: `${b.w}px`, height: `${BUTTONS_H}px` })
    for (const btn of this.acts.querySelectorAll<HTMLButtonElement>('.act')) {
      const name = btn.dataset.act!
      const off = !!s.tour || ((this.busy || s.streaming) && name !== 'info')
      btn.classList.toggle('off', off)
      btn.setAttribute('aria-disabled', String(off))
      btn.classList.toggle('on', s.pressed === name)
      if (name === 'info') btn.lastChild!.textContent = s.comments ? `Info ${s.comments}` : 'Info'
    }
  }

  /** A rope from each mock to its parent, drawn twice: the strand and its twist. */
  private drawLines(kids: Map<string, string[]>) {
    const svg = this.lines
    svg.setAttribute('width', this.surface.style.width)
    svg.setAttribute('height', this.surface.style.height)
    const parts: SVGElement[] = []
    for (const [p, list] of kids) {
      const a = this.places.get(p)
      if (!a) continue
      for (const k of list) {
        const b = this.places.get(k)
        if (!b) continue
        const d = rope(a, b, this.z)
        for (const cls of ['line', 'line twist']) {
          const path = document.createElementNS(SVG_NS, 'path')
          path.setAttribute('d', d)
          path.setAttribute('class', cls)
          parts.push(path)
        }
      }
    }
    svg.replaceChildren(...parts)
  }

  private card(id: string, parent: HTMLElement): Card {
    const c = this.cards.get(id) ?? newCard(id)
    if (!this.cards.has(id)) { parent.append(c.el); this.cards.set(id, c); unzoom(c.frame, this.z) }
    return c
  }

  /** The last middle and spread of two fingers a frame handed on, on the window. */
  private touch: { x: number; y: number; d: number } | null = null

  /** Clicks, links out, scroll edges, keys and gestures from a mock's frame (see the frame script). */
  private onFrameMessage(e: MessageEvent) {
    const d = e.data
    if (typeof d?.uxwoz !== 'string') return
    let c: Card | undefined
    for (const x of this.cards.values()) if (x.frame.contentWindow === e.source) c = x
    if (!c) return
    if (d.uxwoz === 'scroll') {
      // An edge with more beyond it: flat corners, and it fades into the sky.
      c.el.classList.toggle('above', !!d.above)
      c.el.classList.toggle('below', !!d.below)
      if (this.pinTarget(c.key)) pinHook.size(c.key)
    } else if (d.uxwoz === 'located' && this.pinTarget(c.key)) {
      pinHook.located(c.key, d)
    } else if (d.uxwoz === 'key' && typeof d.key === 'string' && typeof d.code === 'string') {
      // A key pressed in a mock, handed on as if pressed in the app.
      dispatchEvent(new KeyboardEvent('keydown', { key: d.key, code: d.code, shiftKey: !!d.shift, metaKey: !!d.mod }))
    } else if (d.uxwoz === 'touch') {
      this.setLoose(false)
      this.on.focus(c.key)
    } else if (d.uxwoz === 'zoom') {
      // Coordinates inside the frame, in its own pixels; the frame is shown at the canvas's scale.
      const r = c.frame.getBoundingClientRect(), k = r.width / (c.frame.offsetWidth || 1)
      this.moved = performance.now()
      this.zoomBy(Number(d.dy) || 0, r.left + (Number(d.x) || 0) * k, r.top + (Number(d.y) || 0) * k)
    } else if (d.uxwoz === 'pinch') {
      // Two fingers over the mock: their middle and spread in the frame's pixels, put on the window as the frame is
      // now, so the canvas moving under the fingers does not count as the fingers moving.
      const r = c.frame.getBoundingClientRect(), k = r.width / (c.frame.offsetWidth || 1)
      const now = { x: r.left + (Number(d.x) || 0) * k, y: r.top + (Number(d.y) || 0) * k, d: (Number(d.d) || 0) * k }
      const last = d.start ? null : this.touch
      this.touch = now
      this.moved = performance.now()
      this.fitted = false
      this.stopGlide()
      if (!last) return
      const s = touchStep(last, now)
      if (s.zoom !== 1) this.setScale(this.z * s.zoom, now.x, now.y)
      this.stage.scrollBy(s.dx, s.dy)
    } else if (d.uxwoz === 'wheel') {
      // Nothing under the pointer in the mock could scroll that way: the gesture scrolls the canvas.
      this.moved = performance.now()
      this.fitted = false
      this.stopGlide()
      this.stage.scrollBy(Number(d.dx) || 0, Number(d.dy) || 0)
    } else if (d.uxwoz === 'open' && typeof d.url === 'string' && /^https?:\/\/\S+$/i.test(d.url) && d.url.length <= 2000) {
      open(d.url, '_blank', 'noopener,noreferrer')
    } else if (d.uxwoz === 'action' && typeof d.prompt === 'string' && !c.view?.streaming) {
      this.on.action(c.key, d.prompt.slice(0, 500), typeof d.label === 'string' ? d.label.slice(0, 80) : '')
    }
  }
}
