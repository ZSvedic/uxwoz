// The canvas: every screen on one panning, zooming surface, a tree with a row per level, a first child
// below its parent when there is room, a rope from each screen to its parent that bends only in the gap below.
// Names keep their size on screen; rails scale with the canvas. Right of the first screen: the boxes (boxes.ts).

import { DEFAULT_DEVICE, DEVICES, FRAME_SANDBOX, framePage, type Device } from '@uxwoz/core/frame'
import { button, el, railOf } from './boxes.ts'

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
/** A rail's width, in canvas pixels; the OR's least width, in pixels on screen. */
const RAIL_W = 60
const OR_MIN = 120
/** Margin so any screen can be scrolled to the middle. */
const PAD = 600
/** Where ropes leave and bent ropes enter a screen: apart, so a rope into a screen below another parent does not run on from it. */
const LINE_X = 40
const ENTRY_X = 110
/** Label height above a screen and above a side, in pixels on screen. */
const LABEL_H = 62
const IDEA_H = 76
/** On a narrow window a side's idea has a line more: its card is as wide as the window, its words whole. */
const IDEA_PHONE = 104
let ideaH = IDEA_H
/** A narrow window (a phone): A OR B one above the other, the current screen as wide as the window, its rail a row under it. */
export const PHONE = '(max-width: 720px)'
const isPhone = () => typeof matchMedia === 'function' && matchMedia(PHONE).matches
/** On a narrow window: the room for the OR between the sides, in pixels on screen; the rail's row, in canvas pixels. */
const OR_H = 130
const RAIL_ROW = 60
/** Below this zoom a screen shows only its name (.surface.far). */
const FAR = 0.5
const NAME_H = 26
const labelH = (z: number) => (z < FAR ? NAME_H : LABEL_H)
/** The ivory frame drawn round a screen, in canvas pixels: the head stands above it. */
const FRAME = 8
/** The room above a screen (a side's idea or a name), in canvas pixels. */
export const headH = (choice: boolean, z: number) => (choice ? ideaH : labelH(z)) / z + FRAME
const SVG_NS = 'http://www.w3.org/2000/svg'
const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2
const STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2]
/** A fit of a tall screen never goes below this zoom, unless the screen's width needs less: its text stays readable. */
export const READABLE = 0.75
/** The room kept between a screen and the stage's edge when the view moves to it, in pixels on screen. */
const EDGE = 24

/** Where the view lands on a box (canvas pixels) at zoom z on a stage w × h: per axis centred when it fits, else its start `m` from the edge. */
export function landing(b: Box, z: number, w: number, h: number, m = EDGE): { left: number; top: number } {
  const axis = (lo: number, size: number, room: number) => (size * z <= room - 2 * m ? (lo + size / 2) * z - room / 2 : lo * z - m)
  return { left: axis(b.x, b.w, w), top: axis(b.y, b.h, h) }
}

/** On one axis, whether a box from lo to hi (pixels on screen) is seen in a view from `at`, `size` long: all of it, or its
 *  start when it is longer than the view, or it covers the view. */
export const seenOn = (lo: number, hi: number, at: number, size: number) =>
  (lo >= at - 1 && (hi <= at + size + 1 || (hi - lo > size && lo < at + size))) || (lo <= at + 1 && hi >= at + size - 1)

/** Where the sides of an A OR B sit, from the top left of its place, and where the OR goes: side by side with `orW`
 *  between them, or on a narrow window one above the other, with the OR (`orH`) and the lower side's idea (`head`) between. */
export function sidesOf(parts: { w: number; h: number }[], narrow: boolean, orW: number, orH: number, head: number) {
  if (!narrow) {
    const at = parts.map((_, i) => ({ x: parts.slice(0, i).reduce((t, p) => t + p.w + orW, 0), y: 0 }))
    const h = Math.max(...parts.map((p) => p.h))
    return { w: parts.reduce((t, p) => t + p.w, 0) + orW * (parts.length - 1), h, at, or: { x: parts[0]!.w, y: 0, w: orW, h: Math.min(h, 700) } }
  }
  const at = parts.map((_, i) => ({ x: 0, y: parts.slice(0, i).reduce((t, p) => t + p.h + orH + head, 0) }))
  const w = Math.max(...parts.map((p) => p.w))
  return { w, h: at.at(-1)!.y + parts.at(-1)!.h, at, or: { x: 0, y: parts[0]!.h, w, h: orH } }
}

/** The zoom that fits a box on a stage. A narrow window keeps a thin margin and fits a screen by its width alone. */
export function fitOf(stageW: number, stageH: number, box: { w: number; h: number }, narrow: boolean, screen: boolean,
  o: { max?: number; top?: boolean; snug?: boolean } = {}): number {
  const m = narrow ? 8 : 48
  return fitZoom((stageW - 2 * m) / box.w, (stageH - 2 * m) / box.h, narrow && screen ? { max: o.max, top: true } : o)
}

/** Whether a point (canvas pixels) lies on one of the boxes. */
export const hit = (boxes: Box[], x: number, y: number) => boxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)

/** The first of the targets whose box shows, any of it, in a view (pixels on screen) at zoom z. */
export function firstSeen<T>(targets: [T, Box | undefined][], z: number, v: { left: number; top: number; w: number; h: number }): T | undefined {
  return targets.find(([, b]) => b && b.x * z < v.left + v.w && (b.x + b.w) * z > v.left && b.y * z < v.top + v.h && (b.y + b.h) * z > v.top)?.[0]
}

/** One step of a touch gesture a frame handed on: the point on the window and the fingers' spread, before and now. A
 *  pan scrolls the canvas by the finger's way back (the content follows the finger); a pinch zooms by how the spread grew. */
export function touchStep(last: { x: number; y: number; d: number }, now: { x: number; y: number; d: number }, pinch: boolean) {
  return pinch ? { zoom: last.d > 0 && now.d > 0 ? now.d / last.d : 1, dx: 0, dy: 0 } : { zoom: 1, dx: last.x - now.x, dy: last.y - now.y }
}

/** The zoom of a fit: the width's and the height's, at most `max`. `top`: the width alone. `snug`: the height too, but at
 *  least 60% of the width's fit and at least READABLE (or the width's fit when that is less). */
export function fitZoom(zw: number, zh: number, { max = 1, top = false, snug = false } = {}): number {
  const z = Math.min(max, MAX_ZOOM, zw, top ? Infinity : snug ? Math.max(zh, 0.6 * zw, Math.min(zw, READABLE)) : zh)
  return Math.max(MIN_ZOOM, Math.floor(z * 100) / 100)
}

export interface CardView {
  /** The screen's key, or `key#0` and `key#1` for the sides of its A OR B. */
  id: string
  width: number
  device?: Device
  /** e.g. "L2 Camera"; '' for a side. */
  name: string
  idea: string
  /** For a side: which one, and whether it finished (may be picked). */
  side?: { index: number; pickable: boolean }
  /** Why a side failed; shown instead of the screen. */
  error?: string
  /** A button under those words (Register, Ask for more). */
  act?: { text: string; run: () => void }
  streaming: boolean
  /** A component: as tall as its content. */
  fit?: boolean
}

export interface ScreenView {
  key: string
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

interface CanvasHandlers {
  /** A click in a picked screen on a control that opens another screen. */
  action: (key: string, prompt: string, label: string) => void
  pick: (key: string, side: number) => void
  /** Drop both designs of an open A OR B. */
  cancel: (key: string) => void
  /** A press in a screen: it becomes the current one. */
  focus: (key: string) => void
  tool: (key: string, name: string) => void
  zoomed: (zoom: number) => void
}

export interface Box { x: number; y: number; w: number; h: number }
/** A screen by its key, or a box by its element. */
type Target = string | HTMLElement

/** The comments' pins (comments.ts): told when a screen's frame is rebuilt, when a picked one has its size, and its answers to `locate`. */
export const pinHook = { rebuilt: (_key: string) => {}, size: (_key: string) => {}, located: (_key: string, _d: any) => {} }
export interface View { z: number; left: number; top: number }

/**
 * A card: name, screen and rail, positioned and never moved in the DOM (that reloads the frame). `more`
 * unfolds a long idea; `shield` lies over a side's frame and takes the click that picks it; `sized`:
 * the final screen has reported its size since it was shown.
 */
function newCard(key: string, on: CanvasHandlers) {
  const name = el('b', 'name'), idea = el('span', 'idea'), note = el('span', 'note'), error = el('div', 'error-box')
  const more = button('more', '', () => { more.textContent = head.classList.toggle('open') ? 'less' : 'more' }, 'more')
  more.hidden = true
  const head = el('div', 'head', name, el('div', 'idea-row', idea, more), note)
  const frame = el('iframe')
  frame.setAttribute('sandbox', FRAME_SANDBOX)
  frame.title = 'Generated screen'
  frame.style.height = `${START_H}px`
  // A screen is laid out at zoom 1, at its device's width, and only scaled: its text wraps the same at every zoom.
  Object.assign(frame.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' })
  const shield = el('div', 'shield', el('span', 'pick-hint', 'Pick this design'))
  const pins = el('div', 'pins')
  const screen = el('div', 'screen', frame, pins, shield)
  screen.style.height = screenH(START_H)
  const { el: rail, tools } = railOf(RAIL, (tool) => on.tool(c.key, tool))
  const c = {
    el: el('article', 'card', head, screen, error, rail), name, idea, more, note, screen, frame, pins, shield, error, rail, tools, key,
    view: null as CardView | null, width: 0, height: START_H, shown: null as { html: string; final: boolean; css: string } | null, sized: false,
  }
  shield.addEventListener('click', () => { if (c.view?.side?.pickable) on.pick(c.key, c.view.side.index) })
  return c
}
type Card = ReturnType<typeof newCard>

/** The height of a card's screen around a frame `h` tall: the frame and its border (1 px on screen) above and below. */
const screenH = (h: number) => `calc(${h}px + 2px / var(--z))`

/** Undo the canvas's zoom inside a frame and scale it instead: the browser lays the screen out once, unzoomed. */
function unzoom(frame: HTMLIFrameElement, z: number) {
  frame.style.zoom = String(1 / z)
  frame.style.transform = z === 1 ? '' : `scale(${z})`
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
  /** From the last layout: each screen's row bottom, where its ropes start to bend. */
  private rowBottom = new Map<string, number>()
  private ropeEnd = new Map<string, number>()
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
    stage.addEventListener('scroll', () => this.measure(), { passive: true })
    // The window really changed size (or moved to another display): fit again what was in view before (see `refit`).
    // A keyboard that opens on a phone changes only the height while a field, in the app or in a screen, has the focus:
    // that is no reason to move.
    let w0 = innerWidth, h0 = innerHeight, timer: ReturnType<typeof setTimeout> | undefined, was: Target | undefined
    const resized = () => {
      if (timer === undefined) was = this.inView // what showed before this burst of resizes
      clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; this.refit(was) }, 150)
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
    // Two fingers on the canvas outside a screen zoom around their middle (a screen hands its touches on, see the frame).
    let spread: { d: number; z: number } | null = null
    const apart = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY)
    stage.addEventListener('touchstart', (e) => { spread = e.touches.length === 2 ? { d: apart(e.touches), z: this.z } : null }, { passive: true })
    stage.addEventListener('touchmove', (e) => {
      if (!spread || e.touches.length !== 2 || !spread.d) return
      e.preventDefault()
      const t = e.touches
      this.setZoom(spread.z * apart(t) / spread.d, (t[0]!.clientX + t[1]!.clientX) / 2, (t[0]!.clientY + t[1]!.clientY) / 2)
    }, { passive: false })
    // Dragging the empty canvas pans it; a finger pans it as the browser scrolls.
    stage.addEventListener('pointerdown', (e) => {
      this.moved = performance.now()
      if (e.button !== 0 || e.pointerType === 'touch' || (e.target !== stage && e.target !== this.surface && e.target !== this.lines)) return
      const x0 = e.clientX, y0 = e.clientY, l0 = stage.scrollLeft, t0 = stage.scrollTop
      stage.setPointerCapture(e.pointerId)
      stage.classList.add('panning')
      const move = (m: PointerEvent) => stage.scrollTo(l0 - (m.clientX - x0), t0 - (m.clientY - y0))
      const up = () => {
        stage.classList.remove('panning')
        for (const [n, f] of [['pointermove', move], ['pointerup', up], ['pointercancel', up]] as const) stage.removeEventListener(n, f as EventListener)
      }
      stage.addEventListener('pointermove', move)
      stage.addEventListener('pointerup', up)
      stage.addEventListener('pointercancel', up)
    })
  }

  /** When the user last scrolled, dragged or zoomed the canvas (performance.now()); fits do not count. */
  moved = 0
  /** Whether the current screen or box (`seenOf`) was in view after the last layout, fit or scroll (see `keepSeen`). */
  private seen = false
  private seenOf: Target | undefined
  /** After the last layout, fit or scroll, the first of the open A OR B, the current box and the current screen that showed. */
  private inView: Target | undefined
  /** A narrow window, as of the last layout. */
  private narrow = false

  /** The current box's element, else the current screen's key. */
  private currentTarget(): Target | undefined {
    return this.side.querySelector<HTMLElement>('.box.current') ?? this.screens.find((s) => s.current)?.key
  }

  /** The room kept at the stage's edge when the view moves to a screen: thin on a narrow window, where a screen fills it. */
  private edge = () => (this.narrow ? 8 : EDGE)

  /** The open A OR B's key. */
  private choice = () => this.screens.find((s) => s.cards[0]?.side)?.key

  private currentSeen(): boolean {
    const t = this.currentTarget(), b = t && this.box(t)
    if (!b) return false
    const st = this.stage, z = this.z
    return seenOn(b.x * z, (b.x + b.w) * z, st.scrollLeft, st.clientWidth) && seenOn(b.y * z, (b.y + b.h) * z, st.scrollTop, st.clientHeight)
  }

  /** What is in view now: the current target's `seen`, and `inView` for a resize. */
  private measure() {
    this.seenOf = this.currentTarget()
    this.seen = this.currentSeen()
    const st = this.stage, cur = this.screens.find((s) => s.current)?.key, box = this.side.querySelector<HTMLElement>('.box.current') ?? undefined
    const targets: [Target | undefined, Box | undefined][] = [[this.choice(), undefined], [box, undefined], [cur, undefined]]
    for (const t of targets) t[1] = t[0] ? this.box(t[0]) : undefined
    this.inView = firstSeen(targets, this.z, { left: st.scrollLeft, top: st.scrollTop, w: st.clientWidth, h: st.clientHeight })
  }

  /** After a layout: the current screen or box that was in view and no longer is (it grew, the stage got narrower) comes
   *  back on the axis it left: centred when it fits, else its start. One that just became current was measured for no one. */
  private keepSeen() {
    const t = this.currentTarget(), b = t && this.box(t)
    if (b && t === this.seenOf && this.seen && !this.currentSeen()) {
      const st = this.stage, z = this.z, to = landing(b, z, st.clientWidth, st.clientHeight, this.edge())
      st.scrollTo({
        left: seenOn(b.x * z, (b.x + b.w) * z, st.scrollLeft, st.clientWidth) ? st.scrollLeft : to.left,
        top: seenOn(b.y * z, (b.y + b.h) * z, st.scrollTop, st.clientHeight) ? st.scrollTop : to.top,
      })
    }
    this.measure()
  }

  /** Fit again after the window changed size: what was in view before (the open A OR B, the current box, the current
   *  screen, the first that showed) as on opening; with none of them in view, the view stays. */
  private refit(t: Target | undefined) {
    if (t instanceof HTMLElement) { if (t.isConnected) this.fit(t, { top: true }) }
    else if (t && this.screens.some((s) => s.key === t)) this.fit(t, t === this.choice() ? { top: true } : { snug: true })
  }

  /**
   * Zoom to `z`. Around a point (x, y), a pinch's, that point stays in place. Without one (the menu, + and −, the keys),
   * around the middle of the view when a screen or a box is there; over the empty sky, the view lands on the open A OR B,
   * else the current box or screen: centred when it fits, else its top left corner. With none, the middle stays.
   */
  setZoom(z: number, x?: number, y?: number) {
    this.moved = performance.now()
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
    if (z === this.z) return
    const st = this.stage, r = st.getBoundingClientRect()
    const mid = () => {
      const px = (st.scrollLeft + st.clientWidth / 2) / this.z, py = (st.scrollTop + st.clientHeight / 2) / this.z
      const all = [...this.boxes.keys()].map((k) => this.box(k)!).concat(this.side.hidden ? [] : [this.box(this.side)!])
      return hit(all, px, py)
    }
    const cur = x == null && !mid() ? this.choice() ?? this.currentTarget() : undefined
    if (cur && this.box(cur)) {
      this.applyZoom(z)
      const to = landing(this.box(cur)!, z, st.clientWidth, st.clientHeight, this.edge())
      st.scrollLeft = to.left
      st.scrollTop = to.top
      this.measure()
      return
    }
    const ax = x == null ? st.clientWidth / 2 : x - r.left, ay = y == null ? st.clientHeight / 2 : y - r.top
    let px = (st.scrollLeft + ax) / this.z, py = (st.scrollTop + ay) / this.z
    // Names keep their size on screen, so screens shift with the zoom: follow the nearest one.
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
    for (const c of this.cards.values()) unzoom(c.frame, z)
    this.surface.style.setProperty('--z', String(z))
    this.surface.classList.toggle('far', z < FAR)
    this.layout() // names keep their size on screen, so the room they need changes
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

  /** A screen's place with the names above it and its rail, a box's with its rail, or the whole tree's without a key. */
  box(key?: string | HTMLElement): Box | undefined {
    if (key instanceof HTMLElement) return { ...this.elBox(key), w: key.offsetWidth + RAIL_W }
    if (key == null) return this.extent.w ? this.extent : undefined
    const comp = this.cards.get(key)
    const b = this.boxes.get(key) ?? (comp && this.components.contains(comp.el) ? this.elBox(comp.el) : undefined)
    if (!b) return undefined
    const choice = !!this.screens.find((s) => s.key === key)?.cards[0]?.side
    const above = headH(choice, this.z)
    // On a narrow window the rail is a row under the screen, in its place already.
    return { x: b.x, y: b.y - above, w: b.w + (choice || this.narrow ? 0 : RAIL_W), h: b.h + above }
  }

  /** Zoom and scroll so a screen (or the tree) fills the stage, at most `max`. `top`: fit the width, show the top. `snug`:
   *  the height too, at least 60% of the width's fit. On a narrow window a screen or an A OR B fits by its width. */
  fit(key?: string | HTMLElement, { max = 1, top = false, snug = false } = {}) {
    const st = this.stage
    if (this.queued) this.layout(false) // sizes that arrived since the last frame count
    const screen = typeof key === 'string'
    if (this.narrow && screen) top = true
    // Names keep their size on screen, so the box changes with the zoom; a few rounds settle it.
    for (let i = 0; i < 4; i++) {
      const box = this.box(key)
      if (!box) return
      const next = fitOf(st.clientWidth, st.clientHeight, box, this.narrow, screen, { max, top, snug })
      if (next === this.z) break
      this.applyZoom(next)
    }
    const box = this.box(key)
    if (box) this.center(top ? { ...box, h: Infinity } : box)
    this.measure()
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
    this.fit(el, { top: true })
  }

  private center(b: Box, smooth = false) {
    const st = this.stage
    const top = b.h * this.z > st.clientHeight - 48 ? b.y * this.z - 24 : (b.y + b.h / 2) * this.z - st.clientHeight / 2
    st.scrollTo({ left: (b.x + b.w / 2) * this.z - st.clientWidth / 2, top, behavior: smooth ? 'smooth' : 'auto' })
  }

  /** Scroll a screen or a box into view if any of it is out of view (its top first, if it is taller than the stage). */
  reveal(key: string | HTMLElement, smooth = true) {
    // The layout waiting for the next frame runs now, but leaves the scrolling to this one: the least needed, gliding.
    if (this.queued) this.layout(false)
    const b = this.box(key)
    if (!b) return
    const st = this.stage, z = this.z, m = this.edge()
    // On a narrow window a screen wider than the window fits its width instead.
    if (this.narrow && typeof key === 'string' && b.w * z > st.clientWidth + 1) return this.fit(key)
    // Per axis: stay when it is in view, else show its start (when it does not fit) or its middle.
    const axis = (lo: number, hi: number, at: number, size: number) => (lo >= at + m && hi <= at + size - m ? at : hi - lo > size - 2 * m ? lo - m : (lo + hi) / 2 - size / 2)
    const left = axis(b.x * z, (b.x + b.w) * z, st.scrollLeft, st.clientWidth), top = axis(b.y * z, (b.y + b.h) * z, st.scrollTop, st.clientHeight)
    if (left !== st.scrollLeft || top !== st.scrollTop) st.scrollTo({ left, top, behavior: smooth ? 'smooth' : 'auto' })
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
        c.el.dataset.id = v.id
        if (c.width !== v.width) { c.width = v.width; c.frame.style.width = `${v.width}px` }
        // A component card flows in its box: only its width is set.
        if (s.component) c.el.style.width = c.screen.style.width = `${v.width}px`
        for (const [cls, on] of Object.entries({ fresh: s.fresh, side: v.side, pickable: v.side?.pickable, streaming: v.streaming, current: s.current && !v.side })) c.el.classList.toggle(cls, !!on)
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
        c.error.replaceChildren(v.error ?? '')
        if (v.error && v.act) {
          const b = el('button', 'primary', v.act.text) as HTMLButtonElement
          b.type = 'button'
          b.addEventListener('click', v.act.run)
          c.error.append(el('p', '', b))
        }
        c.error.hidden = !v.error
        c.screen.hidden = !!v.error
        c.shield.title = v.side ? (v.side.pickable ? 'Pick this design' : 'Wait until it is finished') : ''
        c.rail.hidden = !!v.side
        c.pins.hidden = !!v.side || v.streaming
        c.tools[2]!.hidden = !s.undo
        c.tools[1]!.hidden = !!s.component
        c.tools[4]!.title = s.component ? 'Delete this component: screens that paste it show nothing in its place' : RAIL[4]![2]
        for (const b of c.tools) b.disabled = busy && b.dataset.tool !== 'info'
      }
      if (choices.has(s.key) && !this.ors.has(s.key)) {
        const o = el('div', 'or')
        o.append(el('b', '', 'OR'), button('✕', 'Drop both designs', () => this.on.cancel(o.dataset.key!), 'drop'))
        o.dataset.key = s.key
        this.surface.append(o)
        this.ors.set(s.key, o)
      }
    }
    this.layout()
  }

  /** Put a screen into a card's frame, unless it shows it already. */
  show(id: string, html: string, final: boolean, css: string) {
    const c = this.cards.get(id), s = c?.shown
    if (!c || (s && s.html === html && s.final === final && s.css === css)) return
    c.shown = { html, final, css }
    c.sized = false
    c.pins.replaceChildren()
    pinHook.rebuilt(c.key)
    c.frame.srcdoc = framePage(html, css, final, c.view?.device, c.view?.fit)
  }

  /** A picked, finished screen's frame and the layer of its pins; null while it streams, and for an A OR B side. */
  pinTarget(key: string) {
    const c = this.cards.get(key)
    return c?.view && !c.view.side && !c.view.streaming && c.shown?.final ? { win: c.frame.contentWindow, layer: c.pins } : null
  }

  /** A card takes another id, keeping its frame: the picked side becomes the screen. */
  rename(from: string, to: string) {
    const c = this.cards.get(from)
    if (!c || from === to) return
    this.cards.get(to)?.el.remove()
    this.cards.delete(from)
    this.cards.set(to, c)
    c.el.dataset.id = to
  }

  private queue() {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => { this.queued = false; this.layout() })
  }

  /** Place the tree and the boxes, size the canvas, draw the lines; `keep`: then keep the current screen in view. */
  private layout(keep = true) {
    const z = this.z, narrow = this.narrow = isPhone()
    ideaH = narrow ? IDEA_PHONE : IDEA_H
    // At a low zoom, the OR needs more of the canvas than its fixed room gives.
    const orW = Math.max(OR_W, OR_MIN / z)
    const screens = this.screens.filter((s) => !s.component)
    // The Components box is as wide as a screen of the mockup and its rail; the boxes' rails go in the gaps.
    const devW = Math.max(DEVICES[DEFAULT_DEVICE].width, ...this.screens.filter((s) => s.component || !s.parent).map((s) => s.cards[0]?.width ?? 0))
    this.components.parentElement!.style.width = `${devW + 50 + RAIL_W}px`
    const sizes = new Map<string, ReturnType<typeof sidesOf> & { parts: { id: string; w: number; h: number }[] }>()
    for (const s of screens) {
      // A picked screen on a narrow window has its rail's row under it.
      const row = narrow && s.cards.length === 1 ? RAIL_ROW : 0
      const parts = s.cards.map((v) => ({ id: v.id, w: this.cards.get(v.id)!.width, h: (v.error ? FAILED_H : this.cards.get(v.id)!.height) + row }))
      sizes.set(s.key, { ...sidesOf(parts, narrow, orW, OR_H / z, headH(true, z)), parts })
    }
    // The tree from the parents; a screen whose parent is not here starts a tree of its own, to the right.
    const keys = new Set(screens.map((s) => s.key))
    const kids = new Map<string, string[]>()
    const roots: string[] = []
    const parentOf = new Map<string, string>()
    for (const s of screens) {
      if (s.parent && keys.has(s.parent) && s.parent !== s.key) {
        kids.set(s.parent, [...(kids.get(s.parent) ?? []), s.key])
        parentOf.set(s.key, s.parent)
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
    // A box is at most as tall as the first screen (and one device screen); the rest scrolls inside it.
    const home = this.screens.find((s) => s.key === rows[0]?.[0])
    if (side) this.side.style.setProperty('--box-h', `${Math.max(sizes.get(home!.key)!.h, DEVICES[home!.cards[0]?.device ?? DEFAULT_DEVICE].height)}px`)
    let maxX = PAD, sideX = PAD
    for (const row of rows) {
      let cursor = PAD
      for (const k of row) {
        const p = parentOf.get(k), first = p != null && kids.get(p)![0] === k
        const x = Math.max(cursor, first ? xs.get(p)! : cursor)
        xs.set(k, x)
        cursor = x + sizes.get(k)!.w + GAP_X
        if (side && k === rows[0]![0]) { sideX = cursor; cursor += this.side.offsetWidth + GAP_X }
        maxX = Math.max(maxX, cursor - GAP_X)
      }
    }
    // Each row holds the names above its screens, which keep their size on screen.
    const rowH = rows.map((row, d) => Math.max(d || !side ? 0 : this.side.offsetHeight, ...row.map((k) => sizes.get(k)!.h)))
    const above = (d: number) => headH(rows[d]!.some((k) => sizes.get(k)!.parts.length > 1), z)
    const rowY: number[] = []
    let y = PAD
    for (let d = 0; d < rows.length; d++) {
      y += above(d)
      rowY[d] = y
      y += rowH[d]! + GAP_Y
    }
    this.rowBottom.clear()
    this.ropeEnd.clear()
    rows.forEach((row, d) => row.forEach((k) => {
      this.boxes.set(k, { x: xs.get(k)!, y: rowY[d]!, w: sizes.get(k)!.w, h: sizes.get(k)!.h })
      this.rowBottom.set(k, rowY[d]! + rowH[d]!)
      this.ropeEnd.set(k, rowY[d]! - above(d) - 6 / z)
    }))
    y -= rows.length ? GAP_Y : 0
    Object.assign(this.side.style, { left: `${sideX}px`, top: `${rowY[0] ?? PAD}px` })
    this.extent = { x: PAD, y: PAD, w: Math.max(0, maxX - PAD), h: Math.max(0, y - PAD) }
    for (const s of screens) {
      const b = this.boxes.get(s.key)
      if (!b) continue
      const { parts, at, or } = sizes.get(s.key)!
      parts.forEach((p, i) => {
        const c = this.cards.get(p.id)!
        Object.assign(c.el.style, { left: `${b.x + at[i]!.x}px`, top: `${b.y + at[i]!.y}px`, width: `${p.w}px`, height: `${p.h}px` })
        c.screen.style.width = `${p.w}px`
      })
      const o = this.ors.get(s.key)
      if (o) Object.assign(o.style, { left: `${b.x + or.x}px`, top: `${b.y + or.y}px`, width: `${or.w}px`, height: `${or.h}px` })
    }
    // The canvas reaches past the tree, and at least fills the stage, so any screen can be centred.
    const w = Math.max(maxX + PAD, this.stage.clientWidth / z), h = Math.max(y + PAD, this.stage.clientHeight / z)
    this.surface.style.width = `${w}px`
    this.surface.style.height = `${h}px`
    this.drawLines(kids)
    if (keep) this.keepSeen()
    // Show "more" by each idea cut off at two lines; the room it has changes with the zoom.
    requestAnimationFrame(() => { for (const c of this.cards.values()) c.more.hidden = !!c.view?.side || (c.more.textContent !== 'less' && c.idea.scrollHeight <= c.idea.clientHeight + 1) })
  }

  /** A rope from each screen to its parent, drawn twice: the strand and its twist. */
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
        const d = rope(a, b, z, choice, this.rowBottom.get(p) ?? a.y + a.h, this.ropeEnd.get(k) ?? b.y)
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

  private card(id: string, key: string, parent: HTMLElement): Card {
    const c = this.cards.get(id) ?? newCard(key, this.on)
    if (!this.cards.has(id)) { parent.append(c.el); this.cards.set(id, c); unzoom(c.frame, this.z) }
    return c
  }

  /** The last point (and spread) of a touch gesture a frame handed on, on the window. */
  private touch: { x: number; y: number; d: number } | null = null

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
      if (c.height !== h) {
        c.height = h
        c.frame.style.height = `${h}px`
        c.screen.style.height = screenH(h)
        this.queue()
      }
      if (this.pinTarget(c.el.dataset.id ?? '')) pinHook.size(c.key)
    } else if (d.uxwoz === 'located' && this.pinTarget(c.el.dataset.id ?? '')) {
      pinHook.located(c.key, d)
    } else if (d.uxwoz === 'key' && typeof d.key === 'string' && typeof d.code === 'string') {
      // A key pressed in a screen, handed on as if pressed in the app.
      dispatchEvent(new KeyboardEvent('keydown', { key: d.key, code: d.code, shiftKey: !!d.shift, metaKey: !!d.mod }))
    } else if (d.uxwoz === 'touch') {
      if (!c.view?.side) this.on.focus(c.key)
    } else if (d.uxwoz === 'zoom') {
      // Coordinates inside the frame, in its own pixels; the frame is shown at the canvas's zoom.
      const r = c.frame.getBoundingClientRect(), k = r.width / (c.frame.offsetWidth || 1)
      this.zoomBy(Number(d.dy) || 0, r.left + (Number(d.x) || 0) * k, r.top + (Number(d.y) || 0) * k)
    } else if (d.uxwoz === 'pan' || d.uxwoz === 'pinch') {
      // A finger dragging, or two pinching, over the screen: points in the frame's pixels, put on the window as the
      // frame is now, so the canvas moving under the finger does not count as the finger moving.
      const r = c.frame.getBoundingClientRect(), k = r.width / (c.frame.offsetWidth || 1)
      const now = { x: r.left + (Number(d.x) || 0) * k, y: r.top + (Number(d.y) || 0) * k, d: (Number(d.d) || 0) * k }
      const last = d.start ? null : this.touch
      this.touch = now
      this.moved = performance.now()
      if (!last) return
      const s = touchStep(last, now, d.uxwoz === 'pinch')
      if (s.zoom !== 1) this.setZoom(this.z * s.zoom, now.x, now.y)
      else this.stage.scrollBy(s.dx, s.dy)
    } else if (d.uxwoz === 'wheel') {
      // Nothing under the pointer in the screen could scroll that way: the gesture scrolls the canvas.
      this.moved = performance.now()
      this.stage.scrollBy(Number(d.dx) || 0, Number(d.dy) || 0)
    } else if (d.uxwoz === 'action' && typeof d.prompt === 'string' && !c.view?.side) {
      this.on.action(c.key, d.prompt.slice(0, 500), typeof d.label === 'string' ? d.label.slice(0, 80) : '')
    }
  }
}

/** Down from (x1, y1) to yRow, then one S-curve to (x2, yEnd), upright at both ends, then straight down to y2; straight
 *  all the way when x1 is x2. */
export function curve(x1: number, y1: number, x2: number, yRow: number, y2: number, yEnd = y2): string {
  if (Math.abs(x2 - x1) < 1) return `M${x1} ${y1} V${y2}`
  const m = (yRow + yEnd) / 2
  return `M${x1} ${y1} V${yRow} C${x1} ${m} ${x2} ${m} ${x2} ${yEnd}` + (y2 > yEnd ? ` V${y2}` : '')
}

/** The rope from parent box a to child box b. Every rope into a row bends down to the row's common end (`ropeEnd`: above
 *  the tallest head in the row), so ropes of a row keep their order; a shorter head is reached straight down. */
export function rope(a: Box, b: Box, z: number, choice: boolean, rowBottom: number, ropeEnd: number): string {
  const x1 = a.x + LINE_X, x2 = b.x + (Math.abs(b.x - a.x) < 1 ? LINE_X : ENTRY_X), y2 = b.y - headH(choice, z) - 6 / z
  const yEnd = Math.min(ropeEnd, y2)
  return curve(x1, a.y + a.h, x2, Math.min(rowBottom, yEnd), y2, yEnd)
}
