// The owner's side of comments: the pins over every drawn screen with open comments, the drawer's Comments tab with
// Resolve and Reopen, and the jump to a comment from its pin or from the Feedback pane. The data is sharing.ts's.
// canvas.ts is outside the circle of modules app.ts names, so its pin hook may be set at the top level here.

import type { Feedback } from '@uxwoz/core'
import { button, el } from './boxes.ts'
import { canvas } from './app.ts'
import { pinHook } from './canvas.ts'
import { openDrawer } from './drawer.ts'
import { post, showError } from './net.ts'
import { setCurrent } from './nav.ts'
import { anchorOf, commentRows, openCount, pinLayer, type Spot } from './pins.ts'
import { feedbackOf, loadShared, shareToken } from './sharing.ts'
import { $, state } from './state.ts'

/** Per screen: the number its last `locate` carried (an answer with another is late, and dropped) and the ids found. */
const asked = new Map<string, number>()
const found = new Map<string, Set<string>>()
let count = 0
/** The mockup opening (state.starts) whose feedback was asked for: a mockup's first sized screen loads it. */
let loadedAt = -1
/** The comment to ring in the tab, until when. */
let ring = { id: '', until: 0, scroll: false }

const rowsOf = (key: string) => commentRows(feedbackOf(), key, found.get(key) ?? null, !!shareToken)
const numbers = (key: string) => new Map(rowsOf(key).filter((r) => r.n != null).map((r) => [r.f.id, r.n!] as [string, number]))

/** Ask a screen's frame where its open, anchored comments are; the pins follow the answer. */
function locate(key: string) {
  const t = canvas.pinTarget(key)
  if (!t || shareToken) return
  const anchors = rowsOf(key).filter((r) => r.n != null).map((r) => anchorOf(r.f)).filter((a) => a != null)
  asked.set(key, ++count)
  t.win?.postMessage({ uxwoz: 'locate', n: count, anchors }, '*')
}

/** After the feedback changed: every drawn screen asks again. */
export function relocate() {
  for (const e of state.entries.values()) if (e.versions.length) locate(e.key)
}

Object.assign(pinHook, {
  size(key: string) {
    if (shareToken) return
    if (loadedAt !== state.starts) { loadedAt = state.starts; return void loadShared() }
    locate(key)
  },
  located(key: string, d: any) {
    const t = canvas.pinTarget(key)
    if (!t || d?.n !== asked.get(key) || !Array.isArray(d.spots)) return
    const n = (v: unknown) => (Number.isFinite(v) ? Math.round(v as number) : 0)
    const spots: Spot[] = d.spots.filter((x: any) => typeof x?.id === 'string').map((x: any) => ({ id: x.id, x: n(x.x), y: n(x.y), w: n(x.w), h: n(x.h) }))
    found.set(key, new Set(spots.map((s) => s.id)))
    pinLayer(t.layer, spots, numbers(key), (id) => jump(key, id))
    if (state.drawer === 'comments' && state.current === key && !state.box) renderComments(key)
  },
})

/** Make a screen current, open Comments and ring the comment there (the drawer keeps the screen in view). */
export function jump(key: string, id: string) {
  if (!state.entries.get(key)?.versions.length) return
  canvas.moved = performance.now()
  setCurrent(key)
  ring = { id, until: performance.now() + 1000, scroll: true }
  setTimeout(() => { if (ring.id === id) $('commentsPane').querySelector(`[data-id="${id}"]`)?.classList.remove('ring') }, 1000)
  openDrawer('comments')
}

/** The tab's words: the count of open comments when there are any. */
export const commentsTab = (key: string) => `💬 Comments${openCount(feedbackOf(), key) ? ` ${openCount(feedbackOf(), key)}` : ''}`

const when = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })

/** A pin on the canvas lit while its comment is pointed at or focused. */
function lightPin(key: string, id: string, on: boolean) {
  canvas.pinTarget(key)?.layer.querySelector(`[data-id="${id}"]`)?.classList.toggle('ring', on)
}

/** The Comments pane: the screen's comments, open ones by pin number, then the resolved ones. */
export function renderComments(key: string) {
  const items = rowsOf(key).map((r) => {
    const li = el('li', r.n == null ? 'resolved' : '',
      el('div', 'head', r.pin ? el('span', 'dot', String(r.n)) : '', el('b', '', r.f.name), el('small', '', r.where)),
      el('p', '', r.f.text ?? ''),
      el('small', '', `${when(r.f.at)}${r.earlier ? ' · About an earlier version' : ''}`),
      r.f.resolved ? button('Reopen', 'Open this comment again: its pin comes back', () => resolve(r.f, false))
        : button('Resolve', 'Mark this comment done: its pin goes', () => resolve(r.f, true)))
    li.dataset.id = r.f.id
    li.tabIndex = -1
    if (r.f.id === ring.id && performance.now() < ring.until) li.classList.add('ring')
    for (const [ev, on] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]] as const) li.addEventListener(ev, () => lightPin(key, r.f.id, on))
    return li
  })
  $('commentsPane').replaceChildren(items.length ? el('ul', 'comments', ...items) : el('p', 'none', 'No comments on this screen yet.'))
  const target = ring.scroll && $('commentsPane').querySelector<HTMLElement>(`[data-id="${ring.id}"]`)
  if (target) { ring.scroll = false; target.scrollIntoView({ block: 'nearest' }) }
}

async function resolve(f: Feedback, resolved: boolean) {
  const res = await post('/api/feedback', { app: state.app, id: f.id, resolved }).catch(() => null)
  if (!res?.ok) return showError(`Could not change the comment: ${(await res?.json().catch(() => null))?.error ?? 'no answer'}`)
  await loadShared()
}
