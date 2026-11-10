import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FRAME_SANDBOX, SYSTEM_PROMPT, VIEWPORT_H, extractFragment, framePage, hasVisibleText } from '@uxwoz/core'

describe('frame page', () => {
  test('only a markdown fence is stripped; the code is left alone', () => {
    expect(extractFragment('```html\n<h1>Hi</h1>\n```')).toBe('<h1>Hi</h1>')
    expect(extractFragment('Here you go:\n```html\n<p>x</p>\n```\nEnjoy')).toBe('<p>x</p>')
    expect(extractFragment('```html')).toBe('')
    expect(extractFragment('<h1>Hi</h1><script>let a = 1</script>')).toBe('<h1>Hi</h1><script>let a = 1</script>')
  })

  test('a fragment counts as visible once it has text outside tags and scripts', () => {
    expect(hasVisibleText('<h1>')).toBe(false)
    expect(hasVisibleText('<')).toBe(false)
    expect(hasVisibleText('<h1 id="t"')).toBe(false)
    expect(hasVisibleText('<h1>Hi')).toBe(true)
    expect(hasVisibleText('<script>const s = "text"')).toBe(false)
  })

  test('the page inlines the theme and marks streaming builds as not clickable', () => {
    const streaming = framePage('<h1>Hi</h1>', 'main{color:red}', false)
    expect(streaming).toContain('<style>main{color:red}</style>')
    expect(streaming).toContain('<main><h1>Hi</h1></main>')
    expect(streaming).toContain('const final = false')
    expect(framePage('<h1>Hi</h1>', '', true)).toContain('const final = true')
    expect(FRAME_SANDBOX).toBe('allow-scripts allow-forms')
  })
})

test('the frame script reports the clicked control by its own words', () => {
  // Runs the bootstrap script's label helper as the browser would see it after template escaping.
  const script = framePage('', '', true).match(/<script>([\s\S]*?)<\/script>/)![1]!
  const helper = script.match(/const labelOf = (\(el\) => [^\n]*)/)![1]!
  const labelOf = new Function(`return ${helper}`)() as (el: unknown) => string
  const el = { getAttribute: () => null, textContent: '  View   past orders ', value: '' }
  expect(labelOf(el)).toBe('View past orders')
})

test('vh units become pixels of a fixed window, so a frame cannot grow without end', () => {
  const script = framePage('', '', true).match(/<script>([\s\S]*?)<\/script>/)![1]!
  const helper = script.match(/const vhToPx = (\(css\) => [^\n]*)/)![1]!
  const vhToPx = new Function(`return ${helper}`)() as (css: string) => string
  expect(vhToPx('min-height:100vh;height:50dvh;top:-2.5svh')).toBe(`min-height:${VIEWPORT_H}px;height:${VIEWPORT_H / 2}px;top:${-VIEWPORT_H * 0.025}px`)
  expect(vhToPx('width:100vw;height:100%')).toBe('width:100vw;height:100%')
})

test('spec/prompt-screen.md holds the exact system prompt the app sends, and it holds the manual verbatim', () => {
  const spec = readFileSync(resolve(import.meta.dir, '../../spec/prompt-screen.md'), 'utf8')
  const block = spec.match(/```text\n([\s\S]*?)\n```/)?.[1]
  expect(block).toBe(SYSTEM_PROMPT)
  // A manual edit fails here until the manual is copied into the prompt (and the cassettes recorded).
  const manual = readFileSync(resolve(import.meta.dir, '../../process/plans/2026-11-06-canvas-manual.md'), 'utf8').trim()
  expect(SYSTEM_PROMPT.startsWith(`${manual}\n\n`)).toBe(true)
})

test('the frame script parses, and finds a part again by its words, its tag and its place among equals', () => {
  const script = framePage('', '', true).match(/<script>([\s\S]*?)<\/script>/)![1]!
  expect(() => new Function(script)).not.toThrow()
  for (const s of ["uxwoz: 'located'", "uxwoz: 'part'", "d.uxwoz === 'locate'", 'd.off', 'describe(el))', "uxwoz: 'located', n: d.n"]) expect(script).toContain(s)
  // The matching helpers as the browser sees them, run against fake elements.
  const lines = ['labelOf', 'PARTS', 'textOf'].map((n) => script.match(new RegExp(`const ${n} = [^\\n]*`))![0])
  const find = script.match(/const find = [\s\S]*?\n {2}\}\n/)![0]
  const run = new Function(`${lines.join('\n')}\n${find}\nreturn { find, PARTS }`)() as { find: (q: (s: string) => unknown[], a: object) => unknown; PARTS: string }
  const node = (tag: string, text: string) => ({ tagName: tag.toUpperCase(), getAttribute: () => null, textContent: text })
  const save1 = node('button', 'Save'), save2 = node('button', ' Save '), title = node('h2', 'Save'), other = node('p', 'Hello')
  const q = (s: string) => (s === 'button' ? [save1, save2] : s === 'h2' ? [title] : s === run.PARTS ? [title, save1, save2, other] : [])
  expect(run.find(q, { text: 'Save', tag: 'button', nth: 1 })).toBe(save2)
  expect(run.find(q, { text: 'Save', tag: 'button', nth: 5 })).toBe(save1)
  // The tag changed in an Edit: the same words under any tag.
  expect(run.find(q, { text: 'Hello', tag: 'h3', nth: 0 })).toBe(other)
  expect(run.find(q, { text: 'Save', tag: '', nth: 0 })).toBe(title)
  expect(run.find(q, { text: 'Save', tag: 'x)', nth: 0 })).toBe(title)
  expect(run.find(q, { text: 'Gone', tag: 'button', nth: 0 })).toBeNull()
})
