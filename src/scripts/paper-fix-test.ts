// Paper test, part 3 (Fix): which model tidies a paper with 10 planted mistakes and harms nothing?
// Build step 1 of process/plans/2026-11-06-paper-canvas.md. The manual is the system prompt; the
// user message is the paper of paper-fix-paper.ts (NiceSnore, 12 drawn screens) with every screen's
// HTML, parts numbered. Each visit starts from the same paper: three visits measure how steady a
// model is, not a sequence.
//
//   bun --env-file=../.env scripts/paper-fix-test.ts run gpt-6.1-terra [times] [round]
//   bun scripts/paper-fix-test.ts check [round]
//
// Output: temp/paper-test/fix/<round>/<model>.json and report.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { callModel, isTestModel, numberParts, paperText, ROOT, type Call } from './paper-test-lib.ts'
import { CLEAN_SCREENS, fixPaper, GOOD, PLANTED, type Op } from './paper-fix-paper.ts'

export const FIX_FORMAT = `How to write your reply: plain lines, one change per line, no markdown, no prose. Use only these forms:
merge ID into ID
remove ID
add rule ID: one sentence
add component ID from screen-id part N
redraw screen-id: one sentence that says what to change
note: text
The parts of each screen carry numbers, like data-part="7". Name a part by its screen and its number.
An entry marked (by the user) was written by the user by hand.`

export function fixRequest() {
  const screens = fixPaper.screens.map((s) => `--- ${s.id} (${s.line})\n${numberParts(s.html!)}`).join('\n\n')
  return `${FIX_FORMAT}

The paper:

${paperText(fixPaper)}

The screens new since your last visit, all ${fixPaper.screens.length} of them:

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

/** What a visit broke: a good entry removed or merged away, or merged into a newer ID. */
export function damage(ops: Op[]): string[] {
  const out: string[] = []
  for (const o of ops) {
    if (o.op === 'remove' && GOOD.includes(o.a)) out.push(o.line)
    if (o.op === 'merge' && GOOD.includes(o.a)) out.push(o.line)
    if ((o.op === 'add-rule' || o.op === 'add-component') && GOOD.includes(o.a)) out.push(o.line)
  }
  return out
}

interface Visit { run: number; call: Call }
const dirOf = (round: string) => resolve(ROOT, 'fix', round)

async function run(model: string, times: number, round: string) {
  mkdirSync(dirOf(round), { recursive: true })
  const file = resolve(dirOf(round), `${model}.json`)
  const visits: Visit[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  await Promise.all(Array.from({ length: times }, async (_, i) => {
    const call = await callModel(model, fixRequest(), 8000)
    visits.push({ run: visits.length + i + 1, call })
    writeFileSync(file, JSON.stringify(visits, null, 2))
    console.log(`${model} visit: ${call.reply.split('\n').length} lines, ${(call.ms / 1000).toFixed(1)} s, $${call.costUsd.toFixed(4)}`)
  }))
}

function check(round: string) {
  const dir = dirOf(round)
  const out: string[] = [`# Fix, round ${round}`, '', '| | visit | repaired | which | damage | redraws of clean screens | bad lines | time | cost |', '|---|---|---|---|---|---|---|---|---|']
  const replies: string[] = []
  for (const model of ['gpt-6.1-terra', 'gemini-3.8-flash', 'claude-haiku-5.5']) {
    const file = resolve(dir, `${model}.json`)
    if (!existsSync(file)) continue
    const visits = JSON.parse(readFileSync(file, 'utf8')) as Visit[]
    visits.forEach((v, i) => {
      const ops = parseOps(v.call.reply)
      const fixed = PLANTED.filter((p) => p.repaired(ops)).map((p) => p.n)
      const harm = damage(ops)
      const clean = ops.filter((o) => o.op === 'redraw' && CLEAN_SCREENS.includes(o.a)).map((o) => o.a)
      out.push(`| ${model} | ${i + 1} | ${fixed.length} of 10 | ${fixed.join(' ')} | ${harm.length} | ${clean.join(', ') || 0} | ${ops.filter((o) => o.op === 'bad').length} | ${(v.call.ms / 1000).toFixed(1)} s | $${v.call.costUsd.toFixed(4)} |`)
      replies.push(`\n## ${model} visit ${i + 1}: repaired ${fixed.join(' ') || 'none'}; missed ${PLANTED.filter((p) => !fixed.includes(p.n)).map((p) => p.n).join(' ')}${harm.length ? `; damage: ${harm.join(' | ')}` : ''}\n\`\`\`\n${v.call.reply}\n\`\`\``)
    })
  }
  out.push('', 'Planted mistakes:', ...PLANTED.map((p) => `${p.n}. ${p.what}`))
  writeFileSync(resolve(dir, 'report.md'), out.join('\n') + '\n' + replies.join('\n'))
  console.log(out.join('\n'))
}

const [cmd, a, b, c] = process.argv.slice(2)
if (!import.meta.main) { /* imported for its parts */ } else if (cmd === 'run' && isTestModel(a)) await run(a, Number(b ?? 3), c ?? 'r1')
else if (cmd === 'check' && existsSync(dirOf(a ?? 'r1'))) check(a ?? 'r1')
else if (cmd === 'request') console.log(fixRequest())
else console.log('usage: run <model> [times] [round] | check [round] | request')
