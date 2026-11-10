// The look's own rules: the size caps, colours only in tokens.css, every token defined, every file imported, text
// contrast worked out from tokens.css, no request to Google, the brand files, the player's page and the design sheet.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { ScreenCache } from '@uxwoz/core'
import { createServer } from '@uxwoz/web/src/server.ts'

const WEB = resolve(import.meta.dir, '../packages/web/src')
const DESIGN = resolve(WEB, 'design')
const read = (path: string) => readFileSync(path, 'utf8')
const cssFiles = readdirSync(DESIGN).filter((f) => f.endsWith('.css')).sort()
const css = Object.fromEntries(cssFiles.map((f) => [f, read(resolve(DESIGN, f))]))
const lineCount = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

// Set at run time by the code (canvas.ts, nav.ts) or on one element in CSS (a box's glow, a rope's width) or by fx.ts (a spark's way and colour), so tokens.css does not define them.
const RUNTIME_VARS = ['--z', '--depth', '--box-h', '--bar-h', '--glow', '--rope-w', '--x', '--y', '--c']
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
    for (const page of ['index.html', 'player.html', 'design/sheet.html']) expect([page, read(resolve(WEB, page)).match(COLOUR)?.[0] ?? null]).toEqual([page, null])
  })

  test('every var() it uses is defined in tokens.css or set at run time', () => {
    const defined = new Set([...css['tokens.css']!.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const used = new Set(Object.values(css).flatMap((t) => [...t.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!)))
    const missing = [...used].filter((v) => !defined.has(v) && !RUNTIME_VARS.includes(v))
    expect(missing).toEqual([])
  })

  test('index.css imports every other CSS file in design/ but the player\'s', () => {
    const imported = [...css['index.css']!.matchAll(/@import\s+["']\.\/([\w-]+\.css)["']/g)].map((m) => m[1]).sort()
    expect(imported).toEqual(cssFiles.filter((f) => f !== 'index.css' && f !== 'player.css'))
  })

  test('player.html has no <style>, and every id player.ts looks up is in it', () => {
    const html = read(resolve(WEB, 'player.html'))
    expect(html.includes('<style')).toBe(false)
    const ids = new Set([...read(resolve(WEB, 'player.ts')).matchAll(/\$(?:<\w+>)?\('([\w-]+)'\)/g)].map((m) => m[1]!))
    expect(ids.size).toBeGreaterThan(10)
    expect([...ids].filter((id) => !html.includes(`id="${id}"`))).toEqual([])
  })

  test('every class the design sheet uses, but its own sheet- ones, has a rule in design/', () => {
    const all = Object.values(css).join('\n')
    const classes = new Set([...read(resolve(DESIGN, 'sheet.html')).matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)))
    const missing = [...classes].filter((c) => !c.startsWith('sheet-') && !new RegExp(`\\.${c}(?![\\w-])`).test(all))
    expect(classes.size).toBeGreaterThan(40)
    expect(missing).toEqual([])
  })

  test('the brand files exist; the SVGs are SVGs', () => {
    for (const name of ['logo', 'favicon', 'stars-1', 'stars-2', 'stars-3']) {
      expect([name, read(resolve(DESIGN, 'brand', `${name}.svg`)).trimStart().startsWith('<svg')]).toEqual([name, true])
    }
    for (const file of ['fredoka.woff2', 'LICENSE-fredoka.md', 'favicon-32.png', 'apple-touch-icon.png', 'og.png']) {
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

describe('/design and /og.png', () => {
  let server: ReturnType<typeof createServer> | null = null
  afterEach(() => { server?.stop(true); server = null; delete process.env.UXWOZ_OWNER })
  const start = () => (server = createServer({ port: 0, cache: new ScreenCache(), log: () => {}, fileWaitMs: 0 }))
  const get = (path: string, headers: Record<string, string> = {}) => fetch(new URL(path, server!.url), { headers })

  test('the design sheet is an HTML page and the share preview a PNG', async () => {
    start()
    const sheet = await get('/design')
    expect(sheet.status).toBe(200)
    expect(sheet.headers.get('content-type')).toContain('text/html')
    expect(await sheet.text()).toContain('design sheet')
    const og = await get('/og.png')
    expect(og.status).toBe(200)
    expect(og.headers.get('content-type')).toBe('image/png')
    expect((await og.arrayBuffer()).byteLength).toBeLessThan(200 * 1024)
  })

  test('with UXWOZ_OWNER set, /og.png still answers everyone and /design asks for the owner\'s cookie', async () => {
    process.env.UXWOZ_OWNER = 'sesame'
    start()
    expect((await get('/og.png')).status).toBe(200)
    expect((await get('/design')).status).toBe(403)
    const sheet = await get('/design', { cookie: 'uxwoz_owner=sesame' })
    expect(sheet.status).toBe(200)
    expect(await sheet.text()).toContain('design sheet')
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
