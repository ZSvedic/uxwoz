// The tree of a mockup, worked out, never stored: a level is the fewest clicks from the first screen.
// A name linked to before a screen has it is a planned screen. Runs in the browser too.

import type { CacheEntry } from './cache.ts'
import { OPEN_TAG, VOID, decode, pasteComponents } from './frame.ts'
import { nameWords, normalizePrompt, screenKey, screenRef } from './keys.ts'

/** Where a screen sits: its level (1 for the first screen), the screen it hangs under, and the control clicked there. */
export interface TreeNode { level: number; parent: string | null; label: string }

/** The name of the first screen, in `@home`. */
export const HOME_NAME = 'home'

const attr = (attrs: string, name: string) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i'))
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : null
}

export const isComponent = (e: CacheEntry) => e.kind === 'component'

/** A mockup's components, ID to newest HTML, for pasting. */
export function componentsOf(entries: CacheEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of entries) if (isComponent(e) && e.name && e.versions.length) out[e.name] = e.versions.at(-1)!.html
  return out
}

/** The newest HTML of a screen with its components pasted, as the user sees it; '' while its A OR B is open. */
const shownHtml = (e: CacheEntry, components: Record<string, string>) => {
  const v = e.versions.at(-1)
  return v ? pasteComponents(v.html, components) : ''
}

/** The controls with data-action in a screen's markup: each one's action and its words (aria-label, value, or text). */
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

/** A name not in `taken`: `name`, else name-2, name-3… */
export function uniqueName(name: string, taken: Set<string>): string {
  let n = name, i = 1
  while (taken.has(n)) n = `${name}-${++i}`
  return n
}

export const namesOf = (entries: CacheEntry[]) => new Map(entries.filter((e) => e.name && !isComponent(e)).map((e) => [e.name!, e.key]))

/** What a screen opened by `@name` alone shows, when no link says: its name in words, and the words of the control clicked. */
export function promptFromLabel(name: string, label: string): string {
  const words = nameWords(name)
  return label && normalizePrompt(label) !== words ? `The ${words} screen, opened by "${label}"` : `The ${words} screen`
}

/** The planned screens: names linked to that no screen has, as entries with no versions; the first link gives prompt and parent. */
export function plannedScreens(all: CacheEntry[]): CacheEntry[] {
  const entries = all.filter((e) => !isComponent(e)), components = componentsOf(all)
  const first = entries[0]
  if (!first) return []
  const names = namesOf(entries)
  const planned = new Map<string, CacheEntry>()
  for (const e of entries) {
    if (!e.versions.length) continue
    for (const l of linksIn(shownHtml(e, components))) {
      const ref = screenRef(l.action)
      if (!ref || ref.name === HOME_NAME || names.has(ref.name)) continue
      const have = planned.get(ref.name)
      if (have) { if (!have.action && ref.prompt) have.action = ref.prompt; continue }
      planned.set(ref.name, {
        key: screenKey(first.app, `@${ref.name}`), app: first.app, action: ref.prompt, name: ref.name,
        parent: { key: e.key, label: l.label }, versions: [],
      })
    }
  }
  for (const p of planned.values()) if (!p.action) p.action = promptFromLabel(p.name!, p.parent!.label)
  return [...planned.values()]
}

/** The tree, planned screens included: a screen hangs under the screen whose click made it when that is on a shortest path. */
export const screenTree = (made: CacheEntry[]): Map<string, TreeNode> => build(made).tree

/** The tree, its screens (made and open, then planned) and the links between them; a component's links count where it is pasted. */
function build(all: CacheEntry[]): { tree: Map<string, TreeNode>; entries: CacheEntry[]; links: [string, string][] } {
  const made = all.filter((e) => !isComponent(e)), components = componentsOf(all)
  const entries = [...made, ...plannedScreens(all)]
  const tree = new Map<string, TreeNode>()
  const links: [string, string][] = []
  const first = entries[0]
  if (!first) return { tree, entries, links }
  const app = first.app
  const root = screenKey(app, null)
  const keys = new Set(entries.map((e) => e.key))
  if (!keys.has(root)) return { tree, entries, links }
  const byName = namesOf(entries)
  const edges = new Map<string, { to: string; label: string }[]>()
  const edge = (from: string, to: string, label: string) => edges.set(from, [...edges.get(from) ?? [], { to, label }])
  // A screen's first click counts only from a screen that is there: a planned screen has no buttons,
  // so a screen made from one that was deleted (and is planned again) is not reached through it.
  const madeKeys = new Set(made.map((e) => e.key))
  for (const e of entries) {
    if (e.parent && madeKeys.has(e.parent.key)) edge(e.parent.key, e.key, e.parent.label)
  }
  for (const e of entries) {
    if (!e.versions.length) continue
    for (const l of linksIn(shownHtml(e, components))) {
      // A link opens a screen the mockup has by its `@name`; back, words with no `@` and new screens open none.
      const to = byName.get(screenRef(l.action)?.name ?? '')
      if (!to || to === e.key || !keys.has(to)) continue
      edge(e.key, to, l.label)
      if (!links.some(([f, t]) => f === e.key && t === to)) links.push([e.key, to])
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
    if (node && p && madeKeys.has(e.parent!.key) && e.parent!.key !== node.parent && p.level === node.level - 1) Object.assign(node, { parent: e.parent!.key, label: e.parent!.label })
  }
  return { tree, entries, links }
}

/** The first screen's one line, as the paper lists it. */
export const HOME_LINE = 'the first screen'

/** The paper's titles (`id: one line`, in tree order) and lines (`id -> id`); screens the first does not reach are left out. */
export function screenList(all: CacheEntry[]): { titles: string[]; lines: string[] } {
  const { tree, entries, links } = build(all)
  const titles: string[] = []
  const walk = (e: CacheEntry) => {
    if (e.name) titles.push(`${e.name}: ${e.action ?? HOME_LINE}${e.versions.length ? '' : ' (no drawing yet)'}`)
    for (const c of entries) if (tree.get(c.key)?.parent === e.key) walk(c)
  }
  const root = entries.find((e) => tree.get(e.key)?.level === 1)
  if (root) walk(root)
  const name = new Map(entries.map((e) => [e.key, e.name]))
  return { titles, lines: links.filter(([f, t]) => name.get(f) && name.get(t)).map(([f, t]) => `${name.get(f)} -> ${name.get(t)}`) }
}
