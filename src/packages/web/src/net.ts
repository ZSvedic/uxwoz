// Talking to the server: fetches, the NDJSON screen streams, a streaming frame, and the red pill and the hint.

import { REBUILD_MS, extractFragment, hasVisibleText } from '@uxwoz/core/frame'
import type { ScreenEvent } from './server.ts'
import { canvas } from './app.ts'
import { draw, page } from './screens.ts'
import { openGenerate } from './toolbar.ts'
import { Coach, OnShow, doneBy, fits, type Where } from './onboarding.ts'
import { stepFx } from './design/fx.ts'
import { loadMe, refused, sideAct } from './account-ui.ts'
import { $, generate, state, store } from './state.ts'

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

/** A red pill at the bottom of the canvas, until closed or replaced; it takes the hint's place while it shows. */
export function showError(msg: string | null) {
  $('errorText').textContent = msg ?? ''
  $('error').hidden = !msg
  showLasting()
}

$('errorClose').addEventListener('click', () => showError(null))

let hintTimer: ReturnType<typeof setTimeout> | undefined
/** Briefly say why a click does nothing: a screen is being made, or the control leads nowhere. */
export function hint(text = 'One screen at a time: wait until this one is made.') {
  const h = $('hint')
  h.textContent = text
  h.hidden = !$('error').hidden
  h.classList.remove('press')
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => { hintTimer = undefined; showLasting() }, 2500)
}

/**
 * The hint that stays until the visitor does the thing (onboarding.ts), with where the visitor was when it showed;
 * a brief hint shows over it, then gives it back. None with no mockup open, nor under the red pill.
 */
const lasting = new OnShow()
const where = (): Where => ({
  app: state.app, current: state.current, box: state.box, drawer: state.drawer,
  card: generate.classList.contains('open') || !$('account').hidden,
  drawn: !state.box && !!state.current && !!state.entries.get(state.current)?.versions.length,
  choice: !!state.making || [...state.entries.values()].some((e) => !e.versions.length),
})
function showLasting() {
  if (hintTimer) return
  const h = $('hint'), on = state.app && $('error').hidden && lasting.hint && fits(lasting.hint, where()) ? lasting.hint : null
  // On a narrow window A sits above B, and B starts below the window: the first hint says so.
  const below = on?.after === 'ready' && matchMedia('(max-width: 720px)').matches ? ' The second is below.' : ''
  h.textContent = on ? on.text + below : ''
  h.hidden = !on
  h.classList.toggle('press', !!on?.opens || !!on?.live)
}
/** The visitor went elsewhere since the hint showed: it goes (draw() and every click or key ask). */
export function checkHint() {
  const w = where(), step = lasting.hint && doneBy(lasting.hint, w)
  if (step) coach.did(step) // following the hint (opening Edit) is doing it
  else if (lasting.stale(w)) coach.away()
  else showLasting()
}
const soon = () => setTimeout(checkHint)
addEventListener('click', soon, true)
addEventListener('keydown', soon, true)
export const coach = new Coach({
  load: () => store.get('uxwoz:hints'),
  save: (json) => store.set('uxwoz:hints', json),
  show: (h) => {
    lasting.show(h)
    setTimeout(() => lasting.settle(where())) // once the step that showed it has run to its end
    showLasting()
  },
  fx: (sound) => stepFx($('hint'), sound),
  later: (run, ms) => setTimeout(run, ms),
})
$('hint').addEventListener('click', () => { if (!hintTimer && coach.press()) openGenerate() })

/** A refusal the account card or the red pill already answered (account-ui.ts): no "Could not" pill on top. */
class Answered extends Error {}

async function* readEvents(res: Response): AsyncGenerator<ScreenEvent> {
  if (!res.ok || !res.body) {
    const b = await res.json().catch(() => ({}))
    if (refused(res.status, b)) throw new Answered()
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
export async function stream(url: string, body: object, what: string, on: (ev: ScreenEvent, css: string) => unknown, after: (failed: boolean, answered: boolean) => void) {
  showError(null)
  state.busy?.abort()
  const ctrl = new AbortController()
  state.busy = ctrl
  draw() // rails and the drawer wait while busy
  let failed = false, answered = false
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
    const msg = err instanceof Error ? err.message : String(err)
    // Both sides refused by the meter: the account card, as for a refusal at the door.
    const act = failed && !(err instanceof Answered) ? sideAct(msg) : undefined
    answered = failed && (err instanceof Answered || !!act)
    if (act) act.run()
    else if (failed && !answered) showError(`Could not ${what}: ${msg}`)
  } finally {
    after(failed, answered)
    if (state.busy === ctrl) state.busy = null
    loadMe() // the free screens left, after a live design or a refusal
    draw().catch((e) => showError(String(e)))
  }
}
