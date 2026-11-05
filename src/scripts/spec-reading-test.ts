// Build step 1 of process/plans/2026-11-05-spec-memory.md: does a cheap model follow five
// hand-written spec lines? Makes NiceSnore screens one at a time, the way a user clicks from Home,
// each request carrying the spec after the tree, then counts the misses that code can see.
//
//   bun --env-file=../.env scripts/spec-reading-test.ts make claude-haiku-5.5 [screens] [run]
//   bun scripts/spec-reading-test.ts check [run]
//
// Live calls, about a cent a screen. Results go to temp/spec-reading-test/<run>/.

import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  framePage, generateScreen, isModelId, linksIn, plannedScreens, promptFromLabel, screenKey, screenRef, treeLines,
  wayBack, type CacheEntry, type ModelId, type Version,
} from '@uxwoz/core'

const APP = 'NiceSnore: a snore app with recording as main function (phone+watch), snore score and history, log of tried remedies etc.'

/** The five filled lines of the note's example, written by hand. */
export const SPEC_LINES = [
  'product.core-flow: @home → @recording → @morning-report → @remedy-compare',
  'ui.nav: Tabs: Tonight @home, History @night-history, Remedies @remedy-log, Settings @settings',
  'ui.back: ‹ Back, first in the header',
  'ui.toggles: Switches',
  'data.score: Snore score 0-100, higher is better; last night 72',
]

/** The spec as the request carries it: the lines, then one fixed markup for tabs and for Back. */
export const SPEC = `The spec of this mockup: decisions every screen follows, one per line.
${SPEC_LINES.join('\n')}

Every screen ends with the tabs of ui.nav, in this markup, one link per tab with its label and @name, and aria-current="page" on this screen's own tab: <nav data-ui="tabs"><a data-action="@name">Label</a>…</nav>
A screen that is not one of the tabs has Back where ui.back says, with its label, in this markup: <a data-ui="back" data-action="back">Label</a>`

const TABS = [['home', 'Tonight'], ['night-history', 'History'], ['remedy-log', 'Remedies'], ['settings', 'Settings']] as const
const FLOW = ['home', 'recording', 'morning-report', 'remedy-compare']
const BACK = '‹ Back'

const ROOT = resolve(import.meta.dir, '../../temp/spec-reading-test')

/** One screen of a walk: its name, prompt, the screen and words clicked to reach it, and its design. */
interface Made { name: string; action: string | null; from: string | null; label: string; version: Version }

async function makeOne(model: ModelId, action: string | null, existing: string[]): Promise<Version> {
  for (let attempt = 1; ; attempt++) {
    try {
      for await (const ev of generateScreen({ app: APP, action, existing, model, device: 'phone', spec: SPEC, log: console.warn }))
        if (ev.type === 'done') return ev.version
      throw new Error('no screen')
    } catch (err) {
      if (attempt >= 3) throw err
      console.warn(`  retry ${attempt}: ${err instanceof Error ? err.message : err}`)
    }
  }
}

const toEntries = (made: Made[]): CacheEntry[] => made.map((m) => ({
  key: screenKey(APP, m.name === 'home' ? null : `@${m.name}`), app: APP, action: m.action, name: m.name,
  parent: m.from ? { key: screenKey(APP, m.from === 'home' ? null : `@${m.from}`), label: m.label } : null,
  versions: [m.version],
}))

/**
 * Click from Home as a user would: the core flow first, as far as its links go, then the tabs, then
 * every other planned screen in the order the made screens link to it (nearest first).
 */
async function walk(model: ModelId, count: number, dir: string) {
  const made: Made[] = []
  const save = () => writeFileSync(resolve(dir, `${model}.json`), JSON.stringify({ app: APP, model, spec: SPEC, made }, null, 2))
  console.log(`${model}: home`)
  made.push({ name: 'home', action: null, from: null, label: '', version: await makeOne(model, null, []) })
  save()
  while (made.length < count) {
    const planned = plannedScreens(toEntries(made))
    const pick = [...FLOW, ...TABS.map((t) => t[0])].map((n) => planned.find((p) => p.name === n)).find(Boolean) ?? planned[0]
    if (!pick) break
    const from = made.find((m) => screenKey(APP, m.name === 'home' ? null : `@${m.name}`) === pick.parent!.key)!.name
    const action = pick.action ?? promptFromLabel(pick.name!, pick.parent!.label)
    console.log(`${model}: @${pick.name} (from @${from}, "${pick.parent!.label}")`)
    const version = await makeOne(model, action, treeLines(toEntries(made), 80, pick.name))
    made.push({ name: pick.name!, action, from, label: pick.parent!.label, version })
    save()
  }
  const cost = made.reduce((s, m) => s + (m.version.costUsd ?? 0), 0)
  console.log(`${model}: ${made.length} screens, $${cost.toFixed(3)}`)
}

/** What code can see in one screen. Score direction and the reasons behind a checkbox need reading. */
export function checkScreen(name: string, html: string) {
  const links = linksIn(html)
  const nav = html.match(/<nav\b[^>]*data-ui=["']tabs["'][^>]*>([\s\S]*?)<\/nav>/i)
  const navLinks = nav ? linksIn(nav[1]!).map((l) => ({ name: screenRef(l.action)?.name ?? l.action, label: l.label })) : []
  const tabProblems: string[] = []
  if (!nav) tabProblems.push('no tab bar')
  else {
    for (const [n, label] of TABS) {
      const got = navLinks.find((l) => l.name === n)
      if (!got) tabProblems.push(`no ${label} tab`)
      else if (got.label !== label) tabProblems.push(`${label} tab says "${got.label}"`)
    }
    for (const l of navLinks) if (!TABS.some(([n]) => n === l.name)) tabProblems.push(`extra tab "${l.label}"`)
  }
  const isTab = TABS.some(([n]) => n === name)
  const backs = links.filter((l) => wayBack(l.action, l.label) === 'back' || l.action === 'back')
  const backProblems: string[] = []
  for (const b of backs) if (b.label.replace(/&lsaquo;/g, "‹") !== BACK) backProblems.push(`Back says "${b.label}"`)
  if (backs.length && links[0] && !backs.includes(links[0]) && !(wayBack(links[0].action, links[0].label) === 'back')) backProblems.push('Back is not the first control')
  if (backs.length && !/<header\b[^>]*>\s*<a\b[^>]*data-ui=["']back["']/i.test(html)) backProblems.push('Back is not first in a header')
  if (isTab && backs.length) backProblems.push('a tab has Back')
  const noBack = !isTab && !backs.length
  const boxes = [...html.matchAll(/<input\b[^>]*type=["']?checkbox["']?[^>]*>/gi)].map((m) => m[0])
  const checkboxes = boxes.filter((b) => !/role=["']switch["']/i.test(b)).length
  const switches = boxes.length - checkboxes
  const next = FLOW[FLOW.indexOf(name) + 1]
  const flowProblem = next && name !== FLOW.at(-1) && !links.some((l) => screenRef(l.action)?.name === next) ? `no link to @${next}` : ''
  return { tabProblems, backProblems, noBack, checkboxes, switches, flowProblem }
}

/** Score sentences, for reading: text around "score", and numbers next to it. */
function scoreText(html: string): string[] {
  const text = html.replace(/<script[\s\S]*?<\/script>|<title>[\s\S]*?<\/title>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  return [...text.matchAll(/[^.!?]{0,80}\bscore\b[^.!?]{0,80}/gi)].map((m) => m[0].trim())
}

function check(run: string) {
  const dir = resolve(ROOT, run)
  const css = readFileSync(resolve(import.meta.dir, '../packages/web/themes/pico.css'), 'utf8')
    + readFileSync(resolve(import.meta.dir, '../packages/web/themes/mockup.css'), 'utf8')
    // The note's size rule is code, not prompt: every phone screen 390 px wide and at least 844 px tall.
    + '\nbody > main { width: 390px !important; min-height: 844px; box-sizing: border-box; }'
  const notes: string[] = []
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const { model, made } = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { model: string; made: Made[] }
    const rows = made.map((m) => ({ m, c: checkScreen(m.name, m.version.html) }))
    const n = (p: (c: ReturnType<typeof checkScreen>) => boolean) => rows.filter((r) => p(r.c)).length
    console.log(`\n## ${model}: ${made.length} screens`)
    console.log(`tabs missed or relabelled: ${n((c) => c.tabProblems.length > 0)}`)
    console.log(`Back written another way:  ${n((c) => c.backProblems.length > 0)}`)
    console.log(`below a tab, no Back:      ${n((c) => c.noBack)}`)
    console.log(`screens with checkboxes:   ${n((c) => c.checkboxes > 0)} (with switches: ${n((c) => c.switches > 0)})`)
    console.log(`core-flow link missing:    ${n((c) => !!c.flowProblem)} of ${rows.filter((r) => FLOW.slice(0, -1).includes(r.m.name)).length}`)
    console.log(`cost: $${made.reduce((s, x) => s + (x.version.costUsd ?? 0), 0).toFixed(3)}`)
    for (const { m, c } of rows) {
      const p = [...c.tabProblems, ...c.backProblems, c.noBack ? 'no Back' : '', c.checkboxes ? `${c.checkboxes} checkbox(es)` : '', c.flowProblem].filter(Boolean)
      console.log(`  @${m.name.padEnd(22)} ${p.join('; ') || 'ok'}`)
      notes.push(`### ${model} @${m.name}\n${scoreText(m.version.html).map((s) => `- ${s}`).join('\n') || '- (no score)'}\n`)
    }
    const cards = made.map((m) => `<figure><figcaption>@${m.name} <small>from @${m.from ?? '-'} "${m.label}"</small></figcaption>`
      + `<iframe sandbox="allow-scripts" srcdoc="${framePage(m.version.html, css, true).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></figure>`).join('\n')
    writeFileSync(resolve(dir, `${model}.html`), `<!doctype html><meta charset="utf-8"><title>${model}</title>
<style>body{font:13px system-ui;display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#eee}figure{margin:0}iframe{width:390px;height:1000px;border:1px solid #ccc;background:#fff}</style>${cards}`)
  }
  writeFileSync(resolve(dir, 'score-text.md'), notes.join('\n'))
}

const [cmd, a, b, c] = process.argv.slice(2)
if (cmd === 'make' && isModelId(a)) {
  const dir = resolve(ROOT, c ?? 'run-1')
  mkdirSync(dir, { recursive: true })
  await walk(a, Number(b ?? 15), dir)
} else if (cmd === 'check' && existsSync(resolve(ROOT, a ?? 'run-1'))) check(a ?? 'run-1')
else console.log('usage: make <model> [screens] [run] | check [run]')
