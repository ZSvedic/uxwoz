// Filing: after a pick or an Edit, the background model reads the paper and the decision and replies
// in plain lines; code applies them to the boxes and refuses, with a reason, any line that breaks
// the manual's limits. A new component takes the part's HTML, and the screen pastes it there.

import { refuseLine, type Boxes, type ScreenCache, type Version } from './cache.ts'
import { LIMITS, normalizePrompt } from './keys.ts'
import { elementEnd, type Device } from './frame.ts'
import { FILING_MODEL, MODELS } from './models.ts'
import { SYSTEM_PROMPT, fileRequest } from './prompt.ts'
import { ProviderError, streamModel, type Fetch, type FinalEvent } from './providers.ts'
import { HOME_LINE, HOME_NAME } from './tree.ts'

/** Filing runs in the background, so it may take longer than a screen. */
export const FILING_DEADLINE_MS = 60_000

const BLOCKS = 'header|footer|nav|section|article|aside|main|form|fieldset|table|ul|ol|div|p|h1|h2|h3|h4|figure|details|svg|label|button|a|select|progress'

/** Each block element gets data-part="N", in order; nothing inside an svg or a script, and no paste placeholder. */
export function numberParts(html: string): string {
  let n = 0, skip = 0
  return html.replace(new RegExp(`<(/?)(${BLOCKS}|script)\\b([^>]*)>`, 'gi'), (all, close: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase()
    if (t === 'script') { skip += close ? -1 : 1; return all }
    if (skip > 0) { if (t === 'svg') skip += close ? -1 : 1; return all }
    if (close || /data-component=/i.test(attrs)) return all
    if (t === 'svg' && !/\/\s*$/.test(attrs)) skip++
    return `<${tag} data-part="${++n}"${attrs}>`
  })
}

const unnumber = (html: string) => html.replace(/ data-part="\d+"/g, '')

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
    const r = line.match(/^(change\s+)?(rule|table|row)\s+(\S+?)\s*:\s*(.+)$/i)
    if (r) return { kind: r[2]!.toLowerCase() as FilingLine['kind'], change: !!r[1], id: r[3]!, part: null, text: r[4]!.trim(), line }
    return { kind: 'bad', change: false, id: '', part: null, text: '', line }
  })
}

/** What one filing did: the IDs added and changed, and each refused line with the reason. */
export interface Filed { added: string[]; changed: string[]; refused: string[] }

const cells = (text: string) => text.split('|').map((c) => c.trim())

/**
 * Apply a filing reply to the boxes of `app`. `filedHtml` is the screen's HTML as it was filed; the
 * screen pastes each new component in its part's place only while that HTML is still its newest.
 */
export function applyFiling(cache: ScreenCache, app: string, key: string, filedHtml: string, reply: string, made: Omit<Version, 'html'>): Filed {
  const numbered = numberParts(filedHtml)
  const out: Filed = { added: [], changed: [], refused: [] }
  const refuse = (line: string, why: string) => out.refused.push(`"${line}": ${why}`)
  const cuts: { start: number; end: number; id: string }[] = []
  let table: { id: string; columns: string[]; rows: string[][]; change: boolean; line: string } | null = null
  const done = (why: string | null, line: string, id: string, change: boolean) => (why ? refuse(line, why) : (change ? out.changed : out.added).push(id))
  const flush = () => {
    if (!table) return
    const t = table
    table = null
    done(cache.setBox(app, t.change ? 'set' : 'add', 'data', { id: t.id, columns: t.columns, rows: t.rows }, 'filing'), t.line, t.id, t.change)
  }
  for (const l of parseFiling(reply)) {
    if (l.kind !== 'row') flush()
    if (l.kind === 'nothing') continue
    if (l.kind === 'bad') { refuse(l.line, 'not one of the forms'); continue }
    if (l.kind === 'rule') { done(cache.setBox(app, l.change ? 'set' : 'add', 'rules', { id: l.id, text: l.text }, 'filing'), l.line, l.id, l.change); continue }
    if (l.kind === 'table') { table = { id: l.id, columns: cells(l.text), rows: [], change: l.change, line: l.line }; continue }
    if (l.kind === 'row') {
      const t = table as { id: string; columns: string[]; rows: string[][] } | null
      if (!t || t.id !== l.id) refuse(l.line, `no table ${l.id} above it`)
      else if (cells(l.text).length !== t.columns.length) refuse(l.line, `table ${l.id} has ${t.columns.length} columns`)
      else if (t.rows.length >= LIMITS.rows) refuse(l.line, `a table has at most ${LIMITS.rows} rows`)
      else t.rows.push(cells(l.text))
      continue
    }
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
      if (c && !why) { Object.assign(c, { action: l.text, by: 'filing', at: made.createdAt, seen: false }); cache.addVersion(c.key, version) }
    } else {
      const r = cache.addComponent(app, l.id, l.text, version, 'filing', { key, label: 'a part' })
      if (typeof r === 'string') why = r
    }
    done(why, l.line, l.id, l.change)
    if (!why) cuts.push({ start, end, id: l.id })
  }
  flush()
  if (cuts.length && cache.get(key)?.versions.at(-1)?.html === filedHtml) {
    let html = numbered
    for (const c of cuts.sort((a, b) => b.start - a.start)) html = `${html.slice(0, c.start)}<div data-component="${c.id}"></div>${html.slice(c.end)}`
    cache.setNewestHtml(key, unnumber(html))
  }
  return out
}

export type FilingRun = NonNullable<Boxes['filed']>

export interface FileOptions {
  cache: ScreenCache
  key: string
  decision: { other: string } | { change: string }
  fetch?: Fetch
  env?: Record<string, string | undefined>
  log?: (msg: string) => void
}

/** File one decision: ask the filing model, apply its lines, note the run in the boxes. Null when the screen or its mockup went meanwhile. */
export async function fileDecision(o: FileOptions): Promise<FilingRun | null> {
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
  const run: FilingRun = { ...filed, at: made.createdAt, screen: entry.name ?? HOME_NAME, ms: Math.round(performance.now() - t0), costUsd: final.costUsd }
  o.cache.noteFiling(app, run)
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
