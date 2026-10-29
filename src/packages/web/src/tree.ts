// The tree: every screen of a mockup, as an indented list in a panel floating over the feed, like
// the panels of an image editor: drag it by its header, fold it to its header. Each line is one
// variant ("L2-B Planning sync"); the screens a variant's clicks first made hang below it, under the
// label of the control that was clicked. The variants in the main flow are marked; clicking any
// line makes its path the flow.

import { variantId } from '@uxwoz/core/keys'
import type { CacheEntry } from '@uxwoz/core'

export interface TreeHandlers {
  open: (key: string, index: number) => void
}

export interface TreeData {
  root: string
  entries: Map<string, CacheEntry>
  /** The variants in the main flow, as "key#index". */
  flow: Set<string>
  name: (e: CacheEntry, index: number) => string
}

export class Tree {
  /** Made once, so a redraw while the panel is dragged keeps the drag going. */
  private head = el('div', 'tree-head')
  private count = el('span', '')
  private fold = el('button', 'fold')
  private body = el('div', 'tree-body')

  constructor(private box: HTMLElement, private on: TreeHandlers) {
    this.head.title = 'Drag to move'
    this.fold.type = 'button'
    this.fold.addEventListener('click', () => this.setFolded(!this.body.hidden))
    this.head.append(el('b', '', 'Screens'), this.count, this.fold)
    this.setFolded(false)
    this.drag(this.head)
  }

  private setFolded(folded: boolean) {
    this.body.hidden = folded
    this.fold.textContent = folded ? '+' : '–'
    this.fold.title = folded ? 'Show all screens' : 'Fold to this header'
  }

  /** Drag the panel by its header, kept inside the area around it. */
  private drag(head: HTMLElement) {
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('button')) return
      const box = this.box.getBoundingClientRect(), area = this.box.offsetParent!.getBoundingClientRect()
      const dx = e.clientX - box.left, dy = e.clientY - box.top
      head.setPointerCapture(e.pointerId)
      const move = (m: PointerEvent) => {
        const x = Math.min(Math.max(0, m.clientX - dx - area.left), area.width - box.width)
        const y = Math.min(Math.max(0, m.clientY - dy - area.top), area.height - 40)
        // A panel moved down gets shorter, so its last lines stay reachable.
        Object.assign(this.box.style, { left: `${x}px`, top: `${y}px`, right: 'auto', maxHeight: `${area.height - y - 12}px` })
      }
      const stop = () => {
        head.removeEventListener('pointermove', move)
        for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) head.removeEventListener(t, stop)
      }
      head.addEventListener('pointermove', move)
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) head.addEventListener(t, stop)
    })
  }

  render(d: TreeData | null) {
    if (!d || !d.entries.get(d.root)) { this.box.replaceChildren(); return }
    const kids = new Map<string, CacheEntry[]>()
    for (const e of d.entries.values()) {
      if (!e.parent) continue
      const k = `${e.parent.key}#${e.parent.variant}`
      kids.set(k, [...(kids.get(k) ?? []), e])
    }
    const seen = new Set<string>()
    let variants = 0
    const screen = (e: CacheEntry): HTMLElement => {
      seen.add(e.key)
      const ul = el('ul', 'variants')
      e.candidates.forEach((c, i) => {
        if (c.deleted) return
        variants++
        const id = `${e.key}#${i}`
        const li = el('li', '')
        const line = el('button', `line${d.flow.has(id) ? ' flow' : ''}`)
        line.type = 'button'
        line.append(el('b', 'id', variantId(e.level, c.letter ?? '?')), el('span', 'name', d.name(e, i)))
        line.title = 'Show this variant and the path to it'
        line.addEventListener('click', () => this.on.open(e.key, i))
        li.append(line)
        for (const child of (kids.get(id) ?? []).sort((a, b) => first(a).localeCompare(first(b)))) {
          if (seen.has(child.key)) continue
          const branch = el('div', 'branch')
          branch.append(el('div', 'via', `${child.parent!.label || 'next'} →`), screen(child))
          li.append(branch)
        }
        ul.append(li)
      })
      return ul
    }
    const tree = screen(d.entries.get(d.root)!)
    const parts: HTMLElement[] = [tree]
    const rest = [...d.entries.values()].filter((e) => !seen.has(e.key))
    if (rest.length) {
      parts.push(el('div', 'via', 'Not linked from the first screen'))
      for (const e of rest) if (!seen.has(e.key)) parts.push(screen(e))
    }
    this.count.textContent = `${seen.size} screen${seen.size === 1 ? '' : 's'} · ${variants} variant${variants === 1 ? '' : 's'}`
    this.body.replaceChildren(...parts)
    if (this.head.parentElement !== this.box) this.box.replaceChildren(this.head, this.body)
  }
}

const first = (e: CacheEntry) => e.candidates[0]?.createdAt ?? ''

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
