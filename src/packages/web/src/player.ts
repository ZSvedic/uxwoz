// The player of a share link: one mock at a time in a frame of its own size that scrolls inside, Back and the trail
// of names. A comment link adds feedback, once the visitor gave a name: comments pinned to parts of the mock (the
// pins follow the scroll) and listed in the margin beside it, a thumb, what a dead control should do, and a closing
// answer. No dialogs. Each visit sends its trip (the mocks seen, the dead controls clicked) as it changes.

import type { Feedback } from '@uxwoz/core'
import { FRAME_SANDBOX, framePage, markCurrent, pasteComponents, type Device } from '@uxwoz/core/frame'
import { linkTarget } from '@uxwoz/core/keys'
import { el } from './boxes.ts'
import { anchorOf, numbered, partLabel, pinLayer, playerFit, trailOf, type Spot } from './pins.ts'

interface Screen { key: string; name: string; title: string; html: string; device?: Device; parent: string | null }
interface PlayerMap { role: 'view' | 'comment'; app: string; root: string; components: Record<string, string>; screens: Screen[] }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const token = location.pathname.split('/')[2] ?? ''
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}
const random = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
// The visitor's id and name live here; the browser's storage only restores and keeps them, so a browser that
// blocks it can still comment (as a new visitor on each load).
const visitor = store.get('uxwoz:visitor') ?? random()
store.set('uxwoz:visitor', visitor)
let name = store.get('uxwoz:visitor-name') ?? ''
const nameNow = () => name

const frame = $<HTMLIFrameElement>('frame')
frame.setAttribute('sandbox', FRAME_SANDBOX)
let map: PlayerMap
let css = ''
const byKey = new Map<string, Screen>(), byName = new Map<string, Screen>()
/** The mocks visited in this tab, for Back and the trail; the last one shows. */
let history: string[] = []
const trip = { id: random(), screens: [] as string[], dead: [] as string[] }
/** A trip keeps the first 50 screens and dead clicks, as the server does. */
const addTo = (list: string[], v: string) => { if (list.length < 50) list.push(v) }
/** This visitor's own feedback on this project, from the server, and what they sent since. */
let mine: Feedback[] = []
const current = () => byKey.get(history.at(-1) ?? '')

const post = (what: string, body: object) =>
  fetch(`/api/s/${token}/${what}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor, name: nameNow(), ...body }) })

let toastTimer: ReturnType<typeof setTimeout> | undefined
function toast(text: string) {
  const t = $('toast')
  t.textContent = text
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.hidden = true }, 2500)
}

let tripTimer: ReturnType<typeof setTimeout> | undefined
/** The trip goes to the server a moment after it changes, once there is a name. */
function sendTrip() {
  if (map.role !== 'comment' || !nameNow()) return
  clearTimeout(tripTimer)
  tripTimer = setTimeout(() => post('trip', trip).catch(() => {}), 800)
}

// ---- Showing a screen

/** The margin's width beside the mock; a narrower window has it under the mock. */
const MARGIN_W = 280
/** The frame has the mock's size and scrolls inside; a mock wider than the window shrinks to fit. The margin goes
 * right of it when there is room. */
function layout() {
  const s = current()
  if (!s) return
  const room = innerWidth - 32, { w, h, k } = playerFit(s.device, room)
  $('stage').classList.toggle('wide', map.role === 'comment' && room >= w + 16 + MARGIN_W)
  frame.style.height = `${h}px`
  Object.assign($('device').style, { width: `${w}px`, transform: k < 1 ? `scale(${k})` : '' })
  Object.assign($('fit').style, { width: `${w * k}px`, height: `${h * k}px` })
}
addEventListener('resize', layout)

function show(key: string, push = true) {
  const s = byKey.get(key)
  if (!s) return
  if (push) history.push(key)
  frame.srcdoc = framePage(markCurrent(pasteComponents(s.html, map.components), s.name), css, true)
  $('name').textContent = s.title
  document.title = `${s.title} · ${map.app.slice(0, 40)}`
  // Home has no Back and no trail: it would only say its name again.
  $('back').hidden = history.length < 2
  $('trail').replaceChildren(...trailOf(history).flatMap((k, i) => {
    const t = byKey.get(k)?.title ?? '?'
    const b = i === history.length - 1 ? el('span', '', t) : el('button', '', t)
    if (b instanceof HTMLButtonElement) b.addEventListener('click', () => { if (!leave()) return; history = history.slice(0, i + 1); show(k, false) })
    return i ? [' → ', b] : [b]
  }))
  // A new mock (its frame starts out not picking): no card open, its pins once the frame says where its parts are.
  picking = false
  draft = null
  located = null
  spots = []
  asked++
  addTo(trip.screens, s.title)
  sendTrip()
  layout()
  showThumbs()
  renderMargin()
  drawPins()
  scrollTo(0, 0)
}

interface Part { text: string; tag: string; nth: number; x: number; y: number; w: number; h: number }
/** A part as the frame described it, checked; null without words. */
function partOf(d: any): Part | null {
  if (typeof d?.text !== 'string' || !d.text) return null
  const n = (v: unknown) => (Number.isFinite(v) ? Math.round(v as number) : 0)
  return { text: d.text.slice(0, 120), tag: typeof d.tag === 'string' ? d.tag : '', nth: Math.max(0, n(d.nth)), x: n(d.x), y: n(d.y), w: n(d.w), h: n(d.h) }
}

/** A click in the mock: open the mock it names, else it is a dead control. */
function go(action: string, label: string, part: Part | null) {
  const s = current()
  if (!s) return
  const t = linkTarget(action)
  const to = !t ? undefined : 'back' in t ? byKey.get(s.parent ?? map.root) : t.name === 'home' ? byKey.get(map.root) : byName.get(t.name)
  if (to && to.key === s.key) return
  if (to) return show(to.key)
  // A mock's own script can post an action without a click: it never drops what the visitor is typing.
  if (typing()) return
  addTo(trip.dead, label || 'a control')
  sendTrip()
  if (map.role !== 'comment') return toast('Not designed yet')
  withName(() => openDraft({ kind: 'comment', label: label || 'a control', ...part && { part } }, '', 'Not designed yet. What did you expect here?'))
}

addEventListener('message', (e) => {
  const d = e.data
  if (e.source !== frame.contentWindow || typeof d?.uxwoz !== 'string') return
  // The mock scrolled inside its frame (or grew): its pins are asked for again, and follow.
  if (d.uxwoz === 'scroll') locate()
  else if (d.uxwoz === 'open' && typeof d.url === 'string' && /^https?:\/\/\S+$/i.test(d.url) && d.url.length <= 2000) open(d.url, '_blank', 'noopener,noreferrer')
  else if (d.uxwoz === 'wheel') scrollBy(Number(d.dx) || 0, Number(d.dy) || 0)
  else if (d.uxwoz === 'action' && typeof d.prompt === 'string') go(d.prompt, typeof d.label === 'string' ? d.label.slice(0, 80) : '', partOf(d.part))
  else if (d.uxwoz === 'part' && picking) { const p = partOf(d); if (p) openDraft({ kind: 'comment', part: p }, '', 'Your comment') }
  else if (d.uxwoz === 'located' && d.n === asked && Array.isArray(d.spots)) {
    spots = d.spots.filter((x: any) => typeof x?.id === 'string').map((x: any) => ({ ...partOf({ ...x, text: '-' })!, id: x.id as string }))
    // Found counts a part scrolled out of view too: only a part not in the mock any more is about an earlier version.
    located = new Set([...spots.map((x) => x.id), ...Array.isArray(d.away) ? d.away.filter((x: unknown) => typeof x === 'string') : []])
    draftFound = askedDraft && !!draft?.part
    drawPins()
    renderMargin()
  }
  else if (d.uxwoz === 'key' && d.key === 'Escape' && picking) setPicking(false)
})

// A new frame is asked where its parts are once it has loaded.
frame.addEventListener('load', () => locate())

$('back').addEventListener('click', () => {
  if (history.length < 2 || !leave()) return
  history.pop()
  show(history.at(-1)!, false)
})

// ---- Feedback (comment links only)

/** Comment mode: the next click in the mock names a part. */
let picking = false
/** The card being written: a comment (on a part, a dead control or the whole mock) or the closing answer. */
let draft: { kind: 'comment' | 'done'; part?: Part; label?: string } | null = null
/** What waits for the name card. */
let pending: (() => void) | null = null
/** The ids of this mock's comments the frame found, and where; null until it answers. */
let located: Set<string> | null = null
let spots: Spot[] = []
/** Whether the frame has answered where the card being written is pinned: then its pin follows the scroll too. */
let draftFound = false
/** Counts the asks (and the mocks shown): `locate` carries it, and only the answer to the latest ask counts. Whether
 * that ask included the card being written. */
let asked = 0, askedDraft = false

/** Whether the open card has words typed in it. */
const typing = () => !!draft && !!$<HTMLTextAreaElement>('composerText').value.trim()
/** Leaving the mock drops the card being written: ask first when it has words. */
const leave = () => !typing() || confirm('Drop the comment you are writing?')

const thisScreen = () => mine.filter((f) => f.screen === current()?.key)
const pinned = () => numbered(thisScreen()).filter((x) => x.n != null)

/** Run `then` now if the visitor has a name, else after the name card. */
function withName(then: () => void) {
  if (nameNow()) return then()
  pending = then
  renderMargin()
  $('nameCard').scrollIntoView({ block: 'nearest' })
  $('who').focus()
}
$('nameCard').addEventListener('submit', (e) => {
  e.preventDefault()
  const typed = $<HTMLInputElement>('who').value.trim()
  if (!typed) return $('who').focus()
  name = typed
  store.set('uxwoz:visitor-name', typed)
  const then = pending
  pending = null
  sendTrip()
  renderMargin()
  then?.()
})

/** Start or end picking, in the page and in the frame together: every way out of picking goes through here. */
function pick(on: boolean) {
  if (!on && !picking) return
  picking = on
  frame.contentWindow?.postMessage(on ? { uxwoz: 'name-part' } : { uxwoz: 'name-part', off: true }, '*')
}
function setPicking(on: boolean) {
  pick(on)
  if (on) draft = null
  if (on) toast('Click the part you mean')
  renderMargin()
  drawPins()
  // The card under the mock, half under the bar at the bottom, comes up above it; one out of sight stays there.
  if (on && $('whole').getBoundingClientRect().top < innerHeight) $('whole').scrollIntoView({ block: 'nearest' })
}
addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && picking) setPicking(false) })

/** Open the card beside the mock: the part's words and its pin to come, a question or a placeholder. */
function openDraft(d: NonNullable<typeof draft>, question: string, placeholder: string) {
  pick(false)
  draft = d
  draftFound = false
  $('composerQ').textContent = question
  $('composerQ').hidden = !question
  $('composerPin').textContent = String(pinned().length + 1)
  $('composerAbout').textContent = d.part ? partLabel(d.part.text) : 'The whole screen'
  $('composer').querySelector('.head')!.toggleAttribute('hidden', d.kind === 'done')
  Object.assign($<HTMLTextAreaElement>('composerText'), { value: '', placeholder })
  renderMargin()
  drawPins()
  locate()
  $('composer').scrollIntoView({ block: 'nearest' })
  $('composerText').focus()
}
function closeDraft() {
  draft = null
  renderMargin()
  drawPins()
}
$('composerCancel').addEventListener('click', closeDraft)
$('whole').addEventListener('click', () => openDraft({ kind: 'comment' }, '', 'Your comment'))
// Enter sends, Shift+Enter adds a line.
$('composerText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $<HTMLFormElement>('composer').requestSubmit() } })
$('composer').addEventListener('submit', async (e) => {
  e.preventDefault()
  const d = draft, s = current(), text = $<HTMLTextAreaElement>('composerText').value.trim()
  if (!d || !s) return
  if (!text) return $('composerText').focus()
  const f = { kind: d.kind, screen: s.key, title: s.title, text, ...d.label && { label: d.label }, ...d.part && { about: d.part.text, tag: d.part.tag, nth: d.part.nth } }
  const id = await send(f)
  if (id == null) return
  mine.push({ id, at: new Date().toISOString(), visitor, name: nameNow(), ...f })
  toast('Thanks, sent.')
  if (draft === d) closeDraft()
  locate()
})

/** Send one feedback; its id, or null after saying why it failed. */
async function send(body: object): Promise<string | null> {
  const res = await post('feedback', body).catch(() => null)
  const b = await res?.json().catch(() => null)
  if (res?.ok) return String(b?.id ?? '')
  toast(`Could not send: ${b?.error ?? 'no answer'}`)
  return null
}

/** The thumbs show this visitor's newest for the mock. */
function showThumbs() {
  const t = thisScreen().filter((f) => f.kind === 'thumb').at(-1)
  $('up').classList.toggle('on', t?.up === true)
  $('down').classList.toggle('on', t?.up === false)
}
for (const [id, up] of [['up', true], ['down', false]] as const) $(id).addEventListener('click', () => withName(async () => {
  const s = current()
  if (!s) return
  const got = await send({ kind: 'thumb', screen: s.key, up })
  if (got == null) return
  mine = mine.filter((f) => !(f.kind === 'thumb' && f.screen === s.key))
  mine.push({ id: got, at: new Date().toISOString(), visitor, name: nameNow(), screen: s.key, title: s.title, kind: 'thumb', up })
  showThumbs()
  toast('Thanks.')
}))
// With words typed in the open card, Comment keeps that card and does not start picking.
$('comment').addEventListener('click', () => withName(() => (typing() ? $('composerText').focus() : setPicking(!picking))))
$('done').addEventListener('click', () => withName(() => (typing() ? $('composerText').focus() : openDraft({ kind: 'done' }, 'Would you use this? Why or why not?', ''))))

/** The margin: the name card, the card being written, then this mock's comments by pin number. */
function renderMargin() {
  if (map.role !== 'comment') return
  const list = numbered(thisScreen())
  $('comment').classList.toggle('on', picking)
  $('comment').setAttribute('aria-pressed', String(picking))
  $('whole').hidden = !picking
  $('nameCard').hidden = !pending
  $('composer').hidden = !draft
  $('hint').hidden = list.length > 0 || picking || !!draft || !!pending
  $('slips').replaceChildren(...list.map(({ f, n }) => {
    const gone = !f.resolved && anchorOf(f) && located && !located.has(f.id)
    const state = f.resolved ? 'Resolved' : gone ? 'About an earlier version' : ''
    const li = el('li', 'slip', el('div', 'head', n ? el('span', 'dot', String(n)) : '', el('small', '', partLabel(f.about || f.label || '') || 'The whole screen')),
      el('p', '', f.text ?? ''), ...state ? [el('small', 'state', state)] : [])
    li.dataset.id = f.id
    return li
  }))
}

/** Ask the frame where this mock's open, anchored comments are (those in its view); the pins follow its answer. */
function locate() {
  if (map.role !== 'comment') return
  const anchors = pinned().map((x) => anchorOf(x.f)).filter((a) => a != null)
  askedDraft = draft?.kind === 'comment' && !!draft.part
  if (askedDraft) anchors.push({ id: 'new', text: draft!.part!.text, tag: draft!.part!.tag, nth: draft!.part!.nth })
  frame.contentWindow?.postMessage({ uxwoz: 'locate', n: ++asked, anchors }, '*')
}

/** The pins over the mock: one per located comment, and the one of the card being written. */
function drawPins() {
  const numbers = new Map(pinned().map((x) => [x.f.id, x.n!] as [string, number]))
  const all = [...spots]
  // The new card's pin: where the part was clicked, until the frame says where it is now.
  if (draft?.kind === 'comment' && draft.part) {
    if (!draftFound) all.push({ ...draft.part, id: 'new' })
    numbers.set('new', numbers.size + 1)
  }
  pinLayer($('pins'), all, numbers, (id) => {
    const card = id === 'new' ? $('composer') : $('slips').querySelector<HTMLElement>(`[data-id="${id}"]`)
    for (const x of document.querySelectorAll('.ring')) x.classList.remove('ring')
    card?.classList.add('ring')
    card?.scrollIntoView({ block: 'nearest' })
  })
}

// ---- Start

function note(text: string) {
  $('stage').hidden = true
  $('note').textContent = text
  $('note').hidden = false
  $('name').textContent = 'UXWoz'
}

async function init() {
  const res = await fetch(`/api/s/${token}/map`)
  if (!res.ok) return note((await res.json().catch(() => null))?.error ?? 'This link does not work any more.')
  map = await res.json()
  for (const s of map.screens) { byKey.set(s.key, s); byName.set(s.name, s) }
  if (!byKey.has(map.root)) return note('Nothing to show yet.')
  const [pico, mockup] = await Promise.all(['pico', 'mockup'].map((t) => fetch(`/themes/${t}.css`).then((r) => r.text())))
  css = `${pico}\n${mockup}`
  if (map.role === 'comment') {
    const got = await fetch(`/api/s/${token}/feedback?visitor=${visitor}`).then((r) => r.json()).catch(() => null)
    mine = Array.isArray(got?.feedback) ? got.feedback : []
  }
  $('tools').hidden = $('margin').hidden = map.role !== 'comment'
  show(map.root)
}

init().catch((e) => note(`Could not load this project: ${e.message}`))
