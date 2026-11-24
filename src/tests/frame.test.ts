import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEVICES, FRAME_SANDBOX, SYSTEM_PROMPT, extractFragment, framePage, hasVisibleText, scrollsFirst } from '@uxwoz/core'

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

// The frame's script run against a small fake page: its listeners are called as the browser would call them.
type Msg = Record<string, unknown> & { uxwoz: string }
class El {
  parentElement: El | null = null
  style: Record<string, string> = {}
  childNodes: unknown[] = []
  scrollLeft = 0; scrollTop = 0; scrollWidth = 300; scrollHeight = 100; clientWidth = 300; clientHeight = 100
  constructor(public tagName: string, public attrs: Record<string, string> = {}, public textContent = '', public rect = { left: 0, top: 0, width: 50, height: 20 }) {}
  getAttribute(n: string) { return this.attrs[n] ?? null }
  hasAttribute(n: string) { return n in this.attrs }
  getBoundingClientRect() { const r = this.rect; return { ...r, right: r.left + r.width, bottom: r.top + r.height } }
  closest(sel: string): El | null {
    const is = (e: El) => sel === 'a[href]' ? e.tagName === 'A' && 'href' in e.attrs : sel === '[data-action]' ? 'data-action' in e.attrs : true
    for (let e: El | null = this; e; e = e.parentElement) if (is(e)) return e
    return null
  }
}
function fakeFrame(opts: { final?: boolean; page?: Partial<El>; parts?: El[]; active?: boolean } = {}) {
  const script = framePage('', '', opts.final ?? true).match(/<script>([\s\S]*?)<\/script>/)![1]!
  const sent: Msg[] = [], on: Record<string, ((e: object) => void)[]> = {}
  const add = (n: string, f: (e: object) => void) => { (on[n] ??= []).push(f) }
  const parent = { postMessage: (m: Msg) => sent.push(m) }
  const html = new El('HTML'), body = new El('BODY')
  const page = Object.assign(html, { scrollHeight: 500, clientHeight: 500 }, opts.page)
  const parts = opts.parts ?? []
  const document = {
    scrollingElement: page, documentElement: html, body, addEventListener: add,
    querySelector: () => null,
    querySelectorAll: (sel: string) => parts.filter((p) => sel.includes(',') || p.tagName.toLowerCase() === sel),
  }
  const style = (e: El) => ({ overflowX: e.style.overflowX ?? 'visible', overflowY: e.style.overflowY ?? 'visible' })
  new Function('addEventListener', 'window', 'document', 'parent', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'ResizeObserver', 'innerWidth', 'innerHeight', 'Element', script)(
    add, { addEventListener: add }, document, parent, { userActivation: { isActive: opts.active ?? true } }, style, (f: () => void) => f(),
    class { observe() {} }, 300, 500, El)
  const fire = (n: string, e: Record<string, unknown> = {}) => {
    const ev = { defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true }, stopImmediatePropagation() { this.stopped = true }, ...e }
    for (const f of on[n] ?? []) { if (ev.stopped) break; f(ev) }
    return ev
  }
  return { sent, fire, page, parent, of: (k: string) => sent.filter((m) => m.uxwoz === k) }
}

describe('a mock scrolls inside its frame', () => {
  test('the frame fills its size and scrolls: no vh fix, no size report, no one-finger pan', () => {
    const doc = framePage('<h1>Hi</h1>', '', true)
    expect(doc).not.toContain('overflow: hidden')
    expect(doc).toContain('body > main { min-height: 100vh; }')
    for (const gone of ["uxwoz: 'size'", "'pan'", 'vhToPx', 'dragOwner']) expect(doc).not.toContain(gone)
    expect(DEVICES.phone.height).toBe(844)
  })

  test('scroll says, at load and as it scrolls, whether content lies above or below the frame', () => {
    const f = fakeFrame({ page: { scrollHeight: 1200, clientHeight: 500 } })
    f.fire('load')
    expect(f.of('scroll')).toEqual([{ uxwoz: 'scroll', above: false, below: true }])
    f.fire('load')
    expect(f.of('scroll')).toHaveLength(1) // nothing changed: nothing sent
    f.page.scrollTop = 300; f.fire('scroll')
    f.page.scrollTop = 700; f.fire('scroll')
    expect(f.of('scroll').slice(1)).toEqual([{ uxwoz: 'scroll', above: true, below: true }, { uxwoz: 'scroll', above: true, below: false }])
    const short = fakeFrame()
    short.fire('load')
    expect(short.of('scroll')).toEqual([{ uxwoz: 'scroll', above: false, below: false }])
  })

  test('the wheel scrolls the page while it can; only then does it go to the canvas', () => {
    const f = fakeFrame({ page: { scrollHeight: 1200, clientHeight: 500 } })
    const p = new El('P')
    let e = f.fire('wheel', { target: p, deltaX: 0, deltaY: 40 })
    expect(e.defaultPrevented).toBe(false)
    expect(f.of('wheel')).toHaveLength(0)
    e = f.fire('wheel', { target: p, deltaX: 0, deltaY: -40 }) // at the top already
    expect(e.defaultPrevented).toBe(true)
    expect(f.of('wheel')).toEqual([{ uxwoz: 'wheel', dx: 0, dy: -40 }])
    f.page.scrollTop = 700
    f.fire('wheel', { target: p, deltaX: 0, deltaY: 40 }) // at the end
    expect(f.of('wheel')).toHaveLength(2)
    // A card rail with room takes a sideways scroll; the page cannot scroll sideways.
    const rail = Object.assign(new El('DIV'), { style: { overflowX: 'auto', overflowY: 'hidden' }, scrollWidth: 900 })
    p.parentElement = rail
    f.fire('wheel', { target: p, deltaX: 30, deltaY: 0 })
    expect(f.of('wheel')).toHaveLength(2)
    f.fire('wheel', { target: p, deltaX: -30, deltaY: 0 })
    expect(f.of('wheel')).toHaveLength(3)
    f.fire('wheel', { target: p, deltaX: 0, deltaY: 40, ctrlKey: true, clientX: 5, clientY: 6 })
    expect(f.of('zoom')).toEqual([{ uxwoz: 'zoom', dy: 40, x: 5, y: 6 }])
  })

  test('a page whose body hides its overflow cannot take the wheel', () => {
    const f = fakeFrame({ page: { scrollHeight: 1200, clientHeight: 500 } })
    f.page.style.overflowY = 'hidden'
    f.fire('wheel', { target: new El('P'), deltaX: 0, deltaY: 40 })
    expect(f.of('wheel')).toHaveLength(1)
  })

  test('one finger is the page\'s own; two fingers pinch the canvas', () => {
    const f = fakeFrame()
    const t = (x: number, y: number) => ({ clientX: x, clientY: y })
    f.fire('touchstart', { touches: [t(10, 10)] })
    const one = f.fire('touchmove', { touches: [t(10, 60)] })
    expect(one.defaultPrevented).toBe(false)
    expect(f.sent).toHaveLength(0)
    f.fire('touchstart', { touches: [t(10, 10), t(50, 10)] })
    expect(f.fire('touchmove', { touches: [t(10, 10), t(50, 40)] }).defaultPrevented).toBe(true)
    f.fire('touchmove', { touches: [t(0, 10), t(60, 10)] })
    expect(f.of('pinch')).toEqual([{ uxwoz: 'pinch', x: 30, y: 25, d: 50, start: true }, { uxwoz: 'pinch', x: 30, y: 10, d: 60, start: false }])
    f.fire('touchend', { touches: [t(0, 10)] })
    f.fire('touchmove', { touches: [t(0, 40)] })
    expect(f.of('pinch')).toHaveLength(2)
  })

  test('a link to a full web address asks the app to open it; the frame never navigates', () => {
    const f = fakeFrame()
    const click = (attrs: Record<string, string>) => f.fire('click', { target: new El('A', attrs) })
    expect(click({ href: 'https://example.com/a?b=1' }).defaultPrevented).toBe(true)
    expect(click({ href: 'HTTP://example.com' }).defaultPrevented).toBe(true)
    for (const href of ['#', '', '/about', 'javascript:alert(1)', 'mailto:a@b.c', 'https://']) expect(click({ href }).defaultPrevented).toBe(true)
    click({ href: 'https://example.com', 'data-action': '@home' })
    expect(f.of('open')).toEqual([{ uxwoz: 'open', url: 'https://example.com/a?b=1' }, { uxwoz: 'open', url: 'HTTP://example.com' }])
    expect(f.of('action')).toHaveLength(1) // the data-action wins
    // A script's click, a screen still streaming, or a click the screen's own script took open nothing.
    const scripted = fakeFrame({ active: false })
    scripted.fire('click', { target: new El('A', { href: 'https://example.com' }) })
    const streaming = fakeFrame({ final: false })
    streaming.fire('click', { target: new El('A', { href: 'https://example.com' }) })
    const taken = fakeFrame()
    taken.fire('click', { target: new El('A', { href: 'https://example.com' }), defaultPrevented: true })
    expect([...scripted.sent, ...streaming.sent, ...taken.sent].filter((m) => m.uxwoz === 'open')).toEqual([])
  })

  test('located leaves out a part scrolled outside the frame\'s view, and names it in away', () => {
    const shown = new El('BUTTON', {}, 'Save', { left: 10, top: 400, width: 80, height: 30 })
    const below = new El('BUTTON', {}, 'Delete', { left: 10, top: 900, width: 80, height: 30 })
    const above = new El('H2', {}, 'Title', { left: 10, top: -60, width: 80, height: 30 })
    const f = fakeFrame({ parts: [shown, below, above] })
    const anchors = [{ id: 1, text: 'Save', tag: 'button', nth: 0 }, { id: 2, text: 'Delete', tag: 'button', nth: 0 }, { id: 3, text: 'Title', tag: 'h2', nth: 0 }]
    f.fire('message', { source: f.parent, data: { uxwoz: 'locate', n: 4, anchors } })
    expect(f.of('located')).toEqual([{ uxwoz: 'located', n: 4, spots: [{ id: 1, x: 10, y: 400, w: 80, h: 30 }], away: [2, 3] }])
  })

  test('the keys passed on: zoom keys, Esc and ⇧1, not ⇧2 or ⇧3', () => {
    const f = fakeFrame()
    const key = (code: string, key: string, extra: Record<string, unknown> = {}) => f.fire('keydown', { target: new El('BODY'), code, key, shiftKey: false, ...extra })
    key('Digit1', '!', { shiftKey: true }); key('Digit2', '@', { shiftKey: true }); key('Digit3', '#', { shiftKey: true })
    key('Escape', 'Escape'); key('Equal', '=', { metaKey: true })
    expect(f.of('key').map((m) => m.key)).toEqual(['!', 'Escape', '='])
  })
})
