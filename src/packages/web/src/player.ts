// The player of a share link: one screen at a time in its device frame, Back and the trail of names.
// A comment link adds feedback: a comment, a thumb, what a dead control should do, and a closing answer.
// Each visit sends its trip (the screens seen, the dead controls clicked) as it changes.

import { DEVICES, FRAME_SANDBOX, framePage, markCurrent, pasteComponents, type Device } from '@uxwoz/core/frame'
import { isBack, screenKey, screenRef } from '@uxwoz/core/keys'
import { el } from './boxes.ts'

interface Screen { key: string; name: string; title: string; html: string; device?: Device; parent: string | null }
interface PlayerMap { role: 'view' | 'comment'; app: string; root: string; components: Record<string, string>; screens: Screen[] }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const token = location.pathname.split('/')[2] ?? ''
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}
const random = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
const visitor = store.get('uxwoz:visitor') ?? random()
store.set('uxwoz:visitor', visitor)
const nameNow = () => store.get('uxwoz:visitor-name') ?? ''

const frame = $<HTMLIFrameElement>('frame')
frame.setAttribute('sandbox', FRAME_SANDBOX)
let map: PlayerMap
let css = ''
const byKey = new Map<string, Screen>(), byName = new Map<string, Screen>()
/** The screens visited in this tab, for Back and the trail; the last one shows. */
let history: string[] = []
const trip = { id: random(), screens: [] as string[], dead: [] as string[] }
const thumbsKey = `uxwoz:thumbs:${token}`
const thumbs: Record<string, boolean> = JSON.parse(store.get(thumbsKey) || '{}')
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
/** The trip goes to the server a moment after it changes. */
function sendTrip() {
  clearTimeout(tripTimer)
  tripTimer = setTimeout(() => post('trip', trip).catch(() => {}), 800)
}

// ---- Showing a screen

let frameH = 0
/** Fit the device to the window: a desktop screen shrinks on a phone. */
function layout() {
  const s = current()
  if (!s) return
  const w = s.device ? DEVICES[s.device].width : 800, k = Math.min(1, (innerWidth - 32) / w)
  const h = Math.max(frameH, s.device ? DEVICES[s.device].height : 800)
  frame.style.height = `${h}px`
  Object.assign($('device').style, { width: `${w}px`, transform: `scale(${k})` })
  Object.assign($('fit').style, { width: `${w * k}px`, height: `${h * k}px` })
}
addEventListener('resize', layout)

function show(key: string, push = true) {
  const s = byKey.get(key)
  if (!s) return
  if (push) history.push(key)
  frameH = 0
  frame.srcdoc = framePage(markCurrent(pasteComponents(s.html, map.components), s.name), css, true, s.device)
  $('name').textContent = s.title
  document.title = `${s.title} · ${map.app.slice(0, 40)}`
  $<HTMLButtonElement>('back').disabled = history.length < 2
  $('trail').replaceChildren(...history.flatMap((k, i) => {
    const t = byKey.get(k)?.title ?? '?'
    const b = i === history.length - 1 ? el('span', '', t) : el('button', '', t)
    if (b instanceof HTMLButtonElement) b.addEventListener('click', () => { history = history.slice(0, i + 1); show(k, false) })
    return i ? [' → ', b] : [b]
  }))
  $('up').classList.toggle('on', thumbs[key] === true)
  $('down').classList.toggle('on', thumbs[key] === false)
  trip.screens.push(s.title)
  sendTrip()
  layout()
  scrollTo(0, 0)
}

/** A click in the screen: open the screen it names, else it is a dead control. */
function go(action: string, label: string) {
  const s = current()
  if (!s) return
  const ref = screenRef(action)
  const to = isBack(action) ? byKey.get(s.parent ?? map.root)
    : ref?.name === 'home' ? byKey.get(map.root)
      : ref ? byName.get(ref.name) : byKey.get(screenKey(map.app, action))
  if (to && to.key === s.key) return
  if (to) return show(to.key)
  trip.dead.push(label || 'a control')
  sendTrip()
  if (map.role === 'comment') ask('Not designed yet. What did you expect here?', { kind: 'dead', label }, false)
  else toast('Not designed yet')
}

addEventListener('message', (e) => {
  const d = e.data
  if (e.source !== frame.contentWindow || typeof d?.uxwoz !== 'string') return
  if (d.uxwoz === 'size' && Number.isFinite(d.height)) { frameH = Math.min(8000, Math.round(d.height)); layout() }
  else if (d.uxwoz === 'wheel') scrollBy(Number(d.dx) || 0, Number(d.dy) || 0)
  else if (d.uxwoz === 'action' && typeof d.prompt === 'string') go(d.prompt, typeof d.label === 'string' ? d.label.slice(0, 80) : '')
  else if (d.uxwoz === 'part' && naming) { naming = false; $<HTMLInputElement>('about').value = String(d.text ?? '').slice(0, 120); $<HTMLDialogElement>('ask').showModal() }
})

$('back').addEventListener('click', () => {
  if (history.length < 2) return
  history.pop()
  show(history.at(-1)!, false)
})

// ---- Feedback (comment links only)

/** What the open question sends with the answer. */
let asking: { kind: string; label?: string } | null = null
let naming = false

function ask(question: string, what: { kind: string; label?: string }, about: boolean) {
  asking = what
  $('askQ').textContent = question
  $('aboutRow').hidden = !about
  $<HTMLInputElement>('about').value = ''
  $<HTMLTextAreaElement>('askText').value = ''
  $<HTMLInputElement>('who').value = nameNow()
  $<HTMLDialogElement>('ask').showModal()
  $('askText').focus()
}

async function send(body: object, thanks: string) {
  const res = await post('feedback', { screen: current()?.key, ...body }).catch(() => null)
  const b = await res?.json().catch(() => null)
  toast(res?.ok ? thanks : `Could not send: ${b?.error ?? 'no answer'}`)
}

$('askForm').addEventListener('submit', (e) => {
  e.preventDefault()
  const text = $<HTMLTextAreaElement>('askText').value.trim()
  if (!text) return $('askText').focus()
  store.set('uxwoz:visitor-name', $<HTMLInputElement>('who').value.trim())
  const about = $<HTMLInputElement>('about').value.trim()
  send({ ...asking, text, ...(about && { about }) }, 'Thanks, sent.')
  $<HTMLDialogElement>('ask').close()
})
// Enter sends, Shift+Enter adds a line.
$('askText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $<HTMLFormElement>('askForm').requestSubmit() } })
$('askCancel').addEventListener('click', () => $<HTMLDialogElement>('ask').close())
$('pickPart').addEventListener('click', () => {
  naming = true
  $<HTMLDialogElement>('ask').close()
  frame.contentWindow?.postMessage({ uxwoz: 'name-part' }, '*')
  toast('Click the part you mean')
})
for (const [id, up] of [['up', true], ['down', false]] as const) $(id).addEventListener('click', () => {
  const s = current()
  if (!s) return
  thumbs[s.key] = up
  store.set(thumbsKey, JSON.stringify(thumbs))
  $('up').classList.toggle('on', up)
  $('down').classList.toggle('on', !up)
  send({ kind: 'thumb', up }, 'Thanks.')
})
$('comment').addEventListener('click', () => ask(`Your comment on ${current()?.title ?? 'this screen'}`, { kind: 'comment' }, true))
$('done').addEventListener('click', () => ask('Would you use this? Why or why not?', { kind: 'done' }, false))

// ---- Start

function note(text: string) {
  $('stage').hidden = true
  $('note').textContent = text
  $('note').hidden = false
  $('name').textContent = 'UX Woz'
}

async function init() {
  const res = await fetch(`/api/s/${token}/map`)
  if (!res.ok) return note((await res.json().catch(() => null))?.error ?? 'This link does not work any more.')
  map = await res.json()
  for (const s of map.screens) { byKey.set(s.key, s); byName.set(s.name, s) }
  if (!byKey.has(map.root)) return note('Nothing to show yet.')
  const [pico, mockup] = await Promise.all(['pico', 'mockup'].map((t) => fetch(`/themes/${t}.css`).then((r) => r.text())))
  css = `${pico}\n${mockup}`
  $('tools').hidden = map.role !== 'comment'
  show(map.root)
}

init().catch((e) => note(`Could not load this mockup: ${e.message}`))
