// Sharing, the owner's side: the drawer's Share pane (a link per role, copy, revoke, the cap used) and the
// feedback that came back, grouped by screen (a comment jumps to it in Comments), with the trips. An edit link opens this app on one mockup:
// every API call then carries its token.

import type { Feedback, Share, Trip } from '@uxwoz/core'
import { button, el } from './boxes.ts'
import { jump, relocate } from './comments.ts'
import { openDrawer, renderDrawer } from './drawer.ts'
import { hint, post, showError } from './net.ts'
import { labelOf } from './screens.ts'
import { closeMenus } from './toolbar.ts'
import { $, state } from './state.ts'

/** The edit link this page was opened by, if any: the app then shows its one mockup, without the project menu. */
export const shareToken = location.pathname.match(/^\/s\/([a-f0-9]+)/)?.[1] ?? null
if (shareToken) {
  const plain = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return plain(input, init)
    const headers = new Headers(init.headers)
    headers.set('x-uxwoz-share', shareToken)
    return plain(input, { ...init, headers })
  }) as typeof fetch
  $('projectButton').hidden = true
  $('menuNew').hidden = true
}

/** The mockup an edit link opens. */
export async function editLinkApp(): Promise<string | null> {
  const res = await fetch(`/api/s/${shareToken}/map`)
  if (!res.ok) { showError('This link does not work any more.'); return null }
  return (await res.json()).app
}

type Link = Share & { url: string }
let shared: { app: string; shares: Link[]; feedback: Feedback[]; trips: Trip[] } | null = null

/** The open mockup's links and feedback from the server; the drawer shows them once they come. */
export async function loadShared() {
  const app = state.app
  if (!app || shareToken) return
  const res = await fetch(`/api/shares?app=${encodeURIComponent(app)}`).catch(() => null)
  if (!res?.ok || app !== state.app) return
  shared = { app, ...await res.json() }
  renderDrawer()
  relocate()
}
const mine = () => (shared && shared.app === state.app ? shared : null)
/** The open mockup's feedback, as last loaded. */
export const feedbackOf = (): Feedback[] => mine()?.feedback ?? []
/** Whether the open mockup has share links or feedback: then its screens have a Comments tab. */
export const isShared = () => { const s = mine(); return !!s && (s.shares.length > 0 || s.feedback.length > 0) }

const ROLE_NAMES = { view: 'View: click through', comment: 'Comment: click through and leave feedback', edit: 'Edit: change this mockup' }
const when = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
const thumbsOf = (list: Feedback[]) => {
  const up = list.filter((f) => f.kind === 'thumb' && f.up).length, down = list.filter((f) => f.kind === 'thumb' && !f.up).length
  return up + down ? `👍 ${up} · 👎 ${down}` : ''
}
/** One line of feedback: what was said, about which part or at which dead control (an old answer, or a comment with its label). */
const lineOf = (f: Feedback) => f.kind === 'dead' || f.label ? `At "${f.label || 'a control'}" expected: ${f.text}` : `${f.text}${f.about ? ` (about: ${f.about})` : ''}`
const screenTitle = (key: string, title: string) => { const e = state.entries.get(key); return e?.versions.length ? labelOf(e) : title || 'A deleted screen' }

/** The Info tab's row for a screen: its thumbs (its comments are in Comments). */
export function screenFeedback(key: string): [string, string][] {
  const t = thumbsOf(feedbackOf().filter((f) => f.screen === key))
  return t ? [['Thumbs', t]] : []
}

/** A trip in one line: "Ana: Home → Nights → Settings, 1 dead click (Export)". */
export const tripLine = (t: Trip) => `${t.name}: ${t.screens.join(' → ') || 'nothing yet'}${t.dead.length ? `, ${t.dead.length} dead click${t.dead.length === 1 ? '' : 's'} (${t.dead.join(', ')})` : ''}`

/** The Share pane: make a link, the links, then the feedback by screen (newest first) and the trips. */
export function renderShare() {
  $('drawerName').textContent = 'Share and feedback'
  const s = mine()
  const role = el('select')
  for (const [id, label] of Object.entries(ROLE_NAMES)) role.add(new Option(label, id))
  role.value = 'comment'
  const cap = el('input')
  Object.assign(cap, { type: 'number', min: '1', max: '1000', value: '20', title: 'How many new screens and changes this link may ask for: they cost your credits' })
  const capRow = el('label', 'share-cap', 'Budget: ', cap, ' new screens and changes')
  capRow.hidden = true
  role.addEventListener('change', () => { capRow.hidden = role.value !== 'edit' })
  const make = button('Make a link', 'Make a new link with this role', () => makeLink(role.value, Number(cap.value)), 'primary')
  const links = (s?.shares ?? []).map((x) => el('li', 'share-link',
    el('b', '', x.role), ` · made ${when(x.createdAt)} · opened ${x.opens}×${x.cap ? ` · ${x.used} of ${x.cap} used` : ''}`,
    el('input', 'share-url'), button('Copy', 'Copy the link', () => copy(x.url)), button('Revoke', 'This link stops working', () => revoke(x.token))))
  links.forEach((li, i) => Object.assign(li.querySelector('input')!, { value: s!.shares[i]!.url, readOnly: true }))

  // Feedback by screen, the screen with the newest first; the closing answers and the trips after.
  const all = s?.feedback ?? []
  const groups = new Map<string, Feedback[]>()
  for (const f of [...all].reverse()) if (f.kind !== 'done') groups.set(f.screen, [...groups.get(f.screen) ?? [], f])
  const done = all.filter((f) => f.kind === 'done').reverse()
  const said = (f: Feedback) => el('li', '', el('b', '', f.name), `: ${lineOf(f)}`, el('small', '', ` ${when(f.at)}`))
  // A comment on a drawn screen is a button to it in Comments.
  const comment = (f: Feedback) => {
    if (!state.entries.get(f.screen)?.versions.length) return said(f)
    const b = button('', 'Show this comment on its screen', () => jump(f.screen, f.id), 'jump')
    b.append(el('b', '', f.name), `: ${lineOf(f)}`, el('small', '', ` ${when(f.at)}`))
    return el('li', '', b)
  }
  const feedback = [...groups].flatMap(([key, list]) => [
    el('h4', '', screenTitle(key, list[0]!.title), thumbsOf(list) ? el('small', '', `  ${thumbsOf(list)}`) : ''),
    el('ul', 'feedback', ...list.filter((f) => f.kind !== 'thumb').map(comment)),
  ])
  $('sharePane').replaceChildren(
    el('h3', '', 'Share this mockup'), role, capRow, make,
    el('ul', 'share-links', ...links.length ? links : [el('li', 'none', 'No links yet')]),
    el('h3', '', 'Feedback'),
    ...feedback.length ? feedback : [el('p', 'none', 'Nothing yet. Send a comment link to a reviewer.')],
    ...done.length ? [el('h4', '', 'Would you use this?'), el('ul', 'feedback', ...done.map(said))] : [],
    el('h3', '', 'Trips'),
    el('ul', 'feedback', ...(s?.trips ?? []).slice().reverse().map((t) => el('li', '', tripLine(t), el('small', '', ` ${when(t.at)}`)))),
  )
}

async function makeLink(role: string, cap: number) {
  const res = await post('/api/share', { app: state.app, role, cap }).catch(() => null)
  if (!res?.ok) return showError(`Could not make the link: ${(await res?.json().catch(() => null))?.error ?? 'no answer'}`)
  copy((await res.json()).url)
  loadShared()
}

async function revoke(token: string) {
  if (!confirm('Revoke this link? It stops working for everyone who has it.')) return
  await post('/api/unshare', { token }).catch(() => null)
  loadShared()
}

function copy(url: string) {
  navigator.clipboard?.writeText(url).then(() => hint('Link copied'), () => {})
}

/** Share… and Feedback in the project menu open the pane. */
for (const id of ['shareMenu', 'feedbackMenu']) $(id).addEventListener('click', () => {
  closeMenus()
  openDrawer('share')
  if (id === 'feedbackMenu') requestAnimationFrame(() => $('sharePane').querySelector('h3:nth-of-type(2)')?.scrollIntoView())
})
