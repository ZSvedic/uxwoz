// The spec of a mockup: short rows every new screen follows (process/plans/2026-11-05-spec-memory.md).
// A row is a key, the question it settles and its values, newest last; a row with no value is open.
// The plan opens rows, a picked design fills open ones, an Edit sets any key, Undo takes an Edit's
// values back. Runs in the browser as well as on the server, so it uses no Node or Bun APIs.

/** Who gave a row its value. */
export type SpecFrom = 'plan' | 'pick' | 'edit' | 'user' | 'review'
/**
 * One value of a row; `screen` and `at` (the version's createdAt) say which screen version set it, a
 * pick or an Edit. Not its index: a deleted and remade screen reuses indexes.
 */
export interface SpecValue { text: string; from: SpecFrom; screen?: string; at?: string }
/** `ask` is the question the row settles; `from` says who added the row (the plan opens rows with no value). */
export interface SpecRow { ask?: string; from?: SpecFrom; values: SpecValue[] }
/** Rows by key, in the order they were added. */
export type Spec = Record<string, SpecRow>
/** A line a design or the plan proposes: `ui.nav = Tabs: …`. */
export interface SpecLine { key: string; text: string }
/** A line that was not taken, and why: shown under its Edit in the drawer. */
export interface SpecRefusal { line: string; why: string }

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
  'ui.back': 'the label Back shows, in quotes, and where it sits',
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
export const valueOf = (spec: Spec, key: string): string | undefined => rowOf(spec, key)?.values.at(-1)?.text
/** A row, read as the spec's own key only: `constructor` or `__proto__` is no row. */
export const rowOf = (spec: Spec, key: string): SpecRow | undefined => (Object.hasOwn(spec, key) ? spec[key] : undefined)

/** The `@names` in a line, in order: `@home → @recording` gives home, recording. */
export const namesIn = (text: string): string[] => [...text.matchAll(/@([a-z0-9][a-z0-9_-]*)/gi)].map((m) => m[1]!.toLowerCase())
/** The screens of the core flow, from @home. */
export const flowNames = (spec: Spec) => namesIn(valueOf(spec, FLOW_KEY) ?? '')
/** True when ui.nav's value is a tab bar (`Tabs: …`); any other navigation gets no tab markup and no tab check. */
export const hasTabs = (spec: Spec) => /^\s*tabs\s*:/i.test(valueOf(spec, 'ui.nav') ?? '')
/** The tab screens, from the value of ui.nav when it is a tab bar. */
export const navNames = (spec: Spec) => parseTabs(valueOf(spec, 'ui.nav') ?? '')?.map((t) => t.name) ?? []

/**
 * The tabs of a `Tabs:` line: items split on , / | · ; or •, each one @name and a label on either
 * side (`Tonight @home`, `@home Tonight`, `Tonight (@home)`). Null when the line is no Tabs: line,
 * or an item has no label or not exactly one @name: such a line is refused.
 */
export function parseTabs(text: string): { name: string; label: string }[] | null {
  const m = text.match(/^\s*tabs\s*:\s*([\s\S]*)$/i)
  if (!m) return null
  const tabs: { name: string; label: string }[] = []
  for (const item of m[1]!.split(/\s*[,/|·;•]\s*/).map((x) => x.trim()).filter(Boolean)) {
    const names = namesIn(item)
    const label = item.replace(/\(?@[a-z0-9][a-z0-9_-]*\)?/gi, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
    if (names.length !== 1 || !label) return null
    tabs.push({ name: names[0]!, label })
  }
  return tabs.length >= 2 ? tabs : null
}
/** The label ui.nav gives a tab, e.g. History for @night-history in `Tabs: History @night-history`. */
export function tabLabel(spec: Spec, name: string): string {
  return parseTabs(valueOf(spec, 'ui.nav') ?? '')?.find((t) => t.name === name)?.label ?? ''
}

const NAMED: Record<string, string> = {
  quot: '"', apos: "'", lt: '<', gt: '>', amp: '&', nbsp: ' ', lsaquo: '‹', rsaquo: '›', laquo: '«', raquo: '»',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', hellip: '…', mdash: '—', ndash: '–', times: '×', middot: '·', bull: '•',
}
/** Text from HTML: named entities a model uses, numeric ones, and a no-break space as a space. */
export const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m)
  .replace(/\u00a0/g, ' ')

/** A key as the menu names it: `ui.toggle` is `ui.toggles`, so a model cannot open a second row for a known one. */
export function knownKey(key: string): string {
  if (KNOWN_ROWS[key]) return key
  if (KNOWN_ROWS[`${key}s`]) return `${key}s`
  if (key.endsWith('s') && KNOWN_ROWS[key.slice(0, -1)]) return key.slice(0, -1)
  return key
}

/** Why a `key = value` line is refused, or null when it is a good one. */
export function lineProblem(s: string): string | null {
  const m = s.trim().match(/^([a-z][a-z0-9.-]*)\s*=\s*(.+)$/)
  if (!m) return 'not a key = value line'
  if (!isSpecKey(m[1]!)) return 'the key is not product., ui. or data. and a name'
  const text = m[2]!.replace(/\s+/g, ' ').trim()
  if (text.length > MAX_LINE) return `longer than ${MAX_LINE} characters`
  if (text.includes('<')) return 'it holds markup'
  return null
}

/** One `key = value` line, or null when it is not one, its value is too long or holds `<` (refused). */
export function parseLine(s: string): SpecLine | null {
  if (lineProblem(s)) return null
  const m = s.trim().match(/^([a-z][a-z0-9.-]*)\s*=\s*(.+)$/)!
  return { key: knownKey(m[1]!), text: m[2]!.replace(/\s+/g, ' ').trim() }
}

/** A flow as the plan writes it: `@home → @a → @b`, cut at the first repeated name; null when it names fewer than 2 screens. */
function flowText(text: string): string | null {
  const names: string[] = []
  for (const n of namesIn(text)) { if (names.includes(n)) break; names.push(n) }
  if (names[0] !== 'home') names.unshift('home')
  const t = names.map((n) => `@${n}`).join(' → ')
  return names.length > 1 && t.length <= MAX_LINE ? t : null
}

/**
 * The value a line may give its row, or why not: the core flow must name screens from @home (as the
 * plan writes it), and a `Tabs:` navigation must name at least two tabs by @name. An Edit or a pick
 * that wrote `product.core-flow = Browse, then pay` would empty the tree of its planned steps.
 */
export function shapeOf(line: SpecLine): { text: string } | { why: string } {
  if (line.key === FLOW_KEY) {
    const t = flowText(line.text)
    return t ? { text: t } : { why: 'a core flow names its screens, e.g. @home → @cart' }
  }
  if (line.key === 'ui.nav') {
    const tabs = /^\s*tabs\s*:/i.test(line.text)
    if (tabs && !parseTabs(line.text)) return { why: 'a Tabs: line names each tab by a label and its @name, e.g. Tabs: Home @home, Cart @cart' }
    if (!tabs && claimsTabs(line.text)) return { why: 'a tab bar starts with Tabs:, e.g. Tabs: Home @home, Cart @cart' }
  }
  if (line.key === 'ui.back' && !backLabelOf(line.text)) return { why: 'a ui.back line starts with its label in double quotes, e.g. "‹ Back", top left' }
  return { text: line.text }
}

/** True when a navigation line claims a tab bar (`Bottom tabs: …`), not when it says there is none (`No tab bar: …`). */
function claimsTabs(text: string): boolean {
  if (!/\btab(s|\s+bar)?\b/i.test(text)) return false
  return !/\b(no|without|not|never|remove[sd]?|drop(s|ped)?|instead of|replace[sd]?)\b[^.;:]{0,30}\btab/i.test(text)
}

/** The label a ui.back value gives Back: its opening quoted text, e.g. ‹ Back for `"‹ Back", top left`. */
export function backLabelOf(text: string): string | null {
  const m = text.match(/^\s*["“]([^"”]{1,30})["”]/)
  return m && m[1]!.trim() ? m[1]!.trim() : null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The screen as the frame shows it: code draws its tab bar from ui.nav (labels, names, the current
 * tab) and Back's label from ui.back. The model writes both in the fixed markup, but asking was not
 * enough: Luna dropped a tab on 2 of 6 screens and Haiku wrote Back two ways. A screen with no tab
 * bar gets one; a screen with no Back is left alone. Drawn at show time from the stored screen and
 * the spec as it is now, so an old screen follows a changed line at once and nothing stored changes.
 */
export function drawChrome(html: string, spec: Spec, name?: string): string {
  return applyChrome(html, chromeOf(spec, name))
}

/** True when Back is hidden on the screen `name`: it is a tab, and Home is a tab too (else Back is its only way home). */
export function hidesBack(spec: Spec, name?: string): boolean {
  const tabs = navNames(spec)
  return name != null && tabs.includes('home') && tabs.includes(name)
}

/** Back's label while ui.back is open (or holds no quoted label): the screens still agree. */
export const DEFAULT_BACK = '‹ Back'

/** What code draws on a screen: its tab bar (null when ui.nav is no tab bar) and Back's label. */
export interface Chrome { bar: string | null; back: string }

/** The tab bar and Back label for the screen `name`, from the spec as it is now. */
export function chromeOf(spec: Spec, name?: string): Chrome {
  const tabs = navNames(spec)
  const bar = tabs.length
    ? `<nav data-ui="tabs">${tabs.map((n) => `<a data-action="@${n}"${n === name ? ' aria-current="page"' : ''}>${esc(tabLabel(spec, n) || n)}</a>`).join('')}</nav>`
    : null
  return { bar, back: backLabelOf(valueOf(spec, 'ui.back') ?? '') ?? DEFAULT_BACK }
}

/**
 * Apply chrome to a screen's HTML: the first tab bar becomes `bar` and any other goes (with no tab
 * bar, `bar` goes before the last script, else at the end); every Back link or button gets the label.
 * The frame's script does the same in place when the spec changes (redraw in frame.ts), so a first
 * build and a redraw give the same screen, with no reload.
 */
export function applyChrome(html: string, chrome: Chrome): string {
  let out = html
  if (chrome.bar) {
    const bars = tabBars(out)
    if (bars.length) {
      // The first bar becomes the drawn one, the others go (back to front, so the places hold).
      for (const [s, e] of bars.slice(1).reverse()) out = out.slice(0, s) + out.slice(e)
      out = out.slice(0, bars[0]![0]) + chrome.bar + out.slice(bars[0]![1])
    } else out = out + '\n' + chrome.bar
  }
  return out.replace(/(<(a|button)\b[^>]*\bdata-ui\s*=\s*["']?back\b["']?[^>]*>)[\s\S]*?(<\/\2>)/gi, (_, open: string, _t: string, close: string) => open + esc(chrome.back) + close)
}

/** Where each tab bar sits: any element with data-ui tabs, quoted or not, to its matching closing tag. */
function tabBars(html: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bdata-ui\s*=\s*(?:"tabs"|'tabs'|tabs\b)[^>]*>/gi)) {
    if (out.some(([s, e]) => m.index! >= s && m.index! < e)) continue
    const same = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, 'gi')
    same.lastIndex = m.index! + m[0].length
    let depth = 1, end = html.length
    for (let t = same.exec(html); t; t = same.exec(html)) {
      depth += t[1] ? -1 : 1
      if (!depth) { end = t.index + t[0].length; break }
    }
    out.push([m.index!, end])
  }
  return out
}

/** The kind of screen a name is: its last word when that says what the screen does (details, edit, add…), else its first word. */
export function kindOf(name: string): string {
  const words = name.split(/[-_]/)
  const last = words.at(-1)!
  return words.length > 1 && /^(details?|edit|add|new|form|settings|list|summary|report|history|view)$/.test(last) ? last : words[0]!
}

/** One `<meta name="spec" content="…">` tag, either attribute first; content runs to its closing quote before `>` (or before name=). */
const SPEC_TAG = /<meta\s+(?:name\s*=\s*["']?spec["']?\s+content\s*=\s*(["'])([^\n]*?)\1(?=\s*\/?>)|content\s*=\s*(["'])([^\n]*?)\3\s+name\s*=\s*["']?spec["']?)\s*\/?>/gi

/**
 * Take the `<meta name="spec" content="key = value">` tags out of a reply. Each tag is read up to its
 * closing `">`, so a quote inside the value is safe, and only the tag goes from the stored screen
 * (its line too, when the tag was alone on it). A value with `<` in it is refused. The first
 * MAX_DESIGN_LINES good lines count; `refused` counts the rest that were not lines, too long or repeats.
 */
export function takeSpecLines(html: string): { html: string; lines: SpecLine[]; refused: number; refusals: SpecRefusal[] } {
  const lines: SpecLine[] = []
  const refusals: SpecRefusal[] = []
  const CUT = '\u0000'
  const marked = html.replace(SPEC_TAG, (_, _q1, a: string | undefined, _q2, b: string | undefined) => {
    const raw = decode(a ?? b ?? '').replace(/\s+/g, ' ').trim()
    const line = parseLine(raw)
    if (!line) refusals.push({ line: raw, why: lineProblem(raw)! })
    else if (lines.some((l) => l.key === line.key)) refusals.push({ line: raw, why: 'a second line for the same row' })
    else if (lines.length >= MAX_DESIGN_LINES) refusals.push({ line: raw, why: `more than ${MAX_DESIGN_LINES} lines` })
    else lines.push(line)
    return CUT
  })
  const rest = marked.replace(/^[ \t]*\u0000(?:[ \t]*\u0000)*[ \t]*(?:\n|$)/gm, '').replaceAll(CUT, '')
  return { html: rest, lines, refused: refusals.length, refusals }
}

/** Whether a new key fits the limits: 12 rules, 8 facts, 24 rows. */
export function fits(spec: Spec, key: string): boolean {
  const keys = Object.keys(spec)
  if (keys.length >= MAX_ROWS) return false
  return isFact(key) ? keys.filter(isFact).length < MAX_FACTS : keys.filter((k) => !isFact(k)).length < MAX_RULES
}

/**
 * Put a picked design's lines in: a line fills an open row, and nothing else. A design adds no key
 * of its own, `data.` included: new rows come from the plan, an Edit or the user. When designs could
 * add facts, 7 screens filled the spec with one screen's content. Returns the keys set.
 */
export function applyPick(spec: Spec, lines: SpecLine[], screen: string, at?: string): string[] {
  const taken: string[] = []
  for (const l of lines.slice(0, MAX_DESIGN_LINES)) {
    const row = rowOf(spec, l.key)
    const shape = shapeOf(l)
    // A row filled before the shape rules, with a value of the wrong shape, counts as open: it is stuck otherwise.
    const now = row?.values.at(-1)
    const open = !now || !('text' in shapeOf({ key: l.key, text: now.text }))
    if (!row || !open || !('text' in shape)) continue
    row.values.push({ text: shape.text, from: 'pick', screen, ...(at && { at }) })
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

/**
 * Put an Edit's lines in: any key, new ones too, within the limits. A line that repeats a row's
 * value is skipped: an Edit reply often repeats lines it did not change. `at` is the version's
 * createdAt. Returns the keys set.
 */
export function applyEdit(spec: Spec, lines: SpecLine[], screen: string, at: string, refused: SpecRefusal[] = []): string[] {
  const taken: string[] = []
  for (const l of lines.slice(0, MAX_DESIGN_LINES)) {
    const shape = shapeOf(l)
    const line = `${l.key} = ${l.text}`
    if (!('text' in shape)) { refused.push({ line, why: shape.why }); continue }
    if (valueOf(spec, l.key) === shape.text) { refused.push({ line, why: 'the row has this value already' }); continue }
    if (spec[l.key]?.values.at(-1)?.from === 'user') { refused.push({ line, why: 'you set this row; your line wins' }); continue }
    // The caps of 12 rules and 8 facts bind what models add; an Edit, like the user, only the 24 lines.
    if (!spec[l.key] && lineCount(spec) >= MAX_ROWS) { refused.push({ line, why: `the spec is full: ${MAX_ROWS} lines` }); continue }
    const r = (spec[l.key] ??= { ...(KNOWN_ROWS[l.key] && { ask: KNOWN_ROWS[l.key] }), from: 'edit', values: [] })
    r.values.push({ text: shape.text, from: 'edit', screen, at })
    taken.push(l.key)
  }
  return taken
}

/**
 * Take back the values one version of a screen set (Undo of an Edit, or ✕ on one of its lines, with
 * `key`). The value before counts again; a row an Edit added goes when nothing is left in it.
 * Returns how many values went.
 */
export function dropValues(spec: Spec, screen: string, at: string, key?: string): number {
  let n = 0
  for (const [k, row] of Object.entries(spec)) {
    if (key != null && k !== key) continue
    const keep = row.values.filter((v) => !(v.from === 'edit' && v.screen === screen && v.at === at))
    if (keep.length === row.values.length) continue
    n += row.values.length - keep.length
    row.values = keep
    if (!keep.length && row.from === 'edit') delete spec[k]
  }
  return n
}

/**
 * The lines one version of a screen (by its createdAt) set, with the value each replaced (undefined
 * if the row was open or new), and `later` when a later value has replaced it since.
 */
export function linesOf(spec: Spec, screen: string, at: string): { key: string; text: string; before?: string; later: boolean }[] {
  const out: { key: string; text: string; before?: string; later: boolean }[] = []
  for (const [key, row] of Object.entries(spec)) {
    row.values.forEach((v, i) => {
      if (v.screen === screen && v.at === at) out.push({ key, text: v.text, before: row.values[i - 1]?.text, later: i < row.values.length - 1 })
    })
  }
  return out
}

/** A deleted screen's values stay in the spec, but no longer belong to it: a remade screen's Undo or ✕ cannot take them back. */
export function untie(spec: Spec, screen: string) {
  for (const row of Object.values(spec)) for (const v of row.values) if (v.screen === screen) { delete v.screen; delete v.at }
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
      const text = flowText(f[1]!)
      if (text) spec[FLOW_KEY] = { ask: 'the main path', from: 'plan', values: [{ text, from: 'plan' }] }
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
  'ui.nav': 'Tabs of ui.nav: last on every screen, in this markup, one link per tab with the label and @name ui.nav gives it; the app redraws the bar and marks the current tab: <nav data-ui="tabs"><a data-action="@name">Label</a>…</nav>. A ui.nav line for a tab bar starts with Tabs: and names each tab by its label and @name; other navigation is written another way and gets no tab bar.',
  'ui.back': 'Back of ui.back: where ui.back says, with its label, in this markup: <a data-ui="back" data-action="back">Label</a>. The app draws its label and hides it on the tab screens. A ui.back line starts with the label Back shows, in double quotes, then where it sits: ui.back = "Label", where.',
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
  // The tab markup only while ui.nav is open or says Tabs: other navigation has none.
  const markup = keys.filter((k) => MARKUP[k] && (k !== 'ui.nav' || valueOf(spec, k) == null || hasTabs(spec))).map((k) => MARKUP[k]!)
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
  return next ? `This screen is a step of the main path (product.core-flow): the control that finishes this screen's task (Stop, Save, Done) opens @${next} itself, with data-action="@${next}"; not a script handler, and not a second link beside it.` : ''
}

/** The most new kinds of screen one screen may open (see kindOf): the details of a list's items are one kind. */
export const MAX_NEW_SCREENS = 2
/** The most new screens one screen may open whatever their kinds. */
export const MAX_NEW_NAMES = 5

/**
 * What a finished screen misses against the spec it was made with: no control for the next step of
 * the core flow, more than MAX_NEW_SCREENS new kinds of screen the tree did not have (`known`: its
 * names), and a reply that holds the screen twice. Tabs and Back are not checked: code draws them.
 * `name` is the screen's name, when it has one.
 */
export function checkScreen(html: string, spec: Spec, name?: string, known?: Set<string>): string[] {
  const misses: string[] = []
  const links = [...html.matchAll(/data-action\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]!.trim())
  const linked = new Set(links.flatMap((a) => namesIn(a.split(':')[0]!)))
  const next = nextStep(spec, name)
  if (next && !linked.has(next)) misses.push(`no link to @${next}, the next step of the core flow`)
  if (known) {
    const fresh = [...linked].filter((n) => n !== 'home' && n !== name && !known.has(n))
    const kinds = [...new Set(fresh.map(kindOf))]
    if (kinds.length > MAX_NEW_SCREENS) misses.push(`opens ${kinds.length} new kinds of screen (${fresh.map((n) => `@${n}`).join(', ')})`)
    // Seven export-* screens are one kind, and still sprawl.
    else if (fresh.length > MAX_NEW_NAMES) misses.push(`opens ${fresh.length} new screens (${fresh.map((n) => `@${n}`).join(', ')})`)
  }
  if (writtenTwice(html)) misses.push('the screen is written twice')
  return misses
}

/**
 * The first copy of a reply that holds the screen twice, as Luna's sometimes do: cut where a second
 * idea, or a second title outside SVG, starts. `cut` says it was cut; Info still notes it.
 */
export function firstCopy(html: string): { html: string; cut: boolean } {
  const ideas = [...html.matchAll(/<meta\s+name=["']?idea\b/gi)].map((m) => m.index!)
  const titles = topTitles(html)
  const at = Math.min(...[ideas[1], titles[1]].filter((x): x is number => x != null))
  // Never a kept copy that ends inside a script: a title in a script's string is no second copy.
  if (!Number.isFinite(at) || inside(html, at, 'script')) return { html, cut: false }
  let kept = html.slice(0, at)
  // The junk between the copies goes: from a marker like </final> or </assistant>, else after the last tag.
  const junk = kept.search(/<\/(?:final|assistant|analysis|answer|response|output)>/i)
  kept = junk >= 0 ? kept.slice(0, junk) : kept.slice(0, kept.lastIndexOf('>') + 1)
  return { html: kept.trimEnd(), cut: true }
}

/** The places of <title> tags outside <svg> and <script>: the screen's own titles. */
const topTitles = (html: string) => [...html.matchAll(/<title>/gi)].map((m) => m.index!).filter((i) => !inside(html, i, 'svg') && !inside(html, i, 'script'))

/** True when position `i` of `html` lies inside an element `tag` (svg, script). */
function inside(html: string, i: number, tag: string): boolean {
  const before = html.slice(0, i).toLowerCase()
  return before.lastIndexOf(`<${tag}`) > before.lastIndexOf(`</${tag}>`)
}

/** A reply that holds the screen twice: two ideas, two of the screen's own titles, or two tab bars (opening tags, not a script's selector). */
function writtenTwice(html: string): boolean {
  return (html.match(/<meta\s+name=["']?idea\b/gi)?.length ?? 0) > 1 || topTitles(html).length > 1
    || (html.match(/<[a-z][\w-]*\b[^>]*\bdata-ui\s*=\s*["']?tabs\b/gi)?.length ?? 0) > 1
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

/** How many lines the spec holds, one per row, against MAX_ROWS: the panel shows *9 of 24 lines*. */
export const lineCount = (spec: Spec) => Object.keys(spec).length

/**
 * The user's own line for a row (`from: user`), new rows included, within the limits and in the
 * shape its key needs. A user line wins: an Edit cannot replace it, and no model changes it.
 * Returns why it was refused, or null when set.
 */
export function setUserLine(spec: Spec, key: string, text: string): string | null {
  key = knownKey(key.trim())
  if (!isSpecKey(key)) return 'a key is product., ui. or data. and lowercase words joined by dashes, e.g. ui.dark-mode'
  const raw = text.replace(/\s+/g, ' ').trim()
  if (!raw) return 'the line is empty'
  if (raw.length > MAX_LINE) return `longer than ${MAX_LINE} characters`
  if (raw.includes('<')) return 'it holds markup'
  const shape = shapeOf({ key, text: raw })
  if (!('text' in shape)) return shape.why
  // Saving a line unchanged changes nothing: a model's line stays the model's.
  if (valueOf(spec, key) === shape.text) return null
  // The user, like an Edit, is bound only by the 24 lines in all; the caps of 12 and 8 bind the models.
  if (!rowOf(spec, key) && lineCount(spec) >= MAX_ROWS) return `the spec is full: ${MAX_ROWS} lines`
  const r = (spec[key] ??= { ...(KNOWN_ROWS[key] && { ask: KNOWN_ROWS[key] }), from: 'user', values: [] })
  r.values.push({ text: shape.text, from: 'user' })
  return null
}

/** Delete a row's newest line, so the one before counts (or the row is open again). A row nobody planned goes with its last line. */
export function removeLine(spec: Spec, key: string): boolean {
  const row = rowOf(spec, key)
  if (!row?.values.length) return false
  row.values.pop()
  if (!row.values.length && row.ask == null) delete spec[key]
  return true
}

/** Delete a whole row. */
export function removeRow(spec: Spec, key: string): boolean {
  if (!rowOf(spec, key)) return false
  delete spec[key]
  return true
}

/** The spec as markdown, for Export: rows by section, open ones with their question. */
export function specMarkdown(app: string, spec: Spec): string {
  const sections: [string, string][] = [['product.', 'Product'], ['ui.', 'Screens'], ['data.', 'Facts']]
  // Code-quoted, so a value's own markdown or a prompt's second line cannot add headings or items.
  const code = (t: string) => (t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``)
  const title = app.split('\n')[0]!.trim()
  const out = [`# Spec: ${title}`, '', `${lineCount(spec)} of ${MAX_ROWS} lines. Every screen of the mockup follows these.`]
  for (const [prefix, title] of sections) {
    const keys = Object.keys(spec).filter((k) => k.startsWith(prefix))
    if (!keys.length) continue
    out.push('', `## ${title}`, '')
    for (const k of keys) {
      const v = valueOf(spec, k)
      out.push(v != null ? `- ${code(k)}: ${code(v)}` : `- ${code(k)}: not decided yet (${code(spec[k]!.ask ?? 'open')})`)
    }
  }
  return out.join('\n') + '\n'
}
