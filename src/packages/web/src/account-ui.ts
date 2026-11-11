// The public's account (spec/behavior.md, The public): the account button, last in the toolbar, its menu, and the
// account card over the dimmed canvas. What the button, the menu and the card show follows from `me` (GET /api/me)
// and why the card opened, in functions with no DOM (bun test runs them). The page hands in what it needs from the
// other modules at `initAccount`, so nothing here imports them; the DOM is touched only inside functions.

/** GET /api/me (spec/public.md, Routes). */
export interface Me {
  role: 'owner' | 'user' | 'visitor' | 'new'
  email?: string
  left?: number
  allowance?: number
  screensLeft?: number
  topupDue?: number
  request?: { at: number; answer?: string }
  paused?: boolean
  may?: { share: boolean; exportZip: boolean }
}
/** Why the card opened: a live design refused (`allowance`, `address`), Register, Share or Export, Ask for more. */
export type Why = 'allowance' | 'address' | 'register' | 'share' | 'export' | 'ask'
/** Where the sign-in is: the email, the code sent, verified into a new account; or a request for more sent. */
export type CardStep = 'email' | 'code' | 'thanks' | 'asked'

/** What the top-up gives ($0.15 at about $0.007 a screen). */
export const MORE = 21
const LEADS: Record<Why, string> = {
  allowance: `You have used your free screens. Register to get about ${MORE} more.`,
  address: 'This network has used today\'s free screens. Register to carry on.',
  register: `Register to get about ${MORE} more free screens.`,
  share: 'Register to share a mockup.',
  export: 'Register to export it.',
  ask: `Register to get about ${MORE} more free screens.`,
}

export interface CardView {
  lead: string
  /** The one field, if any, with its label (shown above it) and what it holds. */
  field: { kind: 'email' | 'code' | 'note'; label?: string; placeholder: string } | null
  /** The primary button. */
  send: string | null
  /** The line under it; `privacy` links to /privacy. */
  note: string | null
  privacy: boolean
  /** *Send a new one*, under the code. */
  again: boolean
}

const view = (lead: string, rest: Partial<CardView> = {}): CardView => ({ lead, field: null, send: null, note: null, privacy: false, again: false, ...rest })

/** What the card shows for `me`, given why it opened and where the sign-in is. */
export function cardOf(me: Me, why: Why, step: CardStep, email: string): CardView {
  if (step === 'thanks') return view(`Thanks. Your ${MORE} free screens arrive within 12 hours, and we will email you. Your mockups stay open until then: look, click, export.`)
  if (me.role === 'user') {
    if (step === 'asked' || (me.request && !me.request.answer)) return view('Asked. The answer comes by email.')
    return view('You have used your free screens.', { field: { kind: 'note', label: 'What are you building?', placeholder: 'e.g. a booking app for my dog walking business' }, send: 'Ask for more' })
  }
  if (step === 'code') return view(`We sent a code to ${email}.`, { field: { kind: 'code', placeholder: 'Six digits' }, send: 'Verify', again: true })
  return view(LEADS[why], { field: { kind: 'email', placeholder: 'you@example.com' }, send: 'Send the code', note: 'No password: we email you a six-digit code.', privacy: true })
}

/** The account button shows at all: the public app, for anyone but the owner. */
export const shows = (me: Me | null, isPublic: boolean) => isPublic && !!me && me.role !== 'owner'

/** The button: a visitor's free screens left once they made a live design, a registered user's first letter, else the icon (''). */
export function buttonOf(me: Me): { text: string; letter: boolean } {
  if (me.role === 'user' && me.email) return { text: me.email[0]!.toUpperCase(), letter: true }
  const made = me.role === 'visitor' && (me.left ?? 0) < (me.allowance ?? 0)
  return { text: made ? `${me.screensLeft ?? 0} free` : '', letter: false }
}

export type Row = { kind: 'text' | 'email' | 'register' | 'ask' | 'signout' | 'delete' | 'privacy'; text: string }

/** The menu, top to bottom; Ask for more only while no request waits for its answer. */
export function menuOf(me: Me): Row[] {
  const n = me.screensLeft ?? 0, user = me.role === 'user'
  return [
    { kind: 'text', text: `About ${n} free screen${n === 1 ? '' : 's'} left` },
    user ? { kind: 'email', text: me.email ?? '' } : { kind: 'register', text: 'Register' },
    ...user && n === 0 && !(me.request && !me.request.answer) ? [{ kind: 'ask', text: 'Ask for more' } as Row] : [],
    ...user ? [{ kind: 'signout', text: 'Sign out' }, { kind: 'delete', text: 'Delete my account…' }] as Row[] : [],
    { kind: 'privacy', text: 'Privacy' },
  ]
}

/** What a refused request leads to: the card (and why), the red pill with the server's words, or nothing of ours. */
export function refusalOf(status: number, body: { error?: string; reason?: string } | null): { card: Why } | { pill: string } | null {
  const r = body?.reason
  if (status === 402 && (r === 'allowance' || r === 'address')) return { card: r }
  if (status === 402 && (r === 'paused' || r === 'blocked')) return { pill: body!.error ?? 'Live designs are paused for now. The starters still work.' }
  if (status === 403 && r === 'register') return { card: 'register' }
  return null
}

// ---- The page

export interface AccountDeps {
  post: (url: string, body: object) => Promise<Response>
  showError: (msg: string | null) => void
  loadRecent: () => unknown
  closeMenus: () => void
}

let deps: AccountDeps | null = null
let isPublic = false
let me: Me | null = null
/** The card's own state, kept while it is closed: why it opened, the step, what was typed, the last error. */
const card = { why: 'register' as Why, step: 'email' as CardStep, email: '', code: '', note: '', error: '' }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
/** The email and a code on its way also outlive a reload of this tab. */
const KEPT = 'uxwoz:signin'
function keep() {
  try { sessionStorage.setItem(KEPT, JSON.stringify({ email: card.email, code: card.step === 'code' })) } catch { /* private mode */ }
}

/** Start once the config is known: the button goes last in the toolbar, `me` loads; private mode shows none of it. */
export function initAccount(d: AccountDeps, cfg: { public?: boolean }) {
  deps = d
  isPublic = !!cfg.public
  if (!isPublic) return
  // The first step of the count, once per browser.
  try {
    if (!localStorage.getItem('uxwoz:arrived')) {
      localStorage.setItem('uxwoz:arrived', '1')
      fetch('/api/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'arrived' }) }).catch(() => {})
    }
  } catch { /* no storage: not counted */ }
  try {
    const k = JSON.parse(sessionStorage.getItem(KEPT) ?? 'null')
    if (typeof k?.email === 'string') Object.assign(card, { email: k.email, step: k.code ? 'code' : 'email' })
  } catch { /* none kept */ }
  $('toolbar').querySelector('.tb-right')!.append($('accountPop'))
  const form = $<HTMLFormElement>('account')
  form.addEventListener('submit', (e) => { e.preventDefault(); send() })
  $('accountField').addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).value; if (fieldKind()) card[fieldKind()!] = v })
  $('accountAgain').addEventListener('click', () => signIn())
  addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') closeCard() })
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node
    if (!form.hidden && !form.contains(t) && !$('accountPop').contains(t)) closeCard()
  })
  loadMe()
}

/** GET /api/me again, then the button; the owner sees the Model picker, the public does not. */
export async function loadMe() {
  if (!isPublic) return
  const res = await fetch('/api/me').catch(() => null)
  if (res?.ok) setMe(await res.json())
}

function setMe(m: Me) {
  me = m
  const on = shows(me, isPublic)
  $('accountPop').hidden = !on
  ;($('model').closest('label') as HTMLElement).hidden = on
  if (!on) return
  const b = buttonOf(me)
  $('accountName').textContent = b.letter ? '' : b.text
  $('accountLetter').textContent = b.letter ? b.text : ''
  $('accountLetter').hidden = !b.letter
  $('accountIcon').toggleAttribute('hidden', !!b.text)
  $('accountButton').title = me.role === 'user' ? `${me.email}: your account` : 'Your free screens, Register, Privacy'
  if (!$('account').hidden) renderCard()
}

/** The menu, built when it opens (toolbar.ts). */
export function renderAccountMenu() {
  if (!me) return
  const run: Partial<Record<Row['kind'], () => void>> = {
    register: () => openCard('register'),
    privacy: () => open('/privacy', '_blank'),
    ask: () => openCard('ask'),
    signout: () => leave('/api/signout', {}),
    delete: () => {
      const typed = prompt('Delete your account? Its mockups and its links go at once, for good. Type your email once more:')
      if (typed?.trim()) leave('/api/delete-account', { email: typed.trim() })
    },
  }
  $('accountMenu').replaceChildren(...menuOf(me).map((r) => {
    if (r.kind === 'text' || r.kind === 'email') return Object.assign(document.createElement('h3'), { textContent: r.text, className: r.kind === 'email' ? 'plain' : '' })
    const b = Object.assign(document.createElement('button'), { className: 'item', type: 'button', textContent: r.text })
    b.addEventListener('click', () => { deps!.closeMenus(); run[r.kind]!() })
    return b
  }))
}

/** Sign out or delete the account: then the page starts again with no mockup open. */
async function leave(url: string, body: object) {
  const res = await deps!.post(url, body).catch(() => null)
  if (!res?.ok) return deps!.showError((await res?.json().catch(() => null))?.error ?? 'No answer: try again.')
  try { localStorage.setItem('uxwoz:app', ''); sessionStorage.removeItem(KEPT) } catch { /* private mode */ }
  location.reload()
}

/** A thing that needs an account: true (and the card opens) when this person may not do it yet. */
export function needsAccount(what: 'share' | 'export'): boolean {
  if (!shows(me, isPublic) || (what === 'share' ? me!.may?.share : me!.may?.exportZip)) return false
  openCard(what)
  return true
}

/**
 * A refused request (net.ts, drawer.ts): the card opens, or the red pill says the server's words alone, and `me`
 * loads again. True when it was handled here.
 */
export function refused(status: number, body: { error?: string; reason?: string } | null): boolean {
  if (!isPublic) return false
  if (status === 401) loadMe()
  const r = refusalOf(status, body)
  if (!r) return false
  loadMe()
  if ('pill' in r) deps!.showError(r.pill)
  else openCard(r.card)
  return true
}

export function openCard(why: Why) {
  if (card.step === 'thanks' || card.step === 'asked') card.step = 'email'
  card.why = why
  card.error = ''
  $('account').hidden = false
  renderCard()
}

export const closeCard = () => { $('account').hidden = true }

const fieldKind = () => (me ? cardOf(me, card.why, card.step, card.email).field?.kind ?? null : null)

function renderCard() {
  if (!me) return
  const v = cardOf(me, card.why, card.step, card.email)
  $('accountLead').textContent = v.lead
  const f = $<HTMLInputElement>('accountField'), label = $('accountLabel')
  f.hidden = !v.field
  label.hidden = !v.field?.label
  label.textContent = v.field?.label ?? ''
  if (v.field) {
    const k = v.field.kind
    Object.assign(f, { type: k === 'email' ? 'email' : 'text', placeholder: v.field.placeholder, value: card[k], maxLength: k === 'code' ? 6 : k === 'note' ? 500 : 200 })
    f.inputMode = k === 'code' ? 'numeric' : k === 'email' ? 'email' : 'text'
    f.autocomplete = k === 'email' ? 'email' : k === 'code' ? 'one-time-code' : 'off'
  }
  const s = $<HTMLButtonElement>('accountSend')
  s.hidden = !v.send
  s.textContent = v.send ?? ''
  $('accountNote').hidden = !v.note
  $('accountNoteText').textContent = v.note ?? ''
  $('accountAgain').hidden = !v.again
  $('accountError').textContent = card.error
  $('accountError').hidden = !card.error
  if (v.field) f.focus()
  keep()
}

/** The card's button, or Enter in its field. */
function send() {
  const k = fieldKind()
  if (k === 'email') return signIn()
  if (k === 'code') return verify()
  if (k === 'note') return ask()
}

/** The server's words for a refusal, else its status. */
const words = async (res: Response | null) => (await res?.json().catch(() => null))?.error ?? (res ? `HTTP ${res.status}` : 'No answer: try again.')

async function call(url: string, body: object, ok: (res: Response) => unknown | Promise<unknown>) {
  const s = $<HTMLButtonElement>('accountSend')
  s.disabled = true
  const res = await deps!.post(url, body).catch(() => null)
  s.disabled = false
  card.error = res?.ok ? '' : await words(res)
  if (res?.ok) await ok(res)
  if (!$('account').hidden) renderCard()
}

function signIn() {
  const email = card.email.trim()
  if (!email) return $('accountField').focus()
  return call('/api/signin', { email }, () => { card.step = 'code'; card.code = '' })
}

function verify() {
  if (!card.code.trim()) return $('accountField').focus()
  return call('/api/verify', { email: card.email.trim(), code: card.code.trim() }, async (res) => {
    const m = (await res.json()).me as Me
    card.code = ''
    // A new account waits for its top-up; an account that existed takes the visitor's mockups at once.
    card.step = m.topupDue ? 'thanks' : 'email'
    keep()
    setMe(m)
    if (card.step === 'email') closeCard()
    deps!.loadRecent()
  })
}

function ask() {
  if (!card.note.trim()) return $('accountField').focus()
  return call('/api/ask', { note: card.note.trim() }, () => { card.step = 'asked'; card.note = ''; return loadMe() })
}
