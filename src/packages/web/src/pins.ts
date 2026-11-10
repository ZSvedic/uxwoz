// Comments pinned to parts of a screen, for the player and the app: the anchor a comment sends its frame, the pin
// numbers of a screen's comments, and the layer of gold pins over a frame. The frame finds the parts (`locate`).

import type { Feedback } from '@uxwoz/core'

/** What a frame looks for: the part's words, its tag and its place among the parts with the same tag and words. */
export interface Anchor { id: string; text: string; tag: string; nth: number }
/** Where the frame found an anchor, in the frame's own pixels. */
export interface Spot { id: string; x: number; y: number; w: number; h: number }

/** A pin's size in the frame's pixels (design/ draws it this size), so it stays inside the layer. */
export const PIN = 22

/** The anchor to locate for a feedback entry; null for one about the whole screen. Old entries have words only. */
export const anchorOf = (f: Feedback): Anchor | null => (f.about ? { id: f.id, text: f.about, tag: f.tag ?? '', nth: f.nth ?? 0 } : null)

/** A screen's comments (of the list given) by time, each with its pin number; a resolved one has none, and the open ones count 1, 2, 3. */
export function numbered(list: Feedback[]): { f: Feedback; n: number | null }[] {
  let n = 0
  return list.filter((f) => f.kind === 'comment' || f.kind === 'dead')
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((f) => ({ f, n: f.resolved ? null : ++n }))
}

/** Where a comment is: at a dead control, on a part (its words), or the whole screen. */
export const whereOf = (f: Feedback) => (f.kind === 'dead' || f.label ? `At "${f.label || 'a control'}", not designed yet` : f.about || 'The whole screen')

/** A comment as the owner's Comments tab shows it: its pin number (open ones), whether its pin is drawn, where it is,
 * and whether its part was not found in the newest version. */
export interface CommentRow { f: Feedback; n: number | null; pin: boolean; where: string; earlier: boolean }

/** A screen's comments for the owner, the open ones by pin number, then the resolved ones. `located` is the ids its
 * frame found (null until it answers). An edit link sees none. */
export function commentRows(all: Feedback[], screen: string, located: Set<string> | null, editLink = false): CommentRow[] {
  if (editLink) return []
  const rows = numbered(all.filter((f) => f.screen === screen)).map(({ f, n }) => {
    const live = n != null && !!anchorOf(f), found = !!located?.has(f.id)
    return { f, n, pin: live && found, where: whereOf(f), earlier: live && !!located && !found }
  })
  return [...rows.filter((r) => r.n != null), ...rows.filter((r) => r.n == null)]
}

/** The open comments of a screen, for the tab's count. */
export const openCount = (all: Feedback[], screen: string, editLink = false) => commentRows(all, screen, null, editLink).filter((r) => r.n != null).length

/** Draw or update the pins in `host`, a layer over a frame: one per spot with a number, at its top right corner, inside the layer. */
export function pinLayer(host: HTMLElement, spots: Spot[], numbers: Map<string, number>, onClick: (id: string) => void) {
  const old = new Map([...host.querySelectorAll<HTMLButtonElement>('button.pin')].map((b) => [b.dataset.id!, b]))
  const keep = new Set<string>()
  const W = host.clientWidth, H = host.clientHeight
  for (const s of spots) {
    const n = numbers.get(s.id)
    if (n == null || keep.has(s.id)) continue
    keep.add(s.id)
    let b = old.get(s.id)
    if (!b) {
      b = document.createElement('button')
      b.className = 'pin'
      b.dataset.id = s.id
      b.addEventListener('click', () => onClick(s.id))
      host.append(b)
    }
    b.textContent = String(n)
    b.title = `Comment ${n}`
    const clamp = (v: number, max: number) => Math.max(0, Math.min(v, Math.max(0, max - PIN)))
    b.style.left = `${clamp(s.x + s.w - PIN / 2, W)}px`
    b.style.top = `${clamp(s.y - PIN / 2, H)}px`
  }
  for (const [id, b] of old) if (!keep.has(id)) b.remove()
}
