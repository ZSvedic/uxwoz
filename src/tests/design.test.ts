// The look's own rules: the size caps, colours only in tokens.css, every token defined, every file imported.
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB = resolve(import.meta.dir, '../packages/web/src')
const DESIGN = resolve(WEB, 'design')
const read = (path: string) => readFileSync(path, 'utf8')
const cssFiles = readdirSync(DESIGN).filter((f) => f.endsWith('.css')).sort()
const css = Object.fromEntries(cssFiles.map((f) => [f, read(resolve(DESIGN, f))]))
const lineCount = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

// Set at run time by the code (canvas.ts, nav.ts) or on one element in CSS, so tokens.css does not define them.
const RUNTIME_VARS = ['--z', '--depth', '--box-h']
const COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i

describe('design/', () => {
  test('all its CSS stays under 700 lines and 52 KB, and no file is over 130 lines', () => {
    const all = Object.values(css).join('')
    expect(lineCount(all)).toBeLessThan(700)
    expect(Buffer.byteLength(all)).toBeLessThan(52 * 1024)
    for (const [file, text] of Object.entries(css)) expect([file, lineCount(text) <= 130]).toEqual([file, true])
  })

  test('colours live only in tokens.css', () => {
    for (const [file, text] of Object.entries(css)) {
      if (file !== 'tokens.css') expect([file, text.match(COLOUR)?.[0] ?? null]).toEqual([file, null])
    }
    expect(read(resolve(WEB, 'index.html')).match(COLOUR)?.[0] ?? null).toBeNull()
  })

  test('every var() it uses is defined in tokens.css or set at run time', () => {
    const defined = new Set([...css['tokens.css']!.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const used = new Set(Object.values(css).flatMap((t) => [...t.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!)))
    const missing = [...used].filter((v) => !defined.has(v) && !RUNTIME_VARS.includes(v))
    expect(missing).toEqual([])
  })

  test('index.css imports every other CSS file in design/', () => {
    const imported = [...css['index.css']!.matchAll(/@import\s+["']\.\/([\w-]+\.css)["']/g)].map((m) => m[1]).sort()
    expect(imported).toEqual(cssFiles.filter((f) => f !== 'index.css'))
  })

  test('the brand files exist and are SVGs', () => {
    for (const name of ['logo', 'favicon', 'stars-1', 'stars-2', 'stars-3']) {
      expect([name, read(resolve(DESIGN, 'brand', `${name}.svg`)).trimStart().startsWith('<svg')]).toEqual([name, true])
    }
  })
})
