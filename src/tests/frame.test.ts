import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FRAME_SANDBOX, SYSTEM_PROMPT, extractFragment, framePage, hasVisibleText } from '@uxwoz/core'

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

test('spec/prompt-screen.md holds the exact system prompt the app sends', () => {
  const spec = readFileSync(resolve(import.meta.dir, '../../spec/prompt-screen.md'), 'utf8')
  const block = spec.match(/```text\n([\s\S]*?)\n```/)?.[1]
  expect(block).toBe(SYSTEM_PROMPT)
})
