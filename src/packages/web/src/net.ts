// Talking to the server: fetches, the NDJSON screen streams, a streaming frame, and the red pill and the hint.

import { REBUILD_MS, extractFragment, hasVisibleText } from '@uxwoz/core/frame'
import type { ScreenEvent } from './server.ts'
import { canvas } from './app.ts'
import { draw, page } from './screens.ts'
import { openGenerate } from './toolbar.ts'
import { Coach, type Hint } from './onboarding.ts'
import { stepFx } from './design/fx.ts'
import { $, state, store } from './state.ts'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

export async function themeCss(theme: string): Promise<string> {
  if (state.css[theme] == null) {
    const pico = state.css.pico ?? (state.css.pico = await fetchText('/themes/pico.css'))
    // `clean` is Pico alone; any other theme is a drop-in stylesheet loaded after Pico.
    state.css[theme] = theme === 'clean' ? pico : pico + '\n' + await fetchText(`/themes/${theme}.css`)
  }
  return state.css[theme]!
}

/** A card's frame while it streams, rebuilt at most every REBUILD_MS. `bare`: a component, shown as it streams; a screen gets its components pasted. */
export function streamInto(id: string, css: string, bare = false) {
  let raw = '', shown = '', last = 0, timer: ReturnType<typeof setTimeout> | undefined
  const build = (force: boolean) => {
    const now = Date.now()
    if (!force && now - last < REBUILD_MS) return void (timer ??= setTimeout(() => { timer = undefined; build(true) }, REBUILD_MS - (now - last)))
    const fragment = extractFragment(raw)
    if (fragment === shown || !hasVisibleText(fragment)) return
    last = now
    shown = fragment
    canvas.show(id, bare ? fragment : page(fragment, undefined), false, css)
  }
  return {
    push: (text: string) => { raw += text; build(false) },
    cancel: () => { clearTimeout(timer); timer = undefined },
  }
}
export type StreamRenderer = ReturnType<typeof streamInto>

// ---- Errors

export const fmtS = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`
export const fmtUsd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`

/** A red pill at the bottom of the canvas, until closed or replaced. */
export function showError(msg: string | null) {
  $('errorText').textContent = msg ?? ''
  $('error').hidden = !msg
}

$('errorClose').addEventListener('click', () => showError(null))

let hintTimer: ReturnType<typeof setTimeout> | undefined
/** Briefly say why a click does nothing: a screen is being made, or the control leads nowhere. */
export function hint(text = 'One screen at a time: wait until this one is made.') {
  const h = $('hint')
  h.textContent = text
  h.hidden = false
  h.classList.remove('press')
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => { hintTimer = undefined; showLasting() }, 2500)
}

/** The hint that stays until the visitor does the thing (onboarding.ts); a brief hint shows over it, then gives it back. */
let lasting: Hint | null = null
function showLasting() {
  if (hintTimer) return
  const h = $('hint')
  h.textContent = lasting?.text ?? ''
  h.hidden = !lasting
  h.classList.toggle('press', !!lasting?.opens || !!lasting?.live)
}
export const coach = new Coach({
  load: () => store.get('uxwoz:hints'),
  save: (json) => store.set('uxwoz:hints', json),
  show: (h) => { lasting = h; showLasting() },
  fx: (sound) => stepFx($('hint'), sound),
  later: (run, ms) => setTimeout(run, ms),
})
$('hint').addEventListener('click', () => { if (!hintTimer && coach.press()) openGenerate() })

async function* readEvents(res: Response): AsyncGenerator<ScreenEvent> {
  if (!res.ok || !res.body) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.error ?? `HTTP ${res.status}`)
  }
  const decoder = new TextDecoder()
  let buf = ''
  for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(bytes, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (line.trim()) yield JSON.parse(line)
    }
  }
}

export const mapOf = (app: string, wait = false) => fetch(`/api/map?app=${encodeURIComponent(app)}${wait ? '&wait=1' : ''}`)
export const post = (url: string, body: object, signal?: AbortSignal) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })

/**
 * Stream a screen request as the one busy job: each event to `on` (with the theme's CSS), an error or
 * a stream that ends early to the red pill as "Could not `what`", then `after(failed)`.
 */
export async function stream(url: string, body: object, what: string, on: (ev: ScreenEvent, css: string) => unknown, after: (failed: boolean) => void) {
  showError(null)
  state.busy?.abort()
  const ctrl = new AbortController()
  state.busy = ctrl
  draw() // rails and the drawer wait while busy
  let failed = false
  try {
    const css = await themeCss(state.theme)
    let finished = false
    for await (const ev of readEvents(await post(url, body, ctrl.signal))) {
      if (ev.type === 'error') throw new Error(ev.message)
      finished ||= ev.type === 'done'
      await on(ev, css)
    }
    if (!finished && !ctrl.signal.aborted) throw new Error('the stream ended early')
  } catch (err) {
    failed = !ctrl.signal.aborted
    if (failed) showError(`Could not ${what}: ${err instanceof Error ? err.message : err}`)
  } finally {
    after(failed)
    if (state.busy === ctrl) state.busy = null
    draw().catch((e) => showError(String(e)))
  }
}
