// The rope between a screen and its parent: down to the bottom of the parent's row, then one S-curve in the gap.
import { describe, expect, test } from 'bun:test'
import { READABLE, curve, firstSeen, fitOf, fitZoom, headH, hit, landing, rope, seenOn, sidesOf, touchStep } from '../packages/web/src/canvas.ts'

describe('where the view lands', () => {
  const phone = { x: 600, y: 600, w: 450, h: 930 }

  test('after a zoom, a screen that fits is centred; a taller one shows its top, a wider one its left edge', () => {
    // At 50% on a 1280 × 900 stage the phone fits: its middle is the stage's middle.
    const a = landing(phone, 0.5, 1280, 900)
    expect(a.left + 640).toBeCloseTo((600 + 225) * 0.5)
    expect(a.top + 450).toBeCloseTo((600 + 465) * 0.5)
    // At 100% it is taller than the stage: its top shows, 24 px down; across it still fits, so it is centred.
    const b = landing(phone, 1, 1280, 900)
    expect(b.top).toBe(600 - 24)
    expect(b.left).toBe(825 - 640)
    // At 200% on a narrow stage its left edge shows, never cut off.
    expect(landing(phone, 2, 700, 900).left).toBe(1200 - 24)
  })

  test('a screen is seen when all of it shows, or its start when it is longer, or it covers the view', () => {
    expect(seenOn(100, 500, 0, 1000)).toBe(true)
    expect(seenOn(100, 1500, 0, 1000)).toBe(true) // its start shows, it is longer than the view
    expect(seenOn(-200, 1500, 0, 1000)).toBe(true) // it covers the view
    expect(seenOn(700, 1100, 0, 1000)).toBe(false) // it fits, but its end is cut off
    expect(seenOn(-200, 300, 0, 1000)).toBe(false) // its start is cut off
    expect(seenOn(1200, 2600, 0, 1000)).toBe(false) // out of view
  })

  test('a snug fit keeps a tall screen readable unless its width needs less', () => {
    // A pair on a small window: the height alone gives 42%, the width allows 77%.
    expect(fitZoom(0.77, 0.42, { snug: true })).toBe(READABLE)
    // A narrow window: the width's fit is the floor.
    expect(fitZoom(0.5, 0.3, { snug: true })).toBe(0.5)
    // A phone screen on a laptop still fits at 100%, as before.
    expect(fitZoom(2.7, 0.6, { snug: true })).toBe(1)
    expect(fitZoom(0.77, 0.42)).toBe(0.42)
  })
})

describe('on a phone', () => {
  const phone = { w: 390, h: 900 }

  test('an A OR B stands one above the other, each as wide as the window allows, the OR between', () => {
    const wide = sidesOf([phone, phone], false, 160, 130, 90)
    expect(wide.at).toEqual([{ x: 0, y: 0 }, { x: 550, y: 0 }])
    expect(wide.w).toBe(940)
    const narrow = sidesOf([phone, phone], true, 160, 130, 90)
    expect(narrow.at).toEqual([{ x: 0, y: 0 }, { x: 0, y: 900 + 130 + 90 }])
    expect(narrow.w).toBe(390)
    expect(narrow.or).toEqual({ x: 0, y: 900, w: 390, h: 130 })
    // A 375 px window: the pair fits at 92% (was about 30% side by side), the height ignored.
    const z = fitOf(375, 700, { w: narrow.w, h: narrow.h + 100 }, true, true, { top: true })
    expect(z).toBe(0.92)
    expect(fitOf(375, 700, { w: wide.w, h: wide.h }, false, true, { top: true })).toBeLessThan(0.3)
  })

  test('a picked screen fits the window by its width, with its rail under it, never cut off at the right', () => {
    const z = fitOf(375, 700, { w: 390, h: 1000 }, true, true, { snug: true })
    expect(390 * z).toBeLessThanOrEqual(375)
    expect(z).toBeGreaterThan(0.9)
    // A wide window is as before: the snug fit keeps its height rule.
    expect(fitOf(1280, 900, { w: 450, h: 1000 }, false, true, { snug: true })).toBe(fitZoom((1280 - 96) / 450, (900 - 96) / 1000, { snug: true }))
  })

  test('a finger moves the canvas by its own way, back; two fingers zoom by their spread', () => {
    expect(touchStep({ x: 100, y: 300, d: 0 }, { x: 110, y: 250, d: 0 }, false)).toEqual({ zoom: 1, dx: -10, dy: 50 })
    expect(touchStep({ x: 0, y: 0, d: 100 }, { x: 0, y: 0, d: 150 }, true).zoom).toBe(1.5)
  })
})

describe('what the view keeps', () => {
  test('a zoom without a pointer stays put over a screen or a box, and lands only from the empty sky', () => {
    const boxes = [{ x: 600, y: 600, w: 450, h: 930 }]
    expect(hit(boxes, 800, 1400)).toBe(true)
    expect(hit(boxes, 1200, 1400)).toBe(false)
  })

  test('a resize fits again the first target that showed, any of it, else nothing', () => {
    const view = { left: 0, top: 0, w: 1000, h: 800 }
    const off = { x: 3000, y: 0, w: 400, h: 400 }, on = { x: 900, y: 700, w: 400, h: 400 }
    expect(firstSeen([['choice', undefined], ['box', off], ['screen', on]], 1, view)).toBe('screen')
    expect(firstSeen([['choice', on], ['screen', on]], 1, view)).toBe('choice')
    expect(firstSeen([['screen', off]], 1, view)).toBeUndefined()
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
    expect(curve(40, 600, 40.6, 750, 880)).toBe('M40 600 V880')
  })
})

describe('rope', () => {
  // Two parents side by side; below them one row with an A OR B (a tall idea above it) and a plain screen (a short name).
  // The ropes overlap across: the left parent's goes to the A OR B, the right parent's to the plain screen beyond it.
  for (const z of [0.1, 0.25]) {
    for (const [name, common] of [['the row', true], ['each child (as before)', false]] as const) {
      test(`ropes ending at ${name}'s height at ${z * 100}%: ${common ? 'no crossing, no head entered' : 'the test sees the fault'}`, () => {
        const p1 = { x: 600, y: 600, w: 400, h: 800 }, p2 = { x: 1120, y: 600, w: 400, h: 800 }, rowBottom = 1400
        const y = rowBottom + 150 + headH(true, z), end = common ? y - headH(true, z) - 6 / z : Infinity
        const choice = { x: 1700, y, w: 1000, h: 800 }, plain = { x: 2800, y, w: 400, h: 800 }
        const a = sample(rope(p1, choice, z, true, rowBottom, end)), b = sample(rope(p2, plain, z, false, rowBottom, end))
        // At every height both pass, the rope that starts left stays left.
        let crossed = false
        for (const p of a) for (const q of b) if (Math.abs(p.y - q.y) < 0.5 && p.x > q.x) crossed = true
        // Neither enters the other's head band.
        const band = (c: typeof choice, isChoice: boolean) => (p: { x: number; y: number }) =>
          p.x >= c.x && p.x <= c.x + c.w && p.y > c.y - headH(isChoice, z) - 1e-9
        const entered = a.some(band(plain, false)) || b.some(band(choice, true))
        expect(crossed || entered).toBe(!common)
        if (common) expect([crossed, entered]).toEqual([false, false])
      })
    }
  }
})
