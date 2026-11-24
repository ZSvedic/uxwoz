// The canvas worked out with no page: rows of equal height, the 100% scale, where a glide ends, and the ropes.
import { describe, expect, test } from 'bun:test'
import { BUTTONS_H, NAME_H, ROPE_SHOW, curve, frameOf, glideAt, glideEnd, headH, hit, hundred, landing, placeTree, rope, sizeOf, touchStep } from '../packages/web/src/canvas.ts'

const small = sizeOf('small-phone'), laptop = sizeOf('laptop')

describe('rows', () => {
  // Home, two children, one of them with two children of its own, and a mock whose parent is not here.
  const nodes = [
    { key: 'home', parent: null }, { key: 'a', parent: 'home' }, { key: 'b', parent: 'home' },
    { key: 'a1', parent: 'a' }, { key: 'a2', parent: 'a' }, { key: 'lost', parent: 'gone' },
  ]

  for (const z of [0.3, 1, 1.5]) {
    test(`every row is as tall as the others, every mock the project's size, at ${z * 100}%`, () => {
      const p = placeTree(nodes, small, z)
      const ys = p.rows.map((row) => p.cards.get(row[0]!)!.y)
      for (const [k, b] of p.cards) expect([k, b.w, b.h]).toEqual([k, small.w, small.h])
      p.rows.forEach((row, d) => { for (const k of row) expect(p.cards.get(k)!.y).toBe(ys[d]!) })
      const pitch = ys[1]! - ys[0]!
      for (let d = 1; d < ys.length; d++) expect(ys[d]! - ys[d - 1]!).toBeCloseTo(pitch)
      // The names and the buttons fit in a row's room, the next row's names below them.
      expect(pitch).toBeGreaterThan(headH(z) + small.h + BUTTONS_H)
    })
  }

  test('a first child hangs below its parent, a second beside it; a parent never moves for its children', () => {
    const p = placeTree(nodes, small, 1)
    const at = (k: string) => p.cards.get(k)!
    expect(at('a').x).toBe(at('home').x)
    expect(at('a1').x).toBe(at('a').x)
    expect(at('b').x).toBeGreaterThan(at('a').x + small.w)
    expect(at('a2').x).toBeGreaterThan(at('a1').x)
    // A mock whose parent is not here is a root of its own, in the top row.
    expect(p.rows[0]).toEqual(['home', 'lost'])
  })

  test('the boxes stand right of Home in its row, and a child of Home that does not fit below it goes right, under them', () => {
    const p = placeTree(nodes, small, 1, 900)
    expect(p.side!.y).toBe(p.cards.get('home')!.y)
    expect(p.side!.x).toBeGreaterThan(p.cards.get('home')!.x + small.w)
    expect(p.cards.get('lost')!.x).toBeGreaterThan(p.side!.x + 900)
  })
})

describe('100%', () => {
  const fits = (z: number, stageW: number, stageH: number, mock: { w: number; h: number }) => {
    const f = frameOf({ x: 0, y: 0, ...mock }, z), e = glideEnd({ x: 0, y: 0, ...mock }, z, stageW, stageH)
    return f.w * z <= stageW && f.h * z <= stageH && e.left <= f.x * z && e.top <= f.y * z
  }

  test('a small phone mock on a phone fills its width, its name, buttons and ropes in view', () => {
    const z = hundred(375, 700, small)
    expect(z).toBeGreaterThan(0.95)
    expect(z * small.w).toBeLessThanOrEqual(375 - 16)
    expect(fits(z, 375, 700, small)).toBe(true)
  })

  test('a laptop mock on a laptop is about its real size; on a phone it is scaled down to fit', () => {
    const z = hundred(1440, 780, laptop)
    expect(z).toBeGreaterThan(0.9)
    expect(z).toBeLessThanOrEqual(1)
    expect(fits(z, 1440, 780, laptop)).toBe(true)
    expect(hundred(375, 700, laptop)).toBeLessThan(0.3)
  })

  test('a phone mock in a roomy window is larger, at most 1.5 times its real size', () => {
    expect(hundred(2560, 1400, small)).toBe(1.5)
    const z = hundred(1440, 900, small)
    expect(z).toBeGreaterThan(1)
    expect(z * (small.h + BUTTONS_H + 2 * ROPE_SHOW + NAME_H)).toBeLessThanOrEqual(900 - 48)
  })
})

describe('the glide', () => {
  test('ends with the mock, its name and its buttons centred in the view', () => {
    const card = { x: 2000, y: 1500, ...small }, z = hundred(390, 760, small)
    const end = glideEnd(card, z, 390, 760), f = frameOf(card, z)
    expect(end.left + 390 / 2).toBeCloseTo((f.x + f.w / 2) * z)
    expect(end.top + 760 / 2).toBeCloseTo((f.y + f.h / 2) * z)
    // The name is above the card, the buttons under it.
    expect(f.y).toBeLessThan(card.y - headH(z))
    expect(f.y + f.h).toBeGreaterThan(card.y + card.h + BUTTONS_H)
  })

  test('zoomed in past the view, it shows the start of the mock, never cuts it off at the left or the top', () => {
    const card = { x: 2000, y: 1500, ...small }, end = glideEnd(card, 3, 390, 760), f = frameOf(card, 3)
    expect(end).toEqual({ left: f.x * 3 - 8, top: f.y * 3 - 8 })
  })

  test('runs in a straight line, from where it starts to where it ends', () => {
    const a = { left: 100, top: 900 }, b = { left: 700, top: 300 }
    expect(glideAt(a, b, 0)).toEqual(a)
    expect(glideAt(a, b, 1)).toEqual(b)
    for (const t of [0.2, 0.5, 0.8]) {
      const p = glideAt(a, b, t)
      expect((p.left - a.left) / (b.left - a.left)).toBeCloseTo((p.top - a.top) / (b.top - a.top))
    }
  })

  test('a view lands centred when the box fits, else at its start', () => {
    const box = { x: 600, y: 600, w: 450, h: 930 }
    expect(landing(box, 0.5, 1280, 900).top + 450).toBeCloseTo((600 + 465) * 0.5)
    expect(landing(box, 1, 1280, 900).top).toBe(600 - 24)
  })
})

describe('touch and the pointer', () => {
  test('two fingers move the canvas with their middle and zoom by their spread', () => {
    expect(touchStep({ x: 100, y: 300, d: 100 }, { x: 110, y: 250, d: 100 })).toEqual({ zoom: 1, dx: -10, dy: 50 })
    expect(touchStep({ x: 0, y: 0, d: 100 }, { x: 0, y: 0, d: 150 }).zoom).toBe(1.5)
  })

  test('a zoom without a pointer stays put over a mock or a box', () => {
    const boxes = [{ x: 600, y: 600, w: 450, h: 930 }]
    expect(hit(boxes, 800, 1400)).toBe(true)
    expect(hit(boxes, 1200, 1400)).toBe(false)
  })
})

/** Points along a path of the form curve() writes: M, V, then at most one C and a last V. */
function sample(d: string): { x: number; y: number }[] {
  const n = d.match(/-?[\d.]+/g)!.map(Number)
  const [x1, y1, yRow] = n as [number, number, number]
  const points = [{ x: x1, y: y1 }]
  for (let i = 1; i <= 20; i++) points.push({ x: x1, y: y1 + ((yRow - y1) * i) / 20 })
  if (!d.includes('C')) return points
  const [, , , ax, ay, bx, by, x2, y2] = n as number[]
  for (let i = 1; i <= 100; i++) {
    const t = i / 100, u = 1 - t
    points.push({ x: u ** 3 * x1 + 3 * u * u * t * ax! + 3 * u * t * t * bx! + t ** 3 * x2!, y: u ** 3 * yRow + 3 * u * u * t * ay! + 3 * u * t * t * by! + t ** 3 * y2! })
  }
  const y3 = n[9]
  if (y3 != null) for (let i = 1; i <= 20; i++) points.push({ x: x2!, y: y2! + ((y3 - y2!) * i) / 20 })
  return points
}

describe('curve', () => {
  const cases = [[40, 600, 900, 750, 880], [900, 600, 40, 750, 880], [40, 600, 41.5, 640, 700]] as const
  for (const [x1, y1, x2, yRow, y2] of cases) {
    test(`from (${x1}, ${y1}) to (${x2}, ${y2}), bending below ${yRow}`, () => {
      const points = sample(curve(x1, y1, x2, yRow, y2))
      expect(points[0]).toEqual({ x: x1, y: y1 })
      const end = points.at(-1)!
      expect([Math.abs(end.x - x2) < 1e-9, Math.abs(end.y - y2) < 1e-9]).toEqual([true, true])
      for (const p of points) {
        expect(p.y >= y1 - 1e-9 && p.y <= y2 + 1e-9).toBe(true)
        expect(p.x >= Math.min(x1, x2) - 1e-9 && p.x <= Math.max(x1, x2) + 1e-9).toBe(true)
        if (p.y < yRow) expect(p.x).toBe(x1)
      }
    })
  }

  test('straight down when the child is in the parent column', () => {
    expect(curve(40, 600, 40, 750, 880)).toBe('M40 600 V880')
  })
})

describe('rope', () => {
  for (const z of [0.25, 1]) {
    test(`ropes into one row do not cross and bend below the buttons, above the names, at ${z * 100}%`, () => {
      const p = placeTree([{ key: 'h', parent: null }, { key: 'x', parent: null }, { key: 'h1', parent: 'h' }, { key: 'h2', parent: 'h' },
        { key: 'x1', parent: 'x' }], small, z)
      const c = (k: string) => p.cards.get(k)!
      const a = sample(rope(c('h'), c('h2'), z)), b = sample(rope(c('x'), c('x1'), z))
      let crossed = false
      for (const q of a) for (const r of b) if (Math.abs(q.y - r.y) < 0.5 && q.x > r.x) crossed = true
      expect(crossed).toBe(false)
      // The bend: every point off both ends' columns.
      for (const q of a) if (q.x !== a[0]!.x && q.x !== a.at(-1)!.x) {
        expect(q.y).toBeGreaterThanOrEqual(c('h').y + small.h + BUTTONS_H - 1e-9)
        expect(q.y).toBeLessThanOrEqual(c('h2').y - headH(z) + 1e-9)
      }
      // A first child below its parent: straight down.
      expect(rope(c('h'), c('h1'), z)).toMatch(/^M[\d.]+ [\d.]+ V[\d.]+$/)
    })
  }
})
