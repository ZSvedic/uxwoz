// A design that finishes after its mockup was deleted is not kept, a screen is drawn once at a time, and a filing a
// rename dropped leaves its screen to file again (no cassette: a fake provider).
import { expect, test } from 'bun:test'
import { ScreenCache, screenKey, type Fetch } from '@uxwoz/core'
import { createServer, type DrawEvent } from '@uxwoz/web/src/server.ts'
import { drawing } from '../packages/web/src/drawing.ts'

const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`

/** A provider whose reply waits for `open()`. */
function gated() {
  let open = () => {}
  const gate = new Promise<void>((r) => { open = r })
  const fetch: Fetch = async () => { await gate; return new Response(reply('<h1>A</h1>')) }
  return { fetch, open }
}

/** Read an NDJSON response line by line, as the lines arrive. */
async function* lines(res: Response): AsyncGenerator<DrawEvent> {
  const reader = res.body!.getReader(), dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) { yield JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1) }
  }
}

/** Ask for Shop's first screen; `between` runs once the stream has started, before the design finishes. */
async function run(between: (cache: ScreenCache) => void) {
  const cache = new ScreenCache()
  const { fetch, open } = gated()
  const server = createServer({ port: 0, cache, fetch, env, log: () => {} })
  try {
    const res = await globalThis.fetch(new URL('/api/screen', server.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }),
    })
    const evs: DrawEvent[] = []
    for await (const ev of lines(res)) {
      evs.push(ev)
      if (ev.type === 'meta') { between(cache); open() }
    }
    return { cache, evs }
  } finally {
    server.stop(true)
  }
}

test('a design that finishes after its mockup was deleted does not bring it back', async () => {
  const { cache, evs } = await run((c) => c.deleteApp('Shop'))
  expect(cache.get(screenKey('Shop', null))).toBeUndefined()
  expect(evs.at(-1)).toMatchObject({ type: 'error', message: 'this screen was deleted while it was being made' })
})

test('a design that finishes after its screen was deleted (an unknown key, then) stays dropped', async () => {
  const { cache, evs } = await run((c) => c.delete(screenKey('Shop', null)))
  expect(cache.get(screenKey('Shop', null))).toBeUndefined()
  expect(evs.at(-1)?.type).toBe('error')
})

test('a second request for a new screen while it is drawn gets 409, and one design is stored', async () => {
  const cache = new ScreenCache()
  const { fetch, open } = gated()
  let calls = 0
  const server = createServer({ port: 0, cache, fetch: (u, i) => { calls++; return fetch(u, i) }, env, log: () => {} })
  const ask = () => globalThis.fetch(new URL('/api/screen', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }) })
  try {
    const first = lines(await ask())
    expect((await first.next()).value?.type).toBe('meta')
    expect((await ask()).status).toBe(409)
    open()
    for await (const _ of first) { /* drain */ }
    expect(calls).toBe(1)
    expect(cache.get('shop')!.versions).toHaveLength(1)
  } finally {
    server.stop(true)
  }
})

test('a filing dropped by a rename leaves its screen unsettled, so the next click files it', async () => {
  const cache = new ScreenCache()
  let open = () => {}
  const gate = new Promise<void>((r) => { open = r })
  let asked = 0
  const terra = [{ type: 'response.output_text.delta', delta: 'rule calm: Screens speak calmly.' }, { type: 'response.completed', response: { model: 'gpt-6.1-terra', usage: { input_tokens: 10, output_tokens: 10 } } }]
  const fetch: Fetch = async () => { asked++; await gate; return new Response(terra.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')) }
  const d = drawing(cache, { fetch, env }, () => {}, 0)
  const home = cache.addScreen('Shop', null, { html: '<h1>Shop</h1>', model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-24T00:00:00Z', costUsd: 0.001, costEstimated: false, firstChunkMs: 1, totalMs: 2, finishReason: 'stop' })!
  expect(d.settle(home.key)).toMatchObject({ filing: true })
  while (!asked) await Bun.sleep(1)
  cache.rename('Shop', 'Shop two')
  open()
  await d.idle('Shop')
  expect(cache.get('shop two')!.settled).toBeUndefined()
  expect(cache.wouldSettle('shop two')).toBe('first')
  expect(cache.boxesOf('Shop two').rules).toEqual([])
})
