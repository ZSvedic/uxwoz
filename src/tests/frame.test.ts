import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FRAME_SANDBOX, SYSTEM_PROMPT, VIEWPORT_H, extractFragment, framePage, hasVisibleText, scrollsFirst } from '@uxwoz/core'

describe('the wheel over a screen', () => {
  const rail = { overflowX: 'auto', overflowY: 'hidden', scrollLeft: 0, scrollTop: 0, scrollWidth: 900, scrollHeight: 200, clientWidth: 340, clientHeight: 200 }
  const plain = { overflowX: 'visible', overflowY: 'visible', scrollLeft: 0, scrollTop: 0, scrollWidth: 340, scrollHeight: 900, clientWidth: 340, clientHeight: 900 }

  test('a sideways card rail takes a sideways swipe while it has room that way, then the canvas moves', () => {
    expect(scrollsFirst([plain, rail, plain], 30, 2)).toBe(true)
    expect(scrollsFirst([rail], -30, 0)).toBe(false) // at its start already
    expect(scrollsFirst([{ ...rail, scrollLeft: 200 }], -30, 0)).toBe(true)
    expect(scrollsFirst([{ ...rail, scrollLeft: 560 }], 30, 0)).toBe(false) // at its end
  })

  test('an up or down scroll over the rail, or over a part that cannot scroll, moves the canvas', () => {
    expect(scrollsFirst([rail], 2, 40)).toBe(false)
    expect(scrollsFirst([plain], 0, 40)).toBe(false)
    expect(scrollsFirst([], 30, 0)).toBe(false)
    expect(scrollsFirst([{ ...plain, overflowY: 'auto', clientHeight: 300 }], 0, 40)).toBe(true)
  })

  test('the rule goes into the frame whole, and the frame\'s script still parses', () => {
    const script = framePage('', '', true).match(/<script>([\s\S]*?)<\/script>/)![1]!
    expect(() => new Function(script)).not.toThrow()
    const rule = script.match(/const scrollsFirst = ([\s\S]*?)\n {2}const chain/)![1]!
    const run = new Function(`return (${rule})`)() as typeof scrollsFirst
    expect(run([{ ...rail, scrollLeft: 200 }], -30, 0)).toBe(true)
    expect(run([rail], 0, 30)).toBe(false)
  })
})

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

test('a part\'s words keep a space between its elements, and an anchor from when they ran together still matches', () => {
  const script = framePage('', '', true).match(/<script>([\s\S]*?)<\/script>/)![1]!
  const lines = ['labelOf', 'PARTS', 'textOf'].map((n) => script.match(new RegExp(`const ${n} = [^\\n]*`))![0])
  const find = script.match(/const find = [\s\S]*?\n {2}\}\n/)![0]
  const run = new Function(`${lines.join('\n')}\n${find}\nreturn { find, labelOf }`)() as { find: (q: (s: string) => unknown[], a: object) => unknown; labelOf: (el: unknown) => string }
  const text = (t: string) => ({ nodeType: 3, childNodes: [], textContent: t })
  const cell = (t: string) => ({ nodeType: 1, childNodes: [text(t)], textContent: t })
  const row = { nodeType: 1, tagName: 'TR', getAttribute: () => null, childNodes: [cell('Desk 1'), { nodeType: 8, childNodes: [], textContent: 'note' }, cell('Desk 2')], textContent: 'Desk 1Desk 2' }
  expect(run.labelOf(row)).toBe('Desk 1 Desk 2')
  expect(run.find((s) => (s === 'tr' ? [row] : []), { text: 'Desk 1Desk 2', tag: 'tr', nth: 0 })).toBe(row)
})
