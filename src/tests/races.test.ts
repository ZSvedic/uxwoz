// A design that finishes after its mockup was deleted is not kept (no cassette: a fake provider).
import { expect, test } from 'bun:test'
import { ScreenCache, screenKey, type Fetch } from '@uxwoz/core'
import { createServer, type DrawEvent } from '@uxwoz/web/src/server.ts'

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
