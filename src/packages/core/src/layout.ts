// Places a mockup's screens on the canvas: a tree from the first screen, left to right in the
// order the screens were found. A screen's parent is the first screen a click reached it from;
// every other click (back to the menu, a shortcut) is drawn as a back arrow, not moved.
// Pure geometry, so it runs in the browser and in tests.

import type { Link } from './cache.ts'

export interface Box { x: number; y: number; w: number; h: number }

export interface MapLayout {
  boxes: Map<string, Box>
  /** Child key -> parent key, for the links that shaped the tree. */
  parent: Map<string, string>
}

/** Card size and gaps, in canvas units (1 unit = 1 CSS pixel at 100% zoom). */
export const CARD = { w: 960, h: 768, gapX: 280, gapY: 140 }

/**
 * `keys` are the screens oldest first, starting with the first screen. Screens no click reached
 * (opened with Back, Home, or before links were recorded) start their own rows below.
 */
export function layoutMap(keys: string[], links: Link[]): MapLayout {
  const known = new Set(keys)
  const ordered = links.filter((l) => known.has(l.from) && known.has(l.to)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const parent = new Map<string, string>()
  const children = new Map<string, string[]>()
  const seen = new Set<string>()
  const roots: string[] = []

  // Breadth first from each root, so a screen's parent is the closest one that led to it.
  for (const start of keys) {
    if (seen.has(start)) continue
    roots.push(start)
    seen.add(start)
    const queue = [start]
    while (queue.length) {
      const k = queue.shift()!
      for (const l of ordered) {
        if (l.from !== k || seen.has(l.to)) continue
        seen.add(l.to)
        parent.set(l.to, k)
        children.set(k, [...(children.get(k) ?? []), l.to])
        queue.push(l.to)
      }
    }
  }

  // Depth first: leaves take the next free row, a parent sits level with the middle of its children.
  const boxes = new Map<string, Box>()
  let nextRow = 0
  const place = (k: string, depth: number): number => {
    const kids = children.get(k) ?? []
    const rows = kids.map((c) => place(c, depth + 1))
    const row = rows.length ? (rows[0]! + rows[rows.length - 1]!) / 2 : nextRow++
    boxes.set(k, { x: depth * (CARD.w + CARD.gapX), y: row * (CARD.h + CARD.gapY), w: CARD.w, h: CARD.h })
    return row
  }
  for (const r of roots) place(r, 0)
  return { boxes, parent }
}
