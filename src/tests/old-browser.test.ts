// Too old a browser (spec/behavior.md, Look): the app's page and the player's carry one tiny classic script that tries
// the syntax and the built-ins the app needs and, when one is missing, puts a plain notice in place of the page.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = join(import.meta.dir, '../packages/web/src')
const NOTICE = 'This browser is too old for UXWoz. Please open it in a newer browser.'
const scriptOf = (page: string) => {
  const html = readFileSync(join(WEB, page), 'utf8'), head = html.slice(0, html.indexOf('</head>'))
  const m = head.match(/<script>([\s\S]*?)<\/script>/)
  if (!m) throw new Error(`${page} has no inline script in its head`)
  return m[1]!
}

/** Runs the check against a made-up page; `fn` and `obj` stand in for the browser's Function and Object. */
function run(script: string, fn: unknown = Function, obj: unknown = Object) {
  const ready: (() => void)[] = [], removed: string[] = []
  const node = (name: string) => ({ name, parentNode: { removeChild: (n: { name: string }) => removed.push(n.name) } })
  const attrs: Record<string, string> = {}
  const body = { className: 'app', innerHTML: '<main>the app</main>', setAttribute: (k: string, v: string) => { attrs[k] = v } }
  const document = {
    body,
    addEventListener: (type: string, f: () => void) => { if (type === 'DOMContentLoaded') ready.push(f) },
    querySelectorAll: () => [node('index.css'), node('inline style')],
  }
  new Function('document', 'Function', 'Object', script)(document, fn, obj)
  for (const f of ready) f()
  return { waited: ready.length > 0, body, attrs, removed }
}

describe('a browser too old for the app', () => {
  test('the app\'s page and the player\'s carry the same check, before any stylesheet or module', () => {
    for (const page of ['index.html', 'player.html']) {
      const html = readFileSync(join(WEB, page), 'utf8')
      expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('<link rel="stylesheet"'))
      expect(scriptOf(page)).toContain(NOTICE)
    }
    expect(scriptOf('player.html')).toBe(scriptOf('index.html'))
  })

  test('a browser that has what the app needs keeps the page as it is', () => {
    const r = run(scriptOf('index.html'))
    expect(r.waited).toBe(false)
    expect(r.body.innerHTML).toBe('<main>the app</main>')
  })

  test('one that cannot read the syntax gets the notice alone, the stylesheets gone', () => {
    const throwing = function () { throw new SyntaxError('Unexpected token \'.\'') }
    const r = run(scriptOf('index.html'), throwing)
    expect(r.body.innerHTML).toBe(`<p>${NOTICE}</p>`)
    expect(r.body.className).toBe('')
    expect(r.removed).toEqual(['index.css', 'inline style'])
    expect(r.attrs.style).toContain('sans-serif')
  })

  test('one that reads the syntax but lacks a built-in the app calls gets the notice too', () => {
    const r = run(scriptOf('player.html'), Function, {})
    expect(r.body.innerHTML).toBe(`<p>${NOTICE}</p>`)
  })

  test('the check itself is old syntax: var, function, no arrows or template strings', () => {
    const s = scriptOf('index.html').replace(/^\s*\/\/.*$/gm, '').replace(/'[^']*'/g, "''")
    expect(s).not.toMatch(/=>|`|\blet\b|\bconst\b|\?\.|\?\?/)
  })
})
