// Record and replay model HTTP calls, one JSON file per feature in cassettes/.
// Replay is the default and makes no network calls; `bun run test:record` (UXWOZ_RECORD=1) calls the
// live APIs and rewrites the feature's cassette. Request headers (API keys) are never stored.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Fetch } from '@uxwoz/core'

export const CASSETTES_DIR = resolve(import.meta.dir, '../../cassettes')
export const RECORDING = process.env.UXWOZ_RECORD === '1'

interface Recorded { status: number; contentType: string; body: string }
interface CassetteFile {
  feature: string
  recordedAt: string
  /** Keyed by a hash of method, URL and request body; repeated identical requests replay in order. */
  interactions: Record<string, { request: { method: string; url: string; body: unknown }; responses: Recorded[] }>
}

function hashRequest(method: string, url: string, body: string): string {
  return new Bun.CryptoHasher('sha256').update(`${method} ${url}\n${body}`).digest('hex').slice(0, 16)
}

/** Split a recorded body into small pieces so replay streams the way a provider does. */
function streamOf(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const lines = text.split(/(?<=\n)/)
  return new ReadableStream({
    pull(controller) {
      const next = lines.splice(0, 4).join('')
      if (next) controller.enqueue(enc.encode(next))
      else controller.close()
    },
  })
}

export function cassette(feature: string) {
  const file = resolve(CASSETTES_DIR, `${feature}.json`)
  const loaded: CassetteFile | null = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  const recorded: CassetteFile = { feature, recordedAt: new Date().toISOString(), interactions: {} }
  const replayCount = new Map<string, number>()

  const fetch: Fetch = async (url, init) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : ''
    const key = hashRequest(method, url, body)
    if (RECORDING) {
      const res = await globalThis.fetch(url, init)
      const text = await res.text()
      const slot = (recorded.interactions[key] ??= { request: { method, url, body: body ? JSON.parse(body) : null }, responses: [] })
      slot.responses.push({ status: res.status, contentType: res.headers.get('content-type') ?? '', body: text })
      return new Response(streamOf(text), { status: res.status, headers: { 'Content-Type': slot.responses.at(-1)!.contentType } })
    }
    const slot = loaded?.interactions[key]
    const n = replayCount.get(key) ?? 0
    const r = slot?.responses[Math.min(n, slot.responses.length - 1)]
    if (!r) throw new Error(`cassettes/${feature}.json has no recording for ${method} ${url} (${key}); run "bun run test:record"`)
    replayCount.set(key, n + 1)
    return new Response(streamOf(r.body), { status: r.status, headers: { 'Content-Type': r.contentType } })
  }

  /** In record mode, write what this run recorded. Call from afterAll. */
  const save = () => {
    if (RECORDING) writeFileSync(file, JSON.stringify(recorded, null, 1) + '\n')
  }

  /** Recorded runs hit the live APIs and need the real keys; replays get dummy ones. */
  const env = RECORDING ? process.env : { OPENROUTER_API_KEY: 'replay', OPENAI_API_KEY: 'replay' }

  return { fetch, save, env }
}
