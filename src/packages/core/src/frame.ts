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

/** True once the fragment holds text outside tags, scripts and styles. */
export const hasVisibleText = (html: string): boolean =>
  html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?(<\/script>|$)|<[^>]*>|<[^>]*$/g, '').trim() !== ''

// Our script, added before the model's markup. It turns clicks on data-action controls (and links)
// into postMessage calls to the app, and keeps the frame from navigating away. While the screen is
// still streaming (`final` false), controls do nothing: their handlers are not ready yet.
const bootstrap = (final: boolean) => `(() => {
  const final = ${final}
  // Only a real click may open a screen, so a screen's script cannot start paid generations by itself.
  const go = (prompt) => {
    if (!final || typeof prompt !== 'string' || !prompt.trim()) return
    if (navigator.userActivation && !navigator.userActivation.isActive) return
    parent.postMessage({ uxwoz: 'action', prompt: prompt.trim().slice(0, 500) }, '*')
  }
  window.uxwoz = { go }
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element && e.target.closest('[data-action], a[href]')
    if (!el) return
    if (!final) { e.preventDefault(); e.stopImmediatePropagation(); return }
    const prompt = el.getAttribute('data-action')
    if (prompt) { e.preventDefault(); go(prompt) }
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
    go('The screen shown after clicking the "' + label + '" link on the "' + document.title + '" screen')
  })
  document.addEventListener('submit', (e) => {
    const p = e.target.getAttribute('data-action') || e.submitter?.getAttribute('data-action')
    if (p) { e.preventDefault(); go(p) }
  }, true)
  // A sandboxed form submit would blank the frame; the model's own handlers run first.
  window.addEventListener('submit', (e) => e.preventDefault())
  addEventListener('DOMContentLoaded', () => {
    if (!document.title) document.title = (document.querySelector('h1,h2')?.textContent || '').trim()
  })
})()`

/** The full page for the iframe's srcdoc: theme CSS inlined, our bootstrap, the fragment in <main>. */
export function framePage(fragment: string, css: string, final: boolean): string {
  const style = css.replace(/<\/style/gi, '<\\/style')
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>${style}</style><script>${bootstrap(final)}</script></head>`
    + `<body${final ? '' : ' style="cursor:progress"'}><main>${fragment}</main></body></html>`
}

/** The iframe's sandbox flags: scripts and forms, no same-origin access to the app. */
export const FRAME_SANDBOX = 'allow-scripts allow-forms'

/** Rebuild the srcdoc at most this often while chunks arrive (each rebuild reloads the frame). */
export const REBUILD_MS = 300
