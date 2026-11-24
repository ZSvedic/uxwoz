// A stream that stops early must fail and never reach the cache, and a reply that holds the screen
// twice, or prose before it, is cleaned before it is stored (no cassette: a fake provider).
import { expect, test } from 'bun:test'
import { ScreenCache, generateScreen, screenKey, type Fetch } from '@uxwoz/core'
import { createServer, type DrawEvent } from '@uxwoz/web/src/server.ts'

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
const fakeFetch = (body: string): Fetch => async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
const env = { OPENROUTER_API_KEY: 'fake', OPENAI_API_KEY: 'fake' }

const halfScreen = sse({ model: 'anthropic/claude-haiku-5.5', choices: [{ delta: { content: '<h1>Half a screen</h1><button data-action="x' } }] })
const tooLong = sse(
  { type: 'response.output_text.delta', delta: '<h1>Long</h1>' },
  { type: 'response.incomplete', response: { model: 'gpt-6-luna', incomplete_details: { reason: 'max_output_tokens' }, usage: {} } },
)

test('a stream with no end event is an error', async () => {
  const run = async () => { for await (const _ of generateScreen({ user: 'Shop', model: 'claude-haiku-5.5', fetch: fakeFetch(halfScreen), env })) {} }
  await expect(run()).rejects.toThrow('ended before the screen was complete')
})

test('a reply cut off at the token limit is an error', async () => {
  const run = async () => { for await (const _ of generateScreen({ user: 'Shop', model: 'gpt-6-luna-fast', fetch: fakeFetch(tooLong), env })) {} }
  await expect(run()).rejects.toThrow('cut off (max_output_tokens)')
})

test('the server reports a cut-off screen and caches nothing', async () => {
  const cache = new ScreenCache()
  const server = createServer({ port: 0, cache, fetch: fakeFetch(halfScreen), env, log: () => {} })
  try {
    const res = await fetch(new URL('/api/screen', server.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'Shop' }),
    })
    const evs: DrawEvent[] = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(evs.at(-1)?.type).toBe('error')
    expect(cache.get(screenKey('Shop', null))).toBeUndefined()
  } finally {
    server.stop(true)
  }
})

test('a failed Another or Edit leaves the mock as it was', async () => {
  const cache = new ScreenCache()
  cache.addScreen('Shop', null, { html: '<h1>Shop</h1>', model: 'claude-haiku-5.5', servedModel: null, createdAt: '2026-11-24T00:00:00Z', costUsd: 0.001, costEstimated: false, firstChunkMs: 1, totalMs: 2, finishReason: 'stop', device: 'small-phone' })
  const server = createServer({ port: 0, cache, fetch: fakeFetch(halfScreen), env, log: () => {} })
  try {
    for (const body of [{ key: 'shop' }, { key: 'shop', change: 'Bigger' }]) {
      const res = await fetch(new URL('/api/revise', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const evs: DrawEvent[] = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
      expect(evs.map((e) => e.type)).toEqual(['meta', 'chunk', 'error'])
    }
    expect(cache.get('shop')).toMatchObject({ versions: [{ html: '<h1>Shop</h1>' }], draws: 1 })
  } finally {
    server.stop(true)
  }
})
