// Score a first visit of the planted NiceSnore remake: 10 plants and one rule by the user (step 5 of the
// paper canvas plan; process/journal/2026-11-07-remakes.md). The file is a copy of the remake in
// temp/screen-cache-remake.json with the plants added by hand; temp/ is not in git.
//   bun --env-file=../.env scripts/remake-plant.ts [times]
import { writeFileSync } from 'node:fs'
import { HOME_LINE, HOME_NAME, ScreenCache, askBackground, isComponent, numberParts, visitRequest } from '@uxwoz/core'
import { parseOps } from './paper-fix-test.ts'
import type { Op } from './paper-fix-paper.ts'

const FILE = '../temp/fixer-wording/nicesnore-remake-planted.json'
const c = new ScreenCache(FILE)
const app = c.apps()[0]!.app
const all = c.map(app).entries.filter((e) => !isComponent(e) && e.versions.length)
const shown = all.map((e) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: numberParts(e.versions.at(-1)!.html) }))
const user = visitRequest(c.paper(app, all[0]!.versions.at(-1)!.device), shown)
const banner = Object.fromEntries(['home', 'nights', 'remedies'].map((id) => [id, Number(shown.find((s) => s.id === id)!.html.match(/<article data-part="(\d+)">\s*<p data-part="\d+">🎙/)![1])]))

const has = (o: Op[], f: (x: Op) => boolean) => o.some(f)
const gone = (o: Op[], id: string) => has(o, (x) => (x.op === 'remove' && x.a === id) || (x.op === 'merge' && (x.a === id || x.b === id)))
const redrawn = (o: Op[], id: string, re: RegExp) => has(o, (x) => x.op === 'redraw' && x.a === id && re.test(x.text))
const PLANTS: [string, (o: Op[]) => boolean][] = [
  ['1 quiet-score doubles score-direction', (o) => gone(o, 'quiet-score')],
  ['2 export-formats is about one screen', (o) => gone(o, 'export-formats')],
  ['3 trend-line is a component one screen uses', (o) => gone(o, 'trend-line')],
  ['4 trends draws the tab bar by hand', (o) => redrawn(o, 'trends', /tab|nav|paste|component/i)],
  ['5 remedies (older) says 61 for side sleeping, remedy-details and Data 34', (o) => redrawn(o, 'remedies', /34|average|score|side sleeping/i)],
  ['6 Delete all nights on settings leads nowhere', (o) => redrawn(o, 'settings', /delete/i) || has(o, (x) => x.op === 'note' && /delete/i.test(x.text))],
  ['7 table devices is used by no screen', (o) => gone(o, 'devices')],
  ['8 score-high-quiet (older) contradicts score-direction', (o) => has(o, (x) => (x.op === 'remove' && x.a === 'score-high-quiet') || (x.op === 'merge' && [x.a, x.b].includes('score-high-quiet')))],
  ['9 the tonight card is drawn by hand on home, nights, remedies', (o) => has(o, (x) => x.op === 'add-component' && banner[x.b] === Number(x.text))],
  ['10 back-link doubles back-button', (o) => gone(o, 'back-link')],
]
const GOOD = ['tab-bar', 'back-button', 'score-direction', 'audio-privacy', 'nights', 'remedies']
const damage = (o: Op[]) => o.filter((x) => ((x.op === 'remove' || x.op === 'merge') && GOOD.includes(x.a) && !(x.op === 'merge' && x.a === 'score-direction' && ['quiet-score', 'score-high-quiet'].includes(x.b)))
  || (x.op === 'redraw' && /higher[^.]*quiet|61/i.test(x.text))).map((x) => x.line)
const userTouch = (o: Op[]) => o.filter((x) => [x.a, x.b].includes('bold-high-scores')).map((x) => x.line)

const out: string[] = []
const runs: { reply: string; s: number; cost: number }[] = await Promise.all(Array.from({ length: Number(process.argv[2] ?? 1) }, async () => {
  const t0 = performance.now()
  const { reply, final } = await askBackground(user, {}, 8000)
  return { reply, s: (performance.now() - t0) / 1000, cost: Number((final as { costUsd?: number | null }).costUsd ?? 0) }
}))
runs.forEach((r, i) => {
  const o = parseOps(r.reply)
  const fixed = PLANTS.filter(([, f]) => f(o)).map(([w]) => w.split(' ')[0])
  const line = `visit ${i + 1}: repaired ${fixed.length} of 10 (${fixed.join(' ')}); damage ${damage(o).length}; user touched ${userTouch(o).length}; ${r.s.toFixed(1)} s, $${r.cost.toFixed(4)}`
  console.log(line)
  out.push(`## ${line}`, ...damage(o).map((d) => `damage: ${d}`), '```', r.reply, '```')
})
out.push('', 'Plants:', ...PLANTS.map(([w]) => `- ${w}`))
writeFileSync('../temp/fixer-wording/remake-planted-visits.md', out.join('\n'))
