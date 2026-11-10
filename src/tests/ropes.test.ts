// The rope between a screen and its parent: down to the bottom of the parent's row, then one S-curve in the gap.
import { describe, expect, test } from 'bun:test'
import { curve } from '../packages/web/src/canvas.ts'

/** Points along a path of the form curve() writes: M, V, then at most one C. */
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
