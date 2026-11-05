// The spec of a mockup: short rows every new screen follows (process/plans/2026-11-05-spec-memory.md).
// A row is a key, the question it settles and its values, newest last; a row with no value is open.
// The plan opens rows, a picked design fills open ones, an Edit sets any key, Undo takes an Edit's
// values back. Runs in the browser as well as on the server, so it uses no Node or Bun APIs.

/** Who gave a row its value. */
export type SpecFrom = 'plan' | 'pick' | 'edit' | 'user'
/** One value of a row; `screen` and `version` say which screen version set it (a pick or an Edit). */
export interface SpecValue { text: string; from: SpecFrom; screen?: string; version?: number }
/** `ask` is the question the row settles; `from` says who added the row (the plan opens rows with no value). */
export interface SpecRow { ask?: string; from?: SpecFrom; values: SpecValue[] }
/** Rows by key, in the order they were added. */
export type Spec = Record<string, SpecRow>
/** A line a design or the plan proposes: `ui.nav = Tabs: …`. */
export interface SpecLine { key: string; text: string }

/** The most characters in a value; a longer line is refused. */
export const MAX_LINE = 120
/** At most this many rules (`product.`, `ui.`), facts (`data.`) and lines in all. */
export const MAX_RULES = 12
export const MAX_FACTS = 8
export const MAX_ROWS = 24
/** The plan opens at most this many rows; a design proposes at most this many lines. */
export const MAX_PLAN_ROWS = 8
export const MAX_DESIGN_LINES = 3
export const FLOW_KEY = 'product.core-flow'

/** The planner's menu of known names, with the question each settles. */
export const KNOWN_ROWS: Record<string, string> = {
  'ui.nav': 'main navigation',
  'ui.back': 'how Back looks and where it sits',
  'ui.forms': 'how forms and their buttons are laid out',
  'ui.lists': 'how lists and their items look',
  'ui.toggles': 'switches or checkboxes',
  'ui.colors': 'what colors mean',
  'ui.charts': 'how data is drawn',
  'ui.map': 'how the map, its pins and zoom work',
  'ui.hud': 'what stays on screen during play',
}

const KEY = /^(?:product|ui|data)\.[a-z0-9]+(?:-[a-z0-9]+)*$/
export const isSpecKey = (k: string) => KEY.test(k)
const isFact = (k: string) => k.startsWith('data.')

/** The value a row has now, or undefined while it is open. */
export const valueOf = (spec: Spec, key: string): string | undefined => spec[key]?.values.at(-1)?.text

/** The `@names` in a line, in order: `@home → @recording` gives home, recording. */
export const namesIn = (text: string): string[] => [...text.matchAll(/@([a-z0-9][a-z0-9_-]*)/gi)].map((m) => m[1]!.toLowerCase())
/** The screens of the core flow, from @home. */
export const flowNames = (spec: Spec) => namesIn(valueOf(spec, FLOW_KEY) ?? '')
/** The tab screens, from the value of ui.nav. */
export const navNames = (spec: Spec) => namesIn(valueOf(spec, 'ui.nav') ?? '')

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** One `key = value` line, or null when it is not one or its value is too long (refused). */
export function parseLine(s: string): SpecLine | null {
  const m = s.trim().match(/^([a-z][a-z0-9.-]*)\s*=\s*(.+)$/)
  if (!m || !isSpecKey(m[1]!)) return null
  const text = m[2]!.replace(/\s+/g, ' ').trim()
  return text && text.length <= MAX_LINE ? { key: m[1]!, text } : null
}

/**
 * Take the `<meta name="spec" content="key = value">` lines out of a reply. Each is read to the end
 * of its line, so a value may hold quotes; the whole line goes from the stored screen. The first
 * MAX_DESIGN_LINES good lines count; `refused` counts the rest that were not lines or too long.
 */
export function takeSpecLines(html: string): { html: string; lines: SpecLine[]; refused: number } {
  const lines: SpecLine[] = []
  let refused = 0
  const rest = html.replace(/^[ \t]*<meta\s+name=["']?spec["']?\s+content=["']?(.*)$\n?/gim, (_, tail: string) => {
    const line = parseLine(decode(tail.replace(/["']?\s*\/?>\s*$/, '')))
    if (line && lines.length < MAX_DESIGN_LINES && !lines.some((l) => l.key === line.key)) lines.push(line)
    else refused++
    return ''
  })
  return { html: rest, lines, refused }
}

/** Whether a new key fits the limits: 12 rules, 8 facts, 24 rows. */
function fits(spec: Spec, key: string): boolean {
  const keys = Object.keys(spec)
  if (keys.length >= MAX_ROWS) return false
  return isFact(key) ? keys.filter(isFact).length < MAX_FACTS : keys.filter((k) => !isFact(k)).length < MAX_RULES
}

/**
 * Put a picked design's lines in: a line fills an open row, or adds a known `ui.` name or a `data.`
 * fact the spec does not have. Lines for filled rows and made-up rules are dropped. Returns the keys set.
 */
export function applyPick(spec: Spec, lines: SpecLine[], screen: string): string[] {
  const taken: string[] = []
  for (const l of lines.slice(0, MAX_DESIGN_LINES)) {
    const row = spec[l.key]
    if (row) { if (row.values.length) continue }
    else if (!(l.key in KNOWN_ROWS || isFact(l.key)) || !fits(spec, l.key)) continue
    const r = (spec[l.key] ??= { ...(KNOWN_ROWS[l.key] && { ask: KNOWN_ROWS[l.key] }), from: 'pick', values: [] })
    r.values.push({ text: l.text, from: 'pick', screen, version: 0 })
    taken.push(l.key)
  }
  return taken
}

/** Put an Edit's lines in: any key, new ones too, within the limits. Returns the keys set. */
export function applyEdit(spec: Spec, lines: SpecLine[], screen: string, version: number): string[] {
  const taken: string[] = []
  for (const l of lines.slice(0, MAX_DESIGN_LINES)) {
    if (!spec[l.key] && !fits(spec, l.key)) continue
    const r = (spec[l.key] ??= { ...(KNOWN_ROWS[l.key] && { ask: KNOWN_ROWS[l.key] }), from: 'edit', values: [] })
    r.values.push({ text: l.text, from: 'edit', screen, version })
    taken.push(l.key)
  }
  return taken
}

/**
 * Take back the values one version of a screen set (Undo of an Edit, or ✕ on one of its lines, with
 * `key`). The value before counts again; a row an Edit added goes when nothing is left in it.
 * Returns how many values went.
 */
export function dropValues(spec: Spec, screen: string, version: number, key?: string): number {
  let n = 0
  for (const [k, row] of Object.entries(spec)) {
    if (key != null && k !== key) continue
    const keep = row.values.filter((v) => !(v.from === 'edit' && v.screen === screen && v.version === version))
    if (keep.length === row.values.length) continue
    n += row.values.length - keep.length
    row.values = keep
    if (!keep.length && row.from === 'edit') delete spec[k]
  }
  return n
}

/** The lines one version of a screen set, with the value each replaced (undefined if the row was open or new). */
export function linesOf(spec: Spec, screen: string, version: number): { key: string; text: string; before?: string }[] {
  const out: { key: string; text: string; before?: string }[] = []
  for (const [key, row] of Object.entries(spec)) {
    row.values.forEach((v, i) => {
      if (v.screen === screen && v.version === version) out.push({ key, text: v.text, before: row.values[i - 1]?.text })
    })
  }
  return out
}

/**
 * The plan from the planner's reply: the core flow from @home, cut at the first repeated name, and
 * the first MAX_PLAN_ROWS open rows (`key ? question`). Lines that are neither, or too long, go.
 */
export function parsePlan(reply: string): Spec {
  const spec: Spec = {}
  let rows = 0
  for (const raw of reply.split('\n')) {
    const l = raw.trim().replace(/^[-*]\s+/, '')
    if (!l) continue
    const f = l.match(/^product\.core-flow:?\s*=?\s*(.+)$/)
    if (f && !spec[FLOW_KEY]) {
      const names: string[] = []
      for (const n of namesIn(f[1]!)) { if (names.includes(n)) break; names.push(n) }
      if (names[0] !== 'home') names.unshift('home')
      const text = names.map((n) => `@${n}`).join(' → ')
      if (names.length > 1 && text.length <= MAX_LINE) spec[FLOW_KEY] = { ask: 'the main path', from: 'plan', values: [{ text, from: 'plan' }] }
      continue
    }
    const r = l.match(/^([a-z][a-z0-9.-]*):?\s+\?\s+(.+)$/)
    if (!r || !isSpecKey(r[1]!) || r[1] === FLOW_KEY || spec[r[1]!] || rows >= MAX_PLAN_ROWS) continue
    const ask = r[2]!.trim()
    if (ask.length > MAX_LINE) continue
    spec[r[1]!] = { ask, from: 'plan', values: [] }
    rows++
  }
  return spec
}

/** One markup for each of these rows, styled by the theme: the request names it when the row is in the spec. */
const MARKUP: Record<string, string> = {
  'ui.nav': 'Tabs of ui.nav: last on every screen, in this markup, one link per tab with its label and @name, and aria-current="page" on this screen\'s own tab: <nav data-ui="tabs"><a data-action="@name">Label</a>…</nav>. A ui.nav line names each tab by its label and @name, e.g. ui.nav = Tabs: Menu @home, Orders @order-list, Profile @profile',
  'ui.back': 'Back of ui.back: where ui.back says, with its label, in this markup: <a data-ui="back" data-action="back">Label</a>. The tab screens have no Back. A ui.back line starts with the label, e.g. ui.back = ‹ Back, first in the header',
  'ui.toggles': 'An on/off setting of ui.toggles, as a switch: <label><input type="checkbox" role="switch"> Label</label>. A plain checkbox only picks items, such as what to include or export.',
}

/**
 * The spec as a request carries it, after the tree: filled rows as `key = value`, open ones as
 * `key ? question`, then the markup for tabs, Back and switches when those rows are there. '' for none.
 */
export function specRequest(spec: Spec): string {
  const keys = Object.keys(spec)
  if (!keys.length) return ''
  const rows = keys.map((k) => {
    const v = valueOf(spec, k)
    return v != null ? `${k} = ${v}` : `${k} ? ${spec[k]!.ask ?? ''}`.trimEnd()
  })
  const markup = keys.filter((k) => MARKUP[k]).map((k) => MARKUP[k]!)
  return `The spec of this mockup: decisions every screen follows, one per line; a row with ? is not decided yet.\n${rows.join('\n')}`
    + (markup.length ? `\n\n${markup.join('\n')}` : '')
}

/**
 * What a finished screen misses against the spec it was made with: a tab of ui.nav it does not link
 * to, a Back whose label is not the one ui.back says (tab screens have no Back), and a reply that
 * holds the screen twice. `name` is the screen's name, when it has one.
 */
export function checkScreen(html: string, spec: Spec, name?: string): string[] {
  const misses: string[] = []
  const tabs = navNames(spec)
  const links = [...html.matchAll(/data-action\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]!.trim())
  const linked = new Set(links.flatMap((a) => namesIn(a.split(':')[0]!)))
  const missing = tabs.filter((t) => !linked.has(t))
  if (missing.length) misses.push(`no tab for ${missing.map((t) => `@${t}`).join(', ')}`)
  const back = valueOf(spec, 'ui.back')
  const isTab = name != null && tabs.includes(name)
  if (back && !isTab && name !== 'home') {
    const labels = [...html.matchAll(/<a\b[^>]*data-ui=["']back["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => decode(m[1]!.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim())
    if (!labels.length) misses.push('no Back')
    else for (const l of labels) if (!l || !back.includes(l)) misses.push(`Back says "${l}"`)
  }
  if ((html.match(/<title>/gi)?.length ?? 0) > 1 || (html.match(/data-ui=["']tabs["']/gi)?.length ?? 0) > 1) misses.push('the screen is written twice')
  return misses
}
