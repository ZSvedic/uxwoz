// Paper test, part 2 (File): after a pick or a typed change, do Haiku 5.5, Luna and Terra file what
// the decision settles, and only that? Build step 1 of process/plans/2026-11-06-paper-canvas.md.
// Takes 20 pairs from round r1 of the Draw part, each picked by hand (the reason in one word), five
// with a typed change instead. The manual is the system prompt; the user message is the paper as it
// was before the draw, the chosen variant with numbered parts, and the other variant or the change.
//
//   bun --env-file=../.env scripts/paper-file-test.ts run gpt-6.1-terra [times] [round]
//   bun scripts/paper-file-test.ts check [round]
//
// Output: temp/paper-test/file/<round>/<model>.json and review.md, one block per entry for reading.
// check also tallies temp/paper-test/file/<round>/verdicts.json when it exists: my reading of each
// entry as keep, junk or double, and of each part number as right or wrong.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { callModel, isTestModel, numberParts, paperText, pool, ROOT, visibleText, type Call, type Paper } from './paper-test-lib.ts'
import type { PaperId } from './paper-test-papers.ts'

/** One decision: a step of a Draw walk, the side picked and why, or a typed change on it. */
interface Decision { n: number; model: string; paper: PaperId; step: number; pick: 0 | 1; why?: string; change?: string }

/** Picked by hand from draw/r1, walk 1 of each model. */
export const DECISIONS: Decision[] = [
  { n: 1, model: 'claude-haiku-5.5', paper: 'nicesnore', step: 2, pick: 1, why: 'cards' },
  { n: 2, model: 'claude-haiku-5.5', paper: 'nicesnore', step: 3, pick: 1, why: 'best-first' },
  { n: 3, model: 'gpt-6-luna-fast', paper: 'nicesnore', step: 0, pick: 0, why: 'timeline' },
  { n: 4, model: 'gpt-6-luna-fast', paper: 'nicesnore', step: 2, pick: 1, why: 'explains' },
  { n: 5, model: 'gpt-6-luna-fast', paper: 'nicesnore', step: 4, pick: 1, change: 'use switches, not checkboxes' },
  { n: 6, model: 'gpt-6-luna-fast', paper: 'nicesnore', step: 5, pick: 1, why: 'simpler' },
  { n: 7, model: 'claude-haiku-5.5', paper: 'nicesnore', step: 5, pick: 0, change: 'Back reads ‹ Back at the top left' },
  { n: 8, model: 'gpt-6-luna-fast', paper: 'dashboard', step: 0, pick: 0, why: 'table' },
  { n: 9, model: 'gpt-6-luna-fast', paper: 'dashboard', step: 1, pick: 0, why: 'cards' },
  { n: 10, model: 'gpt-6-luna-fast', paper: 'dashboard', step: 2, pick: 0, why: 'table' },
  { n: 11, model: 'gpt-6-luna-fast', paper: 'dashboard', step: 3, pick: 0, why: 'weekly' },
  { n: 12, model: 'gpt-6-luna-fast', paper: 'dashboard', step: 4, pick: 0, change: "show the customer's total spent next to their name everywhere" },
  { n: 13, model: 'claude-haiku-5.5', paper: 'dashboard', step: 2, pick: 1, why: 'share' },
  { n: 14, model: 'claude-haiku-5.5', paper: 'dashboard', step: 4, pick: 0, why: 'customer-first' },
  { n: 15, model: 'gpt-6-luna-fast', paper: 'dashboard', step: 5, pick: 1, why: 'address' },
  { n: 16, model: 'gpt-6-luna-fast', paper: 'game', step: 0, pick: 1, why: 'installed' },
  { n: 17, model: 'gpt-6-luna-fast', paper: 'game', step: 2, pick: 1, why: 'inline' },
  { n: 18, model: 'gpt-6-luna-fast', paper: 'game', step: 3, pick: 0, why: 'totals' },
  { n: 19, model: 'gpt-6-luna-fast', paper: 'game', step: 1, pick: 0, change: 'use switches, not checkboxes' },
  { n: 20, model: 'claude-haiku-5.5', paper: 'game', step: 3, pick: 0, change: 'ore names start with a capital letter' },
]

/** Decisions a person would file something for: the customers table, and three typed changes. */
export const EXPECTED = [10, 12, 19, 20]

export const FILE_FORMAT = `How to write your reply: plain lines, one entry per line, no markdown, no prose. Use only these forms:
component ID from part N: where it belongs
change component ID from part N: where it belongs
rule ID: one sentence
change rule ID: the new sentence
table ID: column | column | ...
row ID: value | value | ...
nothing
The parts of the chosen variant carry numbers, like data-part="7". Name a part by its number.`

interface Drawn { steps: { target: string; line: string; variants: string[]; paper: Paper }[] }

export function loadDecision(d: Decision) {
  const w = JSON.parse(readFileSync(resolve(ROOT, 'draw', 'r1', `${d.model}-${d.paper}.json`), 'utf8')) as Drawn
  const s = w.steps[d.step]!
  return { target: s.target, line: s.line, chosen: numberParts(s.variants[d.pick]!), other: s.variants[1 - d.pick]!, paper: s.paper }
}

export function fileRequest(d: Decision) {
  const x = loadDecision(d)
  const second = d.change
    ? `The user typed this change on it: "${d.change}"`
    : `The other variant, which the user did not pick:\n${x.other}`
  return `${FILE_FORMAT}

The paper:

${paperText(x.paper)}

The decision, on the screen ${x.target} (${x.line}).
The user picked this variant:
${x.chosen}

${second}

File what this decision settles.`
}

interface Filed { n: number; call: Call }
const dirOf = (round: string) => resolve(ROOT, 'file', round)

async function run(model: string, times: number, round: string) {
  mkdirSync(dirOf(round), { recursive: true })
  const file = resolve(dirOf(round), `${model}.json`)
  const done: Filed[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const jobs = Array.from({ length: times }, () => DECISIONS).flat()
  await pool(jobs, 5, async (d) => {
    const call = await callModel(model, fileRequest(d), 4000)
    done.push({ n: d.n, call })
    writeFileSync(file, JSON.stringify(done, null, 2))
    console.log(`${model} #${d.n}: ${call.reply.split('\n').length} lines, ${(call.ms / 1000).toFixed(1)} s, $${call.costUsd.toFixed(4)}`)
  })
}

// The check -------------------------------------------------------------------------------------------

export interface Entry { kind: 'component' | 'rule' | 'table' | 'row' | 'nothing' | 'bad'; change: boolean; id: string; part: number | null; text: string; line: string }

/** The entries of a reply. A table and the rows right after it are one entry, and so is a run of rows. */
export function parseFiling(reply: string): Entry[] {
  const out: Entry[] = []
  for (const e of parseLines(reply)) {
    const last = out.at(-1)
    if (e.kind === 'row' && last && (last.kind === 'table' || last.kind === 'row')) { last.line += `\n  ${e.line}`; continue }
    out.push(e)
  }
  return out
}

function parseLines(reply: string): Entry[] {
  return reply.split('\n').map((l) => l.trim().replace(/^[-*]\s+/, '')).filter(Boolean).map((line): Entry => {
    if (/^nothing\.?$/i.test(line)) return { kind: 'nothing', change: false, id: '', part: null, text: '', line }
    const c = line.match(/^(change\s+)?component\s+([a-z0-9-]+)\s+from\s+part\s+(\d+)\s*:\s*(.+)$/i)
    if (c) return { kind: 'component', change: !!c[1], id: c[2]!, part: Number(c[3]), text: c[4]!, line }
    const r = line.match(/^(change\s+)?(rule|table|row)\s+([a-z0-9-]+)\s*:\s*(.+)$/i)
    if (r) return { kind: r[2]!.toLowerCase() as Entry['kind'], change: !!r[1], id: r[3]!, part: null, text: r[4]!, line }
    return { kind: 'bad', change: false, id: '', part: null, text: '', line }
  })
}

/** The text of part N, for reading whether the reply pointed at the right part. */
function partText(html: string, n: number): string {
  const m = html.match(new RegExp(`<(\\w+) data-part="${n}"[^>]*>`))
  if (!m) return '(no such part)'
  const start = m.index!
  const tag = m[1]!
  const close = html.indexOf(`</${tag}>`, start)
  return `<${tag}> ${visibleText(html.slice(start, close > 0 ? close : start + 300)).slice(0, 120)}`
}

type Verdicts = Record<string, { v: 'keep' | 'junk' | 'double'; part?: 'right' | 'wrong'; note?: string }>

function check(round: string) {
  const dir = dirOf(round)
  const vfile = resolve(dir, 'verdicts.json')
  const verdicts: Verdicts = existsSync(vfile) ? JSON.parse(readFileSync(vfile, 'utf8')) : {}
  const review: string[] = [`# File, round ${round}: every entry, for reading`]
  const out: string[] = [`# File, round ${round}`, '', '| | entries | keep | junk | double | bad lines | parts right | nothing | missed | cost | median time |', '|---|---|---|---|---|---|---|---|---|---|---|']
  const models = ['claude-haiku-5.5', 'gpt-6-luna', 'gpt-6.1-terra'].filter((m) => existsSync(resolve(dir, `${m}.json`)))
  const missing: string[] = []
  for (const model of models) {
    const filed = (JSON.parse(readFileSync(resolve(dir, `${model}.json`), 'utf8')) as Filed[]).sort((a, b) => a.n - b.n)
    const t = { entries: 0, keep: 0, junk: 0, double: 0, bad: 0, partsJudged: 0, partsRight: 0, nothing: 0 }
    const seen = new Map<number, number>()
    const kept = new Set<string>()
    for (const f of filed) {
      const d = DECISIONS.find((x) => x.n === f.n)!
      const x = loadDecision(d)
      const run = (seen.get(f.n) ?? 0) + 1
      seen.set(f.n, run)
      const entries = parseFiling(f.call.reply)
      review.push(`\n## ${model} #${f.n} run ${run}: ${d.paper} ${x.target}, ${d.change ? `typed "${d.change}"` : `picked ${'ab'[d.pick]} (${d.why})`}`)
      if (entries.every((e) => e.kind === 'nothing')) t.nothing++
      entries.forEach((e, i) => {
        if (e.kind === 'nothing') return
        if (e.kind === 'bad') { t.bad++; review.push(`- BAD: ${e.line}`); return }
        t.entries++
        const key = `${model}#${f.n}.${run}.${i}`
        const v = verdicts[key]
        if (v) { t[v.v]++; if (v.v === 'keep') kept.add(`${f.n}.${run}`) }
        else missing.push(key)
        if (e.part != null && v?.part) { t.partsJudged++; if (v.part === 'right') t.partsRight++ }
        review.push(`- [${key}] ${e.line}${e.part != null ? `\n  part ${e.part} is ${partText(x.chosen, e.part)}` : ''}${v ? `\n  verdict: ${v.v}${v.part ? `, part ${v.part}` : ''}${v.note ? ` (${v.note})` : ''}` : ''}`)
      })
    }
    const ms = filed.map((f) => f.call.ms).sort((a, b) => a - b)
    const cost = filed.reduce((s, f) => s + f.call.costUsd, 0)
    const runs = Math.max(...seen.values())
    const missed = EXPECTED.flatMap((n) => Array.from({ length: runs }, (_, k) => `${n}.${k + 1}`)).filter((k) => !kept.has(k)).map((k) => `#${k.split('.')[0]}`)
    out.push(`| ${model} | ${t.entries} | ${t.keep} | ${t.junk} | ${t.double} | ${t.bad} | ${t.partsJudged ? `${t.partsRight} of ${t.partsJudged}` : "not read"} | ${t.nothing} of ${filed.length} | ${missed.join(' ') || 0} | $${cost.toFixed(3)} | ${(ms[ms.length >> 1]! / 1000).toFixed(1)} s |`)
  }
  if (missing.length) out.push(`\n${missing.length} entries have no verdict yet.`)
  writeFileSync(resolve(dir, 'review.md'), review.join('\n'))
  writeFileSync(resolve(dir, 'report.md'), out.join('\n'))
  console.log(out.join('\n'))
}

const [cmd, a, b, c] = process.argv.slice(2)
if (!import.meta.main) { /* imported for its parts */ } else if (cmd === 'run' && isTestModel(a)) await run(a, Number(b ?? 1), c ?? 'r1')
else if (cmd === 'check' && existsSync(dirOf(a ?? 'r1'))) check(a ?? 'r1')
else console.log('usage: run <model> [times] [round] | check [round]')
