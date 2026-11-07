// Paper test, part 3 (Fix): which model tidies a paper with 10 planted mistakes and harms nothing?
// Build step 1 of process/plans/2026-11-06-paper-canvas.md. The manual is the system prompt; the
// user message is one paper of paper-fix-paper.ts with every screen's HTML, parts numbered. Each
// visit starts from the same paper: three visits measure how steady a model is, not a sequence.
// Papers: nicesnore-v1 (rounds 1 and 2), nicesnore (the contradiction turned round, round 3 on),
// dashboard (held out: no manual change was tried on it).
//
//   bun --env-file=../.env scripts/paper-fix-test.ts run gpt-6.1-terra [times] [round] [paper]
//   bun scripts/paper-fix-test.ts check [round]
//   bun scripts/paper-fix-test.ts request [paper]
//
// Output: temp/paper-test/fix/<round>/<model>-<paper>.json and report.md. Rounds 1 and 2 saved
// <model>.json, which is nicesnore-v1.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { callModel, isTestModel, numberParts, paperText, ROOT, type Call } from './paper-test-lib.ts'
import { FIX_CASES, type FixCase, type Op } from './paper-fix-paper.ts'

export const FIX_FORMAT = `How to write your reply: plain lines, one change per line, no markdown, no prose. Use only these forms:
merge ID into ID
remove ID
add rule ID: one sentence
add component ID from screen-id part N
redraw screen-id: one sentence that says what to change
note: text
The parts of each screen carry numbers, like data-part="7". Name a part by its screen and its number.
An entry marked (by the user) was written by the user by hand.`

export function fixRequest(c: FixCase) {
  const screens = c.paper.screens.map((s) => `--- ${s.id} (${s.line})\n${numberParts(s.html!)}`).join('\n\n')
  return `${FIX_FORMAT}

The paper:

${paperText(c.paper)}

The screens new since your last visit, all ${c.paper.screens.length} of them:

${screens}

Visit the paper as the overnight fixer.`
}

export function parseOps(reply: string): Op[] {
  return reply.split('\n').map((l) => l.trim().replace(/^[-*]\s+/, '').replace(/`/g, '')).filter(Boolean).map((line): Op => {
    let m = line.match(/^merge\s+([a-z0-9-]+)\s+into\s+([a-z0-9-]+)\.?$/i)
    if (m) return { op: 'merge', a: m[1]!, b: m[2]!, text: '', line }
    m = line.match(/^remove\s+([a-z0-9-]+)\.?$/i)
    if (m) return { op: 'remove', a: m[1]!, b: '', text: '', line }
    m = line.match(/^add rule\s+([a-z0-9-]+)\s*:\s*(.+)$/i)
    if (m) return { op: 'add-rule', a: m[1]!, b: '', text: m[2]!, line }
    m = line.match(/^add component\s+([a-z0-9-]+)\s+from\s+([a-z0-9-]+)\s+part\s+(\d+)\b/i)
    if (m) return { op: 'add-component', a: m[1]!, b: m[2]!, text: m[3]!, line }
    m = line.match(/^redraw\s+([a-z0-9-]+)\s*:\s*(.+)$/i)
    if (m) return { op: 'redraw', a: m[1]!, b: '', text: m[2]!, line }
    m = line.match(/^note\s*:\s*(.+)$/i)
    if (m) return { op: 'note', a: '', b: '', text: m[1]!, line }
    return { op: 'bad', a: '', b: '', text: '', line }
  })
}

/** What a visit broke: a good entry removed, merged away or added over, or a redraw that makes a screen wrong. */
export function damage(c: FixCase, ops: Op[]): string[] {
  const out: string[] = []
  for (const o of ops) {
    if ((o.op === 'remove' || o.op === 'merge' || o.op === 'add-rule' || o.op === 'add-component') && c.good.includes(o.a)) out.push(o.line)
    if (o.op === 'redraw' && c.harm.some((h) => (h.screen === '*' || h.screen === o.a) && h.re.test(o.text))) out.push(o.line)
  }
  return out
}

interface Visit { call: Call }
const dirOf = (round: string) => resolve(ROOT, 'fix', round)

async function run(model: string, times: number, round: string, paper: string) {
  mkdirSync(dirOf(round), { recursive: true })
  const file = resolve(dirOf(round), `${model}-${paper}.json`)
  const visits: Visit[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  await Promise.all(Array.from({ length: times }, async () => {
    const call = await callModel(model, fixRequest(FIX_CASES[paper]!), 8000)
    visits.push({ call })
    writeFileSync(file, JSON.stringify(visits, null, 2))
    console.log(`${model} ${paper} visit: ${call.reply.split('\n').length} lines, ${(call.ms / 1000).toFixed(1)} s, $${call.costUsd.toFixed(4)}`)
  }))
}

function check(round: string) {
  const dir = dirOf(round)
  const out: string[] = [`# Fix, round ${round}`, '', '| paper | model | visit | repaired | which | damage | redraws of clean screens | bad lines | time | cost |', '|---|---|---|---|---|---|---|---|---|---|']
  const replies: string[] = []
  const papers = new Set<string>()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  for (const paper of Object.keys(FIX_CASES)) for (const model of ['gpt-6.1-terra', 'gemini-3.8-flash', 'claude-haiku-5.5']) {
    const name = files.find((f) => f === `${model}-${paper}.json`) ?? (paper === 'nicesnore-v1' ? files.find((f) => f === `${model}.json`) : undefined)
    if (!name) continue
    const c = FIX_CASES[paper]!
    papers.add(paper)
    const visits = JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as Visit[]
    visits.forEach((v, i) => {
      const ops = parseOps(v.call.reply)
      const fixed = c.planted.filter((p) => p.repaired(ops)).map((p) => p.n)
      const harm = damage(c, ops)
      const clean = ops.filter((o) => o.op === 'redraw' && c.clean.includes(o.a)).map((o) => o.a)
      out.push(`| ${paper} | ${model} | ${i + 1} | ${fixed.length} of 10 | ${fixed.join(' ')} | ${harm.length} | ${clean.join(', ') || 0} | ${ops.filter((o) => o.op === 'bad').length} | ${(v.call.ms / 1000).toFixed(1)} s | $${v.call.costUsd.toFixed(4)} |`)
      replies.push(`\n## ${paper} ${model} visit ${i + 1}: repaired ${fixed.join(' ') || 'none'}; missed ${c.planted.filter((p) => !fixed.includes(p.n)).map((p) => p.n).join(' ')}${harm.length ? `; damage: ${harm.join(' | ')}` : ''}\n\`\`\`\n${v.call.reply}\n\`\`\``)
    })
  }
  for (const paper of papers) out.push('', `Planted in ${paper}:`, ...FIX_CASES[paper]!.planted.map((p) => `${p.n}. ${p.what}`))
  writeFileSync(resolve(dir, 'report.md'), out.join('\n') + '\n' + replies.join('\n'))
  console.log(out.join('\n'))
}

const [cmd, a, b, c, d] = process.argv.slice(2)
if (!import.meta.main) { /* imported for its parts */ } else if (cmd === 'run' && isTestModel(a) && FIX_CASES[d ?? 'nicesnore']) await run(a, Number(b ?? 3), c ?? 'r3', d ?? 'nicesnore')
else if (cmd === 'check' && existsSync(dirOf(a ?? 'r1'))) check(a ?? 'r1')
else if (cmd === 'request' && FIX_CASES[a ?? 'nicesnore']) console.log(fixRequest(FIX_CASES[a ?? 'nicesnore']!))
else console.log('usage: run <model> [times] [round] [paper] | check [round] | request [paper]')
