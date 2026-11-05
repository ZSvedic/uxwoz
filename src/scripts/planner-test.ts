// Build step 2 of process/plans/2026-11-05-spec-memory.md: does one small call write a good plan
// (the core flow and the open rows) for any kind of app? Calls the model directly with a planner
// prompt of its own; the screen prompt and the app are untouched.
//
//   bun --env-file=../.env scripts/planner-test.ts run gpt-6.1-sol-ultrafast [times]
//   bun scripts/planner-test.ts check
//
// Results go to temp/planner-test/<model>.json, one entry per call.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEVICES, isModelId, streamModel, type Device, type ModelId } from '@uxwoz/core'

export const PLANNER_PROMPT = `You plan a clickable mockup before its first screen is made. A cheap model then makes the screens one at a time, each alone, so whatever two screens must agree on is decided once, in this plan. Reply with plain lines only: no markdown, no prose, no blank lines.

The first line is the core flow: the main path a user takes to reach the reason for this app, as 3 to 5 screen names from @home joined by →, e.g.
product.core-flow @home → @menu → @order-checkout → @order-status
Then up to 8 open rows, one per line: a key, a space, ?, a space, and the short question the row settles, e.g.
ui.nav ? main navigation

- A row is a rule several screens must match, such as how Back looks or what a color means. Never something one screen shows, such as the fields of one form or the content of one page.
- Use these keys when they fit: ui.nav (main navigation), ui.back (how Back looks and where it sits), ui.forms (how forms and their buttons are laid out), ui.lists (how lists and their items look), ui.toggles (switches or checkboxes), ui.colors (what colors mean), ui.charts (how data is drawn), ui.map (how the map, its pins and zoom work), ui.hud (what stays on screen during play).
- Make up a key only when none of these fits: ui. and 1-3 lowercase words joined by dashes, e.g. ui.filters. Never a second name for one listed above.
- A fact that several screens show and could get wrong, such as what a score means or which units a value uses, is a data. row, e.g. data.units ? which units distances use.
- A screen name is 1-4 lowercase words joined by dashes.
- Each line is at most 120 characters. Ask only what this app needs: fewer rows beat filler.`

/** Six kinds of app, one prompt each, as a user would type it. NiceSnore's is the one in the screen cache. */
export const APPS: { id: string; device: Device; prompt: string }[] = [
  { id: 'nicesnore', device: 'phone', prompt: 'NiceSnore: a snore app with recording as main function (phone+watch), snore score and history, log of tried remedies etc.' },
  { id: 'dashboard', device: 'desktop', prompt: 'A sales dashboard for a small online shop: revenue, orders, top products and low stock alerts' },
  { id: 'map', device: 'phone', prompt: 'A trail map app for hikers: find trails near me, follow the route on a map, save favourites' },
  { id: 'game', device: 'phone', prompt: 'A space mining game where you fly a small ship between asteroids, upgrade it and sell the ore' },
  { id: 'desktop-tool', device: 'desktop', prompt: 'A markdown notes app for my desktop with folders, tags and quick search' },
  { id: 'kiosk', device: 'desktop', prompt: 'A self check-in kiosk for a hotel lobby: find your booking, pay the deposit, get your room key' },
]

export const KNOWN = ['ui.nav', 'ui.back', 'ui.forms', 'ui.lists', 'ui.toggles', 'ui.colors', 'ui.charts', 'ui.map', 'ui.hud']

const ROOT = resolve(import.meta.dir, '../../temp/planner-test')

interface Call { app: string; run: number; reply: string; firstMs: number | null; totalMs: number; costUsd: number | null; outputTokens: number | null; finishReason: string | null }

const request = (app: (typeof APPS)[number]) => `${app.prompt}\n\nDesign it for ${DEVICES[app.device].request}.`

async function planOnce(model: ModelId, app: (typeof APPS)[number], run: number): Promise<Call> {
  const t0 = performance.now()
  let reply = '', firstMs: number | null = null
  for await (const ev of streamModel({ model, system: PLANNER_PROMPT, user: request(app), maxTokens: 4000, signal: AbortSignal.timeout(60_000) })) {
    if (ev.type === 'text') { firstMs ??= Math.round(performance.now() - t0); reply += ev.text; continue }
    return { app: app.id, run, reply: reply.trim(), firstMs, totalMs: Math.round(performance.now() - t0), costUsd: ev.costUsd, outputTokens: ev.outputTokens, finishReason: ev.finishReason }
  }
  throw new Error('the stream ended without a final event')
}

/** Run every app `times` times, the apps of one round at once, and save each call as it ends. */
async function runAll(model: ModelId, times: number) {
  mkdirSync(ROOT, { recursive: true })
  const file = resolve(ROOT, `${model}.json`)
  const calls: Call[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const start = Math.max(0, ...calls.map((c) => c.run))
  for (let run = start + 1; run <= start + times; run++) {
    await Promise.all(APPS.map(async (app) => {
      const c = await planOnce(model, app, run)
      calls.push(c)
      writeFileSync(file, JSON.stringify(calls, null, 2))
      console.log(`${model} ${app.id} run ${run}: ${(c.totalMs / 1000).toFixed(1)} s, $${(c.costUsd ?? 0).toFixed(4)}`)
    }))
  }
}

/** One plan read by code: the flow, the rows, and the lines that break the format. */
export function parsePlan(reply: string) {
  const lines = reply.split('\n').map((l) => l.trim()).filter(Boolean)
  let flow: string[] = []
  const rows: { key: string; ask: string }[] = []
  const bad: string[] = []
  for (const l of lines) {
    const f = l.match(/^product\.core-flow:?\s+(.+)$/)
    if (f) { flow = f[1]!.split(/\s*(?:→|->)\s*/).map((s) => s.trim()); continue }
    const r = l.match(/^([a-z]+\.[a-z0-9-]+):?\s+\?\s+(.+)$/)
    if (r) rows.push({ key: r[1]!, ask: r[2]! })
    else bad.push(l)
  }
  return { lines, flow, rows, bad, longest: Math.max(0, ...lines.map((l) => [...l].length)) }
}

function check() {
  const out: string[] = []
  for (const f of readdirSync(ROOT).filter((f) => f.endsWith('.json'))) {
    const calls = JSON.parse(readFileSync(resolve(ROOT, f), 'utf8')) as Call[]
    const model = f.replace(/\.json$/, '')
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    const times = calls.map((c) => c.totalMs).sort((a, b) => a - b)
    out.push(`\n## ${model}: ${calls.length} calls`)
    out.push(`time to full reply: median ${(times[times.length >> 1]! / 1000).toFixed(1)} s, max ${(times.at(-1)! / 1000).toFixed(1)} s; cost: avg $${avg(calls.map((c) => c.costUsd ?? 0)).toFixed(4)}, max $${Math.max(...calls.map((c) => c.costUsd ?? 0)).toFixed(4)}`)
    out.push('| app | runs | rows | flow steps | known / made-up / data | longest line | bad lines | keys in every run / all keys |')
    out.push('|---|---|---|---|---|---|---|---|')
    for (const app of APPS) {
      const plans = calls.filter((c) => c.app === app.id).map((c) => parsePlan(c.reply))
      if (!plans.length) continue
      const keys = plans.map((p) => new Set(p.rows.map((r) => r.key)))
      const all = new Set(keys.flatMap((k) => [...k]))
      const every = [...all].filter((k) => keys.every((s) => s.has(k)))
      const rowKeys = plans.flatMap((p) => p.rows.map((r) => r.key))
      const known = rowKeys.filter((k) => KNOWN.includes(k)).length
      const data = rowKeys.filter((k) => k.startsWith('data.')).length
      out.push(`| ${app.id} | ${plans.length} | ${plans.map((p) => p.rows.length).join(', ')} | ${plans.map((p) => p.flow.length).join(', ')} | ${known} / ${rowKeys.length - known - data} / ${data} | ${Math.max(...plans.map((p) => p.longest))} | ${plans.reduce((s, p) => s + p.bad.length, 0)} | ${every.length} / ${all.size} |`)
    }
    for (const app of APPS) for (const c of calls.filter((c) => c.app === app.id)) {
      const p = parsePlan(c.reply)
      out.push(`\n### ${model} ${app.id} run ${c.run} (${(c.totalMs / 1000).toFixed(1)} s, $${(c.costUsd ?? 0).toFixed(4)})\n${c.reply}`)
      if (p.bad.length) out.push(`BAD: ${p.bad.join(' | ')}`)
    }
  }
  writeFileSync(resolve(ROOT, 'report.md'), out.join('\n'))
  console.log(out.join('\n'))
}

const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'run' && isModelId(a)) await runAll(a, Number(b ?? 1))
else if (cmd === 'check' && existsSync(ROOT)) check()
else console.log('usage: run <model> [times] | check')
