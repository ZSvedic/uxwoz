// Feature: generate one screen with each of the three models (cassette: generate-screen).
import { afterAll, describe, expect, test } from 'bun:test'
import { MODELS, generateScreen, type ModelId } from '@uxwoz/core'
import { cassette } from './cassette.ts'

const tape = cassette('generate-screen')
afterAll(tape.save)

async function run(model: ModelId, action: string | null) {
  const chunks: string[] = []
  for await (const ev of generateScreen({ app: 'A coffee shop ordering app', action, model, fetch: tape.fetch, env: tape.env, log: () => {} })) {
    if (ev.type === 'chunk') chunks.push(ev.text)
    else return { chunks, candidate: ev.candidate }
  }
  throw new Error('no final event')
}

describe('generate a screen', () => {
  for (const model of Object.keys(MODELS) as ModelId[]) {
    test(`${model} streams an HTML fragment with action prompts and a cost`, async () => {
      const { chunks, candidate: c } = await run(model, null)
      expect(chunks.length).toBeGreaterThan(5)
      expect(c.html).toContain('<script>')
      expect(c.html).not.toContain('```')
      expect(c.html).toMatch(/data-action="[^"]{10,}"/)
      expect(c.costUsd).toBeGreaterThan(0)
      expect(c.costEstimated).toBe(MODELS[model].costEstimated)
      expect(c.servedModel?.startsWith(MODELS[model].model)).toBe(true)
      expect(c.finishReason).toBe('stop')
    }, 30_000)
  }

  test('a later screen is asked for with the product and the action prompt', async () => {
    const { candidate } = await run('claude-haiku-5.5', 'Checkout screen with 2 lattes in the cart')
    expect(candidate.html.toLowerCase()).toContain('checkout')
  }, 30_000)
})
