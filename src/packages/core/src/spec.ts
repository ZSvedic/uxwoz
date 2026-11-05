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

/** A key as the menu names it: `ui.toggle` is `ui.toggles`, so a model cannot open a second row for a known one. */
export function knownKey(key: string): string {
  if (KNOWN_ROWS[key]) return key
  if (KNOWN_ROWS[`${key}s`]) return `${key}s`
  if (key.endsWith('s') && KNOWN_ROWS[key.slice(0, -1)]) return key.slice(0, -1)
  return key
}

/** One `key = value` line, or null when it is not one or its value is too long (refused). */
export function parseLine(s: string): SpecLine | null {
  const m = s.trim().match(/^([a-z][a-z0-9.-]*)\s*=\s*(.+)$/)
  if (!m || !isSpecKey(m[1]!)) return null
  const text = m[2]!.replace(/\s+/g, ' ').trim()
  return text && text.length <= MAX_LINE ? { key: knownKey(m[1]!), text } : null
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
 * Put a picked design's lines in: a line fills an open row, and nothing else. A design adds no key
 * of its own, `data.` included: new rows come from the plan, an Edit or the user. When designs could
 * add facts, 7 screens filled the spec with one screen's content. Returns the keys set.
 */
export function applyPick(spec: Spec, lines: SpecLine[], screen: string): string[] {
  const taken: string[] = []
  for (const l of lines.slice(0, MAX_DESIGN_LINES)) {
    const row = spec[l.key]
    if (!row || row.values.length) continue
    row.values.push({ text: l.text, from: 'pick', screen, version: 0 })
    taken.push(l.key)
  }
  return taken
}

/** The spec of a mockup whose plan failed or was slow: main navigation and Back open, so screens still agree on them. */
export const fallbackSpec = (): Spec => ({
  'ui.nav': { ask: KNOWN_ROWS['ui.nav'], from: 'plan', values: [] },
  'ui.back': { ask: KNOWN_ROWS['ui.back'], from: 'plan', values: [] },
})

/** Which of a design's lines its pick would put in (see applyPick), before the pick: the A OR B shows them. */
export function wouldTake(spec: Spec, lines: SpecLine[]): boolean[] {
  const taken = applyPick(JSON.parse(JSON.stringify(spec)) as Spec, lines, '')
  return lines.map((l, i) => i < MAX_DESIGN_LINES && taken.includes(l.key))
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
    const key = r && knownKey(r[1]!)
    if (!r || !key || !isSpecKey(key) || key === FLOW_KEY || spec[key] || rows >= MAX_PLAN_ROWS) continue
    const ask = r[2]!.trim()
    if (ask.length > MAX_LINE) continue
    spec[key] = { ask, from: 'plan', values: [] }
    rows++
  }
  return spec
}

/** One markup for each of these rows, styled by the theme: the request names it when the row is in the spec. */
const MARKUP: Record<string, string> = {
  'ui.nav': 'Tabs of ui.nav: last on every screen, in this markup, one link per tab with the label and @name ui.nav gives it, exactly; the app marks the current tab: <nav data-ui="tabs"><a data-action="@name">Label</a>…</nav>. A ui.nav line names each tab by its label and @name.',
  'ui.back': 'Back of ui.back: where ui.back says, with its label, in this markup: <a data-ui="back" data-action="back">Label</a>. The tab screens have no Back. A ui.back line starts with the label Back shows, then where it sits.',
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

/** The core flow's step after the screen `name`, when that screen is a step with a next one. */
export function nextStep(spec: Spec, name?: string): string | undefined {
  const flow = flowNames(spec)
  const i = name == null ? -1 : flow.indexOf(name)
  return i >= 0 ? flow[i + 1] : undefined
}

/** The request's line for a step of the core flow: one control must open the next step. '' for any other screen. */
export function flowRequest(spec: Spec, name?: string): string {
  const next = nextStep(spec, name)
  return next ? `This screen is a step of the main path (product.core-flow): one control on it must open @${next}.` : ''
}

/** The most screens one screen may open that the tree does not have yet. */
export const MAX_NEW_SCREENS = 2

/**
 * What a finished screen misses against the spec it was made with: a tab of ui.nav it does not link
 * to, a Back whose label is not the one ui.back says (tab screens have no Back), no control for the
 * next step of the core flow, more than MAX_NEW_SCREENS screens the tree did not have (`known`: its
 * names), and a reply that holds the screen twice. `name` is the screen's name, when it has one.
 */
export function checkScreen(html: string, spec: Spec, name?: string, known?: Set<string>): string[] {
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
  const next = nextStep(spec, name)
  if (next && !linked.has(next)) misses.push(`no link to @${next}, the next step of the core flow`)
  if (known) {
    const fresh = [...linked].filter((n) => n !== 'home' && n !== name && !known.has(n))
    if (fresh.length > MAX_NEW_SCREENS) misses.push(`opens ${fresh.length} new screens (${fresh.map((n) => `@${n}`).join(', ')})`)
  }
  if ((html.match(/<title>/gi)?.length ?? 0) > 1 || (html.match(/data-ui=["']tabs["']/gi)?.length ?? 0) > 1) misses.push('the screen is written twice')
  return misses
}

/**
 * The app marks the current tab: in the tab bar, the model's own marks go, and the tab that opens
 * `name` (the screen itself) gets aria-current="page". A screen that is not a tab has none marked.
 */
export function markTab(html: string, name?: string): string {
  return html.replace(/(<nav\b[^>]*data-ui=["']tabs["'][^>]*>)([\s\S]*?)(<\/nav>)/gi, (_, open: string, inner: string, close: string) => {
    const clean = inner.replace(/\s+aria-current\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    const marked = name == null ? clean : clean.replace(/<(a|button)\b([^>]*\bdata-action\s*=\s*["']@([a-z0-9_-]+)[^"']*["'][^>]*)>/gi,
      (tag: string, el: string, attrs: string, n: string) => (n.toLowerCase() === name ? `<${el}${attrs} aria-current="page">` : tag))
    return open + marked + close
  })
}

/** Prose a model wrote before `<title>` goes: the reply must begin with the title. Markup before it stays. */
export function cutProse(html: string): string {
  const i = html.search(/<title>/i)
  return i > 0 && !html.slice(0, i).includes('<') ? html.slice(i) : html
}
