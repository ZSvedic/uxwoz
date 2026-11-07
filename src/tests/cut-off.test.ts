// A stream that stops early must fail and never reach the cache, and a reply that holds the screen
// twice, or prose before it, is cleaned before it is stored (no cassette: a fake provider).
import { describe, expect, test } from 'bun:test'
import { ALTERNATIVE_REQUEST, ScreenCache, cutProse, firstCopy, generateScreen, screenKey, type Fetch } from '@uxwoz/core'
import { createServer, type ScreenEvent } from '@uxwoz/web/src/server.ts'

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
const fakeFetch = (body: string): Fetch => async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }

const halfScreen = sse({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: '<h1>Half a screen</h1><button data-action="x' } }] })
const tooLong = sse(
  { type: 'response.output_text.delta', delta: '<h1>Long</h1>' },
  { type: 'response.incomplete', response: { model: 'gpt-6-luna', incomplete_details: { reason: 'max_output_tokens' }, usage: {} } },
)

test('a stream with no end event is an error', async () => {
  const run = async () => { for await (const _ of generateScreen({ app: 'Shop', action: null, model: 'claude-haiku-5.5', fetch: fakeFetch(halfScreen), env })) {} }
  await expect(run()).rejects.toThrow('ended before the screen was complete')
})

test('a reply cut off at the token limit is an error', async () => {
  const run = async () => { for await (const _ of generateScreen({ app: 'Shop', action: null, model: 'gpt-6-luna-fast', fetch: fakeFetch(tooLong), env })) {} }
  await expect(run()).rejects.toThrow('cut off (max_output_tokens)')
})

test('the server reports a cut-off screen and caches nothing', async () => {
  const cache = new ScreenCache()
  const server = createServer({ port: 0, cache, fetch: fakeFetch(halfScreen), env, log: () => {}, plan: async () => ({}) })
  try {
    const res = await fetch(new URL('/api/screen', server.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }),
    })
    const evs: ScreenEvent[] = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(evs.at(-1)?.type).toBe('error')
    expect(cache.get(screenKey('Shop', null))).toBeUndefined()
  } finally {
    server.stop(true)
  }
})

test('when one side of the A OR B fails, the other is still cached and shown', async () => {
  const whole = sse({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: '<h1>Whole</h1>' }, finish_reason: 'stop' }], usage: { cost: 0.001 } })
  // The side asked for a different design (the second, here) stops early; the other finishes.
  const fetch: Fetch = async (_url, init) => new Response(String(init?.body).includes(ALTERNATIVE_REQUEST) ? halfScreen : whole)
  const cache = new ScreenCache()
  const server = createServer({ port: 0, cache, fetch, env, log: () => {}, random: () => 0.9, plan: async () => ({}) })
  try {
    const res = await globalThis.fetch(new URL('/api/screen', server.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }),
    })
    const evs: ScreenEvent[] = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(evs.find((e) => e.type === 'failed')).toMatchObject({ variant: 1, message: expect.stringContaining('ended before the screen was complete') })
    expect(evs.find((e) => e.type === 'version')).toMatchObject({ variant: 0 })
    const done = evs.at(-1) as Extract<ScreenEvent, { type: 'done' }>
    expect(done.type).toBe('done')
    expect(cache.get(screenKey('Shop', null))?.proposals?.map((v) => v?.html ?? null)).toEqual(['<h1>Whole</h1>', null])
  } finally {
    server.stop(true)
  }
})

describe('a doubled reply keeps its first copy', () => {
  test('cut at the second idea or title outside SVG', () => {
    const one = '<title>Home</title>\n<meta name="idea" content="a">\n<h1>Home</h1><svg><title>chart</title></svg>'
    expect(firstCopy(`${one}\n/final\n${one}`)).toEqual({ html: one, cut: true })
    expect(firstCopy(one)).toEqual({ html: one, cut: false })
  })

  test('a title in a script\'s string after an SVG is no second copy, and a cut never ends inside a script', () => {
    const html = '<title>Trends</title>\n<meta name="idea" content="a">\n<svg id="chart"></svg>\n<script>chart.innerHTML = data.map((v) => `<rect><title>${v}</title></rect>`).join("")</script>'
    expect(firstCopy(html)).toEqual({ html, cut: false })
  })

  test('the junk between copies goes: a marker like </assistant>, or notes after the last tag', () => {
    const one = '<title>Home</title>\n<meta name="idea" content="a">\n<main><h1>Home</h1></main><script>go()</script>'
    expect(firstCopy(`${one}</assistant>ablytyped\n${one}`)).toEqual({ html: one, cut: true })
    expect(firstCopy(`${one}\nHere is the screen again, with the notes I wrote.\n${one}`)).toEqual({ html: one, cut: true })
  })
})

test('prose before the title is cut; markup before it stays', () => {
  expect(cutProse('The request has no change, so here it is again.\n\n<title>Home</title><h1>Hi</h1>')).toBe('<title>Home</title><h1>Hi</h1>')
  expect(cutProse('<style>p{}</style><title>Home</title>')).toBe('<style>p{}</style><title>Home</title>')
  expect(cutProse('<h1>No title</h1>')).toBe('<h1>No title</h1>')
})
