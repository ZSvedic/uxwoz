// `bun run starters:record [id…] [--device <id>]` (live calls, about $5 for all 28): drives the real server on
// temporary caches and writes recordings/<id>.<device>.json (spec/public.md, Recordings). No ids: every starter;
// no --device: every size offered.
//
// Home's first design, then (on a copy of the cache as it is now) Another on it, and each copy settles Home and
// keeps its filing: the first with design 0 showing, the copy with design 1. Then each @name a Home design links
// to, clicked from that design: its first design and Another on it.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_MODEL, FILING_MODEL, OFFERED_DEVICES, RECORDINGS_DIR, STARTERS, ScreenCache, isDevice, linkedNames, linksIn, promptHash, recordedHtml,
  recordingFile, recordingProblems, screenKey, setRecordings, screenRef, type Device, type Recorded, type Recording, type Starter, type Version,
} from '@uxwoz/core'
import { createServer, type DrawEvent as ScreenEvent } from '@uxwoz/web/src/server.ts'

// The script is the owner: no gate on its own temporary server. Every call is live: no old recording answers.
delete process.env.UXWOZ_OWNER
setRecordings(new Map())

const args = process.argv.slice(2), at = args.indexOf('--device')
const device = at >= 0 ? args[at + 1] : null
if (at >= 0 && !isDevice(device)) throw new Error(`no device ${device}; the sizes are ${OFFERED_DEVICES.join(', ')}`)
const devices: Device[] = device ? [device as Device] : OFFERED_DEVICES
const ids = args.filter((_, i) => at < 0 || (i !== at && i !== at + 1))
const unknown = ids.filter((id) => !STARTERS.some((s) => s.id === id))
if (unknown.length) throw new Error(`no starter ${unknown.join(', ')}; the starters are ${STARTERS.map((s) => s.id).join(', ')}`)
const chosen = ids.length ? STARTERS.filter((s) => ids.includes(s.id)) : STARTERS

interface Call { r: Recorded; model: string; user: string }

/** A server on its own cache file; every live call it makes lands in `calls`. */
function serve(file: string) {
  const calls: Call[] = []
  const cache = new ScreenCache(file)
  const server = createServer({ port: 0, cache, fileWaitMs: 60_000, log: (m) => console.log(`  server: ${m}`), record: (r, c) => calls.push({ r, ...c }) })
  const post = (path: string, body: unknown) => fetch(new URL(path, server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  /** One design over HTTP: the live call that made it. */
  const design = async (path: string, body: unknown): Promise<Recorded> => {
    const res = await post(path, body)
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${await res.text()}`)
    const evs: ScreenEvent[] = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    const bad = evs.find((e) => e.type === 'error')
    if (bad) throw new Error(`${path}: ${'message' in bad ? bad.message : ''}`)
    const v = evs.find((e): e is Extract<ScreenEvent, { type: 'version' }> => e.type === 'version')?.version
    if (!v) throw new Error(`${path} made no design`)
    return callFor(v)
  }
  const callFor = (v: Version): Recorded => {
    const c = calls.find((c) => c.model !== FILING_MODEL && recordedHtml(c.r) === v.html)
    if (!c) throw new Error('no recorded call made a design the server returned')
    return c.r
  }
  /** Settle Home over HTTP and wait for its filing: the filing call. */
  const settleHome = async (key: string): Promise<Recorded> => {
    const before = calls.length
    const res = await post('/api/settle', { key })
    if (!res.ok) throw new Error(`/api/settle HTTP ${res.status}: ${await res.text()}`)
    await fetch(new URL(`/api/map?wait=1&app=${encodeURIComponent(cache.get(key)!.app)}`, server.url))
    const filing = calls.slice(before).find((c) => c.model === FILING_MODEL)
    if (!filing) throw new Error('settling Home made no complete filing call (see the server lines above)')
    return filing.r
  }
  return { cache, server, design, settleHome }
}

async function recordStarter(s: Starter, size: Device, dir: string): Promise<Recording> {
  const body = { app: s.prompt, model: DEFAULT_MODEL, device: size }
  const home = screenKey(s.prompt, null)
  const a = serve(join(dir, 'a.json'))
  let b: ReturnType<typeof serve> | null = null
  try {
    console.log(`${s.id} (${size}): Home`)
    const first = await a.design('/api/screen', body)
    // Another, on a copy of the cache as it is after Home's first design.
    const bFile = join(dir, 'b.json')
    writeFileSync(bFile, a.cache.serialize())
    b = serve(bFile)
    console.log(`${s.id} (${size}): Another on Home`)
    const second = await b.design('/api/revise', { key: home, model: DEFAULT_MODEL })
    const filings = [await a.settleHome(home), await b.settleHome(home)]
    const screens: Recording['screens'] = { home: { action: null, designs: [first, second] } }

    // Each name a Home design links to, clicked from that design: on the server whose Home shows it.
    const sides = [{ desk: a, html: recordedHtml(first) }, { desk: b, html: recordedHtml(second) }]
    for (const name of new Set(sides.flatMap((x) => linkedNames(x.html)))) {
      const side = sides.find((x) => linkedNames(x.html).includes(name))!
      const link = linksIn(side.html).find((l) => screenRef(l.action)?.name === name)!
      console.log(`${s.id} (${size}): @${name}`)
      const d0 = await side.desk.design('/api/screen', { ...body, action: link.action, from: home, label: link.label })
      const d1 = await side.desk.design('/api/revise', { key: screenKey(s.prompt, `@${name}`), model: DEFAULT_MODEL })
      screens[name] = { action: link.action, designs: [d0, d1] }
    }
    return { starter: s.id, device: size, prompt: s.prompt, promptHash: promptHash(), recordedAt: new Date().toISOString(), screens, filings }
  } finally {
    a.server.stop(true)
    b?.server.stop(true)
  }
}

mkdirSync(RECORDINGS_DIR, { recursive: true })
let failed = 0
for (const s of chosen) for (const size of devices) {
  const dir = mkdtempSync(join(tmpdir(), `uxwoz-starter-${s.id}-`))
  try {
    const rec = await recordStarter(s, size, dir)
    const problems = recordingProblems(rec, s)
    if (problems.length) throw new Error(`incomplete: ${problems.join('; ')}`)
    const file = join(RECORDINGS_DIR, recordingFile(s.id, size))
    writeFileSync(file, JSON.stringify(rec) + '\n')
    const designs = Object.values(rec.screens).reduce((n, x) => n + x.designs.length, 0)
    const cost = [...Object.values(rec.screens).flatMap((x) => x.designs), ...rec.filings].reduce((n, r) => n + (r.final.costUsd ?? 0), 0)
    console.log(`${s.id} (${size}): ${Object.keys(rec.screens).length} screens, ${designs} designs, $${cost.toFixed(4)} recorded → ${file}`)
  } catch (err) {
    failed++
    console.error(`${s.id} (${size}) failed, nothing written: ${err instanceof Error ? err.message : err}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
process.exit(failed ? 1 : 0)
