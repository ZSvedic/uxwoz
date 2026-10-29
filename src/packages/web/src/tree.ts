// The tree: every screen of a mockup, as an indented list beside the feed. Each line is one variant
// ("L2-B Planning sync"); the screens a variant's clicks first made hang below it, under the label
// of the control that was clicked. The variants in the main flow are marked; clicking any line
// makes its path the flow.

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
  constructor(private el: HTMLElement, private on: TreeHandlers) {}

  render(d: TreeData | null) {
    if (!d || !d.entries.get(d.root)) { this.el.replaceChildren(); return }
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
    const head = el('div', 'tree-head', `${seen.size} screen${seen.size === 1 ? '' : 's'} · ${variants} variant${variants === 1 ? '' : 's'}`)
    this.el.replaceChildren(head, ...parts)
  }
}

const first = (e: CacheEntry) => e.candidates[0]?.createdAt ?? ''

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
