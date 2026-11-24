// The tour (spec/behavior.md, The tour): a read-only project read from the folder `tour/` at each request, sent as
// /api/map sends a mockup. `<name>.html` is a mock (`home.html` first), `rules.md` and `data.md` in the form Export
// writes, `components/<id>.html` (a leading `<!-- … -->` says where it belongs), `notes.md` one fixer's change a line.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HOME_NAME, ScreenCache, isId, linksIn, normalizePrompt, screenIdea, screenName, screenRef, type Version } from '@uxwoz/core'

/** The tour's folder, at the repo's root beside recordings/ (in the image too). */
export const TOUR_DIR = resolve(import.meta.dir, '../../../../tour')
/** The tour's project name: every route that changes something refuses it. */
export const TOUR_APP = 'The UXWoz tour'
/** Whether a project name, a key or a `?app=` is the tour's. */
export const isTour = (appOrKey: unknown) => typeof appOrKey === 'string' && normalizePrompt(appOrKey.split(' » ')[0]!) === normalizePrompt(TOUR_APP)

const AT = '2026-11-24T00:00:00.000Z'
const version = (html: string): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: AT, costUsd: 0, costEstimated: false, firstChunkMs: null, totalMs: 0,
  finishReason: 'stop', device: 'small-phone', name: screenName(html) || undefined, idea: screenIdea(html) || undefined,
})
const read = (dir: string, f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '')

/** The markdown table rows of data.md under each `## id`: the columns, then the rows. */
function tables(md: string) {
  const out: { id: string; columns: string[]; rows: string[][] }[] = []
  for (const line of md.split('\n').map((l) => l.trim())) {
    const h = line.match(/^## (.+)$/)
    if (h) { out.push({ id: h[1]!.trim(), columns: [], rows: [] }); continue }
    const t = out.at(-1)
    if (!t || !line.startsWith('|')) continue
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
    if (cells.every((c) => /^-{3,}$/.test(c))) continue
    if (!t.columns.length) t.columns = cells
    else t.rows.push(cells)
  }
  return out
}

/** The tour as a cache of its own, built from `dir`. */
export function tourCache(dir = TOUR_DIR, log: (m: string) => void = console.warn): ScreenCache {
  const cache = new ScreenCache(), app = TOUR_APP
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).filter(isId) : []
  if (!files.includes(HOME_NAME)) return cache
  const html = new Map(files.map((n) => [n, read(dir, `${n}.html`).trim()]))
  cache.addScreen(app, null, version(html.get(HOME_NAME)!))
  // From Home along the links, so each mock's parent is the first mock that links to it, with that link's words.
  const queue = [HOME_NAME], seen = new Set(queue)
  while (queue.length) {
    const from = queue.shift()!
    for (const l of linksIn(html.get(from)!)) {
      const ref = screenRef(l.action)
      if (!ref || seen.has(ref.name) || !html.has(ref.name)) continue
      seen.add(ref.name)
      queue.push(ref.name)
      cache.addScreen(app, `@${ref.name}: ${ref.prompt || ref.name}`, version(html.get(ref.name)!), { key: cache.find(app, from === HOME_NAME ? null : `@${from}`)!.key, label: l.label })
    }
  }
  for (const n of files.filter((n) => !seen.has(n))) cache.addScreen(app, `@${n}: ${n}`, version(html.get(n)!))
  cache.group(() => {
    const cdir = join(dir, 'components')
    for (const f of existsSync(cdir) ? readdirSync(cdir).filter((f) => f.endsWith('.html')).sort() : []) {
      const text = read(cdir, f).trim(), where = text.match(/^<!--([\s\S]*?)-->/)
      const why = cache.addComponent(app, f.slice(0, -5), where?.[1]!.trim() || 'every mock', version(text.slice(where?.[0].length ?? 0).trim()), 'filing')
      if (typeof why === 'string') log(`tour: component ${f}: ${why}`)
    }
    for (const m of read(dir, 'rules.md').matchAll(/^- ([a-z0-9-]+): (.+)$/gm)) {
      const why = cache.setBox(app, 'add', 'rules', { id: m[1]!, text: m[2]!.trim() }, 'filing')
      if (why) log(`tour: rule ${m[1]}: ${why}`)
    }
    for (const t of tables(read(dir, 'data.md'))) {
      const why = cache.setBox(app, 'add', 'data', t, 'filing')
      if (why) log(`tour: table ${t.id}: ${why}`)
    }
  }, undefined, 'Filing after home')
  const notes = read(dir, 'notes.md').split('\n').map((l) => l.trim()).filter(Boolean)
  if (notes.length) cache.noteVisit(app, { at: AT, ms: 0, costUsd: 0, screens: files.length, changes: notes.map((text) => ({ text })), refused: [], seen: false })
  return cache
}

/** GET /api/tour: the tour as /api/map sends a mockup. */
export function tourMap(dir = TOUR_DIR) {
  const cache = tourCache(dir)
  return { ...cache.map(TOUR_APP), past: cache.past(TOUR_APP), filing: false, visiting: false }
}
