// The fixer's visit: the background model reads the paper and the screens new since its last visit
// and replies in plain lines; code applies them with refusals and keeps how to undo each change.
// The server runs the redraws, as Edits.

import type { BoxName, CacheEntry, Change, Rule, ScreenCache, Table, Visit } from './cache.ts'
import { refuseLine } from './cache.ts'
import { askBackground, backgroundVersion, numberParts, partOf } from './filing.ts'
import { visitRequest } from './prompt.ts'
import type { Fetch } from './providers.ts'
import { HOME_LINE, HOME_NAME, isComponent } from './tree.ts'

/** A visit redraws at most this many screens. */
export const MAX_REDRAWS = 5

export interface VisitLine { op: 'merge' | 'remove' | 'rule' | 'component' | 'redraw' | 'note' | 'bad'; a: string; b: string; part: number; text: string; line: string }

// Each form's groups are the same four: two IDs, a part number, a text.
const FORMS: [VisitLine['op'], RegExp][] = [
  ['merge', /^merge\s+(\S+)\s+into\s+(\S+)()()$/i],
  ['remove', /^remove\s+(\S+)()()()$/i],
  ['rule', /^add\s+rule\s+(\S+?)()()\s*:\s*(.+)$/i],
  ['component', /^add\s+component\s+(\S+)\s+from\s+(\S+)\s+part\s+(\d+)\s*:\s*(.+)$/i],
  ['redraw', /^redraw\s+(\S+?)()()\s*:\s*(.+)$/i],
  ['note', /^note()()()\s*:\s*(.+)$/i],
]

/** The lines of a visit's reply, each read as one of the forms; anything else is `bad`. */
export function parseVisit(reply: string): VisitLine[] {
  return reply.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    for (const [op, re] of FORMS) {
      const [, a, b, part, text] = line.match(re) ?? []
      if (a != null) return { op, a, b: b!, part: Number(part) || 0, text: text!.trim(), line }
    }
    return { op: 'bad', a: '', b: '', part: 0, text: '', line }
  })
}

/** What applying a visit leaves for the server: the redraws to run. */
export interface Applied { changes: Change[]; refused: string[]; redraws: { key: string; sentence: string; change: Change }[] }

/** Apply a visit's reply to the boxes of `app`; `sent` holds the numbered HTML of each screen it read, by ID. */
export function applyVisit(cache: ScreenCache, app: string, reply: string, sent: Map<string, string>): Applied {
  const out: Applied = { changes: [], refused: [], redraws: [] }
  const refuse = (line: string, why: string) => out.refused.push(`"${line}": ${why}`)
  const screens = new Map(cache.map(app).entries.filter((e) => !isComponent(e)).map((e) => [e.name ?? HOME_NAME, e]))
  let last = null as Change | null
  const did = (c: Change) => { out.changes.push((last = c)); return c }
  // Where an ID is, among the boxes: its box, its entry and its place in the list (older first).
  const find = (id: string): { box: BoxName; entry: Rule | Table | CacheEntry; index: number } | null => {
    const comps = cache.map(app).entries.filter(isComponent)
    const lists: [BoxName, (Rule | Table | CacheEntry)[]][] = [['components', comps], ['rules', cache.boxesOf(app).rules], ['data', cache.boxesOf(app).data]]
    for (const [box, list] of lists) {
      const index = list.findIndex((x) => ('id' in x ? x.id : x.name) === id)
      if (index >= 0) return { box, entry: list[index]!, index }
    }
    return null
  }
  const remove = (id: string, text: string, line: string) => {
    const f = find(id)
    if (!f) return refuse(line, `no entry ${id}`)
    if (f.entry.by === 'user') return refuse(line, `${id} was written by the user`)
    const entry = structuredClone(f.entry)
    if (f.box === 'components') cache.removeComponent(app, id)
    else cache.setBox(app, 'delete', f.box, { id }, 'fixer')
    did({ text, undo: { put: f.box, entry, index: f.index } })
  }
  for (const l of parseVisit(reply)) {
    if (l.op === 'bad') { refuse(l.line, 'not one of the forms'); continue }
    if (l.op === 'note') { if (last && !last.note) last.note = l.text; continue }
    last = null
    if (l.op === 'remove') remove(l.a, `removed ${l.a}`, l.line)
    else if (l.op === 'merge') {
      const a = find(l.a), b = find(l.b)
      if (!a || !b || a.box !== b.box || l.a === l.b) refuse(l.line, !a || !b ? `no entry ${a ? l.b : l.a}` : 'they are not two entries of one box')
      else {
        const [older, newer] = a.index < b.index ? [l.a, l.b] : [l.b, l.a]
        remove(newer, `merged ${newer} into ${older}`, l.line)
      }
    } else if (l.op === 'rule') {
      const why = cache.setBox(app, 'add', 'rules', { id: l.a, text: l.text }, 'fixer')
      if (why) refuse(l.line, why); else did({ text: `added rule ${l.a}: ${l.text}`, undo: { drop: 'rules', id: l.a } })
    } else if (l.op === 'component') {
      const html = sent.get(l.b), s = screens.get(l.b), part = html == null ? null : partOf(html, l.part)
      const why = !s || html == null ? `the visit did not read a screen ${l.b}` : part == null ? `${l.b} has no part ${l.part}` : refuseLine(l.text)
      const e = why ?? cache.addComponent(app, l.a, l.text, { ...backgroundVersion(null, s!.versions.at(-1)?.device), html: part! }, 'fixer', { key: s!.key, label: 'a part' })
      if (typeof e === 'string') refuse(l.line, e); else did({ text: `added component ${l.a} from ${l.b}`, undo: { drop: 'components', id: l.a } })
    } else {
      const s = screens.get(l.a)
      const why = !s ? `no screen ${l.a}` : !s.versions.length ? `${l.a} is waiting for a pick` : out.redraws.some((r) => r.key === s.key) ? `${l.a} is redrawn once a visit` : out.redraws.length >= MAX_REDRAWS ? `a visit redraws at most ${MAX_REDRAWS} screens` : refuseLine(l.text)
      if (why) refuse(l.line, why)
      else out.redraws.push({ key: s!.key, sentence: l.text, change: did({ text: `redrawing ${l.a}: ${l.text}` }) })
    }
  }
  return out
}

export interface VisitOptions { cache: ScreenCache; app: string; fetch?: Fetch; env?: Record<string, string | undefined>; log?: (msg: string) => void }

/** One visit: ask, apply, keep the note. Null when `dropped()` says, as the reply comes, that the mockup went. */
export async function visitPaper(o: VisitOptions, dropped: () => boolean): Promise<{ visit: Visit; redraws: Applied['redraws'] } | null> {
  const { cache, app } = o
  const all = cache.map(app).entries.filter((e) => !isComponent(e) && e.versions.length)
  const lastAt = cache.boxesOf(app).visits?.filter((v) => !v.error).at(-1)?.at ?? ''
  const fresh = all.filter((e) => e.versions.at(-1)!.createdAt > lastAt)
  const sent = new Map(fresh.map((e) => [e.name ?? HOME_NAME, numberParts(e.versions.at(-1)!.html)]))
  const at = new Date().toISOString(), t0 = performance.now()
  const user = visitRequest(cache.paper(app, all[0]?.versions.at(-1)?.device), fresh.map((e) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: sent.get(e.name ?? HOME_NAME)! })))
  const { reply, final } = await askBackground(user, o, 8000)
  if (dropped()) return null
  const applied = applyVisit(cache, app, reply, sent)
  for (const r of applied.refused) (o.log ?? console.warn)(`fixer refused ${r}`)
  const visit: Visit = { at, ms: Math.round(performance.now() - t0), costUsd: final.costUsd, screens: fresh.length, changes: applied.changes, refused: applied.refused, seen: false }
  cache.noteVisit(app, visit)
  return { visit, redraws: applied.redraws }
}
