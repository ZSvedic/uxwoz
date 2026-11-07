// The three hand-made papers of the Draw part (process/plans/2026-11-06-paper-canvas.md, step 1):
// NiceSnore (phone), a sales dashboard (desktop) and the space mining game (phone). Each starts
// with two drawn screens, five undrawn titles, two or three components, five rules and two tables.
// The checks beside each paper are measurement only: no model sees them.

import type { Paper } from './paper-test-lib.ts'

/** How the check reads one paper: which screens need a component, and one test per rule. */
export interface PaperCheck {
  /** Does a screen with this ID need this component, by the component's own `where` line? */
  needs: Record<string, (screen: string) => boolean>
  /** Does this variant draw the component by hand (pasted copies already taken out)? */
  redrawn: Record<string, (html: string, text: string) => boolean>
  /** Per rule: does it fit this variant, and if so, the broken bit or null. Absent: read by hand. */
  rules: Record<string, { fits: (html: string, text: string) => boolean; broken: (html: string, text: string) => string | null }>
  /** Per table, where code can tell: a pattern for one item of its kind, to find items not in the table. */
  items: Record<string, RegExp>
}

const links = (html: string) => [...html.matchAll(/data-action\s*=\s*["']@?([a-z0-9-]+)/gi)].map((m) => m[1]!)
const hits = (html: string, targets: string[]) => new Set(links(html).filter((t) => targets.includes(t))).size
const first = (text: string, re: RegExp) => text.match(re)?.[0] ?? null

// NiceSnore -----------------------------------------------------------------------------------------

const SNORE_TABS = ['home', 'history', 'remedies', 'settings']

export const nicesnore: Paper = {
  app: 'NiceSnore: a snore app with recording as main function (phone+watch), snore score and history, log of tried remedies etc.',
  device: 'phone',
  screens: [
    { id: 'home', line: "tonight's recording and last night's score", html: `<title>Tonight</title>
<h1>Good evening, Alex</h1>
<div data-component="watch-status"></div>
<article style="text-align:center">
<h2>Ready to sleep?</h2>
<p>Put the phone on the nightstand, screen down.</p>
<button data-action="@recording">Start recording</button>
</article>
<article>
<h3>Last night, Mon 3 Nov</h3>
<p><mark>Snore score 34</mark> · snoring 1 h 20 min</p>
<a data-action="@sleep-summary">See the night</a>
</article>
<p><a data-action="@profile">Alex Morgan · profile</a></p>
<div data-component="tab-bar"></div>` },
    { id: 'recording', line: 'recording in progress, live sound level and snore marks', html: `<title>Recording</title>
<div data-component="back"></div>
<h1>Recording</h1>
<div data-component="watch-status"></div>
<p style="text-align:center"><strong style="font-size:3rem">01:42</strong><br><small>started 23:10</small></p>
<progress value="38" max="100"></progress>
<p><small>Sound level now · 3 snore marks so far</small></p>
<button data-action="@sleep-summary">Stop and save</button>` },
    { id: 'sleep-summary', line: "one night's score and a timeline of snoring episodes" },
    { id: 'history', line: 'every recorded night, newest first' },
    { id: 'remedies', line: 'the remedies the user has tried and how well each worked' },
    { id: 'settings', line: 'recording and reminder options' },
    { id: 'profile', line: 'name, sleep goal and account' },
  ],
  components: [
    { id: 'tab-bar', where: 'at the bottom of every screen except recording', html: `<nav>
<a data-action="@home">Tonight</a>
<a data-action="@history">History</a>
<a data-action="@remedies">Remedies</a>
<a data-action="@settings">Settings</a>
</nav>` },
    { id: 'back', where: 'at the top left of every screen that the tab bar does not open', html: '<a data-action="back">‹ Back</a>' },
    { id: 'watch-status', where: 'under the heading of home, recording and settings', html: '<p><small>⌚ Watch paired · phone mic on</small></p>' },
  ],
  rules: [
    { id: 'score-direction', text: 'A higher snore score means more snoring, so higher is worse.' },
    { id: 'on-off-switches', text: 'On/off settings are switches, never checkboxes.' },
    { id: 'durations', text: 'Durations read like 2 h 15 min.' },
    { id: 'dates', text: 'Dates read like Mon 3 Nov.' },
    { id: 'clock', text: 'Times of day use the 24-hour clock, like 23:10.' },
  ],
  data: [
    { id: 'nights', rows: [
      ['date', 'score', 'snoring', 'remedy'],
      ['Mon 3 Nov', '34', '1 h 20 min', 'none'],
      ['Sun 2 Nov', '58', '3 h 05 min', 'none'],
      ['Sat 1 Nov', '41', '2 h 10 min', 'nasal strips'],
      ['Fri 31 Oct', '27', '50 min', 'side sleeping'],
      ['Thu 30 Oct', '66', '3 h 40 min', 'none'],
    ] },
    { id: 'remedies', rows: [
      ['remedy', 'started', 'nights', 'average score'],
      ['nasal strips', 'Sat 1 Nov', '3', '39'],
      ['side sleeping', 'Fri 24 Oct', '6', '31'],
      ['chin strap', 'Mon 13 Oct', '4', '52'],
      ['no alcohol', 'Mon 6 Oct', '5', '44'],
    ] },
  ],
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const MONTH_WORDS = 'January|February|March|April|June|July|August|September|October|November|December'
/**
 * A date written another way: month before day ("Nov 3", not after a day as in "3 Nov 34", where
 * 34 is the next cell), a month spelled out next to a day, or digits only. A month alone is no date.
 */
const DATES = {
  fits: (_h: string, t: string) => new RegExp(`\\b(${MONTHS}|${MONTH_WORDS})\\b|\\b\\d{1,2}/\\d{1,2}\\b|\\d{4}-\\d\\d-\\d\\d`).test(t),
  broken: (_h: string, t: string) => first(t, new RegExp(`(?<!\\d )\\b(${MONTHS})\\.? \\d{1,2}\\b|\\b\\d{1,2}/\\d{1,2}(/\\d+)?\\b|\\d{4}-\\d\\d-\\d\\d|\\b(${MONTH_WORDS}) \\d{1,2}\\b|\\b\\d{1,2} (${MONTH_WORDS})\\b`)),
}
/** A Back or Close control drawn by hand: data-action="back" with words or marks that say so (a Cancel is no Back). */
const backByHand = (h: string) => [...h.matchAll(/<(a|button)\b[^>]*data-action\s*=\s*["']back["'][^>]*>([\s\S]*?)<\/\1>/gi)]
  .some((m) => /back|close|‹|←|✕|×|&lsaquo;|&larr;|&times;/i.test(m[2]!))

export const nicesnoreCheck: PaperCheck = {
  needs: {
    'tab-bar': (s) => s !== 'recording',
    back: (s) => !SNORE_TABS.includes(s),
    'watch-status': (s) => ['home', 'recording', 'settings'].includes(s),
  },
  redrawn: {
    'tab-bar': (h) => hits(h, SNORE_TABS) >= 3,
    back: backByHand,
    'watch-status': (_h, t) => /watch (is )?paired|mic on/i.test(t),
  },
  rules: {
    'score-direction': {
      // Only screens that say which way the score goes; a colour alone is read by hand.
      fits: (_h, t) => /(higher|lower|more snoring|less snoring)[^.]{0,40}(better|worse|quiet|loud|snoring)/i.test(t) && /score/i.test(t),
      broken: (_h, t) => first(t, /higher[^.,;]{0,20}\b(is|=|means)\s+(better|quieter|good)|lower[^.,;]{0,20}\b(is|=|means)\s+(worse|louder|bad)/i),
    },
    'on-off-switches': {
      fits: (h) => /type=["']?checkbox/i.test(h),
      broken: (h) => [...h.matchAll(/<input\b[^>]*type=["']?checkbox[^>]*>/gi)].map((m) => m[0]).find((i) => !/role=["']switch/i.test(i)) ?? null,
    },
    durations: {
      fits: (_h, t) => /\b\d+\s*(h|hr|hrs|hours?|min|mins|minutes?)\b|\b\d+h\s?\d+m\b/i.test(t),
      broken: (_h, t) => first(t, /\b\d+(\.\d+)?\s*(hr|hrs|hours?)\b|\b\d+h\s?\d+m\b|\b\d+\s*(mins|minutes)\b|\b\d+m\b/i),
    },
    dates: DATES,
    clock: {
      fits: (_h, t) => /\b\d{1,2}:\d\d\b|\b\d{1,2}\s?(am|pm)\b/i.test(t),
      broken: (_h, t) => first(t, /\b\d{1,2}(:\d\d)?\s?(am|pm)\b/i),
    },
  },
  items: { nights: /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w* \d{1,2} (Oct|Nov)\b/gi },
}

// Sales dashboard -----------------------------------------------------------------------------------

const DASH_NAV = ['overview', 'orders', 'products', 'stock', 'customers', 'reports']

export const dashboard: Paper = {
  app: 'A sales dashboard for a small online shop: revenue, orders, top products and low stock alerts',
  device: 'desktop',
  screens: [
    { id: 'overview', line: 'revenue, orders and alerts at a glance', html: `<title>Overview</title>
<div style="display:grid;grid-template-columns:180px 1fr;gap:1.5rem">
<div data-component="side-nav"></div>
<section>
<div style="display:flex;justify-content:space-between;align-items:center"><h1>Overview</h1><div data-component="date-range"></div></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
<article><small>Revenue</small><h2>$4,480.00</h2><small>▲ 12%</small></article>
<article><small>Orders</small><h2>52</h2><small>▲ 4%</small></article>
<article><small>Low stock</small><h2>3</h2><a data-action="@stock">See stock</a></article>
</div>
<h3>Latest orders</h3>
<table><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>
<tr><td><a data-action="@order-details">#1042</a></td><td>6 Nov 2026</td><td>$84.00</td><td>Paid</td></tr>
<tr><td><a data-action="@order-details">#1041</a></td><td>6 Nov 2026</td><td>$212.50</td><td>Packed</td></tr>
</tbody></table>
<a data-action="@orders">All orders</a>
</section>
</div>` },
    { id: 'orders', line: 'every order, newest first, with a status filter', html: `<title>Orders</title>
<div style="display:grid;grid-template-columns:180px 1fr;gap:1.5rem">
<div data-component="side-nav"></div>
<section>
<div style="display:flex;justify-content:space-between;align-items:center"><h1>Orders</h1><div data-component="date-range"></div></div>
<select id="f"><option>All statuses</option><option>Paid</option><option>Packed</option><option>Shipped</option><option>Refunded</option></select>
<table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody id="rows">
<tr><td><a data-action="@order-details">#1042</a></td><td>6 Nov 2026</td><td>Mia Chen</td><td>$84.00</td><td>Paid</td></tr>
<tr><td><a data-action="@order-details">#1041</a></td><td>6 Nov 2026</td><td>Omar Haddad</td><td>$212.50</td><td>Packed</td></tr>
<tr><td><a data-action="@order-details">#1040</a></td><td>5 Nov 2026</td><td>Lena Novak</td><td>$39.90</td><td>Shipped</td></tr>
<tr><td><a data-action="@order-details">#1038</a></td><td>4 Nov 2026</td><td>Ada Brown</td><td>$64.00</td><td>Refunded</td></tr>
</tbody></table>
</section>
</div>
<script>
document.getElementById('f').addEventListener('input', (e) => {
  for (const r of document.querySelectorAll('#rows tr')) r.hidden = e.target.selectedIndex > 0 && r.cells[4].textContent !== e.target.value
})
</script>` },
    { id: 'order-details', line: "one order: its items, customer and shipping" },
    { id: 'products', line: 'products ranked by revenue' },
    { id: 'stock', line: 'stock levels, low stock first' },
    { id: 'customers', line: 'customers by total spent' },
    { id: 'reports', line: 'revenue by week or month, to export' },
  ],
  components: [
    { id: 'side-nav', where: 'the left column of every screen', html: `<aside><nav><ul>
<li><a data-action="@overview">Overview</a></li>
<li><a data-action="@orders">Orders</a></li>
<li><a data-action="@products">Products</a></li>
<li><a data-action="@stock">Stock</a></li>
<li><a data-action="@customers">Customers</a></li>
<li><a data-action="@reports">Reports</a></li>
</ul></nav></aside>` },
    { id: 'date-range', where: 'at the top right of overview, orders, products and reports', html: `<select aria-label="Date range">
<option>Last 7 days</option><option selected>Last 30 days</option><option>This year</option>
</select>` },
    { id: 'back', where: 'at the top left of every screen that the side nav does not open', html: '<a data-action="back">← Back</a>' },
  ],
  rules: [
    { id: 'money', text: 'Money shows a dollar sign and two decimals, like $1,240.00.' },
    { id: 'low-stock', text: 'Stock under 10 units is low and shows in red.' },
    { id: 'order-status', text: "An order's status is one of Paid, Packed, Shipped or Refunded." },
    { id: 'dates', text: 'Dates read like 6 Nov 2026.' },
    { id: 'change', text: 'A change against the previous period reads like ▲ 12% or ▼ 4%.' },
  ],
  data: [
    { id: 'orders', rows: [
      ['order', 'date', 'customer', 'total', 'status'],
      ['#1042', '6 Nov 2026', 'Mia Chen', '$84.00', 'Paid'],
      ['#1041', '6 Nov 2026', 'Omar Haddad', '$212.50', 'Packed'],
      ['#1040', '5 Nov 2026', 'Lena Novak', '$39.90', 'Shipped'],
      ['#1039', '5 Nov 2026', 'Sam Ortiz', '$129.00', 'Shipped'],
      ['#1038', '4 Nov 2026', 'Ada Brown', '$64.00', 'Refunded'],
    ] },
    { id: 'products', rows: [
      ['product', 'price', 'sold', 'revenue', 'stock'],
      ['Linen tote', '$32.00', '41', '$1,312.00', '6'],
      ['Ceramic mug', '$18.00', '64', '$1,152.00', '23'],
      ['Beeswax candle', '$24.00', '38', '$912.00', '4'],
      ['Cotton apron', '$36.00', '19', '$684.00', '12'],
      ['Oak coaster set', '$28.00', '15', '$420.00', '9'],
    ] },
  ],
}

/** The products under 10 units in the products table, with their stock. */
const LOW: Record<string, string> = { 'Linen tote': '6', 'Beeswax candle': '4', 'Oak coaster set': '9' }
/** The smallest row element that holds a low product's name, for each low product drawn in markup. */
function lowRows(h: string) {
  const out: { name: string; row: string }[] = []
  if (!/stock/i.test(h)) return out
  for (const [name, units] of Object.entries(LOW)) {
    const rows = [...h.matchAll(/<(tr|li|article|p)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((m) => m[0]).filter((r) => r.includes(name) && !/<(tr|li|article)\b[\s\S]*<(tr|li|article)\b/i.test(r.slice(1)))
    const row = rows.sort((a, b) => a.length - b.length)[0]
    if (row && new RegExp(`(^|[^\\d.,$])${units}(?![\\d.,])`).test(row.replace(/<[^>]+>/g, ' ').replace(/\$[\d,.]+/g, ''))) out.push({ name, row })
  }
  return out
}
/** Red text or a red mark: a named red, var(--pico-del-color), or a hex colour that is mostly red. */
function isRed(html: string): boolean {
  if (/\b(red|crimson|firebrick|tomato|darkred|indianred)\b|--pico-del-color|--pico-color-red/i.test(html)) return true
  return [...html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].some((m) => {
    const x = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16))
    return r! > 140 && g! < 110 && b! < 110
  })
}

export const dashboardCheck: PaperCheck = {
  needs: {
    'side-nav': () => true,
    'date-range': (s) => ['overview', 'orders', 'products', 'reports'].includes(s),
    back: (s) => !DASH_NAV.includes(s),
  },
  redrawn: {
    'side-nav': (h) => hits(h, DASH_NAV) >= 4,
    'date-range': (_h, t) => /last 7 days|last 30 days/i.test(t),
    back: backByHand,
  },
  rules: {
    money: {
      fits: (_h, t) => /\$\s?\d|\d\s?(USD|dollars)\b/.test(t),
      broken: (_h, t) => first(t, /\$\s?\d[\d,]*(?!\.\d\d)(?![\d,])(?!\.\d)|\$\s?\d[\d,]*\.\d(?!\d)|\$\s?\d+(\.\d+)?\s?[kKmM]\b|\$\d{4,}(?![\d,])/),
    },
    'low-stock': {
      // Each product with stock under 10 whose row (tr, li, article or p) is in the markup: is the row red?
      fits: (h) => lowRows(h).length > 0,
      broken: (h) => lowRows(h).find((r) => !isRed(r.row))?.name ?? null,
    },
    'order-status': {
      fits: (_h, t) => /\b(paid|packed|shipped|refunded|pending|processing|delivered|cancell?ed|fulfilled|unfulfilled|on hold)\b/i.test(t),
      broken: (_h, t) => first(t, /\b(pending|processing|delivered|cancell?ed|fulfilled|unfulfilled|on hold|completed?)\b/i),
    },
    dates: DATES,
    change: {
      fits: (_h, t) => /[+\-−▲▼↑↓]\s?\d+(\.\d+)?\s?%/.test(t),
      broken: (_h, t) => first(t, /(?<![▲▼]\s?)(?<![▲▼])[+\-−↑↓]\s?\d+(\.\d+)?\s?%/),
    },
  },
  items: { orders: /#\d{3,5}\b/g },
}

// Space mining game ---------------------------------------------------------------------------------

export const game: Paper = {
  app: 'A space mining game where you fly a small ship between asteroids, upgrade it and sell the ore',
  device: 'phone',
  screens: [
    { id: 'home', line: 'the title screen: play, hangar and settings', html: `<title>Title screen</title>
<h1 style="text-align:center">Rock Hauler</h1>
<p style="text-align:center"><small>Belt 3 · 1,250 cr saved</small></p>
<button data-action="@asteroid-field">Launch</button>
<button data-action="@hangar">Hangar</button>
<button data-action="@settings">Settings</button>` },
    { id: 'asteroid-field', line: 'flying among asteroids and mining them with a laser', html: `<title>Asteroid field</title>
<div data-component="status-bar"></div>
<svg viewBox="0 0 360 360" width="100%" role="img" aria-label="Asteroid field">
<rect width="360" height="360" fill="#0b1020"/>
<circle cx="80" cy="90" r="26" fill="#8a7f72"/><text x="80" y="95" font-size="11" text-anchor="middle" fill="#fff">iron</text>
<circle cx="250" cy="140" r="34" fill="#6f8aa0"/><text x="250" y="145" font-size="11" text-anchor="middle" fill="#fff">cobalt</text>
<polygon points="180,300 168,330 192,330" fill="#ffd166"/>
</svg>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
<button id="mine">Mine</button>
<button data-action="@station">Dock at station</button>
</div>
<script>
document.getElementById('mine').addEventListener('click', (e) => { e.target.textContent = 'Mining… +1 t iron' })
</script>` },
    { id: 'station', line: 'the space station: sell ore, buy upgrades, repair' },
    { id: 'market', line: "sell ore for credits at today's prices" },
    { id: 'hangar', line: 'the ship and its upgrades' },
    { id: 'settings', line: 'sound, vibration and controls' },
    { id: 'star-map', line: 'pick the next asteroid belt to fly to' },
  ],
  components: [
    { id: 'status-bar', where: 'at the top of every screen except home and settings', html: `<p style="display:flex;justify-content:space-between"><small>◆ 1,250 cr</small><small>Cargo 18/40 t</small><small>Hull 85%</small></p>` },
    { id: 'close', where: 'at the top right of every screen except home and asteroid-field', html: '<a data-action="back" style="float:right">✕ Close</a>' },
  ],
  rules: [
    { id: 'credits', text: 'Money is credits, shown like 1,250 cr.' },
    { id: 'ore-kinds', text: 'Ore is iron, nickel, cobalt or iridium; iridium is the rarest.' },
    { id: 'cargo', text: 'Cargo shows as used and limit in tons, like 18/40 t.' },
    { id: 'danger-red', text: 'Red means danger to the ship and nothing else.' },
    { id: 'hull', text: 'Hull shows as a percentage, like Hull 85%.' },
  ],
  data: [
    { id: 'ore-prices', rows: [
      ['ore', 'price per ton', 'in cargo'],
      ['iron', '12 cr', '10 t'],
      ['nickel', '20 cr', '5 t'],
      ['cobalt', '45 cr', '3 t'],
      ['iridium', '120 cr', '0 t'],
    ] },
    { id: 'upgrades', rows: [
      ['upgrade', 'level', 'next cost', 'effect'],
      ['laser', '2', '600 cr', 'mines 20% faster'],
      ['cargo hold', '1', '400 cr', '+20 t cargo'],
      ['hull plating', '1', '500 cr', '+25% hull'],
      ['engine', '3', '900 cr', 'flies 15% faster'],
    ] },
  ],
}

export const gameCheck: PaperCheck = {
  needs: {
    'status-bar': (s) => !['home', 'settings'].includes(s),
    close: (s) => !['home', 'asteroid-field'].includes(s),
  },
  redrawn: {
    'status-bar': (_h, t) => /1,250\s?cr/i.test(t) && /18\s?\/\s?40/.test(t),
    close: backByHand,
  },
  rules: {
    credits: {
      fits: (_h, t) => /\d\s?(cr|credits?|coins?|gold|c)\b|[$¢₵]\s?\d/i.test(t),
      broken: (_h, t) => first(t, /[$¢₵]\s?\d[\d,.]*|\d[\d,.]*\s?(credits?|coins?|gold|c)\b|\b\d{4,}\s?cr\b/i),
    },
    'ore-kinds': {
      fits: (_h, t) => /\b(ore|iron|nickel|cobalt|iridium|gold|platinum|titanium|silver|copper|uranium|ice|crystal|helium|lithium|palladium)\b/i.test(t),
      broken: (_h, t) => first(t, /\b(gold|platinum|titanium|silver|copper|uranium|crystals?|helium(-3)?|lithium|palladium|quartz|carbon|silicon|water ice|ice)\b/i),
    },
    cargo: {
      // The cargo load, not the cargo hold upgrade or one ore's tons.
      fits: (_h, t) => /(?<!\bin |t )\bcargo\b(?! hold)\W{0,3}(\d|used|full|load)|\d+\s?(t|tons?)\s?(of|\/)\s?\d+/i.test(t),
      broken: (_h, t) => !/\d+\s?\/\s?\d+\s?t\b/.test(t) ? (first(t, /cargo[^.]{0,30}|\d+\s?(t|tons?)\s?(of|\/)\s?\d+/i) ?? 'cargo') : null,
    },
    hull: {
      // The hull's state, not the hull plating upgrade or a hull damage warning.
      fits: (_h, t) => /\bhull\b(?! plating)\W{0,3}(integrity|health|status|strength)?\W{0,3}\d|\d+\s?%?\s?hull\b/i.test(t),
      broken: (_h, t) => !/hull[^.%]{0,30}\d+\s?%|\d+\s?%\W{0,10}hull/i.test(t) ? (first(t, /hull[^.]{0,30}/i) ?? 'hull') : null,
    },
  },
  items: {},
}

export const PAPERS = {
  nicesnore: { paper: nicesnore, check: nicesnoreCheck },
  dashboard: { paper: dashboard, check: dashboardCheck },
  game: { paper: game, check: gameCheck },
} as const
export type PaperId = keyof typeof PAPERS
