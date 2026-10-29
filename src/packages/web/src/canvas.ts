// The canvas: every screen of the mockup as a card, with a labelled arrow for each click that
// led from one screen to another. The current card is live; the others are previews you can click.
// A card is as tall as its screen, so only the canvas scrolls: drag or scroll to pan, pinch or
// Ctrl/Cmd + scroll to zoom, also over a screen.

import { FRAME_SANDBOX, framePage } from '@uxwoz/core/frame'
import { layoutMap, type Box } from '@uxwoz/core/layout'
import type { Link } from '@uxwoz/core'

/** Height of a card's title bar; the screen fills the rest of the card. */
const TITLE_H = 44
const MIN_SCALE = 0.05
const MAX_SCALE = 1.5
/** Limits on the height a screen may report, so a broken screen cannot make a huge card. */
const MIN_SCREEN_H = 160
const MAX_SCREEN_H = 8000

export interface CanvasScreen {
  key: string
  title: string
  /** Shown on hover: the prompt that made the screen. */
  tooltip: string
  /** Null while the screen is streaming: the canvas leaves its frame alone. */
  html: string | null
}

interface Card {
  el: HTMLElement
  frame: HTMLIFrameElement
  title: HTMLElement
  shown: { html: string; final: boolean; css: string } | null
  onLoad: (() => void) | null
  /** Growth reports in a row, each soon after the last: a screen whose height follows its window. */
  growth: { count: number; at: number }
  /** Set once that happens; the card then keeps its height until it shows a new screen. */
  frozen: boolean
}

/** A card that grows this many times in a row, each within GROWTH_MS of the last, stops growing. */
const GROWTH_LIMIT = 4
const GROWTH_MS = 1500

const svgNS = 'http://www.w3.org/2000/svg'

export class Canvas {
  private world: HTMLElement
  private svg: SVGSVGElement
  private labels: HTMLElement
  private cards = new Map<string, Card>()
  private boxes = new Map<string, Box>()
  private parent = new Map<string, string>()
  /** Card heights, from the heights the screens report. */
  private heights = new Map<string, number>()
  private keys: string[] = []
  private links: Link[] = []
  private scale = 1
  private tx = 0
  private ty = 0
  private current: string | null = null
  /** The last automatic view, redone when the canvas changes size; null once the user pans or zooms. */
  private autoView: (() => void) | null = null

  constructor(private viewport: HTMLElement, private onPick: (key: string) => void) {
    this.world = document.createElement('div')
    this.world.className = 'world'
    this.svg = document.createElementNS(svgNS, 'svg')
    this.svg.classList.add('links')
    this.labels = document.createElement('div')
    this.labels.className = 'link-labels'
    this.world.append(this.svg, this.labels)
    this.viewport.replaceChildren(this.world)
    this.wireGestures()
    new ResizeObserver(() => this.autoView?.()).observe(this.viewport)
    addEventListener('message', (e) => this.onFrameMessage(e))
  }

  /** Lay out and draw every card and arrow. Cards keep their frames, so unchanged screens do not reload. */
  update(screens: CanvasScreen[], links: Link[], css: string, current: string | null) {
    this.current = current
    this.keys = screens.map((s) => s.key)
    this.links = links
    const keep = new Set(this.keys)
    for (const [k, c] of this.cards) if (!keep.has(k)) { c.el.remove(); this.cards.delete(k); this.heights.delete(k) }
    for (const s of screens) {
      const card = this.card(s.key)
      card.el.classList.toggle('current', s.key === current)
      card.title.textContent = s.title
      card.el.title = s.tooltip
      if (s.html != null) this.show(s.key, s.html, true, css)
    }
    this.relayout()
  }

  /** Place the cards and draw the arrows again, e.g. after a screen reported a new height. */
  private relayout() {
    const { boxes, parent } = layoutMap(this.keys, this.links, this.heights)
    this.boxes = boxes
    this.parent = parent
    for (const [k, b] of boxes) {
      const el = this.cards.get(k)?.el
      if (el) Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` })
    }
    this.drawLinks(this.links)
  }

  /** Screens report their height and hand over scroll gestures (see the frame script). */
  private onFrameMessage(e: MessageEvent) {
    const d = e.data
    if (d?.uxwoz !== 'size' && d?.uxwoz !== 'wheel') return
    let key: string | null = null
    for (const [k, c] of this.cards) if (c.frame.contentWindow === e.source) key = k
    if (!key) return
    if (d.uxwoz === 'size' && Number.isFinite(d.height)) {
      const h = TITLE_H + Math.min(MAX_SCREEN_H, Math.max(MIN_SCREEN_H, Math.round(d.height)))
      const old = this.heights.get(key)
      if (old === h) return
      // A screen sized by its window (100% heights, script reading innerHeight) grows each time its
      // card grows. Stop that loop instead of following it to MAX_SCREEN_H.
      const card = this.cards.get(key)!
      if (old != null && h > old) {
        if (card.frozen) return
        const now = performance.now()
        card.growth = { count: now - card.growth.at < GROWTH_MS ? card.growth.count + 1 : 1, at: now }
        if (card.growth.count >= GROWTH_LIMIT) { card.frozen = true; return }
      }
      this.heights.set(key, h)
      this.relayout()
      this.autoView?.()
    } else if (d.uxwoz === 'wheel' && key === this.current) {
      // The frame's coordinates, scaled by the zoom, from the frame's corner on the canvas.
      const r = this.cards.get(key)!.frame.getBoundingClientRect()
      this.wheel(Number(d.dx) || 0, Number(d.dy) || 0, !!d.zoom, r.left + (Number(d.x) || 0) * this.scale, r.top + (Number(d.y) || 0) * this.scale)
    }
  }

  /** Put a screen into a card's frame; `onLoad` runs once the frame has loaded it. */
  show(key: string, html: string, final: boolean, css: string, onLoad?: () => void) {
    const card = this.card(key)
    if (onLoad) card.onLoad = onLoad
    const s = card.shown
    if (s && s.html === html && s.final === final && s.css === css) {
      // Nothing to reload, so no load event will come: report it as loaded now.
      if (onLoad) requestAnimationFrame(() => this.loaded(card))
      return
    }
    if (card.shown?.html !== html) { card.frozen = false; card.growth = { count: 0, at: 0 } }
    card.shown = { html, final, css }
    card.frame.srcdoc = framePage(html, css, final)
  }

  /** The window of a card's frame, to check where a postMessage came from. */
  frameWindow(key: string | null): Window | null {
    return key ? this.cards.get(key)?.frame.contentWindow ?? null : null
  }

  /**
   * Show the current screen at full width, its top near the top of the canvas, leaving room to see
   * the screen that led to it. Scroll to read further down.
   */
  focus(key = this.current, animate = true) {
    const b = key && this.boxes.get(key)
    if (!b) return
    this.autoView = () => this.focus(key, false)
    const { width: vw, height: vh } = this.viewport.getBoundingClientRect()
    if (!vw || !vh) return // not laid out yet: the resize observer calls again
    const scale = clamp(Math.min(1, (vw * 0.8) / b.w))
    // Shift right of centre when there is a parent, so its edge and the arrow stay in view.
    const cx = this.parent.has(key) ? vw * 0.56 : vw / 2
    this.setView(scale, cx - (b.x + b.w / 2) * scale, 16 - b.y * scale, animate)
  }

  /** Zoom out until every screen fits. */
  fitAll(animate = true) {
    if (!this.boxes.size) return
    this.autoView = () => this.fitAll(false)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const b of this.boxes.values()) {
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    y0 -= 260 // room for back arrows, which arc above the cards
    const { width: vw, height: vh } = this.viewport.getBoundingClientRect()
    if (!vw || !vh) return
    const scale = clamp(Math.min(1, (vw - 48) / (x1 - x0), (vh - 48) / (y1 - y0)))
    this.setView(scale, (vw - (x1 - x0) * scale) / 2 - x0 * scale, (vh - (y1 - y0) * scale) / 2 - y0 * scale, animate)
  }

  private card(key: string): Card {
    let c = this.cards.get(key)
    if (c) return c
    const el = document.createElement('section')
    el.className = 'card'
    el.dataset.key = key
    const title = document.createElement('div')
    title.className = 'card-title'
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', FRAME_SANDBOX)
    frame.title = 'Generated screen'
    // Previews are not clickable inside: a click on one makes it the current screen.
    const cover = document.createElement('div')
    cover.className = 'card-cover'
    el.append(title, frame, cover)
    this.world.appendChild(el)
    c = { el, frame, title, shown: null, onLoad: null, growth: { count: 0, at: 0 }, frozen: false }
    const card = c
    frame.addEventListener('load', () => this.loaded(card))
    this.cards.set(key, c)
    return c
  }

  private loaded(card: Card) {
    const f = card.onLoad
    card.onLoad = null
    f?.()
  }

  private drawLinks(links: Link[]) {
    this.svg.replaceChildren()
    this.labels.replaceChildren()
    const defs = document.createElementNS(svgNS, 'defs')
    defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="22" markerHeight="22" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>'
    this.svg.appendChild(defs)
    for (const l of links) {
      const a = this.boxes.get(l.from), b = this.boxes.get(l.to)
      if (!a || !b) continue
      const tree = this.parent.get(l.to) === l.from
      const [p0, c1, c2, p3] = curve(a, b, tree)
      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute('d', `M${p0} C${c1} ${c2} ${p3}`)
      path.setAttribute('marker-end', 'url(#arrow)')
      path.classList.add('link', tree ? 'tree' : 'back')
      if (l.from === this.current || l.to === this.current) path.classList.add('near')
      this.svg.appendChild(path)
      // The label sits at the curve's midpoint and keeps its screen size at any zoom.
      const mid = p0.map((_, i) => (p0[i]! + 3 * c1[i]! + 3 * c2[i]! + p3[i]!) / 8)
      const label = document.createElement('div')
      label.className = 'link-label'
      label.textContent = l.label
      label.style.left = `${mid[0]}px`
      label.style.top = `${mid[1]}px`
      this.labels.appendChild(label)
    }
  }

  private setView(scale: number, tx: number, ty: number, animate: boolean) {
    this.scale = scale
    this.tx = tx
    this.ty = ty
    this.world.classList.toggle('animate', animate)
    this.world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    this.world.style.setProperty('--inv', String(1 / scale))
  }

  /** Scroll pans; pinch or Ctrl/Cmd + scroll zooms around the pointer (page coordinates). */
  private wheel(dx: number, dy: number, zoom: boolean, clientX: number, clientY: number) {
    this.autoView = null
    if (zoom) {
      const r = this.viewport.getBoundingClientRect()
      const mx = clientX - r.left, my = clientY - r.top
      const s = clamp(this.scale * Math.exp(-dy * 0.01))
      this.setView(s, mx - ((mx - this.tx) * s) / this.scale, my - ((my - this.ty) * s) / this.scale, false)
    } else {
      this.setView(this.scale, this.tx - dx, this.ty - dy, false)
    }
  }

  private wireGestures() {
    const vp = this.viewport
    vp.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.wheel(e.deltaX, e.deltaY, e.ctrlKey || e.metaKey, e.clientX, e.clientY)
    }, { passive: false })

    let down: { x: number; y: number; tx: number; ty: number; target: EventTarget | null; id: number } | null = null
    let dragging = false
    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      down = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, target: e.target, id: e.pointerId }
      dragging = false
    })
    vp.addEventListener('pointermove', (e) => {
      if (!down) return
      const dx = e.clientX - down.x, dy = e.clientY - down.y
      if (!dragging && Math.hypot(dx, dy) < 4) return
      if (!dragging) { dragging = true; this.autoView = null; vp.setPointerCapture(down.id); vp.classList.add('dragging') }
      this.setView(this.scale, down.tx + dx, down.ty + dy, false)
    })
    const up = () => {
      const d = down
      down = null
      vp.classList.remove('dragging')
      if (!d || dragging) return
      const card = d.target instanceof Element ? d.target.closest<HTMLElement>('.card:not(.current)') : null
      if (card?.dataset.key) this.onPick(card.dataset.key)
    }
    vp.addEventListener('pointerup', up)
    vp.addEventListener('pointercancel', () => { down = null; vp.classList.remove('dragging') })
  }
}

const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

type Pt = [number, number]

/**
 * Forward arrows run from the right edge of one card to the left edge of the next. Arrows back
 * (to a screen in the same or an earlier column) arc above the cards, top centre to top centre.
 */
function curve(a: Box, b: Box, tree: boolean): [Pt, Pt, Pt, Pt] {
  if (tree || b.x > a.x + a.w) {
    // Near the top of a tall card, where you are looking when you arrive.
    const p0: Pt = [a.x + a.w, a.y + TITLE_H + Math.min(200, (a.h - TITLE_H) / 2)]
    const p3: Pt = [b.x, b.y + TITLE_H + Math.min(200, (b.h - TITLE_H) / 2)]
    const dx = Math.max(80, (p3[0] - p0[0]) / 2)
    return [p0, [p0[0] + dx, p0[1]], [p3[0] - dx, p3[1]], p3]
  }
  const p0: Pt = [a.x + a.w / 2, a.y]
  const p3: Pt = [b.x + b.w / 2 + (a.x === b.x ? 120 : 0), b.y]
  const lift = 180 + 0.12 * Math.abs(p3[0] - p0[0])
  const top = Math.min(a.y, b.y) - lift
  return [p0, [p0[0], top], [p3[0], top], p3]
}
