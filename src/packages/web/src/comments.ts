// The owner's side of comments: the pins over every drawn mock with open comments, the comments at the end of a mock's
// Info card with Resolve and Reopen, and the jump to a comment from its pin or from Feedback (Info flips open at it,
// and it gets a gold ring for a moment). The data is sharing.ts's. canvas.ts is outside the circle of modules app.ts
// names, so its pin hook may be set at the top level here. app.ts loads the comments when a project opens
// (loadShared), and the pins follow (relocate).

import type { Feedback } from '@uxwoz/core'
import { button, el } from './boxes.ts'
import { canvas } from './app.ts'
import { pinHook } from './canvas.ts'
import { flipTo, renderCards } from './cards.ts'
import { post, showError } from './net.ts'
import { setCurrent } from './nav.ts'
import { anchorOf, commentRows, openCount, pinLayer, type Spot } from './pins.ts'
import { feedbackOf, loadShared, shareToken } from './sharing.ts'
import { state } from './state.ts'

/** Per mock: the number its last `locate` carried (an answer with another is late, and dropped) and the ids found. */
const asked = new Map<string, number>()
const found = new Map<string, Set<string>>()
let count = 0
/** The project opening (state.starts) that `asked` and `found` are about. */
let openedAt = -1
/** The comment to ring in Info, until when. */
let ring = { id: '', until: 0, scroll: false }

const rowsOf = (key: string) => commentRows(feedbackOf(), key, found.get(key) ?? null, !!shareToken)
const numbers = (key: string) => new Map(rowsOf(key).filter((r) => r.n != null).map((r) => [r.f.id, r.n!] as [string, number]))

/** Ask a mock's frame where its open, anchored comments are; the pins follow the answer. */
function locate(key: string) {
  const t = canvas.pinTarget(key)
  if (!t || shareToken) return
  const anchors = rowsOf(key).filter((r) => r.n != null).map((r) => anchorOf(r.f)).filter((a) => a != null)
  asked.set(key, ++count)
  t.win?.postMessage({ uxwoz: 'locate', n: count, anchors }, '*')
}

/** After the feedback changed: every drawn mock asks again. Another project opened starts afresh. */
export function relocate() {
  if (openedAt !== state.starts) { openedAt = state.starts; asked.clear(); found.clear() }
  for (const e of state.entries.values()) if (e.versions.length) locate(e.key)
}

Object.assign(pinHook, {
  // A rebuilt frame (an Edit, an Undo) has no pins until it answers again.
  rebuilt(key: string) { asked.delete(key); found.delete(key) },
  size: locate,
  located(key: string, d: any) {
    const t = canvas.pinTarget(key)
    if (!t || d?.n !== asked.get(key) || !Array.isArray(d.spots)) return
    const n = (v: unknown) => (Number.isFinite(v) ? Math.round(v as number) : 0)
    const spots: Spot[] = d.spots.filter((x: any) => typeof x?.id === 'string').map((x: any) => ({ id: x.id, x: n(x.x), y: n(x.y), w: n(x.w), h: n(x.h) }))
    // Found: the parts in view, and those scrolled away (`away`), which have no pin until they come back.
    const away = Array.isArray(d.away) ? d.away.filter((x: unknown) => typeof x === 'string') as string[] : []
    found.set(key, new Set([...spots.map((s) => s.id), ...away]))
    pinLayer(t.layer, spots, numbers(key), (id) => jump(key, id))
    // Info open on it: *About an earlier version* follows what the frame found.
    if (state.flip === 'info' && state.current === key && !state.box) renderCards()
  },
})

/** A pin or a comment in Feedback: its mock becomes current and flips to Info at the comment, ringed for a moment. */
export function jump(key: string, id: string) {
  if (!state.entries.get(key)?.versions.length) return
  canvas.moved = performance.now()
  setCurrent(key)
  canvas.reveal(key)
  ring = { id, until: performance.now() + 1500, scroll: true }
  setTimeout(() => { if (ring.id === id) document.querySelector(`.flip [data-id="${id}"]`)?.classList.remove('ring') }, 1500)
  flipTo(key, 'info')
  loadShared()
}

/** The open comments on a mock, counted on its ℹ️; none through an edit link. */
export const commentCount = (key: string) => openCount(feedbackOf(), key, !!shareToken)

/** What Info's comments show, as a string: the card draws them again only when it changed. */
export const commentsSig = (key: string) => JSON.stringify(rowsOf(key).map((r) => [r.f.id, r.n, r.pin, r.earlier, r.f.resolved ?? '']))

const when = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })

/** A pin on the canvas lit while its comment is pointed at or focused. */
function lightPin(key: string, id: string, on: boolean) {
  canvas.pinTarget(key)?.layer.querySelector(`[data-id="${id}"]`)?.classList.toggle('ring', on)
}

/** Info's comments: from every reviewer, the open ones by pin number, then the resolved ones, muted; each with its pin's
 *  number in a gold dot, the name, the part, the text, when, and Resolve or Reopen. Empty when there are none. */
export function commentsList(key: string): HTMLElement[] {
  for (const p of document.querySelectorAll('.pin.ring')) p.classList.remove('ring')
  const rows = rowsOf(key)
  if (!rows.length) return []
  const items = rows.map((r) => {
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
  const open = rows.filter((r) => r.n != null).length
  return [el('h5', '', `Comments${open ? ` (${open})` : ''}`), el('ul', 'comments', ...items)]
}

/** After Info drew its comments: the ringed one scrolls into view once. */
export function showRing(card: HTMLElement) {
  const target = ring.scroll && card.querySelector<HTMLElement>(`[data-id="${ring.id}"]`)
  if (target) { ring.scroll = false; target.scrollIntoView({ block: 'nearest' }) }
}

async function resolve(f: Feedback, resolved: boolean) {
  const res = await post('/api/feedback', { app: state.app, id: f.id, resolved }).catch(() => null)
  if (!res?.ok) return showError(`Could not change the comment: ${(await res?.json().catch(() => null))?.error ?? 'no answer'}`)
  await loadShared()
}
