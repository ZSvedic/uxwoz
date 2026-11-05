// A side that finishes after its A OR B was picked or deleted is not kept (no cassette: a fake provider).
import { expect, test } from 'bun:test'
import { ALTERNATIVE_REQUEST, ScreenCache, screenKey, type Fetch } from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'

const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }
const reply = (html: string) => `data: ${JSON.stringify({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: html }, finish_reason: 'stop' }], usage: { cost: 0.001 } })}\n\n`

/** A provider whose replies wait for `open()`: side 1 (asked for the different design) always, side 0 only when `both`. */
function gated(both: boolean) {
  let open = () => {}
  const gate = new Promise<void>((r) => { open = r })
  const fetch: Fetch = async (_url, init) => {
    const different = String(init?.body).includes(ALTERNATIVE_REQUEST)
    if (different || both) await gate
    return new Response(reply(different ? '<h1>B</h1>' : '<h1>A</h1>'))
  }
  return { fetch, open }
}

/** Read an NDJSON response line by line, as the lines arrive. */
async function* lines(res: Response): AsyncGenerator<ScreenEvent> {
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

async function run(both: boolean, between: (cache: ScreenCache, seen: ScreenEvent) => void) {
  const cache = new ScreenCache()
  const { fetch, open } = gated(both)
  const server = createServer({ port: 0, cache, fetch, env, log: () => {}, random: () => 0.9, plan: async () => ({}) })
  try {
    const res = await globalThis.fetch(new URL('/api/screen', server.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }),
    })
    const evs: ScreenEvent[] = []
    for await (const ev of lines(res)) {
      evs.push(ev)
      // Act once side 0 is stored (or, when both wait, once the stream has started).
      if ((both && ev.type === 'meta') || (!both && ev.type === 'version')) { between(cache, ev); open() }
    }
    return { cache, evs }
  } finally {
    server.stop(true)
  }
}

test('a side that finishes after the other was picked is dropped', async () => {
  const { cache, evs } = await run(false, (c) => c.pick(screenKey('Shop', null), 0))
  expect(evs.filter((e) => e.type === 'version').map((e) => e.variant)).toEqual([0])
  expect(cache.get(screenKey('Shop', null))).toMatchObject({ versions: [{ html: '<h1>A</h1>' }] })
  expect(cache.get(screenKey('Shop', null))!.proposals).toBeUndefined()
})

test('a side that finishes after its mockup was deleted does not bring it back', async () => {
  const { cache, evs } = await run(false, (c) => c.deleteApp('Shop'))
  expect(cache.get(screenKey('Shop', null))).toBeUndefined()
  expect(evs.at(-1)?.type).toBe('error')
})

test('an A OR B dropped before either side finished stays dropped', async () => {
  const { cache, evs } = await run(true, (c) => c.delete(screenKey('Shop', null)))
  expect(cache.get(screenKey('Shop', null))).toBeUndefined()
  expect(evs.at(-1)?.type).toBe('error')
})
