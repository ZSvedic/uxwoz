// The model's HTML fragment as the srcdoc page of a sandboxed iframe. Runs in the browser too: no Node or Bun APIs.

/** Remove a markdown fence (and prose around it) if the model added one; the code itself is never changed. */
export function extractFragment(raw: string): string {
  const block = raw.match(/(?:^|\n)[ \t]*```[^\n`]*\n([\s\S]*?)(?:\n[ \t]*```|$)/)
  if (block) return block[1]!
  if (/^\s*`{1,3}[^\n`]*$/.test(raw)) return '' // an opening fence, mid-stream
  return raw
}

/** True once the fragment holds text outside tags, the title, scripts and styles. */
export const hasVisibleText = (html: string): boolean =>
  html.replace(/<(style|script|title)[\s\S]*?(<\/\1>|$)|<[^>]*>|<[^>]*$/g, '').trim() !== ''

/** HTML text with its five common entities read. */
export const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** The short name the model gives a screen in its <title>, or '' if it gave none. */
export function screenName(html: string): string {
  const t = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? ''
  return t.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 60)
}

/** The one-sentence design idea the model gives a screen in <meta name="idea">, or '' if it gave none. */
export function screenIdea(html: string): string {
  const tag = html.match(/<meta\s+name=["']idea["'][^>]*>/i)?.[0] ?? ''
  const t = tag.match(/content=(?:"([^"]*)"|'([^']*)')/i)
  const s = t?.[1] ?? t?.[2] ?? ''
  return decode(s).replace(/\s+/g, ' ').trim().slice(0, 140)
}

/** The window height of a screen made before devices; our script turns vh units into pixels of it, as a frame grows with its screen. */
export const VIEWPORT_H = 800

/** The devices a screen can be designed for: the width of its window, and the least height of a screen. */
export const DEVICES = {
  phone: { label: 'Phone', width: 390, height: 844, request: 'a phone screen, 390 px wide' },
  desktop: { label: 'Desktop', width: 1024, height: 768, request: 'a desktop browser window, 1024 px wide' },
} as const
export type Device = keyof typeof DEVICES
export const DEFAULT_DEVICE: Device = 'phone'
/** The window width of screens made before devices existed. */
export const LEGACY_WIDTH = 800
export const isDevice = (v: unknown): v is Device => typeof v === 'string' && Object.hasOwn(DEVICES, v)

// Our script, before the model's markup: clicks on data-action controls become messages to the app,
// and the frame never navigates. While the screen streams (`final` false), controls do nothing.
const bootstrap = (final: boolean, vh: number) => `(() => {
  const final = ${final}
  // Only a real click opens a screen: a script cannot start paid generations.
  const go = (prompt, label, part) => {
    if (!final || typeof prompt !== 'string' || !prompt.trim()) return
    if (navigator.userActivation && !navigator.userActivation.isActive) return
    parent.postMessage({ uxwoz: 'action', prompt: prompt.trim().slice(0, 500), label: String(label || '').slice(0, 80), part }, '*')
  }
  const labelOf = (el) => { const w = (n) => n.nodeType === 8 ? '' : n.childNodes?.length ? [...n.childNodes].map(w).join(' ') : n.textContent || ''; return el ? (el.getAttribute('aria-label') || w(el).trim() || el.value || '').trim().replace(/\\s+/g, ' ') : '' }
  addEventListener('pointerdown', () => parent.postMessage({ uxwoz: 'touch' }, '*'), true)
  // A part of the screen, as the page pins a comment to it: its words, its tag, its place among the elements with the
  // same tag and words, and where it is. The frame never scrolls, so its rectangle is in the page's own pixels.
  const PARTS = '[data-action],[aria-label],button,a,label,h1,h2,h3,h4,li,td,th,p,input,select'
  const all = (sel) => [...document.querySelectorAll(sel)]
  const textOf = (el) => { const t = labelOf(el) || el.tagName.toLowerCase(); return t.length > 60 ? t.slice(0, 57) + '…' : t }
  const partAt = (t) => t instanceof Element ? t.closest(PARTS) || t : null
  const describe = (el) => {
    const text = textOf(el), tag = el.tagName.toLowerCase(), r = el.getBoundingClientRect()
    const nth = Math.max(0, all(tag).filter((x) => textOf(x) === text).indexOf(el))
    return { text, tag, nth, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  }
  // An anchor found again: the nth with the same tag and words (the first if there are fewer), else any part with the words.
  const find = (q, a) => {
    // A part's words were once run together ("Desk 1Desk 2"): an anchor from then still matches without its spaces.
    const bare = (t) => t.replace(/\\s/g, ''), is = (x) => textOf(x) === a.text || bare(textOf(x)) === bare(a.text)
    const same = /^[a-z][a-z0-9]*$/.test(a.tag) ? q(a.tag).filter(is) : []
    return same[a.nth] || same[0] || q(PARTS).find(is) || null
  }
  // The page's comment mode: after { uxwoz: 'name-part' }, the part under the pointer has an outline and the next
  // click names it instead of using it; { uxwoz: 'name-part', off: true } stops it. Until then this does nothing.
  let naming = false, lit = null, litStyle = ''
  const light = (el) => {
    if (el === lit) return
    if (lit) lit.style.outline = litStyle
    lit = el
    if (el) { litStyle = el.style.outline; el.style.outline = '2px solid #f5c542' }
  }
  addEventListener('message', (e) => {
    const d = e.source === parent && e.data
    if (!d) return
    if (d.uxwoz === 'name-part') { naming = !d.off; if (!naming) light(null) }
    if (d.uxwoz === 'locate' && Array.isArray(d.anchors)) {
      const spots = []
      for (const a of d.anchors.slice(0, 200)) {
        if (!a || typeof a.text !== 'string') continue
        const el = find(all, { id: a.id, text: a.text, tag: String(a.tag || ''), nth: Math.max(0, Number(a.nth) || 0) })
        if (el) { const p = describe(el); spots.push({ id: a.id, x: p.x, y: p.y, w: p.w, h: p.h }) }
      }
      parent.postMessage({ uxwoz: 'located', n: d.n, spots }, '*')
    }
  })
  addEventListener('pointerover', (e) => { if (naming) light(partAt(e.target)) }, true)
  addEventListener('click', (e) => {
    if (!naming) return
    naming = false
    light(null)
    e.preventDefault(); e.stopImmediatePropagation()
    const t = partAt(e.target)
    if (t) parent.postMessage({ uxwoz: 'part', ...describe(t) }, '*')
  }, true)
  // The app's keys work while a screen has the focus.
  addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    const field = e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    const zoom = mod && ['=', '+', '-', '0', '[', ']'].includes(e.key)
    const fit = !mod && !e.altKey && e.shiftKey && !field && /^Digit[123]$/.test(e.code)
    if (!zoom && !fit && e.key !== 'Escape') return
    if (zoom) e.preventDefault()
    parent.postMessage({ uxwoz: 'key', key: e.key, code: e.code, shift: e.shiftKey, mod }, '*')
  })
  // The mouse's back and forward buttons walk the app's screens, not away from the page.
  addEventListener('mouseup', (e) => {
    if (e.button !== 3 && e.button !== 4) return
    e.preventDefault()
    parent.postMessage({ uxwoz: 'key', key: e.button === 3 ? '[' : ']', code: '', shift: false, mod: true }, '*')
  })
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element && e.target.closest('[data-action]')
    if (!el) return
    if (!final) { e.preventDefault(); e.stopImmediatePropagation(); return }
    const prompt = el.getAttribute('data-action')
    if (prompt) { e.preventDefault(); go(prompt, labelOf(el), describe(el)) }
  }, true)
  // A followed link would show another page in the frame.
  window.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('a[href]')) e.preventDefault() })
  document.addEventListener('submit', (e) => {
    const p = e.target.getAttribute('data-action') || e.submitter?.getAttribute('data-action')
    const by = e.submitter || e.target.querySelector('button,[type=submit]') || e.target
    if (p) { e.preventDefault(); go(p, labelOf(e.submitter) || labelOf(e.target.querySelector('button,[type=submit]')), describe(by)) }
  }, true)
  // A sandboxed submit would blank the frame; the model's handlers run first.
  window.addEventListener('submit', (e) => e.preventDefault())
  // vh units become pixels of the device's height, again before each measure.
  const vhToPx = (css) => css.replace(/(-?\\d*\\.?\\d+)[dsl]?vh\\b/g, (m, n) => (parseFloat(n) * ${vh / 100}) + 'px')
  const fixVh = () => {
    for (const el of document.querySelectorAll('main [style*="vh"], main[style*="vh"]')) {
      const before = el.getAttribute('style'), after = vhToPx(before)
      if (after !== before) el.setAttribute('style', after)
    }
    for (const st of document.querySelectorAll('main style')) {
      const after = vhToPx(st.textContent)
      if (after !== st.textContent) st.textContent = after
    }
  }
  addEventListener('DOMContentLoaded', fixVh)
  // The frame never scrolls: it reports the screen's size and hands scroll gestures on.
  let last = ''
  const report = () => {
    fixVh()
    const main = document.querySelector('main')
    const r = main ? main.getBoundingClientRect() : null
    const h = Math.ceil(r ? r.bottom + 16 : document.body.scrollHeight)
    const w = Math.ceil(r ? r.right : document.body.scrollWidth)
    if (h + 'x' + w !== last) { last = h + 'x' + w; parent.postMessage({ uxwoz: 'size', height: h, width: w }, '*') }
  }
  addEventListener('load', () => { report(); new ResizeObserver(report).observe(document.body) })
  addEventListener('wheel', (e) => {
    e.preventDefault() // a pinch arrives as Ctrl+wheel
    if (e.ctrlKey || e.metaKey) parent.postMessage({ uxwoz: 'zoom', dy: e.deltaY, x: e.clientX, y: e.clientY }, '*')
    else parent.postMessage({ uxwoz: 'wheel', dx: e.deltaX, dy: e.deltaY }, '*')
  }, { passive: false })
})()`

// Controls that open another screen are blue in every theme, the rest a neutral ink, so Pico's own
// blue cannot be mistaken for them. Blue links show their underline only on hover, so a tab bar looks
// the same whatever markup the model chose. A form with an action prompt has a blue submit button.
const GO = `[data-action]:not(form), form[data-action] :is(button:not([type="button"]), [type="submit"])`
export const NAV_CSS = `main { --pico-primary: #373c44; --pico-primary-background: #525f7a; --pico-primary-border: #525f7a;
  --pico-primary-underline: rgba(55, 60, 68, .5); --pico-primary-hover: #1f2329; --pico-primary-hover-background: #48536b;
  --pico-primary-hover-border: #48536b; --pico-primary-hover-underline: #1f2329; --pico-primary-focus: rgba(82, 95, 122, .25);
  --pico-primary-inverse: #fff; }
main :is(${GO}) { color: #2a5bd7 !important; border-color: #2a5bd7 !important; text-decoration-color: #2a5bd7 !important; }
main :is(button, [role="button"], input, select):is(${GO}) { background-color: #e9effc !important; }
main a:is(${GO}) { text-decoration-line: none !important; }
main a:is(${GO}):hover { text-decoration-line: underline !important; }
main [aria-current="page"] { font-weight: 700 !important; text-decoration-line: underline !important; text-underline-offset: .25em; }`

// Our layout rules, after the theme. Pico grows its text with the window; a fixed 16 px keeps
// screens in scale with the app around them. The export uses them too, without the frame's no-scroll.
export const SCREEN_CSS = `body > main { width: 100%; margin: 0; padding: 20px 24px; box-sizing: border-box; }
@media (max-width: 600px) { body > main { padding: 16px; } }
:root { --pico-font-size: 100%; --pico-spacing: .75rem; --pico-typography-spacing-vertical: .75rem;
  --pico-block-spacing-vertical: .75rem; --pico-block-spacing-horizontal: 1rem;
  --pico-form-element-spacing-vertical: .5rem; --pico-form-element-spacing-horizontal: .75rem; }`
const FRAME_CSS = `html, body { overflow: hidden; }\n${SCREEN_CSS}`

/** The iframe's srcdoc: theme CSS inlined, our script, the fragment in <main>, one `device` screen tall unless `fit`. */
export function framePage(fragment: string, css: string, final: boolean, device?: Device, fit = false): string {
  const h = device && !fit ? DEVICES[device].height : 0
  const style = css.replace(/<\/style/gi, '<\\/style')
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>${style}</style><style>${FRAME_CSS}\n${NAV_CSS}${h ? `\nbody > main { min-height: ${h}px; }` : ''}</style><script>${bootstrap(final, device ? DEVICES[device].height : VIEWPORT_H)}</script></head>`
    + `<body${final ? '' : ' style="cursor:progress"'}><main>${fragment}</main></body></html>`
}

/** The iframe's sandbox flags: scripts and forms, no same-origin access to the app. */
export const FRAME_SANDBOX = 'allow-scripts allow-forms'

/** Rebuild the srcdoc at most this often while chunks arrive (each rebuild reloads the frame). */
export const REBUILD_MS = 300

// Paste by ID and the current link: the two things code adds to a stored screen when it shows it.

/** An opening tag, its attributes read with quotes in mind (a `>` inside a quoted value is no end). */
export const OPEN_TAG = /<([a-z][\w-]*)((?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/gi
export const VOID = new Set(['input', 'img', 'br', 'hr', 'area', 'col', 'embed', 'source', 'wbr', 'meta', 'link'])

/** Where the element whose opening tag starts at `start` ends, nested ones counted, scripts skipped; -1 when it has no end yet. */
export function elementEnd(html: string, start: number): number {
  // A sticky copy: OPEN_TAG's own lastIndex must stay 0, as matchAll starts from it.
  const at = new RegExp(OPEN_TAG.source, 'iy')
  at.lastIndex = start
  const open = at.exec(html)
  if (!open) return -1
  const tag = open[1]!.toLowerCase(), after = start + open[0].length
  if (open[3] || VOID.has(tag)) return after
  const re = new RegExp(`<script\\b[\\s\\S]*?</script\\s*>|<(/?)${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi')
  re.lastIndex = after
  let depth = 1
  for (let m; (m = re.exec(html));) {
    if (/^<script/i.test(m[0]) && tag !== 'script') continue
    depth += m[1] ? -1 : 1
    if (!depth) return m.index + m[0].length
  }
  return -1
}

/** Each element with `data-component="ID"` becomes that component's HTML, three levels deep; an unknown ID stays as it is. */
export function pasteComponents(html: string, components: Record<string, string>, depth = 3): string {
  let out = '', at = 0
  for (const m of html.matchAll(OPEN_TAG)) {
    const id = m.index! >= at && m[2]!.match(/(?:^|\s)data-component\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase()
    if (!id || components[id] == null) continue
    const end = elementEnd(html, m.index!)
    out += html.slice(at, m.index) + (depth > 1 ? pasteComponents(components[id], components, depth - 1) : components[id])
    at = end < 0 ? m.index! + m[0].length : end
  }
  return out + html.slice(at)
}

/** Every control whose data-action opens the screen it sits on (`@name`) gets aria-current="page". */
export function markCurrent(html: string, name: string | undefined): string {
  if (!name || !/^[\w-]+$/.test(name)) return html
  const re = new RegExp(`(<[a-z][\\w-]*\\b[^>]*?\\sdata-action\\s*=\\s*(["'])\\s*@${name}\\s*(?::(?:(?!\\2)[\\s\\S])*)?\\2)`, 'gi')
  return html.replace(re, '$1 aria-current="page"')
}
