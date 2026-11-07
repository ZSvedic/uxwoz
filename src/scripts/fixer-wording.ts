// Try a wording of the manual's section "The overnight fixer" on two planted papers, as the app's
// first visit would send them, and score each reply. Nothing is applied. A few cents a run.
//   bun --env-file=../.env scripts/fixer-wording.ts <section.md> [times] [label]
// <section.md> holds the section's body (the text under its heading); "current" uses the prompt as it is.
// Papers: the planted NiceSnore of the fixer report (temp/fixer-wording/nicesnore-planted.json, 5 plants)
// and the held-out dashboard of the paper test (10 plants). Replies go to temp/fixer-wording/<label>.md.
// The NiceSnore file is temp/screen-cache-fixer.json of step 4 with the fixer's versions and visits taken
// out (temp/ is not in git; process/journal/2026-11-07-fixer.md describes the plants).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { FILING_MODEL, HOME_LINE, HOME_NAME, ScreenCache, SYSTEM_PROMPT, isComponent, numberParts, streamModel, visitRequest, type Paper as CorePaper } from '@uxwoz/core'
import { FIX_CASES, type Op } from './paper-fix-paper.ts'
import { damage, parseOps } from './paper-fix-test.ts'
import { paperLines } from './paper-test-lib.ts'

const DIR = resolve(import.meta.dir, '../../temp/fixer-wording')
const [sectionFile = 'current', times = '5', label = 'current'] = process.argv.slice(2)

const HEAD = '## The overnight fixer\n\n', NEXT = '\n\n## Mistakes'
const start = SYSTEM_PROMPT.indexOf(HEAD) + HEAD.length, end = SYSTEM_PROMPT.indexOf(NEXT)
const system = sectionFile === 'current' ? SYSTEM_PROMPT : SYSTEM_PROMPT.slice(0, start) + readFileSync(sectionFile, 'utf8').trim() + SYSTEM_PROMPT.slice(end)

// NiceSnore, planted: its request as fixer-reply.ts builds it.
const snore = new ScreenCache(resolve(DIR, 'nicesnore-planted.json'))
const snoreApp = snore.apps()[0]!.app
const snoreAll = snore.map(snoreApp).entries.filter((e) => !isComponent(e) && e.versions.length)
const snoreReq = visitRequest(snore.paper(snoreApp, snoreAll[0]!.versions.at(-1)!.device), snoreAll.map((e) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: numberParts(e.versions.at(-1)!.html) })))

// The dashboard of the paper test, as the app's paper.
const dash = FIX_CASES.dashboard!
const d = dash.paper
const dashPaper: CorePaper = {
  app: d.app, device: d.device, titles: d.screens.map((s) => `${s.id}: ${s.line}`), lines: paperLines(d).map(([f, t]) => `${f} -> ${t}`),
  components: d.components, rules: d.rules, data: d.data.map((t) => ({ id: t.id, columns: t.rows[0]!, rows: t.rows.slice(1) })),
}
const dashReq = visitRequest(dashPaper, d.screens.map((s) => ({ id: s.id, line: s.line, html: numberParts(s.html!) })))

const has = (ops: Op[], f: (o: Op) => boolean) => ops.some(f)
const gone = (ops: Op[], id: string) => has(ops, (o) => (o.op === 'remove' && o.a === id) || (o.op === 'merge' && (o.a === id || o.b === id)))
const redrawn = (ops: Op[], id: string, re: RegExp) => has(ops, (o) => o.op === 'redraw' && o.a === id && re.test(o.text))
const SNORE = [
  { n: 1, what: 'score-range doubles score-scale', ok: (o: Op[]) => gone(o, 'score-range') || has(o, (x) => x.op === 'remove' && x.a === 'score-scale') },
  { n: 2, what: 'settings-list is about one screen', ok: (o: Op[]) => gone(o, 'settings-list') },
  { n: 3, what: 'the table devices is used by no screen', ok: (o: Op[]) => gone(o, 'devices') },
  { n: 4, what: 'night-details draws the tab bar by hand', ok: (o: Op[]) => redrawn(o, 'night-details', /tab|nav|component|paste/i) },
  { n: 5, what: 'home shows last night as 4.2, history (newer) and Data as 9.1', ok: (o: Op[]) => redrawn(o, 'home', /9\.1|score/i) },
]
const snoreDamage = (ops: Op[]) => ops.filter((o) =>
  (o.op === 'remove' && ['score-scale', 'nights'].includes(o.a) && !(o.a === 'score-scale' && !gone(ops.filter((x) => x !== o), 'score-range')))
  || (o.op === "redraw" && /\b4\.2\b/.test(o.text) && !/9\.1/.test(o.text))).map((o) => o.line)
// A user's entry is touched by a remove, by a merge that would drop it, or by naming it in a new rule's ID.
const userTouch = (ops: Op[]) => ops.filter((o) => (o.op === 'remove' && o.a === 'score-direction')
  || (o.op === 'merge' && (o.a === 'score-direction' || o.b === 'score-direction') && [o.a, o.b].some((x) => x === 'score-scale'))
  || (o.op === 'add-rule' && o.a === 'score-direction')).map((o) => o.line)

async function ask(user: string) {
  let reply = '', cost = 0
  const t0 = performance.now()
  for await (const ev of streamModel({ model: FILING_MODEL, system, user, maxTokens: 8000, signal: AbortSignal.timeout(90_000) })) {
    if (ev.type === 'text') reply += ev.text
    else cost = ev.costUsd ?? 0
  }
  return { reply, cost, s: (performance.now() - t0) / 1000 }
}

mkdirSync(DIR, { recursive: true })
const out: string[] = [`# ${label}`, '', '```', system.slice(start, system.indexOf(NEXT)), '```', '']
const rows: string[] = []
let total = 0
// A third paper with no plants, when REAL=<cache.json>: a remake, to count the rules a visit adds (those with a number are facts).
const real = process.env.REAL ? new ScreenCache(process.env.REAL) : null
const realReq = real && (() => {
  const app = real.apps()[0]!.app, all = real.map(app).entries.filter((e) => !isComponent(e) && e.versions.length)
  return visitRequest(real.paper(app, all[0]!.versions.at(-1)!.device), all.map((e) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: numberParts(e.versions.at(-1)!.html) })))
})()
const factRules = (ops: Op[]) => ops.filter((o) => o.op === 'add-rule' && /\d/.test(o.text)).length
const runs = await Promise.all(Array.from({ length: Number(times) }, async () => [await ask(snoreReq), await ask(dashReq), realReq ? await ask(realReq) : null] as const))
runs.forEach(([s, dv, r], i) => {
  total += s.cost + dv.cost + (r?.cost ?? 0)
  const ro = r ? parseOps(r.reply) : []
  if (r) out.push(`## run ${i + 1}, remake: ${ro.filter((o) => o.op === 'add-rule').length} rules added, ${factRules(ro)} with a number`, '```', r.reply, '```')
  const so = parseOps(s.reply), dop = parseOps(dv.reply)
  const sFixed = SNORE.filter((p) => p.ok(so)).map((p) => p.n), dFixed = dash.planted.filter((p) => p.repaired(dop)).map((p) => p.n)
  const sDmg = snoreDamage(so), dDmg = damage(dash, dop), touch = userTouch(so)
  rows.push(`| ${i + 1} | ${sFixed.length} of 5 (${sFixed.join(' ')}) | ${sDmg.length} | ${touch.length} | ${dFixed.length} of 10 (${dFixed.join(' ')}) | ${dDmg.length} | ${so.filter((o) => o.op === 'redraw').length}, ${dop.filter((o) => o.op === 'redraw').length} | ${[so, dop, ro].map((o) => `${o.filter((x) => x.op === 'add-rule').length}/${factRules(o)}`).join(', ')} |`)
  out.push(`## run ${i + 1}, NiceSnore: ${sFixed.join(' ')}${sDmg.length ? `; damage: ${sDmg.join(' | ')}` : ''}${touch.length ? `; user: ${touch.join(' | ')}` : ''} (${s.s.toFixed(1)} s)`, '```', s.reply, '```',
    `## run ${i + 1}, dashboard: ${dFixed.join(' ')}${dDmg.length ? `; damage: ${dDmg.join(' | ')}` : ''} (${dv.s.toFixed(1)} s)`, '```', dv.reply, '```')
})
const table = ['| run | NiceSnore repaired | damage | user touched | dashboard repaired | damage | redraws | rules added / with a number (NiceSnore, dashboard, remake) |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n')
writeFileSync(resolve(DIR, `${label}.md`), [...out.slice(0, 6), table, '', `Cost: $${total.toFixed(4)}`, '', ...out.slice(6)].join('\n'))
console.log(`${label}\n${table}\nCost: $${total.toFixed(4)}`)
