// The look's own rules: the size caps, colours only in tokens.css, every token defined, every file imported, text
// contrast worked out from tokens.css, no request to Google, and the brand files.
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB = resolve(import.meta.dir, '../packages/web/src')
const DESIGN = resolve(WEB, 'design')
const read = (path: string) => readFileSync(path, 'utf8')
const cssFiles = readdirSync(DESIGN).filter((f) => f.endsWith('.css')).sort()
const css = Object.fromEntries(cssFiles.map((f) => [f, read(resolve(DESIGN, f))]))
const lineCount = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

// Set at run time by the code (canvas.ts, nav.ts) or on one element in CSS (a box's glow, a rope's width), so tokens.css does not define them.
const RUNTIME_VARS = ['--z', '--depth', '--box-h', '--bar-h', '--glow', '--rope-w']
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

  test('the brand files exist; the SVGs are SVGs', () => {
    for (const name of ['logo', 'favicon', 'stars-1', 'stars-2', 'stars-3']) {
      expect([name, read(resolve(DESIGN, 'brand', `${name}.svg`)).trimStart().startsWith('<svg')]).toEqual([name, true])
    }
    for (const file of ['fredoka.woff2', 'LICENSE-fredoka.md', 'favicon-32.png', 'apple-touch-icon.png']) {
      expect([file, existsSync(resolve(DESIGN, 'brand', file))]).toEqual([file, true])
    }
  })

  test('index.html has no data: URI and no <style>', () => {
    const html = read(resolve(WEB, 'index.html'))
    expect(html.includes('data:')).toBe(false)
    expect(html.includes('<style')).toBe(false)
  })

  test('nothing under src/packages/ asks Google for fonts', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const path = resolve(dir, f)
      return f === 'node_modules' ? [] : statSync(path).isDirectory() ? walk(path) : [path]
    })
    const hits = walk(resolve(WEB, '../..')).filter((f) => !/\.(woff2|png)$/.test(f) && /fonts\.(googleapis|gstatic)\.com/.test(read(f)))
    expect(hits).toEqual([])
  })
})

// Contrast, from tokens.css: the light tokens, then the dark ones over them; a role resolves through var() to a hex.
const tokens = css['tokens.css']!.replace(/\/\*[\s\S]*?\*\//g, '')
const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)')
const darkEnd = tokens.indexOf('\n}', darkStart) + 2
const decls = (text: string) => Object.fromEntries([...text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
const light = decls(tokens.slice(0, darkStart) + tokens.slice(darkEnd))
const modes = { light, dark: { ...light, ...decls(tokens.slice(darkStart, darkEnd)) } }

/** A token as an opaque #rrggbb; a see-through #rrggbbaa (a chip) is laid over --surface, where it sits. */
function hex(map: Record<string, string>, name: string): string {
  let v = map[name]
  for (let m; v && (m = v.match(/^var\((--[\w-]+)\)$/)); ) v = map[m[1]!]
  if (v && /^#[0-9a-f]{8}$/i.test(v)) {
    const under = hex(map, '--surface'), a = parseInt(v.slice(7), 16) / 255
    return '#' + [1, 3, 5].map((i) => Math.round(parseInt(v!.slice(i, i + 2), 16) * a + parseInt(under.slice(i, i + 2), 16) * (1 - a))
      .toString(16).padStart(2, '0')).join('')
  }
  if (!v || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) throw new Error(`${name} is not an opaque hex colour: ${v}`)
  return v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v
}
const luminance = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0)
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

// [text, background, the least contrast]: 4.5:1 for text, 3:1 for a disabled control.
const PAIRS: [string, string, number][] = [
  ['--text', '--surface', 4.5], ['--muted', '--surface', 4.5], ['--mark', '--surface', 4.5], ['--err', '--surface', 4.5],
  ['--on-pick', '--pick', 4.5], ['--on-badge', '--badge', 4.5], ['--bar-text', '--wood1', 4.5], ['--bar-text', '--wood2', 4.5],
  ['--sky-text', '--sky1', 4.5], ['--sky-text', '--sky2', 4.5], ['--sky-muted', '--sky1', 4.5], ['--sky-muted', '--sky2', 4.5],
  ['--sky-mark', '--sky1', 4.5], ['--sky-text', '--plate', 4.5], ['--sky-muted', '--plate', 4.5],
  ['--disabled', '--surface', 3], ['--bar-disabled', '--wood1', 3], ['--bar-disabled', '--wood2', 3],
  // The wordmark is large text; an idea opened in a box lies on surface-2; the deck's + on both of its stripes.
  ['--wordmark', '--surface', 3], ['--text', '--surface-2', 4.5], ['--muted', '--surface-2', 4.5], ['--mark', '--surface-2', 4.5],
  ['--disabled', '--surface-2', 3], ['--deck-edge', '--deck', 4.5], ['--deck-edge', '--deck-stripe', 4.5],
  // An ID on its chip, and the "new" after it; the drawer's open tab. A screen's name chip is --text on --surface.
  ['--text', '--chip', 4.5], ['--mark', '--chip', 4.5], ['--on-tab', '--tab', 4.5],
]

describe('contrast in tokens.css', () => {
  for (const [mode, map] of Object.entries(modes)) {
    test(`${mode}: every text pair passes`, () => {
      const low = PAIRS.map(([fg, bg, min]) => [fg, bg, Math.round(ratio(hex(map, fg), hex(map, bg)) * 100) / 100, min] as const)
        .filter(([, , r, min]) => r < min)
      expect(low).toEqual([])
    })
  }
})
