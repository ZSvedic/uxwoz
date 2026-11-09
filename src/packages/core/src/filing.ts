// Filing: after a pick or an Edit, the background model files the decision in plain lines; code
// applies them to the boxes, refusing with a reason what breaks the manual's limits.

import { refuseLine, type Filing, type ScreenCache, type Version } from './cache.ts'
import { LIMITS, normalizePrompt } from './keys.ts'
import { elementEnd, type Device } from './frame.ts'
import { FILING_MODEL, MODELS } from './models.ts'
import { SYSTEM_PROMPT, fileRequest } from './prompt.ts'
import { ProviderError, streamModel, type Fetch, type FinalEvent } from './providers.ts'
import { HOME_LINE, HOME_NAME } from './tree.ts'

/** Filing runs in the background, so it may take longer than a screen. */
export const FILING_DEADLINE_MS = 60_000

const BLOCKS = 'header|footer|nav|section|article|aside|main|form|fieldset|table|ul|ol|div|p|h1|h2|h3|h4|figure|details|svg|label|button|a|select|progress'

/** Each block element gets data-part="N", in order (numbers a model wrote go first); nothing inside an svg or a script, and no paste placeholder. */
export function numberParts(html: string): string {
  let n = 0, skip = 0
  return unnumber(html).replace(new RegExp(`<(/?)(${BLOCKS}|script)\\b([^>]*)>`, 'gi'), (all, close: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase()
    if (t === 'script') { skip += close ? -1 : 1; return all }
    if (skip > 0) { if (t === 'svg') skip += close ? -1 : 1; return all }
    if (close || /data-component=/i.test(attrs)) return all
    if (t === 'svg' && !/\/\s*$/.test(attrs)) skip++
    return `<${tag} data-part="${++n}"${attrs}>`
  })
}

const unnumber = (html: string) => html.replace(/\s+data-part\s*=\s*(["']?)\d+\1/gi, '')

/** Where part N of a numbered screen starts and ends, or null when it has none. */
function partAt(numbered: string, n: number): { start: number; end: number } | null {
  const start = numbered.search(new RegExp(`<[a-z][\\w-]*\\s+data-part="${n}"[\\s>/]`, 'i'))
  const end = start < 0 ? -1 : elementEnd(numbered, start)
  return end < 0 ? null : { start, end }
}

/** The outer HTML of part N of a numbered screen, numbers gone; null when it has none. */
export function partOf(numbered: string, n: number): string | null {
  const p = partAt(numbered, n)
  return p && unnumber(numbered.slice(p.start, p.end))
}

export interface FilingLine { kind: 'component' | 'rule' | 'table' | 'row' | 'nothing' | 'bad'; change: boolean; id: string; part: number | null; text: string; line: string }

/** The lines of a filing reply, each read as one of the forms; anything else is `bad`. */
export function parseFiling(reply: string): FilingLine[] {
  return reply.split('\n').map((l) => l.trim()).filter(Boolean).map((line): FilingLine => {
    if (/^nothing$/i.test(line)) return { kind: 'nothing', change: false, id: '', part: null, text: '', line }
    const c = line.match(/^(change\s+)?component\s+(\S+)\s+from\s+part\s+(\d+)\s*:\s*(.+)$/i)
    if (c) return { kind: 'component', change: !!c[1], id: c[2]!, part: Number(c[3]), text: c[4]!.trim(), line }
    const r = line.match(/^(?:add\s+)?(change\s+)?(rule|table|row)\s+(\S+?)\s*:\s*(.+)$/i)
    if (r) return { kind: r[2]!.toLowerCase() as FilingLine['kind'], change: !!r[1], id: r[3]!, part: null, text: r[4]!.trim(), line }
    return { kind: 'bad', change: false, id: '', part: null, text: '', line }
  })
}

/** What one filing did: the IDs added and changed, and each refused line with the reason. */
export interface Filed { added: string[]; changed: string[]; refused: string[] }

const cells = (text: string) => text.split('|').map((c) => c.trim())

/** A rule or a table read from filing's forms, to store. */
export interface BoxLine { box: 'rules' | 'data'; change: boolean; entry: { id: string; text?: string; columns?: string[]; rows?: string[][] }; line: string }

/** Read rule, table and row lines in order: a rule goes to `set` at once, a table once its rows have come (`flush` at the end). */
export function boxLines(cache: ScreenCache, app: string, set: (l: BoxLine) => string | null, refuse: (line: string, why: string) => void) {
  let table: { id: string; columns: string[]; rows: string[][]; lines: string[]; change: boolean; line: string } | null = null
  const flush = () => {
    const t = table
    table = null
    if (t && set({ box: 'data', change: t.change, entry: { id: t.id, columns: t.columns, rows: t.rows }, line: t.line })) for (const r of t.lines) refuse(r, `table ${t.id} was refused`)
  }
  /** False for a line of another form. */
  const read = (l: FilingLine): boolean => {
    if (l.kind !== 'row') flush()
    if (l.kind === 'rule') set({ box: 'rules', change: l.change, entry: { id: l.id, text: l.text }, line: l.line })
    else if (l.kind === 'table') table = { id: l.id, columns: cells(l.text), rows: [], lines: [], change: l.change, line: l.line }
    else if (l.kind !== 'row') return false
    // A row belongs to the table above it, unless it names another table in Data.
    else if (!table) refuse(l.line, 'no table above it')
    else if (l.id !== table.id && cache.boxesOf(app).data.some((x) => x.id === l.id)) refuse(l.line, `table ${l.id} is not the one above it`)
    else if (cells(l.text).length !== table.columns.length) refuse(l.line, `table ${table.id} has ${table.columns.length} columns`)
    else if (table.rows.length >= LIMITS.rows) refuse(l.line, `a table has at most ${LIMITS.rows} rows`)
    else table.rows.push(cells(l.text)), table.lines.push(l.line)
    return true
  }
  return { read, flush }
}

/** Apply a filing reply; the screen pastes each new component in its part's place only while `filedHtml` is still its newest. */
export function applyFiling(cache: ScreenCache, app: string, key: string, filedHtml: string, reply: string, made: Omit<Version, 'html'>): Filed {
  return cache.group(() => fileLines(cache, app, key, filedHtml, reply, made))
}

function fileLines(cache: ScreenCache, app: string, key: string, filedHtml: string, reply: string, made: Omit<Version, 'html'>): Filed {
  const numbered = numberParts(filedHtml)
  const out: Filed = { added: [], changed: [], refused: [] }
  const refuse = (line: string, why: string) => out.refused.push(`"${line}": ${why}`)
  const cuts: { start: number; end: number; id: string }[] = []
  const done = (why: string | null, line: string, id: string, change: boolean) => (why ? refuse(line, why) : (change ? out.changed : out.added).push(id))
  const boxes = boxLines(cache, app, (l) => {
    const why = cache.setBox(app, l.change ? 'set' : 'add', l.box, l.entry, 'filing')
    done(why, l.line, l.entry.id, l.change)
    return why
  }, refuse)
  for (const l of parseFiling(reply)) {
    if (boxes.read(l) || l.kind === 'nothing') continue
    if (l.kind === 'bad') { refuse(l.line, 'not one of the forms'); continue }
    // A component: the outer HTML of part N.
    const p = partAt(numbered, l.part!)
    if (!p) { refuse(l.line, `the screen has no part ${l.part}`); continue }
    const { start, end } = p
    if (cuts.some((c) => start < c.end && end > c.start)) { refuse(l.line, `part ${l.part} overlaps a part filed above`); continue }
    const version: Version = { ...made, html: unnumber(numbered.slice(start, end)) }
    let why: string | null = null
    if (l.change) {
      const c = cache.component(app, l.id)
      why = !c ? `components has no ${l.id}` : refuseLine(l.text)
      if (c && !why) { cache.addVersion(c.key, version); Object.assign(c, { action: l.text, by: 'filing', at: made.createdAt, seen: false }) }
    } else {
      const r = cache.addComponent(app, l.id, l.text, version, 'filing', { key, label: 'a part' })
      if (typeof r === 'string') why = r
    }
    done(why, l.line, l.id, l.change)
    if (!why) cuts.push({ start, end, id: l.id })
  }
  boxes.flush()
  if (cuts.length && cache.get(key)?.versions.at(-1)?.html === filedHtml) {
    let html = numbered
    for (const c of cuts.sort((a, b) => b.start - a.start)) html = `${html.slice(0, c.start)}<div data-component="${c.id}"></div>${html.slice(c.end)}`
    cache.setNewestHtml(key, unnumber(html))
  }
  return out
}


export interface FileOptions {
  cache: ScreenCache
  key: string
  decision: { other: string } | { change: string }
  fetch?: Fetch
  env?: Record<string, string | undefined>
  log?: (msg: string) => void
}

/** File one decision: ask the filing model, apply its lines, note the run in the boxes. Null when the screen or its mockup went meanwhile. */
export async function fileDecision(o: FileOptions): Promise<Filing | null> {
  const entry = o.cache.get(o.key), v = entry?.versions.at(-1)
  if (!entry || !v) return null
  const { app } = entry
  const since = o.cache.now(), filedHtml = v.html, t0 = performance.now()
  const user = fileRequest(o.cache.paper(app, v.device), { id: entry.name ?? HOME_NAME, line: entry.action ?? HOME_LINE, html: numberParts(filedHtml) }, o.decision)
  const { reply, final } = await askBackground(user, o)
  // A screen deleted, or a mockup deleted or started over, meanwhile gets nothing back.
  if (o.cache.removedSince(normalizePrompt(app), since) || o.cache.removedSince(o.key, since)) return null
  const made = backgroundVersion(final.servedModel, v.device)
  const filed = applyFiling(o.cache, app, o.key, filedHtml, reply, made)
  for (const r of filed.refused) (o.log ?? console.warn)(`filing refused ${r}`)
  const run: Filing = { ...filed, at: made.createdAt, screen: entry.name ?? HOME_NAME, ms: Math.round(performance.now() - t0), costUsd: final.costUsd }
  o.cache.noteFiling(o.key, run)
  return run
}

/** Ask the background model once, with the system prompt; its whole reply and its final event. A cut-off reply is an error. */
export async function askBackground(user: string, o: { fetch?: Fetch; env?: Record<string, string | undefined> }, maxTokens = 4000) {
  let reply = '', final: FinalEvent | null = null
  for await (const ev of streamModel({ model: FILING_MODEL, system: SYSTEM_PROMPT, user, maxTokens, signal: AbortSignal.timeout(FILING_DEADLINE_MS), fetch: o.fetch, env: o.env })) {
    if (ev.type === 'text') reply += ev.text
    else final = ev
  }
  if (final?.finishReason !== 'stop') throw new ProviderError(`the reply was cut off (${final?.finishReason ?? 'no end'})`)
  return { reply, final }
}

/** A version the background model made (a component taken from a screen), without its HTML. */
export const backgroundVersion = (servedModel: string | null, device?: Device): Omit<Version, 'html'> => ({
  model: FILING_MODEL, servedModel, createdAt: new Date().toISOString(), costUsd: null, costEstimated: MODELS[FILING_MODEL].costEstimated,
  firstChunkMs: null, totalMs: 0, finishReason: 'stop', device,
})
