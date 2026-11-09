// Turns the model's HTML fragment into the srcdoc page for the sandboxed iframe.
// Runs in the browser as well as on the server, so it uses no Node or Bun APIs.

/**
 * Remove a markdown fence (and prose around a fenced block) if the model added one.
 * The code itself is never changed, so failures stay the model's.
 */
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

// Our script, added before the model's markup. It turns clicks on data-action controls
// into postMessage calls to the app, and keeps the frame from navigating away. While the screen is
// still streaming (`final` false), controls do nothing: their handlers are not ready yet.
const bootstrap = (final: boolean, vh: number) => `(() => {
  const final = ${final}
  // Only a real click may open a screen, so a screen's script cannot start paid generations by itself.
  const go = (prompt, label) => {
    if (!final || typeof prompt !== 'string' || !prompt.trim()) return
    if (navigator.userActivation && !navigator.userActivation.isActive) return
    parent.postMessage({ uxwoz: 'action', prompt: prompt.trim().slice(0, 500), label: String(label || '').slice(0, 80) }, '*')
  }
  // What the control says, shown between the two screens it joins.
  const labelOf = (el) => el ? (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ') : ''
  addEventListener('pointerdown', () => parent.postMessage({ uxwoz: 'touch' }, '*'), true)
  // The app's zoom keys, ⌘[ ⌘] and Esc work while a screen has the focus too; the fit keys not in a text field.
  addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    const field = e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    const zoom = mod && ['=', '+', '-', '0', '[', ']'].includes(e.key)
    const fit = !mod && !e.altKey && e.shiftKey && !field && /^Digit[123]$/.test(e.code)
    if (!zoom && !fit && e.key !== 'Escape') return
    if (zoom) e.preventDefault()
    parent.postMessage({ uxwoz: 'key', key: e.key, code: e.code, shift: e.shiftKey, mod }, '*')
  })
  // The mouse's back and forward buttons walk the app's screens instead of leaving the page.
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
    if (prompt) { e.preventDefault(); go(prompt, labelOf(el)) }
  }, true)
  // A link never leaves the screen: the frame would show another page.
  window.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('a[href]')) e.preventDefault() })
  document.addEventListener('submit', (e) => {
    const p = e.target.getAttribute('data-action') || e.submitter?.getAttribute('data-action')
    if (p) { e.preventDefault(); go(p, labelOf(e.submitter) || labelOf(e.target.querySelector('button,[type=submit]'))) }
  }, true)
  // A sandboxed form submit would blank the frame; the model's own handlers run first.
  window.addEventListener('submit', (e) => e.preventDefault())
  // vh units become pixels of the device's height (see VIEWPORT_H), again before each measure.
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
  // Ctrl/Cmd + scroll (and a pinch, which arrives as one) zooms the canvas around the pointer.
  addEventListener('wheel', (e) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) parent.postMessage({ uxwoz: 'zoom', dy: e.deltaY, x: e.clientX, y: e.clientY }, '*')
    else parent.postMessage({ uxwoz: 'wheel', dx: e.deltaX, dy: e.deltaY }, '*')
  }, { passive: false })
})()`

// Controls that open another screen are blue, in every theme; everything else keeps a neutral ink,
// so Pico's own blue (links, buttons) cannot be mistaken for them. Blue links lose their underline
// until hovered: Pico drops it inside <nav> and the mockup theme makes it wavy elsewhere, so the
// same tab bar looked different depending on the markup the model chose. A form with an action prompt
// opens a screen on submit, so its submit button is blue, not the whole form.
const GO = `[data-action]:not(form), form[data-action] :is(button:not([type="button"]), [type="submit"])`
const NAV_CSS = `main { --pico-primary: #373c44; --pico-primary-background: #525f7a; --pico-primary-border: #525f7a;
  --pico-primary-underline: rgba(55, 60, 68, .5); --pico-primary-hover: #1f2329; --pico-primary-hover-background: #48536b;
  --pico-primary-hover-border: #48536b; --pico-primary-hover-underline: #1f2329; --pico-primary-focus: rgba(82, 95, 122, .25);
  --pico-primary-inverse: #fff; }
main :is(${GO}) { color: #2a5bd7 !important; border-color: #2a5bd7 !important; text-decoration-color: #2a5bd7 !important; }
main :is(button, [role="button"], input, select):is(${GO}) { background-color: #e9effc !important; }
main a:is(${GO}) { text-decoration-line: none !important; }
main a:is(${GO}):hover { text-decoration-line: underline !important; }
main [aria-current="page"] { font-weight: 700 !important; text-decoration-line: underline !important; text-underline-offset: .25em; }`

// Our layout rules, after the theme. Pico grows its text with the window; a fixed 16 px keeps
// screens in scale with the app around them.
const FRAME_CSS = `html, body { overflow: hidden; }
body > main { width: 100%; margin: 0; padding: 20px 24px; box-sizing: border-box; }
@media (max-width: 600px) { body > main { padding: 16px; } }
:root { --pico-font-size: 100%; --pico-spacing: .75rem; --pico-typography-spacing-vertical: .75rem;
  --pico-block-spacing-vertical: .75rem; --pico-block-spacing-horizontal: 1rem;
  --pico-form-element-spacing-vertical: .5rem; --pico-form-element-spacing-horizontal: .75rem; }`

/**
 * The full page for the iframe's srcdoc: theme CSS inlined, our bootstrap, the fragment in <main>,
 * at least one screen of `device` tall (unless `fit`: a component is as tall as its content).
 */
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

/**
 * Where the element whose opening tag starts at `start` ends: after its closing tag, counting
 * nested elements of the same name and skipping scripts. -1 when it has no end (yet).
 */
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

/**
 * Each element with `data-component="ID"`, contents and all, becomes that component's HTML, and so
 * on inside it, three levels deep. An element whose ID is not in the box stays as it is, so an
 * empty placeholder of a deleted component shows nothing.
 */
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
