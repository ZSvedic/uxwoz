// The admin's page at /admin: reads GET /api/admin, draws its tables, and sends each button's op to POST /api/admin,
// whose answer is the page's next state. Every text from the database goes in as text, never as HTML.

interface Person { id: string; email: string | null; created: number; seen: number; allowance: number; spent: number; mockups: number; blocked: boolean; topupDue: number | null }
interface Req { id: number; person: string; email: string | null; note: string; at: number; answer: 'approved' | 'refused' | null; usd: number | null }
interface Admin {
  spent: { today: number; month: number }; caps: Record<string, number>; mode: 'open' | 'starters'
  steps: ({ day: string } & Record<string, number>)[]; people: Person[]; requests: Req[]
  address: string; mailToday: number; startersCurrent: boolean; mailed?: boolean
}

const CAP_LABELS: Record<string, string> = {
  visitor: 'A visitor\'s free allowance ($)', topup: 'The top-up after sign-up ($)', topupHours: 'Hours before the top-up arrives',
  addressUsd: 'Visitors\' spend per address a day ($)', addressVisitors: 'New visitors per address a day',
  addressAccounts: 'New accounts per address a day', dayUsd: 'The public\'s spend a day ($)', monthUsd: 'The public\'s spend a month ($)',
  mailPerDay: 'Emails a day',
}
const STEP_LABELS: [string, string][] = [['arrived', 'Arrived'], ['starter', 'Picked a starter'], ['picked', 'Picked a design'],
  ['own', 'Own prompt'], ['limit', 'Hit the limit'], ['asked', 'Asked for a code'], ['verified', 'Verified']]

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
/** Dollars; an amount under ten cents keeps its tenths of a cent, since a design costs about $0.001. */
const money = (usd: number) => `$${usd.toFixed(usd !== 0 && Math.abs(usd) < 0.1 ? 3 : 2)}`
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '')

type Child = Node | string
function el(tag: string, props: Record<string, any> = {}, ...kids: Child[]) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) (e as any)[k] = v
  e.append(...kids)
  return e
}
const row = (...cells: Child[]) => el('tr', {}, ...cells.map((c) => el('td', {}, c)))
const head = (...cells: string[]) => el('tr', {}, ...cells.map((c) => el('th', {}, c)))
const button = (text: string, onclick: () => void, cls = '') => el('button', { type: 'button', className: cls, onclick }, text)

function amountField(value: string) {
  return el('input', { type: 'number', step: '0.01', min: '-100', max: '100', value, className: 'amount', ariaLabel: 'Amount in dollars' }) as HTMLInputElement
}

async function load(res: Promise<Response>) {
  const err = $('err')
  try {
    const r = await res
    const body = await r.json()
    if (!r.ok) { err.textContent = body.error ?? `Error ${r.status}`; err.hidden = false; return }
    err.hidden = !(body.mailed === false)
    if (body.mailed === false) err.textContent = 'Done, but the email did not go out.'
    draw(body as Admin)
  } catch (e) {
    err.textContent = `Could not reach the server: ${(e as Error).message}`
    err.hidden = false
  }
}
const op = (body: Record<string, unknown>) => load(fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

function draw(a: Admin) {
  $('spend').textContent = `Today ${money(a.spent.today)} of ${money(a.caps.dayUsd!)}; this month ${money(a.spent.month)} of ${money(a.caps.monthUsd!)}.`
  $('modeOpen').className = a.mode === 'open' ? 'primary' : ''
  $('modeStarters').className = a.mode === 'starters' ? 'primary' : ''
  $('modeOpen').setAttribute('aria-pressed', String(a.mode === 'open'))
  $('modeStarters').setAttribute('aria-pressed', String(a.mode === 'starters'))

  $('capRows').replaceChildren(...Object.entries(CAP_LABELS).map(([k, label]) => {
    const input = el('input', { type: 'number', step: 'any', min: '0', name: k, value: String(a.caps[k] ?? ''), id: `cap-${k}` })
    return el('tr', {}, el('td', {}, el('label', { htmlFor: `cap-${k}` }, label)), el('td', {}, input))
  }))

  $('stepHead').replaceChildren(head('Day', ...STEP_LABELS.map(([, l]) => l)))
  $('stepRows').replaceChildren(...(a.steps.length ? a.steps.map((d) => row(d.day, ...STEP_LABELS.map(([k]) => String(d[k] ?? 0))))
    : [row('No steps in the last 30 days.')]))

  const waiting = a.people.filter((p) => p.email && p.topupDue !== null)
  $('waiting').replaceChildren(...(waiting.length
    ? [head('Who', 'Since', 'Arrives', ''), ...waiting.map((p) => row(p.email!, when(p.created), when(p.topupDue), button('Approve now', () => op({ op: 'topup', id: p.id }), 'primary')))]
    : [row('Nobody waits.')]))

  $('requests').replaceChildren(...(a.requests.length
    ? [head('Who', 'Note', 'Spent', 'Amount', ''), ...a.requests.map((r) => {
        const p = a.people.find((x) => x.id === r.person)
        const spent = p ? `${money(p.spent)} of ${money(p.allowance)}` : ''
        if (r.answer) return row(r.email ?? 'gone', r.note, spent, r.usd ? money(r.usd) : '', r.answer === 'approved' ? 'Approved' : 'Refused')
        const amount = amountField('0.50')
        amount.min = '0.01'
        return row(r.email ?? 'gone', r.note, spent, amount, el('span', { className: 'row' },
          button('Approve', () => op({ op: 'answer', request: r.id, approved: true, usd: Number(amount.value) }), 'primary'),
          button('Refuse', () => op({ op: 'answer', request: r.id, approved: false }))))
      })]
    : [row('No requests.')]))

  $('people').replaceChildren(...(a.people.length
    ? [head('Who', 'Since', 'Last seen', 'Spent', 'Mockups', 'Give more', ''), ...a.people.map((p) => {
        const amount = amountField('0.15')
        const who = p.blocked ? `${p.email ?? 'visitor'} (blocked)` : p.email ?? 'visitor'
        return row(who, when(p.created), when(p.seen), `${money(p.spent)} of ${money(p.allowance)}`, String(p.mockups),
          el('span', { className: 'row' }, amount, button('Give', () => op({ op: 'give', id: p.id, usd: Number(amount.value) }))),
          el('span', { className: 'row' },
            button(p.blocked ? 'Unblock' : 'Block', () => op({ op: 'block', id: p.id, blocked: !p.blocked })),
            button('Delete', () => { if (confirm(`Delete ${p.email ?? 'this visitor'}, their mockups and links? This cannot be undone.`)) op({ op: 'delete', id: p.id }) }, 'danger')))
      })]
    : [row('Nobody yet.')]))

  $('address').textContent = `Your address as the server sees it: ${a.address}`
  $('starters').textContent = a.startersCurrent ? 'The starters were recorded with today\'s prompt.'
    : 'The starters were recorded with an older prompt: run bun run starters:record.'
  $('mail').textContent = `Emails sent today: ${a.mailToday} of ${a.caps.mailPerDay}.`
}

$('modeOpen').onclick = () => op({ op: 'mode', mode: 'open' })
$('modeStarters').onclick = () => op({ op: 'mode', mode: 'starters' })
$<HTMLFormElement>('caps').onsubmit = (e) => {
  e.preventDefault()
  const caps: Record<string, number> = {}
  for (const input of $('capRows').querySelectorAll('input')) if (input.value !== '') caps[input.name] = Number(input.value)
  op({ op: 'caps', caps })
}
load(fetch('/api/admin'))
