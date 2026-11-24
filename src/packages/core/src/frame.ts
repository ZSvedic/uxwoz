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

/** The window height of a screen made before devices; the export turns vh units into pixels of it. */
export const VIEWPORT_H = 800

/** The sizes a mockup can have: the frame of every screen, and how the model is told of it. 'phone' and 'desktop' are read from mockups made before, never offered. */
export const DEVICES = {
  'small-phone': { label: 'Small phone', width: 360, height: 500, request: 'a phone screen, 360 × 500 px; the screen scrolls inside it, and a bar pinned to its bottom stays in view' },
  'large-phone': { label: 'Large phone', width: 412, height: 620, request: 'a phone screen, 412 × 620 px; the screen scrolls inside it, and a bar pinned to its bottom stays in view' },
  laptop: { label: 'Laptop', width: 1280, height: 560, request: 'a laptop browser window, 1280 × 560 px; the page scrolls inside it, and a bar pinned to its bottom stays in view' },
  monitor: { label: 'Monitor', width: 1920, height: 780, request: 'a large monitor\'s browser window, 1920 × 780 px; the page scrolls inside it, and a bar pinned to its bottom stays in view' },
  phone: { label: 'Phone', width: 390, height: 844, request: 'a phone screen, 390 px wide' },
  desktop: { label: 'Desktop', width: 1024, height: 768, request: 'a desktop browser window, 1024 px wide' },
} as const
export type Device = keyof typeof DEVICES
/** The sizes a new mockup is offered, in /api/config. */
export const OFFERED_DEVICES: Device[] = ['small-phone', 'large-phone', 'laptop', 'monitor']
export const DEFAULT_DEVICE: Device = 'small-phone'
/** The window width of screens made before devices existed. */
export const LEGACY_WIDTH = 800
export const isDevice = (v: unknown): v is Device => typeof v === 'string' && Object.hasOwn(DEVICES, v)

/** An element on the way up from the pointer, as the wheel rule needs it. */
export interface Scrollable {
  overflowX: string; overflowY: string; scrollLeft: number; scrollTop: number
  scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number
}

/**
 * Whether a scroll gesture (dx, dy) belongs to a part of the screen: one of `chain` (the elements from the pointer up)
 * scrolls on the gesture's main axis and has room left that way. Else the canvas moves. Copied into the frame as source,
 * so it uses nothing from outside.
 */
export function scrollsFirst(chain: Scrollable[], dx: number, dy: number): boolean {
  const across = Math.abs(dx) > Math.abs(dy), d = across ? dx : dy
  if (!d) return false
  for (const e of chain) {
    const flow = across ? e.overflowX : e.overflowY
    if (flow !== 'auto' && flow !== 'scroll') continue
    const at = across ? e.scrollLeft : e.scrollTop, room = (across ? e.scrollWidth - e.clientWidth : e.scrollHeight - e.clientHeight) - 1
    if (room > 0 && (d < 0 ? at > 0 : at < room)) return true
  }
  return false
}

// Our script, before the model's markup: clicks on data-action controls become messages to the app,
// and the frame never navigates. While the screen streams (`final` false), controls do nothing.
const bootstrap = (final: boolean) => `(() => {
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
  // same tag and words, and where it is in the frame's view (the page scrolls inside the frame).
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
  // A part scrolled out of the frame's view has no pin.
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth }
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
      // A part found but scrolled outside the view has no spot; its id is in away, so it is not taken for gone.
      const spots = [], away = []
      for (const a of d.anchors.slice(0, 200)) {
        if (!a || typeof a.text !== 'string') continue
        const el = find(all, { id: a.id, text: a.text, tag: String(a.tag || ''), nth: Math.max(0, Number(a.nth) || 0) })
        if (el && inView(el)) { const p = describe(el); spots.push({ id: a.id, x: p.x, y: p.y, w: p.w, h: p.h }) }
        else if (el) away.push(a.id)
      }
      parent.postMessage({ uxwoz: 'located', n: d.n, spots, away }, '*')
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
    const fit = !mod && !e.altKey && e.shiftKey && !field && /^Digit1$/.test(e.code)
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
  // A followed link would show another page in the frame. A link to a full web address asks the app to open it
  // (a real click only); one the screen's own script or a data-action took, or with no address, does nothing here.
  window.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[href]')
    if (!a) return
    const taken = e.defaultPrevented
    e.preventDefault()
    if (taken || !final || a.hasAttribute('data-action')) return
    if (navigator.userActivation && !navigator.userActivation.isActive) return
    const url = (a.getAttribute('href') || '').trim()
    if (/^https?:\\/\\/\\S+$/i.test(url) && url.length <= 2000) parent.postMessage({ uxwoz: 'open', url }, '*')
  })
  document.addEventListener('submit', (e) => {
    const p = e.target.getAttribute('data-action') || e.submitter?.getAttribute('data-action')
    const by = e.submitter || e.target.querySelector('button,[type=submit]') || e.target
    if (p) { e.preventDefault(); go(p, labelOf(e.submitter) || labelOf(e.target.querySelector('button,[type=submit]')), describe(by)) }
  }, true)
  // A sandboxed submit would blank the frame; the model's handlers run first.
  window.addEventListener('submit', (e) => e.preventDefault())
  // The page scrolls inside the frame: the app learns, at load and as it scrolls or grows, whether content lies
  // beyond the top or bottom edge (at most once a frame).
  const page = () => document.scrollingElement || document.documentElement
  let edges = '', queued = false
  const edgesNow = () => {
    queued = false
    const p = page(), above = p.scrollTop > 1, below = p.scrollTop + p.clientHeight < p.scrollHeight - 1
    const key = above + ',' + below + ',' + Math.round(p.scrollTop) + ',' + p.scrollHeight
    if (key !== edges) { edges = key; parent.postMessage({ uxwoz: 'scroll', above, below }, '*') }
  }
  const edgesSoon = () => { if (!queued) { queued = true; requestAnimationFrame(edgesNow) } }
  addEventListener('scroll', edgesSoon, { passive: true })
  addEventListener('resize', edgesSoon)
  addEventListener('load', () => {
    edgesNow()
    const seen = new ResizeObserver(edgesSoon)
    seen.observe(document.body)
    const main = document.querySelector('main')
    if (main) seen.observe(main)
  })
  // A part under the pointer that can scroll that way (a card rail, or the page itself) takes the wheel; else the canvas moves.
  const scrollsFirst = ${scrollsFirst}
  const chain = (t) => {
    const out = []
    for (let el = t instanceof Element ? t : null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const s = getComputedStyle(el)
      out.push({ overflowX: s.overflowX, overflowY: s.overflowY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop,
        scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight })
    }
    const h = getComputedStyle(document.documentElement), b = document.body ? getComputedStyle(document.body) : h
    const flow = (x, y) => { const f = x !== 'visible' ? x : y; return f === 'hidden' || f === 'clip' ? 'hidden' : 'auto' }
    const p = page()
    out.push({ overflowX: flow(h.overflowX, b.overflowX), overflowY: flow(h.overflowY, b.overflowY), scrollLeft: p.scrollLeft, scrollTop: p.scrollTop,
      scrollWidth: p.scrollWidth, scrollHeight: p.scrollHeight, clientWidth: p.clientWidth, clientHeight: p.clientHeight })
    return out
  }
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); parent.postMessage({ uxwoz: 'zoom', dy: e.deltaY, x: e.clientX, y: e.clientY }, '*'); return } // a pinch arrives as Ctrl+wheel
    if (scrollsFirst(chain(e.target), e.deltaX, e.deltaY)) return
    e.preventDefault()
    parent.postMessage({ uxwoz: 'wheel', dx: e.deltaX, dy: e.deltaY }, '*')
  }, { passive: false })
  // Touch: one finger belongs to the screen (the page scrolls natively, a tap clicks); two fingers move and zoom the
  // canvas. Points go out in the frame's pixels; \`start\` begins a gesture (or a new count of fingers).
  let pinch = null
  const at = (ts) => { const a = ts[0], b = ts[1]; return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) } }
  const begin = (e) => { pinch = e.touches.length > 1 ? { start: true } : null }
  for (const n of ['touchstart', 'touchend', 'touchcancel']) addEventListener(n, begin, { passive: true })
  addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length < 2) return
    e.preventDefault()
    const p = at(e.touches)
    parent.postMessage({ uxwoz: 'pinch', x: p.x, y: p.y, d: p.d, start: pinch.start }, '*')
    pinch.start = false
  }, { passive: false })
  addEventListener('gesturestart', (e) => e.preventDefault()) // Safari's own pinch would zoom the page
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
// screens in scale with the app around them. The export uses them too, without the frame's own rules.
export const SCREEN_CSS = `body > main { width: 100%; margin: 0; padding: 20px 24px; box-sizing: border-box; }
@media (max-width: 600px) { body > main { padding: 16px; } }
:root { --pico-font-size: 100%; --pico-spacing: .75rem; --pico-typography-spacing-vertical: .75rem;
  --pico-block-spacing-vertical: .75rem; --pico-block-spacing-horizontal: 1rem;
  --pico-form-element-spacing-vertical: .5rem; --pico-form-element-spacing-horizontal: .75rem; }`
// In the frame the page scrolls inside the device's size and fills it at least, so a bar pinned to the bottom sits
// at the frame's bottom; vh units are the frame's own.
const FRAME_CSS = `html { overscroll-behavior: contain; }\nhtml, body { margin: 0; }\nbody > main { min-height: 100vh; }\n${SCREEN_CSS}`

/**
 * The iframe's srcdoc: theme CSS inlined, our script, the fragment in <main>. The frame has its device's size (the
 * caller sets it) and the page scrolls inside, so `device` and `fit` change nothing here; they stay for old callers.
 */
export function framePage(fragment: string, css: string, final: boolean, _device?: Device, _fit = false): string {
  const style = css.replace(/<\/style/gi, '<\\/style')
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>${style}</style><style>${FRAME_CSS}\n${NAV_CSS}</style><script>${bootstrap(final)}</script></head>`
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
