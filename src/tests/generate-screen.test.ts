// Feature: generate one screen with each of the three models (cassette: generate-screen).
import { afterAll, describe, expect, test } from 'bun:test'
import { MODELS, drawRequest, fileRequest, generateScreen, type ModelId } from '@uxwoz/core'
import { cassette } from './cassette.ts'

const tape = cassette('generate-screen')
afterAll(tape.save)

const paper = { app: 'A coffee shop ordering app', device: 'small-phone' as const, titles: [], lines: [], components: [], rules: [], data: [] }

async function run(model: ModelId, target: { id: string; line: string }) {
  const chunks: string[] = []
  for await (const ev of generateScreen({ user: drawRequest(paper, target, null), model, device: 'small-phone', fetch: tape.fetch, env: tape.env })) {
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

test('File names the one design kept, and the other only when there was one', () => {
  const screen = { id: 'home', line: 'the first screen', html: '<h1 data-part="1">Hi</h1>' }
  const one = fileRequest(paper, screen, {})
  expect(one).toContain('Device: a phone screen, 360 × 500 px; the screen scrolls inside it, and a bar pinned to its bottom stays in view.')
  expect(one).toEndWith('The user picked this variant:\n<h1 data-part="1">Hi</h1>\n\nFile what this decision settles.')
  expect(fileRequest(paper, screen, { other: '<h1>Hello</h1>' })).toContain('<h1 data-part="1">Hi</h1>\n\nThe other variant, which the user did not pick:\n<h1>Hello</h1>\n\nFile')
  expect(fileRequest(paper, screen, { change: 'Bigger' })).toContain('The screen after the change:\n<h1 data-part="1">Hi</h1>\n\nThe user typed this change on it: "Bigger"\n\nFile')
})
