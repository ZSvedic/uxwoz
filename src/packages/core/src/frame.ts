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
  return s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim().slice(0, 140)
}

/**
 * The window height a screen is designed for. A frame grows to fit its whole screen, so its real
 * window is as tall as the screen; vh units would then feed back into the frame's height forever.
 * Our script converts vh units to pixels of this height instead.
 */
export const VIEWPORT_H = 800

/** The devices a screen can be designed for, and the width of the window it gets: its widest. */
export const DEVICES = {
  phone: { label: 'Phone', width: 390, request: 'a phone screen, at most 390 px wide' },
  desktop: { label: 'Desktop', width: 1024, request: 'a desktop browser window, at most 1024 px wide' },
} as const
export type Device = keyof typeof DEVICES
export const DEFAULT_DEVICE: Device = 'phone'
/** The window width of screens made before devices existed. */
export const LEGACY_WIDTH = 800
export const isDevice = (v: unknown): v is Device => typeof v === 'string' && Object.hasOwn(DEVICES, v)

// Our script, added before the model's markup. It turns clicks on data-action controls (and links)
// into postMessage calls to the app, and keeps the frame from navigating away. While the screen is
// still streaming (`final` false), controls do nothing: their handlers are not ready yet.
const bootstrap = (final: boolean) => `(() => {
  const final = ${final}
  // Only a real click may open a screen, so a screen's script cannot start paid generations by itself.
  const go = (prompt, label) => {
    if (!final || typeof prompt !== 'string' || !prompt.trim()) return
    if (navigator.userActivation && !navigator.userActivation.isActive) return
    parent.postMessage({ uxwoz: 'action', prompt: prompt.trim().slice(0, 500), label: String(label || '').slice(0, 80) }, '*')
  }
  // What the control says, shown between the two screens it joins.
  const labelOf = (el) => el ? (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ') : ''
  window.uxwoz = { go }
  // Any press in the screen makes it the current one.
  addEventListener('pointerdown', () => parent.postMessage({ uxwoz: 'touch' }, '*'), true)
  // The app's zoom keys and Esc work while a screen has the focus too; the fit keys not in a text field.
  addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    const field = e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    const zoom = mod && ['=', '+', '-', '0'].includes(e.key)
    const fit = !mod && !e.altKey && e.shiftKey && !field && /^Digit[123]$/.test(e.code)
    if (!zoom && !fit && e.key !== 'Escape') return
    if (zoom) e.preventDefault()
    parent.postMessage({ uxwoz: 'key', key: e.key, code: e.code, shift: e.shiftKey, mod }, '*')
  })
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element && e.target.closest('[data-action], a[href]')
    if (!el) return
    if (!final) { e.preventDefault(); e.stopImmediatePropagation(); return }
    const prompt = el.getAttribute('data-action')
    if (prompt) { e.preventDefault(); go(prompt, labelOf(el)) }
  }, true)
  // A plain link the screen's own script did not handle opens "the screen behind this link".
  // In-page links (#, #tab, javascript:) stay in the screen.
  window.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[href]:not([data-action])')
    if (!a) return
    const handled = e.defaultPrevented
    e.preventDefault()
    const href = a.getAttribute('href') || ''
    const label = (a.textContent || '').trim()
    if (handled || href.startsWith('#') || href.startsWith('javascript:') || !label) return
    go('The screen shown after clicking the "' + label + '" link on the "' + document.title + '" screen', label)
  })
  document.addEventListener('submit', (e) => {
    const p = e.target.getAttribute('data-action') || e.submitter?.getAttribute('data-action')
    if (p) { e.preventDefault(); go(p, labelOf(e.submitter) || labelOf(e.target.querySelector('button,[type=submit]'))) }
  }, true)
  // A sandboxed form submit would blank the frame; the model's own handlers run first.
  window.addEventListener('submit', (e) => e.preventDefault())
  addEventListener('DOMContentLoaded', () => {
    if (!document.title) document.title = (document.querySelector('h1,h2')?.textContent || '').trim()
  })
  // vh, dvh, svh and lvh in the screen's inline styles and <style> elements become pixels of a
  // ${VIEWPORT_H} px window (see VIEWPORT_H). Run again before each measure, for styles set by script.
  const vhToPx = (css) => css.replace(/(-?\\d*\\.?\\d+)[dsl]?vh\\b/g, (m, n) => (parseFloat(n) * ${VIEWPORT_H / 100}) + 'px')
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
  // The frame fits the whole screen, so it never scrolls: it reports the screen's height and width
  // (main is only as wide as its content), and hands scroll gestures to the page around it.
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
const GO = `[data-action]:not(form), form[data-action] :is(button:not([type="button"]), [type="submit"]), a[href]:not([href^="#"], [href^="javascript:"])`
const NAV_CSS = `main { --pico-primary: #373c44; --pico-primary-background: #525f7a; --pico-primary-border: #525f7a;
  --pico-primary-underline: rgba(55, 60, 68, .5); --pico-primary-hover: #1f2329; --pico-primary-hover-background: #48536b;
  --pico-primary-hover-border: #48536b; --pico-primary-hover-underline: #1f2329; --pico-primary-focus: rgba(82, 95, 122, .25);
  --pico-primary-inverse: #fff; }
main :is(${GO}) { color: #2a5bd7 !important; border-color: #2a5bd7 !important; text-decoration-color: #2a5bd7 !important; }
main :is(button, [role="button"], input, select):is(${GO}) { background-color: #e9effc !important; }
main a:is(${GO}) { text-decoration-line: none !important; }
main a:is(${GO}):hover { text-decoration-line: underline !important; }`

// Our layout rules, after the theme: the screen is only as wide as its content and never wider than
// the window (fit-content alone grows past it when the content cannot shrink), with less padding, and the page never scrolls (the frame is as tall as the screen). Pico grows its text with the window
// (20 px at 1280 px); a fixed 16 px keeps screens in scale with the app around them.
// Pico turns a <small> right after an input into help text on its own line; after a checkbox or
// radio in its label it is a count or note, like "All <small>(6)</small>", so it stays inline.
const FRAME_CSS = `html, body { overflow: hidden; }
label > :is([type="checkbox"], [type="radio"]) + small { display: inline; margin: 0 0 0 .25em; }
body > main { width: fit-content; min-width: 280px; max-width: 100%; margin: 0; padding: 20px 24px; }
@media (max-width: 600px) { body > main { padding: 16px; } }
:root { --pico-font-size: 100%; --pico-spacing: .75rem; --pico-typography-spacing-vertical: .75rem;
  --pico-block-spacing-vertical: .75rem; --pico-block-spacing-horizontal: 1rem;
  --pico-form-element-spacing-vertical: .5rem; --pico-form-element-spacing-horizontal: .75rem; }`

/** The full page for the iframe's srcdoc: theme CSS inlined, our bootstrap, the fragment in <main>. */
export function framePage(fragment: string, css: string, final: boolean): string {
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
