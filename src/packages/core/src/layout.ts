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

/**
 * Card width, the height of a card whose screen has not reported its size yet, and the gaps, in
 * canvas units (1 unit = 1 CSS pixel at 100% zoom). A card is as tall as its screen.
 */
export const CARD = { w: 800, h: 600, gapX: 180, gapY: 64 }

/**
 * `keys` are the screens oldest first, starting with the first screen; `heights` are card heights
 * where known. Screens no click reached (opened with Back, Home, or before links were recorded)
 * start their own rows below.
 */
export function layoutMap(keys: string[], links: Link[], heights: Map<string, number> = new Map()): MapLayout {
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

  // Depth first: a leaf goes below everything placed so far; a parent is centred on its children's
  // band, pushed down if that would overlap the card above it in its own column.
  const boxes = new Map<string, Box>()
  const columnBottom: number[] = []
  let nextY = 0
  const place = (k: string, depth: number): { top: number; bottom: number } => {
    const h = heights.get(k) ?? CARD.h
    const bands = (children.get(k) ?? []).map((c) => place(c, depth + 1))
    const free = (columnBottom[depth] ?? -Infinity) + CARD.gapY
    let y: number
    if (bands.length) {
      const top = bands[0]!.top, bottom = bands[bands.length - 1]!.bottom
      // Centred when shorter than the band, else level with its first child.
      y = Math.max(free, top + Math.max(0, (bottom - top - h) / 2))
    } else {
      y = Math.max(free, nextY)
    }
    boxes.set(k, { x: depth * (CARD.w + CARD.gapX), y, w: CARD.w, h })
    columnBottom[depth] = y + h
    nextY = Math.max(nextY, y + h + CARD.gapY)
    const band = { top: Math.min(y, bands[0]?.top ?? y), bottom: Math.max(y + h, bands.at(-1)?.bottom ?? y + h) }
    return band
  }
  for (const r of roots) place(r, 0)
  return { boxes, parent }
}
