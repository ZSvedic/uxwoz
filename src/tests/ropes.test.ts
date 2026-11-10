// The rope between a screen and its parent: down to the bottom of the parent's row, then one S-curve in the gap.
import { describe, expect, test } from 'bun:test'
import { curve, headH, rope } from '../packages/web/src/canvas.ts'

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
