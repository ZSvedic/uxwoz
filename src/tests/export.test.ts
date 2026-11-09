// Feature: Export project writes a mockup as a zip: the prompt, the boxes and every drawn screen (no model calls).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScreenCache, crc32, zip, type Version } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'

/** The entries of a zip, read from its central directory: name, size, and the stored bytes as text. */
function unzip(z: Uint8Array): Record<string, string> {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength), dec = new TextDecoder()
  const end = z.length - 22
  expect(v.getUint32(end, true)).toBe(0x06054b50)
  const out: Record<string, string> = {}
  let at = v.getUint32(end + 16, true)
  for (let i = 0; i < v.getUint16(end + 10, true); i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50)
    const size = v.getUint32(at + 24, true), n = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true)
    const name = dec.decode(z.subarray(at + 46, at + 46 + n))
    const start = local + 30 + v.getUint16(local + 26, true)
    const data = z.subarray(start, start + size)
    expect(crc32(data)).toBe(v.getUint32(at + 16, true))
    out[name] = dec.decode(data)
    at += 46 + n
  }
  return out
}

const ver = (html: string): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-09T00:00:00Z', device: 'phone',
  costUsd: 0.001, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop',
})

describe('zip writer', () => {
  test('CRC-32 is the standard one', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  test('stored entries with UTF-8 names read back, also with unzip', async () => {
    const z = zip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/č.md', data: '# Ž\n' }, { name: 'bin', data: new Uint8Array([0, 255, 7]) }])
    const files = unzip(z)
    expect(Object.keys(files)).toEqual(['a.txt', 'dir/č.md', 'bin'])
    expect(files['dir/č.md']).toBe('# Ž\n')
    if (!Bun.which('unzip')) return
    const path = join(mkdtempSync(join(tmpdir(), 'uxwoz-zip-')), 't.zip')
    writeFileSync(path, z)
    const p = Bun.spawnSync(['unzip', '-t', path])
    expect(p.exitCode).toBe(0)
    expect(p.stdout.toString()).toContain('No errors detected')
  })
})

describe('export project', () => {
  const APP = 'A tiny sleep tracker'
  let server: ReturnType<typeof createServer>
  beforeAll(() => {
    const cache = new ScreenCache()
    const home = cache.pick(cache.propose(APP, null, 0, ver('<title>Tonight</title><div data-component="tab-bar"></div><h1>Tonight</h1><section style="height:50vh">Sleep well</section><button data-action="@report: The sleep report">Report</button><a data-action="@alarm: Set an alarm">Alarm</a>'))!.key, 0)!
    cache.pick(cache.propose(APP, '@report: The sleep report', 0, ver('<title>Sleep report</title><div data-component="tab-bar"></div><h1>Report</h1>'), { key: home.key, label: 'Report' })!.key, 0)
    cache.addComponent(APP, 'tab-bar', 'bottom of every screen', ver('<nav class="tabs"><a data-action="@home">Home</a></nav>'), 'filing')
    cache.setBox(APP, 'add', 'rules', { id: 'calm', text: 'Use calm colors.' }, 'user')
    cache.setBox(APP, 'add', 'data', { id: 'nights', columns: ['date', 'hours'], rows: [['Mon', '7.5']] }, 'user')
    cache.noteVisit(APP, { at: '2026-11-09T01:00:00Z', ms: 10, costUsd: 0, screens: 2, changes: [{ text: 'merged secret-note into calm' }], refused: [], seen: false })
    server = createServer({ port: 0, cache, log: () => {} })
  })
  afterAll(() => server.stop(true))

  test('the zip holds the handoff, the boxes and one page per drawn screen, and no fixer notes', async () => {
    const res = await fetch(new URL(`/api/export?app=${encodeURIComponent(APP)}`, server.url))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="a-tiny-sleep-tracker.zip"')
    const raw = unzip(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(raw).sort()).toEqual(['HANDOFF.md', 'README.md', 'components.md', 'data.md', 'rules.md', 'screens/home.html', 'screens/report.html'].map((n) => `a-tiny-sleep-tracker/${n}`))
    const files = Object.fromEntries(Object.entries(raw).map(([n, t]) => [n.replace('a-tiny-sleep-tracker/', ''), t]))
    const home = files['screens/home.html']!
    // As in the app's frame: vh is pixels of the phone's 844 px height, and the page is at least that tall.
    expect(home).toContain('<section style="height:422px">')
    expect(home).toContain('min-height: 844px')
    expect(home).toContain('<nav class="tabs">')
    expect(home).not.toContain('data-component="tab-bar"></div>')
    expect(home).toContain('--pico-') // the theme inlined
    expect(home).toContain('location.href = file')
    expect(home).toContain('"report":"report.html"')
    expect(home).not.toContain('"alarm"')
    expect(files['README.md']).toContain('**Tonight**')
    expect(files['README.md']).toContain('**Sleep report**')
    expect(files['README.md']).toContain('"Report" on Tonight')
    expect(files['README.md']).toMatch(/## Not drawn yet[\s\S]*`@alarm`: Set an alarm/)
    expect(files['rules.md']).toContain('- calm: Use calm colors.')
    expect(files['data.md']).toContain('| Mon | 7.5 |')
    expect(files['components.md']).toContain('## tab-bar')
    expect(files['HANDOFF.md']).toContain('## Prompt to paste')
    expect(Object.values(files).join('\n')).not.toContain('secret-note')
  })

  test('an unknown mockup is 404', async () => {
    expect((await fetch(new URL('/api/export?app=nothing+here', server.url))).status).toBe(404)
  })
})
