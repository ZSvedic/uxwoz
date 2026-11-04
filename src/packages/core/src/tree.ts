// The tree of a mockup's screens, worked out from the screens themselves: a screen's level is the
// fewest clicks from the first screen, following the buttons in each screen's newest version and the
// click that first made each screen. Nothing here is stored, so an Edit, an Undo or a delete moves
// screens at once. Runs in the browser as well as on the server, so it uses no Node or Bun APIs.

import type { CacheEntry } from './cache.ts'
import { normalizePrompt, screenKey } from './keys.ts'

/** Where a screen sits: its level (1 for the first screen), the screen it hangs under, and the control clicked there. */
export interface TreeNode { level: number; parent: string | null; label: string }

/** The name of the first screen, in `@home`. */
export const HOME_NAME = 'home'

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** An opening tag, its attributes read with quotes in mind (a `>` inside a quoted value is no end). */
const OPEN_TAG = /<([a-z][\w-]*)((?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/gi
const VOID = new Set(['input', 'img', 'br', 'hr', 'area', 'col', 'embed', 'source', 'wbr', 'meta', 'link'])
const attr = (attrs: string, name: string) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i'))
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : null
}

/**
 * The controls in a screen that open another screen: each one's action prompt and its words (its
 * aria-label, its value, or its text up to its closing tag). Every opening tag with data-action
 * counts, nested ones too; one written by a script is not in the markup, and is not found.
 */
export function linksIn(html: string): { action: string; label: string }[] {
  const out: { action: string; label: string }[] = []
  for (const m of html.matchAll(OPEN_TAG)) {
    const action = attr(m[2]!, 'data-action')
    if (action == null) continue
    const tag = m[1]!.toLowerCase()
    let text = attr(m[2]!, 'aria-label') ?? attr(m[2]!, 'value') ?? ''
    if (!text && !m[3] && !VOID.has(tag)) {
      const start = m.index! + m[0].length, end = html.toLowerCase().indexOf(`</${tag}`, start)
      text = decode(html.slice(start, end < 0 ? start : end).replace(/<[^>]*>/g, ' '))
    }
    out.push({ action: action.trim(), label: text.replace(/\s+/g, ' ').trim().slice(0, 80) })
  }
  return out
}

/** Words that say nothing about which screen it is. */
const FILLER = new Set(['a', 'an', 'the', 'of', 'for', 'with', 'in', 'on', 'and', 'to', 'screen', 'page', 'app', 'view'])

/** A short name for links, made from a screen's title (or prompt): "Sleep report" becomes "sleep-report". */
export function nameFrom(title: string): string {
  const words = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean)
  const kept = words.filter((w) => !FILLER.has(w))
  return (kept.length ? kept : words).slice(0, 4).join('-').slice(0, 32).replace(/-+$/, '') || 'screen'
}

/**
 * A name no other screen of the mockup has: `name`, else one made from `fallback` (the screen's
 * prompt, which says more), else name-2, name-3…
 */
export function uniqueName(name: string, taken: Set<string>, fallback = ''): string {
  if (!taken.has(name)) return name
  const other = fallback && nameFrom(fallback)
  if (other && other !== 'screen' && !taken.has(other)) return other
  let n = name, i = 1
  while (taken.has(n)) n = `${name}-${++i}`
  return n
}

/** The screen an action prompt opens if it is already there: `@name`, `home`, or a prompt it was made from. Null for `back` and for a new screen. */
export function resolveAction(app: string, action: string, byName: Map<string, string>): string | null {
  const ref = action.trim().match(/^@([\w-]+)$/)
  if (ref) return byName.get(ref[1]!.toLowerCase()) ?? null
  if (normalizePrompt(action) === 'back') return null
  return screenKey(app, action)
}

/** Every screen of one mockup (all from the same app) by name. */
export const namesOf = (entries: CacheEntry[]) => new Map(entries.filter((e) => e.name).map((e) => [e.name!, e.key]))

/**
 * The tree of one mockup. Edges are the click that first made each screen and every control in a
 * picked screen's newest version that opens a screen already there. A screen hangs under the screen
 * the click that made it came from when that is on a shortest path, else under the first other one
 * that is. Screens the first screen does not reach are left out.
 */
export function screenTree(entries: CacheEntry[]): Map<string, TreeNode> {
  const tree = new Map<string, TreeNode>()
  const first = entries[0]
  if (!first) return tree
  const app = first.app
  const root = screenKey(app, null)
  const keys = new Set(entries.map((e) => e.key))
  if (!keys.has(root)) return tree
  const byName = namesOf(entries)
  const edges = new Map<string, { to: string; label: string }[]>()
  for (const e of entries) {
    if (e.parent && keys.has(e.parent.key)) edges.set(e.parent.key, [...(edges.get(e.parent.key) ?? []), { to: e.key, label: e.parent.label }])
  }
  for (const e of entries) {
    const v = e.versions.at(-1)
    if (!v) continue
    for (const l of linksIn(v.html)) {
      const to = resolveAction(app, l.action, byName)
      if (to && to !== e.key && keys.has(to)) edges.set(e.key, [...(edges.get(e.key) ?? []), { to, label: l.label }])
    }
  }
  tree.set(root, { level: 1, parent: null, label: '' })
  const queue = [root]
  while (queue.length) {
    const from = queue.shift()!
    const level = tree.get(from)!.level + 1
    for (const { to, label } of edges.get(from) ?? []) {
      if (tree.has(to)) continue
      tree.set(to, { level, parent: from, label })
      queue.push(to)
    }
  }
  // Prefer the click that made a screen, when it is as short as the path found first.
  for (const e of entries) {
    const node = tree.get(e.key), p = e.parent && tree.get(e.parent.key)
    if (node && p && e.parent!.key !== node.parent && p.level === node.level - 1) Object.assign(node, { parent: e.parent!.key, label: e.parent!.label })
  }
  return tree
}

/**
 * The picked screens as an indented tree for the model, one line each: `@name: what it is`, two
 * spaces deeper per level, children in the order they were made. Past `max` lines the deepest
 * levels go first, so the main sections stay.
 */
export function treeLines(entries: CacheEntry[], max = 40): string[] {
  const tree = screenTree(entries)
  const rows: { level: number; text: string }[] = []
  const walk = (e: CacheEntry) => {
    const { level } = tree.get(e.key)!
    if (e.name && e.versions.length) rows.push({ level, text: `${'  '.repeat(level - 1)}@${e.name}: ${e.action ?? `the first screen of ${e.app}`}` })
    for (const c of entries) if (tree.get(c.key)?.parent === e.key) walk(c)
  }
  const root = entries.find((e) => tree.get(e.key)?.level === 1)
  if (root) walk(root)
  let deepest = Math.max(1, ...rows.map((r) => r.level))
  while (rows.filter((r) => r.level <= deepest).length > max && deepest > 1) deepest--
  return rows.filter((r) => r.level <= deepest).slice(0, max).map((r) => r.text)
}
