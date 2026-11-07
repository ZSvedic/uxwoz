// Feature: generate one screen with each of the three models (cassette: generate-screen).
import { afterAll, describe, expect, test } from 'bun:test'
import { MODELS, drawRequest, generateScreen, type ModelId } from '@uxwoz/core'
import { cassette } from './cassette.ts'

const tape = cassette('generate-screen')
afterAll(tape.save)

const paper = { app: 'A coffee shop ordering app', device: 'phone' as const, titles: [], lines: [], components: [], rules: [], data: [] }

async function run(model: ModelId, target: { id: string; line: string }) {
  const chunks: string[] = []
  for await (const ev of generateScreen({ user: drawRequest(paper, target, null), model, device: 'phone', fetch: tape.fetch, env: tape.env, log: () => {} })) {
    if (ev.type === 'chunk') chunks.push(ev.text)
    else return { chunks, version: ev.version }
  }
  throw new Error('no final event')
}

describe('generate a screen', () => {
  for (const model of (Object.keys(MODELS) as ModelId[]).filter((m) => !MODELS[m].background)) {
    test(`${model} streams an HTML fragment with action prompts and a cost`, async () => {
      const { chunks, version: c } = await run(model, { id: 'home', line: 'the first screen' })
      expect(chunks.length).toBeGreaterThan(5)
      // A screen with no logic has no script; one that has logic keeps it in one <script>.
      expect((c.html.match(/<script>/g) ?? []).length).toBeLessThanOrEqual(1)
      expect(c.html).not.toContain('```')
      // A link that names its screen and says what it shows, in the markup or set by the screen's script.
      expect(c.html).toMatch(/data-action="@[a-z0-9-]+:\s*[^"]{10,}"|dataset\.action\s*=/)
      expect(c.costUsd).toBeGreaterThan(0)
      expect(c.costEstimated).toBe(MODELS[model].costEstimated)
      expect(c.servedModel?.startsWith(MODELS[model].model)).toBe(true)
      expect(c.finishReason).toBe('stop')
      expect(c.name?.length).toBeGreaterThan(2)
      expect(c.html).toMatch(/^\s*<title>/)
      expect(c.idea?.length).toBeGreaterThan(8)
    }, 30_000)
  }

  test('a later screen is asked for with the product and the action prompt', async () => {
    const { version } = await run('claude-haiku-5.5', { id: 'checkout', line: 'Checkout screen with 2 lattes in the cart' })
    expect(version.html.toLowerCase()).toContain('checkout')
  }, 30_000)
})
