// Paper test, part 1 (Draw): do Haiku 5.5 and Luna follow the canvas manual when they draw a screen?
// Build step 1 of process/plans/2026-11-06-paper-canvas.md. The manual is the system prompt as it
// is; the user message is the paper (titles, lines, the three boxes), the screen the click came
// from, and the request. Each walk starts from a hand-made paper and clicks on like a user: the
// first undrawn screen a drawn one links to, sides picked in turn, the boxes left as they are.
//
//   bun --env-file=../.env scripts/paper-draw-test.ts run claude-haiku-5.5 [screens] [round] [paper]
//   bun scripts/paper-draw-test.ts check [round]
//
// Output: temp/paper-test/draw/<round>/<model>-<paper>.json, report.md and a gallery per walk.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { framePage } from '@uxwoz/core'
import { actionsIn, callModel, isTestModel, manual, paperText, pasteAll, pool, ROOT, visibleText, type Call, type Paper } from './paper-test-lib.ts'
import { PAPERS, type PaperId } from './paper-test-papers.ts'

/** How to write the reply: the HTML format and the two mechanisms code gives the paper. */
export const FORMAT = `How to write your reply: two variants of the screen, one after the other, as HTML fragments that classless Pico.css styles. Begin each variant with <title>Name</title>. No markdown fences, no prose.
- Write no CSS and no classes; a few inline style attributes for layout are fine. Script, if any, goes in one <script> at the end of its variant.
- A control that opens a screen on the paper has data-action="@id". A control that opens a new screen has data-action="@id: its one line". A control that goes back has data-action="back".
- To paste a component, write an empty element with its ID, like <div data-component="tab-bar"></div>. The app puts the component there.
- Keep each variant under about 2,500 characters.`

interface Step { walk: number; target: string; line: string; from: string; label: string; call: Call; variants: string[]; picked: number; paper: Paper }
interface Walk { model: string; paper: PaperId; manual: string; steps: Step[] }

const dirOf = (round: string) => resolve(ROOT, 'draw', round)

/** Two variants from one reply: each begins at its <title>. */
export function splitVariants(reply: string): string[] {
  const clean = reply.replace(/^```\w*\s*|```\s*$/gm, '')
  const at = [...clean.matchAll(/<title>/gi)].map((m) => m.index!)
  return at.map((i, k) => clean.slice(i, at[k + 1] ?? clean.length).trim())
}

/** The next click: the first link from a drawn screen to a screen with a title and no drawing. */
function nextClick(p: Paper) {
  for (const s of p.screens) {
    if (!s.html) continue
    for (const a of actionsIn(s.html, p.components)) {
      const t = p.screens.find((x) => x.id === a.target && !x.html)
      if (t) return { from: s, target: t, label: a.label }
    }
  }
  return null
}

export function drawRequest(p: Paper, from: { id: string; line: string; html?: string }, target: { id: string; line: string }, label: string) {
  return `${FORMAT}

The paper:

${paperText(p)}

The screen the click came from, ${from.id} (${from.line}):
${from.html}

Draw this screen: ${target.id}: ${target.line}
The click came from "${label}" on ${from.id}.`
}

async function walk(model: string, id: PaperId, screens: number, round: string) {
  let paper: Paper = structuredClone(PAPERS[id].paper)
  let walkNo = 1
  const w: Walk = { model, paper: id, manual: manual(), steps: [] }
  const file = resolve(dirOf(round), `${model}-${id}.json`)
  for (let n = 0; n < screens; n++) {
    let click = nextClick(paper)
    if (!click) {
      // Every linked screen is drawn: start again from the hand-made paper, as a second user would.
      console.log(`${model} ${id}: no undrawn screen is linked after ${n} screens, walk ${walkNo + 1} starts`)
      if (w.steps.at(-1)?.walk !== walkNo) break
      paper = structuredClone(PAPERS[id].paper)
      walkNo++
      click = nextClick(paper)!
    }
    const before = structuredClone(paper)
    const call = await callModel(model, drawRequest(paper, click.from, click.target, click.label))
    const variants = splitVariants(call.reply)
    const picked = variants.length > 1 ? n % 2 : 0
    w.steps.push({ walk: walkNo, target: click.target.id, line: click.target.line, from: click.from.id, label: click.label, call, variants, picked, paper: before })
    // The pick goes on the paper, with the new screens its links name.
    click.target.html = variants[picked] ?? '<title>Empty</title>'
    for (const a of actionsIn(click.target.html, paper.components))
      if (a.line && /^[a-z0-9-]+$/.test(a.target) && !paper.screens.some((s) => s.id === a.target)) paper.screens.push({ id: a.target, line: a.line })
    writeFileSync(file, JSON.stringify(w, null, 2))
    console.log(`${model} ${id} ${n + 1} (walk ${walkNo}): ${click.target.id} from ${click.from.id} "${click.label}", ${variants.length} variants, ${(call.ms / 1000).toFixed(1)} s, $${call.costUsd.toFixed(4)}`)
  }
}

// The check -------------------------------------------------------------------------------------------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const PASTE = /<(\w+)\b[^>]*\bdata-component\s*=\s*(["'])([^"']+)\2[^>]*>([\s\S]*?)<\/\1>/gi

/** What code can see in one variant. Rules marked for reading come back as text to read. */
export function checkVariant(id: PaperId, target: string, html: string, paper: Paper) {
  const { check } = PAPERS[id]
  const pastes = [...html.matchAll(PASTE)].map((m) => ({ id: m[3]!, filled: m[4]!.trim().length > 0 }))
  const bare = html.replace(PASTE, '')
  const text = visibleText(bare)
  const components = paper.components.map((c) => {
    const pasted = pastes.some((p) => p.id === c.id)
    const redrawn = check.redrawn[c.id]!(bare, text)
    const needed = check.needs[c.id]!(target)
    return { id: c.id, needed, pasted, redrawn, missing: needed && !pasted && !redrawn }
  })
  const unknownPastes = pastes.filter((p) => !paper.components.some((c) => c.id === p.id)).map((p) => p.id)
  const rules = Object.entries(check.rules).map(([rid, r]) => {
    const fits = r.fits(bare, text)
    return { id: rid, fits, broken: fits ? r.broken(bare, text) : null }
  })
  const fullText = visibleText(pasteAll(html, paper.components))
  const data = paper.data.map((t) => {
    const keys = t.rows.slice(1).map((r) => r[0]!)
    const used = keys.filter((k) => fullText.toLowerCase().includes(k.toLowerCase()))
    const re = check.items[t.id]
    // An item of this kind that no cell of any table holds (a remedy's start date is no new night).
    const cells = paper.data.flatMap((d) => d.rows.slice(1).flat()).map((x) => x.toLowerCase())
    const invented = re ? [...new Set([...fullText.matchAll(re)].map((m) => m[0]))].filter((x) => !cells.includes(x.toLowerCase())) : []
    return { id: t.id, used, invented }
  })
  // Controls that lead nowhere: a link or button with no data-action that no script can reach,
  // or a data-action that names no screen on the paper and gives no line for a new one.
  const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? ''
  const ids = new Set(paper.screens.map((s) => s.id))
  const declared = new Set(actionsIn(html, paper.components).filter((a) => a.line).map((a) => a.target))
  const nowhere: string[] = []
  for (const m of bare.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = m[2]!
    const label = visibleText(m[3]!).slice(0, 40)
    const act = attrs.match(/data-action\s*=\s*(["'])(.*?)\1/)?.[2]?.trim()
    if (act !== undefined) {
      const t = act.match(/^@([a-z0-9-]+)/)?.[1]
      if (act === 'back') continue
      if (!t) nowhere.push(`"${label}" -> ${act.slice(0, 30)}${/^[a-z0-9-]+(:|$)/.test(act) ? ' (no @)' : ''}`)
      else if (!ids.has(t) && !declared.has(t) && !act.includes('${')) nowhere.push(`"${label}" -> @${t} (unknown)`)
      continue
    }
    if (/\bonclick=|\btype=["']?submit|\bhref=["']?#[a-z]/i.test(attrs)) continue
    const elId = attrs.match(/\bid=["']([^"']+)/)?.[1]
    const dataAttr = attrs.match(/\bdata-([a-z-]+)=/)?.[1]
    const reachable = (elId && script.includes(elId)) || (dataAttr && script.includes(dataAttr))
      || /querySelectorAll\(\s*["'`][^"'`]*\b(button|a)\b/.test(script) || /closest\(\s*["'`](button|a)\b/.test(script)
    if (!reachable) nowhere.push(`"${label}" (no data-action)`)
  }
  // Rows of one list: links in repeated rows (li, tr, article) or built by a script template.
  const lists: { rows: number; targets: string[]; perItem: boolean }[] = []
  for (const tag of ['li', 'tr', 'article']) {
    const rows = [...bare.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))]
      .map((m) => [...m[1]!.matchAll(/data-action\s*=\s*(["'])@([a-z0-9-]+)/gi)].map((x) => x[2]!))
      .filter((t) => t.length)
    if (rows.length < 2) continue
    const targets = [...new Set(rows.map((t) => t[0]!))]
    const keys = paper.data.flatMap((t) => t.rows.slice(1).map((r) => slug(r[0]!))).filter((k) => k.length > 2)
    const perItem = targets.length > 1 && targets.some((t) => keys.some((k) => t.includes(k)))
    lists.push({ rows: rows.length, targets, perItem })
  }
  if (/data-action\s*=\s*\\?["']@[a-z0-9-]*\$\{/i.test(script)) lists.push({ rows: 0, targets: ['(script template)'], perItem: true })
  return { components, unknownPastes, rules, data, nowhere, lists, chars: html.length }
}

type Checked = ReturnType<typeof checkVariant>

function gallery(w: Walk, dir: string) {
  const css = readFileSync(resolve(import.meta.dir, '../packages/web/themes/pico.css'), 'utf8')
    + readFileSync(resolve(import.meta.dir, '../packages/web/themes/mockup.css'), 'utf8')
  const width = PAPERS[w.paper].paper.device === 'phone' ? 390 : 1024
  const cards = w.steps.flatMap((s, i) => s.variants.slice(0, 2).map((v, k) => `<figure><figcaption>${i + 1}${'ab'[k]}${s.picked === k ? ' (picked)' : ''} ${s.target} <small>from ${s.from} "${s.label}"</small></figcaption>`
    + `<iframe sandbox="allow-scripts" srcdoc="${framePage(pasteAll(v, s.paper.components), css, true).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></figure>`)).join('\n')
  writeFileSync(resolve(dir, `${w.model}-${w.paper}.html`), `<!doctype html><meta charset="utf-8"><title>${w.model} ${w.paper}</title>
<style>body{font:13px system-ui;display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#eee}figure{margin:0}iframe{width:${width}px;height:900px;border:1px solid #ccc;background:#fff}</style>${cards}`)
}

function check(rounds: string[]) {
  const dir = dirOf(rounds[0]!)
  const walks = rounds.flatMap((r) => readdirSync(dirOf(r)).filter((f) => f.endsWith('.json'))
    .map((f) => ({ ...(JSON.parse(readFileSync(resolve(dirOf(r), f), 'utf8')) as Walk), dir: dirOf(r) })))
  const out: string[] = [`# Draw, ${rounds.join(' + ')}`]
  const models = [...new Set(walks.map((w) => w.model))]
  const reading: string[] = ['\n# For reading']
  for (const model of models) {
    const rows: { w: Walk; s: Step; k: number; c: Checked }[] = []
    for (const w of walks.filter((w) => w.model === model)) {
      gallery(w, w.dir)
      // A reply that runs on past two variants counts once as such; only its first two are checked.
      for (const s of w.steps) s.variants.slice(0, 2).forEach((v, k) => rows.push({ w, s, k, c: checkVariant(w.paper, s.target, v, s.paper) }))
    }
    const comps = rows.flatMap((r) => r.c.components.map((c) => ({ ...c, r })))
    const needed = comps.filter((c) => c.needed)
    const rules = rows.flatMap((r) => r.c.rules.filter((x) => x.fits).map((x) => ({ ...x, r })))
    const steps = rows.filter((r) => r.k === 0).map((r) => r.s)
    const cost = steps.reduce((s, x) => s + x.call.costUsd, 0)
    const ms = steps.map((x) => x.call.ms).sort((a, b) => a - b)
    const pct = (a: number, b: number) => `${a} of ${b}${b ? ` (${Math.round((100 * a) / b)}%)` : ''}`
    out.push(`\n## ${model}: ${steps.length} calls, ${rows.length} variants, $${cost.toFixed(3)}, median ${(ms[ms.length >> 1]! / 1000).toFixed(1)} s`)
    out.push(`calls with fewer than 2 variants: ${steps.filter((s) => s.variants.length < 2).length}; more than 2: ${steps.filter((s) => s.variants.length > 2).length}; cut off: ${steps.filter((s) => s.call.finish !== 'stop').length}`)
    out.push(`components needed: ${needed.length}; pasted ${pct(needed.filter((c) => c.pasted).length, needed.length)}, redrawn by hand ${needed.filter((c) => !c.pasted && c.redrawn).length}, missing ${needed.filter((c) => c.missing).length}`)
    out.push(`components pasted and also redrawn: ${comps.filter((c) => c.pasted && c.redrawn).length}; pasted where not needed: ${comps.filter((c) => c.pasted && !c.needed).length}; filled paste elements or unknown IDs: ${rows.filter((r) => r.c.unknownPastes.length).length}`)
    for (const cid of [...new Set(comps.map((c) => `${c.r.w.paper}/${c.id}`))]) {
      const n = needed.filter((c) => `${c.r.w.paper}/${c.id}` === cid)
      out.push(`  ${cid}: needed ${n.length}, pasted ${n.filter((c) => c.pasted).length}, redrawn ${n.filter((c) => !c.pasted && c.redrawn).length}, missing ${n.filter((c) => c.missing).length}`)
    }
    out.push(`rules checked by code: fit ${rules.length}, held ${pct(rules.filter((r) => !r.broken).length, rules.length)}`)
    for (const rid of [...new Set(rules.map((r) => `${r.r.w.paper}/${r.id}`))]) {
      const n = rules.filter((r) => `${r.r.w.paper}/${r.id}` === rid)
      out.push(`  ${rid}: fits ${n.length}, held ${n.filter((r) => !r.broken).length}${n.some((r) => r.broken) ? `; e.g. ${[...new Set(n.filter((r) => r.broken).map((r) => JSON.stringify(r.broken!.slice(0, 60))))].slice(0, 4).join(', ')}` : ''}`)
    }
    const dataRows = rows.flatMap((r) => r.c.data.map((d) => ({ ...d, r })))
    out.push(`data: variants showing a table's rows ${dataRows.filter((d) => d.used.length).length}; with items not in the table (where code can tell) ${dataRows.filter((d) => d.invented.length).length}`)
    out.push(`controls that lead nowhere: ${rows.filter((r) => r.c.nowhere.length).length} variants, ${rows.reduce((s, r) => s + r.c.nowhere.length, 0)} controls`)
    const lists = rows.flatMap((r) => r.c.lists)
    out.push(`lists with linked rows: ${lists.length}; rows open one screen ${lists.filter((l) => l.targets.length === 1 && !l.perItem).length}; several screens ${lists.filter((l) => l.targets.length > 1 && !l.perItem).length}; one screen per item ${lists.filter((l) => l.perItem).length}`)
    out.push('')
    for (const { w, s, k, c } of rows) {
      const p = [
        ...c.components.filter((x) => x.missing).map((x) => `missing ${x.id}`),
        ...c.components.filter((x) => !x.pasted && x.redrawn).map((x) => `redrew ${x.id}`),
        ...c.unknownPastes.map((x) => `unknown paste ${x}`),
        ...c.rules.filter((x) => x.broken).map((x) => `${x.id}: ${JSON.stringify(x.broken!.slice(0, 50))}`),
        ...c.data.filter((d) => d.invented.length).map((d) => `not in ${d.id}: ${d.invented.slice(0, 3).join(', ')}`),
        ...c.nowhere.map((x) => `nowhere ${x}`),
        ...c.lists.filter((l) => l.targets.length > 1).map((l) => `list rows -> ${l.targets.join(', ')}${l.perItem ? ' (per item)' : ''}`),
      ]
      out.push(`  ${w.paper} ${s.target}${'ab'[k]} ${p.join('; ') || 'ok'}`)
      const t = visibleText(pasteAll(s.variants[k]!, s.paper.components))
      reading.push(`\n## ${model} ${w.paper} ${s.target}${'ab'[k]} (data used: ${c.data.map((d) => `${d.id} ${d.used.length}`).join(', ')})\n${t.slice(0, 700)}`)
    }
  }
  writeFileSync(resolve(dir, 'report.md'), out.join('\n') + '\n' + reading.join('\n'))
  console.log(out.join('\n'))
}

const [cmd, a, b, c, d] = process.argv.slice(2)
if (!import.meta.main) { /* imported for its parts */ } else if (cmd === 'run' && isTestModel(a)) {
  const round = c ?? 'r1'
  mkdirSync(dirOf(round), { recursive: true })
  const ids = (d ? [d] : Object.keys(PAPERS)) as PaperId[]
  await pool(ids, 3, (id) => walk(a, id, Number(b ?? 10), round))
} else if (cmd === 'check' && process.argv.slice(3).every((r) => existsSync(dirOf(r)))) check(process.argv.slice(3).length ? process.argv.slice(3) : ['r1'])
else console.log('usage: run <model> [screens] [round] [paper] | check [round]')
