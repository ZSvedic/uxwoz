// `bun run starters:record [id…]` (live calls, a few cents a starter): drives the real server on a
// temporary cache and writes recordings/<id>.json (spec/public.md, Recordings). No ids: every starter.
//
// Home: two designs, then (on a copy of the cache as it is now) pick B and keep its filing; on the
// first cache pick A, keep its filing, two Regenerates. Then each @name a Home version links to, clicked
// from that version: two designs, picked in the cache (a recorded pick files nothing), two Regenerates.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_MODEL, FILING_MODEL, RECORDED_DESIGNS, RECORDINGS_DIR, STARTERS, ScreenCache, linkedNames, promptHash, recordedHtml,
  recordingProblems, screenKey, screenRef, linksIn, type Recorded, type Recording, type Starter, type Version,
} from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'

// The script is the owner: no gate on its own temporary server.
delete process.env.UXWOZ_OWNER

const ids = process.argv.slice(2)
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
  const stream = async (path: string, body: unknown): Promise<ScreenEvent[]> => {
    const res = await post(path, body)
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${await res.text()}`)
    const evs: ScreenEvent[] = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    const bad = evs.filter((e) => e.type === 'failed' || e.type === 'error')
    if (bad.length) throw new Error(`${path}: ${bad.map((e) => ('message' in e ? e.message : '')).join('; ')}`)
    return evs
  }
  /** The live call that made this version. */
  const callFor = (v: Version): Recorded => {
    const c = calls.find((c) => c.model !== FILING_MODEL && recordedHtml(c.r) === v.html)
    if (!c) throw new Error('no recorded call made a design the server returned')
    return c.r
  }
  const versions = (evs: ScreenEvent[]) => {
    const out: Version[] = []
    for (const e of evs) if (e.type === 'version') out[e.variant] = e.version
    return out
  }
  /** Pick a side of Home over HTTP and wait for its filing: the filing call. */
  const pickHome = async (key: string, index: number): Promise<Recorded> => {
    const before = calls.length
    const res = await post('/api/pick', { key, index })
    if (!res.ok) throw new Error(`/api/pick HTTP ${res.status}: ${await res.text()}`)
    await fetch(new URL(`/api/map?wait=1&app=${encodeURIComponent(cache.get(key)!.app)}`, server.url))
    const filing = calls.slice(before).find((c) => c.model === FILING_MODEL)
    if (!filing) throw new Error('the filing after Home\'s pick made no complete call (see the server lines above)')
    return filing.r
  }
  return { cache, server, stream, callFor, versions, pickHome }
}

async function recordStarter(s: Starter, dir: string): Promise<Recording> {
  const body = { app: s.prompt, model: DEFAULT_MODEL, device: s.device }
  const home = screenKey(s.prompt, null)
  const a = serve(join(dir, 'a.json'))
  try {
    console.log(`${s.id}: Home`)
    const two = a.versions(await a.stream('/api/screen', body))
    if (two.length !== 2 || !two[0] || !two[1]) throw new Error('Home did not get both designs')
    const designs = two.map(a.callFor)

    // Filing after B, on a copy of the cache as it is after Home's two designs.
    const bFile = join(dir, 'b.json')
    writeFileSync(bFile, a.cache.serialize())
    const b = serve(bFile)
    let filingB: Recorded
    try { filingB = await b.pickHome(home, 1) } finally { b.server.stop(true) }
    const filingA = await a.pickHome(home, 0)

    const regenerate = async (key: string) => {
      const v = a.versions(await a.stream('/api/revise', { key, model: DEFAULT_MODEL, device: s.device }))[0]
      if (!v) throw new Error('a Regenerate made no design')
      return a.callFor(v)
    }
    for (let i = 2; i < RECORDED_DESIGNS; i++) designs.push(await regenerate(home))
    const screens: Recording['screens'] = { home: { action: null, designs } }

    // Each name a Home version links to, clicked from the first version that links to it.
    const homeVersions = designs.map(recordedHtml)
    for (const name of new Set(homeVersions.flatMap(linkedNames))) {
      const html = homeVersions.find((h) => linkedNames(h).includes(name))!
      const link = linksIn(html).find((l) => screenRef(l.action)?.name === name)!
      const root = a.cache.get(home)!
      // The screen clicked in is the newest Home version, so make that one newest.
      if (root.versions.at(-1)!.html !== html) a.cache.addVersion(home, { ...root.versions.find((v) => v.html === html) ?? root.versions[0]!, html })
      console.log(`${s.id}: @${name}`)
      const got = a.versions(await a.stream('/api/screen', { ...body, action: link.action, from: home, label: link.label }))
      if (!got[0] || !got[1]) throw new Error(`@${name} did not get both designs`)
      const key = screenKey(s.prompt, `@${name}`)
      if (!a.cache.pick(key, 0)) throw new Error(`could not pick @${name}`)
      const d = got.map(a.callFor)
      for (let i = 2; i < RECORDED_DESIGNS; i++) d.push(await regenerate(key))
      screens[name] = { action: link.action, designs: d }
    }
    return { starter: s.id, prompt: s.prompt, promptHash: promptHash(), recordedAt: new Date().toISOString(), screens, filings: [filingA, filingB] }
  } finally {
    a.server.stop(true)
  }
}

mkdirSync(RECORDINGS_DIR, { recursive: true })
let failed = 0
for (const s of chosen) {
  const dir = mkdtempSync(join(tmpdir(), `uxwoz-starter-${s.id}-`))
  try {
    const rec = await recordStarter(s, dir)
    const problems = recordingProblems(rec, s)
    if (problems.length) throw new Error(`incomplete: ${problems.join('; ')}`)
    const file = join(RECORDINGS_DIR, `${s.id}.json`)
    writeFileSync(file, JSON.stringify(rec) + '\n')
    const designs = Object.values(rec.screens).reduce((n, x) => n + x.designs.length, 0)
    const cost = [...Object.values(rec.screens).flatMap((x) => x.designs), ...rec.filings].reduce((n, r) => n + (r.final.costUsd ?? 0), 0)
    console.log(`${s.id}: ${Object.keys(rec.screens).length} screens, ${designs} designs, $${cost.toFixed(4)} recorded → ${file}`)
  } catch (err) {
    failed++
    console.error(`${s.id} failed, nothing written: ${err instanceof Error ? err.message : err}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
process.exit(failed ? 1 : 0)

