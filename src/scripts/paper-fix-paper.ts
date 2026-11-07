// The papers of the Fix part (process/plans/2026-11-06-paper-canvas.md, step 1), each with 10
// planted mistakes: NiceSnore with 12 drawn screens (taken from Draw round r1 and cleaned by hand),
// and a held-out dashboard with 10. FIX_CASES gives each paper's answer key; the check in
// paper-fix-test.ts reads replies against it. No model sees the keys.

import { numberParts, type Paper } from './paper-test-lib.ts'

const banner = `<article>
<p>🎙 Tonight's recording starts at 23:00.</p>
<button data-action="@recording">Start now</button>
</article>`

export const fixPaper: Paper = {
  app: 'NiceSnore: a snore app with recording as main function (phone+watch), snore score and history, log of tried remedies etc.',
  device: 'phone',
  screens: [
    { id: 'home', line: "tonight's recording and last night's score", html: `<title>Tonight</title>
<h1>Good evening, Alex</h1>
<div data-component="watch-status"></div>
${banner}
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
    { id: 'sleep-summary', line: "one night's score and a timeline of snoring episodes", html: `<title>Night summary</title>
<div data-component="back"></div>
<h1>Mon 3 Nov</h1>
<article style="text-align:center">
<h2>Snore score</h2>
<p><mark>34</mark></p>
<p>Higher is better: a quiet night scores high.</p>
<p>Snoring: 1 h 20 min</p>
</article>
<h2>Snoring timeline</h2>
<ul>
<li><strong>23:10–23:35</strong> · snoring episode</li>
<li><strong>01:40–02:05</strong> · snoring episode</li>
<li><strong>04:20–04:50</strong> · snoring episode</li>
</ul>
<div data-component="tab-bar"></div>` },
    { id: 'history', line: 'every recorded night, newest first', html: `<title>History</title>
<h1>History</h1>
${banner}
<table>
<thead><tr><th>Night</th><th>Score</th><th>Snoring</th></tr></thead>
<tbody>
<tr><td><a data-action="@sleep-summary">Mon 3 Nov</a></td><td>34</td><td>1 h 20 min</td></tr>
<tr><td><a data-action="@sleep-summary">Sun 2 Nov</a></td><td>58</td><td>3 h 05 min</td></tr>
<tr><td><a data-action="@sleep-summary">Sat 1 Nov</a></td><td>41</td><td>2 h 10 min</td></tr>
<tr><td><a data-action="@sleep-summary">Fri 31 Oct</a></td><td>27</td><td>50 min</td></tr>
<tr><td><a data-action="@sleep-summary">Thu 30 Oct</a></td><td>66</td><td>3 h 40 min</td></tr>
</tbody>
</table>
<nav>
<a data-action="@home">Tonight</a>
<a data-action="@history">History</a>
<a data-action="@remedies">Remedies</a>
<a data-action="@settings">Settings</a>
</nav>` },
    { id: 'remedies', line: 'the remedies the user has tried and how well each worked', html: `<title>Remedies</title>
<h1>Remedies</h1>
<p>Lower scores mean less snoring.</p>
${banner}
<table>
<thead><tr><th>Remedy</th><th>Started</th><th>Nights</th><th>Avg score</th></tr></thead>
<tbody>
<tr><td><a data-action="@remedy-details">Nasal strips</a></td><td>Sat 1 Nov</td><td>3</td><td>39</td></tr>
<tr><td><a data-action="@remedy-details">Side sleeping</a></td><td>Fri 24 Oct</td><td>6</td><td>31</td></tr>
<tr><td><a data-action="@remedy-details">Chin strap</a></td><td>Mon 13 Oct</td><td>4</td><td>52</td></tr>
<tr><td><a data-action="@remedy-details">No alcohol</a></td><td>Mon 6 Oct</td><td>5</td><td>44</td></tr>
</tbody>
</table>
<button data-action="@remedy-add">Log a remedy</button>
<div data-component="tab-bar"></div>` },
    { id: 'remedy-details', line: 'one remedy: its nights and their scores', html: `<title>Remedy details</title>
<div data-component="back"></div>
<h1>Nasal strips</h1>
<p><small>Started Sat 1 Nov · 3 nights · average score 39. Lower score is better.</small></p>
<div data-component="remedy-chart"></div>
<table>
<thead><tr><th>Night</th><th>Score</th><th>Snoring</th></tr></thead>
<tbody>
<tr><td><a data-action="@sleep-summary">Mon 3 Nov</a></td><td>34</td><td>1 h 20 min</td></tr>
<tr><td><a data-action="@sleep-summary">Sun 2 Nov</a></td><td>58</td><td>3 h 05 min</td></tr>
<tr><td><a data-action="@sleep-summary">Sat 1 Nov</a></td><td>41</td><td>2 h 10 min</td></tr>
</tbody>
</table>
<div data-component="tab-bar"></div>` },
    { id: 'remedy-add', line: 'form to log a new remedy', html: `<title>Log a remedy</title>
<div data-component="back"></div>
<h1>Log a remedy</h1>
<form>
<label>Remedy
<select><option>Nasal strips</option><option>Side sleeping</option><option>Chin strap</option><option>No alcohol</option></select>
</label>
<label>Starts <input type="date" value="2026-11-03"></label>
<button type="button" data-action="@remedies">Log for tonight</button>
</form>
<div data-component="tab-bar"></div>` },
    { id: 'settings', line: 'recording and reminder options', html: `<title>Settings</title>
<h1>Settings</h1>
<div data-component="watch-status"></div>
<article>
<h2>Recording</h2>
<label><input type="checkbox" role="switch" checked> Record snoring automatically</label>
<label><input type="checkbox" role="switch" checked> Use the phone microphone</label>
</article>
<article>
<h2>Reminders</h2>
<label><input type="checkbox" role="switch" checked> Bedtime reminder</label>
<label>Remind me at <input type="time" value="22:30"></label>
</article>
<div data-component="tab-bar"></div>` },
    { id: 'profile', line: 'name, sleep goal and account', html: `<title>Profile</title>
<div data-component="back"></div>
<h1>Profile</h1>
<article>
<p><strong>Name</strong><br>Alex Morgan</p>
<a data-action="@edit-name">Edit name</a>
</article>
<article>
<p><strong>Sleep goal</strong><br>8 h</p>
<a data-action="@sleep-goal">Change goal</a>
</article>
<article>
<p><strong>Email</strong><br>alex.morgan@example.com</p>
<a data-action="@account">Manage account</a>
</article>
<button>Sign out</button>
<div data-component="tab-bar"></div>` },
    { id: 'sleep-goal', line: 'set the nightly sleep goal', html: `<title>Sleep goal</title>
<div data-component="back"></div>
<h1>Sleep goal</h1>
<fieldset>
<legend>Hours of sleep each night</legend>
<label><input type="radio" name="goal"> 7 h</label>
<label><input type="radio" name="goal" checked> 8 h</label>
<label><input type="radio" name="goal"> 9 h</label>
</fieldset>
<button data-action="@profile">Save goal</button>
<div data-component="tab-bar"></div>` },
    { id: 'account', line: 'the signed-in account', html: `<title>Account</title>
<div data-component="back"></div>
<h1>Account</h1>
<p>Signed in as alex.morgan@example.com</p>
<a data-action="@edit-name">Change name</a>
<a data-action="@profile">Profile and sleep goal</a>
<div data-component="tab-bar"></div>` },
    { id: 'edit-name', line: 'change the name shown on the profile', html: `<title>Edit name</title>
<div data-component="back-link"></div>
<h1>Edit name</h1>
<label>Name <input type="text" value="Alex Morgan"></label>
<button data-action="@profile" style="width:100%">Save name</button>
<div data-component="tab-bar"></div>` },
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
    { id: 'remedy-chart', where: 'on remedy-details, under the heading', html: `<svg viewBox="0 0 330 100" width="100%" role="img" aria-label="Score per night">
<polyline points="30,40 165,30 300,48" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>` },
    { id: 'back-link', where: 'at the top left of the screens below a tab screen', html: '<a data-action="back">‹ Back</a>' },
  ],
  rules: [
    { id: 'durations', text: 'Durations read like 2 h 15 min.' },
    { id: 'dates', text: 'Dates read like Mon 3 Nov.' },
    { id: 'clock', text: 'Times of day use the 24-hour clock, like 23:10. (by the user)' },
    { id: 'on-off-switches', text: 'On/off settings are switches, never checkboxes.' },
    { id: 'time-lengths', text: 'Show a length of time in hours and minutes, like 2 h 15 min.' },
    { id: 'edit-name-button', text: 'The Save button on edit-name is full width.' },
    { id: 'settings-checkboxes', text: 'Settings use checkboxes.' },
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
    { id: 'devices', rows: [
      ['device', 'model', 'battery'],
      ['phone', 'Pixel 9', '64%'],
      ['watch', 'Galaxy Watch 7', '80%'],
    ] },
  ],
}

/** One parsed line of a fixer's reply. */
export interface Op { op: 'merge' | 'remove' | 'add-rule' | 'add-component' | 'redraw' | 'note' | 'bad'; a: string; b: string; text: string; line: string }

/** A planted mistake and the replies that repair it. */
export interface Planted { n: number; what: string; repaired: (ops: Op[]) => boolean }

/**
 * A paper for the Fix part with its answer key: the planted mistakes, the entries that are right
 * (removing, merging away or adding over one is damage), the screens with nothing planted, and
 * redraws that would make a screen wrong (also damage).
 */
export interface FixCase { paper: Paper; planted: Planted[]; good: string[]; clean: string[]; harm: { screen: string; re: RegExp }[] }

const has = (ops: Op[], f: (o: Op) => boolean) => ops.some(f)
const merged = (ops: Op[], from: string, into?: string) => has(ops, (o) => o.op === 'merge' && o.a === from && (!into || o.b === into))
const removed = (ops: Op[], id: string) => has(ops, (o) => o.op === 'remove' && o.a === id)
const gone = (ops: Op[], id: string) => removed(ops, id) || merged(ops, id)
const redrawn = (ops: Op[], screen: string, re: RegExp) => has(ops, (o) => o.op === 'redraw' && o.a === screen && re.test(o.text))
const noted = (ops: Op[], re: RegExp) => has(ops, (o) => o.op === 'note' && re.test(o.text))

/** The part number of a card drawn by hand on several screens, per screen. */
function partsOf(p: Paper, screens: string[], marker: string): Record<string, number> {
  return Object.fromEntries(screens.map((id) => {
    const html = numberParts(p.screens.find((s) => s.id === id)!.html!)
    return [id, Number(html.match(new RegExp(`<article data-part="(\\d+)">\\s*<p data-part="\\d+">${marker}`))![1])]
  }))
}
const addedFrom = (ops: Op[], parts: Record<string, number>) => has(ops, (x) => x.op === 'add-component' && parts[x.b] === Number(x.text))

// NiceSnore, as rounds 1 and 2 ran it. The contradiction there had the newer rule as the wrong one,
// and the manual says the later rule wins, so dropping either rule counts as the repair.
const snoreBanner = partsOf(fixPaper, ['home', 'history', 'remedies'], '🎙')
const snorePlanted = (eighth: Planted): Planted[] => [
  { n: 1, what: 'two rules say one thing: time-lengths doubles durations', repaired: (o) => gone(o, 'time-lengths') },
  { n: 2, what: 'a rule about one screen: edit-name-button', repaired: (o) => gone(o, 'edit-name-button') },
  { n: 3, what: 'a component only one screen uses: remedy-chart', repaired: (o) => gone(o, 'remedy-chart') },
  { n: 4, what: 'history draws the tab bar by hand', repaired: (o) => redrawn(o, 'history', /tab|nav/i) },
  { n: 5, what: 'sleep-summary says higher is better, remedies (newer) says lower is better', repaired: (o) =>
    has(o, (x) => x.op === 'add-rule' && /(higher|more)[^.]*(worse|bad)|lower[^.]*(better|less snoring)/i.test(x.text) && !/higher[^.]*better/i.test(x.text))
    || redrawn(o, 'sleep-summary', /lower|higher[^.]*worse/i) },
  { n: 6, what: 'Sign out on profile leads nowhere', repaired: (o) => redrawn(o, 'profile', /sign.?out/i) || noted(o, /sign.?out/i) },
  { n: 7, what: 'the table devices is used by no screen', repaired: (o) => gone(o, 'devices') },
  eighth,
  { n: 9, what: 'the tonight card is drawn by hand on home, history and remedies', repaired: (o) => addedFrom(o, snoreBanner) },
  { n: 10, what: 'two components say one thing: back-link doubles back', repaired: (o) => gone(o, 'back-link') },
]
const SNORE_GOOD = ['tab-bar', 'back', 'watch-status', 'durations', 'dates', 'clock', 'nights', 'remedies']
const SNORE_CLEAN = ['recording', 'remedy-add', 'settings', 'sleep-goal', 'account']

/** Round 3 on: the same paper with the contradicting rule moved up, so the older rule is the wrong one. */
const fixPaper2: Paper = {
  ...fixPaper,
  rules: ['durations', 'dates', 'settings-checkboxes', 'clock', 'on-off-switches', 'time-lengths', 'edit-name-button']
    .map((id) => fixPaper.rules.find((r) => r.id === id)!),
}

// The dashboard, held out: no manual change was tried on it. The same ten kinds of mistake.
const dashNav = '<div data-component="side-nav"></div>'
const lowCard = `<article>
<p>⚠ 3 products are low on stock.</p>
<a data-action="@stock">See stock</a>
</article>`
const grid = (body: string) => `<div style="display:grid;grid-template-columns:180px 1fr;gap:1.5rem">\n${dashNav}\n<section>\n${body}\n</section>\n</div>`
const head = (h1: string, range = true) => `<div style="display:flex;justify-content:space-between;align-items:center"><h1>${h1}</h1>${range ? '<div data-component="date-range"></div>' : ''}</div>`

export const dashFixPaper: Paper = {
  app: 'A sales dashboard for a small online shop: revenue, orders, top products and low stock alerts',
  device: 'desktop',
  screens: [
    { id: 'overview', line: 'revenue, orders and alerts at a glance', html: `<title>Overview</title>\n${grid(`${head('Overview')}
${lowCard}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
<article><small>Revenue</small><h2>$4,480.00</h2><small>▲ 12%</small></article>
<article><small>Orders</small><h2>52</h2><small>▲ 4%</small></article>
</div>
<a data-action="@orders">All orders</a>`)}` },
    { id: 'orders', line: 'every order, newest first', html: `<title>Orders</title>\n${grid(`${head('Orders')}
${lowCard}
<table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>
<tr><td><a data-action="@order-details">#1042</a></td><td>6 Nov 2026</td><td>Mia Chen</td><td>$84.00</td><td>Paid</td></tr>
<tr><td><a data-action="@order-details">#1041</a></td><td>6 Nov 2026</td><td>Omar Haddad</td><td>$212.50</td><td>Packed</td></tr>
<tr><td><a data-action="@order-details">#1040</a></td><td>5 Nov 2026</td><td>Lena Novak</td><td>$39.90</td><td>Shipped</td></tr>
</tbody></table>`)}` },
    { id: 'order-details', line: 'one order: its items, customer and status', html: `<title>Order details</title>\n${grid(`<div data-component="back"></div>
<h1>Order #1042</h1>
<p>6 Nov 2026 · Paid</p>
<table><thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead><tbody>
<tr><td>Linen tote</td><td>1</td><td>$32.00</td></tr>
<tr><td>Ceramic mug</td><td>2</td><td>$36.00</td></tr>
</tbody></table>
<p>Customer: <a data-action="@customer-details">Mia Chen</a></p>`)}` },
    { id: 'products', line: 'products ranked by revenue', html: `<title>Products</title>\n${grid(`${head('Products')}
${lowCard}
<p><small>Low stock means under 5 units.</small></p>
<table><thead><tr><th>Product</th><th>Revenue</th><th>Stock</th></tr></thead><tbody>
<tr><td><a data-action="@product-details">Linen tote</a></td><td>$1,312.00</td><td>6</td></tr>
<tr><td><a data-action="@product-details">Ceramic mug</a></td><td>$1,152.00</td><td>23</td></tr>
<tr><td><a data-action="@product-details">Beeswax candle</a></td><td>$912.00</td><td style="color:red">4 · low</td></tr>
<tr><td><a data-action="@product-details">Oak coaster set</a></td><td>$420.00</td><td>9</td></tr>
</tbody></table>`)}` },
    { id: 'product-details', line: 'one product: price, sales and stock', html: `<title>Product details</title>\n${grid(`<div data-component="back"></div>
<h1>Linen tote</h1>
<p>$32.00 · 41 sold · $1,312.00 revenue</p>
<p style="color:red">6 in stock · low</p>`)}` },
    { id: 'stock', line: 'stock levels, low stock first', html: `<title>Stock</title>
<div style="display:grid;grid-template-columns:180px 1fr;gap:1.5rem">
<aside><nav><ul>
<li><a data-action="@overview">Overview</a></li>
<li><a data-action="@orders">Orders</a></li>
<li><a data-action="@products">Products</a></li>
<li><a data-action="@stock">Stock</a></li>
<li><a data-action="@customers">Customers</a></li>
<li><a data-action="@reports">Reports</a></li>
</ul></nav></aside>
<section>
<h1>Stock</h1>
<p><small>Low stock means under 10 units.</small></p>
<table><thead><tr><th>Product</th><th>Units</th></tr></thead><tbody>
<tr><td>Beeswax candle</td><td style="color:red">4</td></tr>
<tr><td>Linen tote</td><td style="color:red">6</td></tr>
<tr><td>Oak coaster set</td><td style="color:red">9</td></tr>
<tr><td>Ceramic mug</td><td>23</td></tr>
</tbody></table>
</section>
</div>` },
    { id: 'customers', line: 'customers by total spent', html: `<title>Customers</title>\n${grid(`<h1>Customers</h1>
<table><thead><tr><th>Customer</th><th>Orders</th><th>Total spent</th></tr></thead><tbody>
<tr><td><a data-action="@customer-details">Mia Chen</a></td><td>8</td><td>$1,248.00</td></tr>
<tr><td><a data-action="@customer-details">Omar Haddad</a></td><td>6</td><td>$986.50</td></tr>
</tbody></table>
<button>Email customers</button>`)}` },
    { id: 'customer-details', line: 'one customer and their orders', html: `<title>Customer details</title>\n${grid(`<div data-component="return-link"></div>
<h1>Mia Chen</h1>
<p>mia.chen@example.com · 8 orders · $1,248.00</p>
<table><thead><tr><th>Order</th><th>Date</th><th>Total</th></tr></thead><tbody>
<tr><td><a data-action="@order-details">#1042</a></td><td>6 Nov 2026</td><td>$84.00</td></tr>
</tbody></table>`)}` },
    { id: 'reports', line: 'revenue by week, to export', html: `<title>Reports</title>\n${grid(`<div style="display:flex;justify-content:space-between;align-items:center"><h1>Reports</h1><div data-component="export-button"></div></div>
<table><thead><tr><th>Week</th><th>Revenue</th><th>Change</th></tr></thead><tbody>
<tr><td>2 to 8 Nov 2026</td><td>$1,120.00</td><td>▲ 12%</td></tr>
<tr><td>26 Oct to 1 Nov 2026</td><td>$1,000.00</td><td>▼ 4%</td></tr>
</tbody></table>`)}` },
    { id: 'store-settings', line: 'shop name and currency', html: `<title>Store settings</title>\n${grid(`<div data-component="back"></div>
<h1>Store settings</h1>
<label>Shop name <input value="Linen & Clay"></label>
<label>Currency <select><option>US dollar ($)</option></select></label>
<button data-action="@overview">Save</button>`)}` },
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
    { id: 'date-range', where: 'at the top right of overview, orders and products', html: '<select aria-label="Date range"><option>Last 7 days</option><option selected>Last 30 days</option></select>' },
    { id: 'back', where: 'at the top left of every screen that the side nav does not open', html: '<a data-action="back">← Back</a>' },
    { id: 'export-button', where: 'at the top right of reports', html: '<button>Export CSV</button>' },
    { id: 'return-link', where: 'at the top left of detail screens', html: '<a data-action="back">← Back</a>' },
  ],
  rules: [
    { id: 'money', text: 'Money shows a dollar sign and two decimals, like $1,240.00.' },
    { id: 'dates-us', text: 'Dates read like Nov 6, 2026.' },
    { id: 'order-status', text: "An order's status is one of Paid, Packed, Shipped or Refunded." },
    { id: 'dates', text: 'Dates read like 6 Nov 2026.' },
    { id: 'change', text: 'A change against the previous period reads like ▲ 12% or ▼ 4%. (by the user)' },
    { id: 'prices', text: 'Prices show the dollar sign and cents, like $32.00.' },
    { id: 'reports-export', text: 'The Export CSV button on reports sits to the right of the title.' },
  ],
  data: [
    { id: 'orders', rows: [
      ['order', 'date', 'customer', 'total', 'status'],
      ['#1042', '6 Nov 2026', 'Mia Chen', '$84.00', 'Paid'],
      ['#1041', '6 Nov 2026', 'Omar Haddad', '$212.50', 'Packed'],
      ['#1040', '5 Nov 2026', 'Lena Novak', '$39.90', 'Shipped'],
    ] },
    { id: 'products', rows: [
      ['product', 'price', 'sold', 'revenue', 'stock'],
      ['Linen tote', '$32.00', '41', '$1,312.00', '6'],
      ['Ceramic mug', '$18.00', '64', '$1,152.00', '23'],
      ['Beeswax candle', '$24.00', '38', '$912.00', '4'],
      ['Oak coaster set', '$28.00', '15', '$420.00', '9'],
    ] },
    { id: 'suppliers', rows: [
      ['supplier', 'country', 'lead time'],
      ['Flax & Co', 'Portugal', '3 weeks'],
      ['Kiln House', 'Mexico', '5 weeks'],
    ] },
  ],
}
const dashCard = partsOf(dashFixPaper, ['overview', 'orders', 'products'], '⚠')

export const FIX_CASES: Record<string, FixCase> = {
  'nicesnore-v1': {
    paper: fixPaper,
    planted: snorePlanted({ n: 8, what: 'settings-checkboxes (newer) contradicts on-off-switches', repaired: (o) => gone(o, 'settings-checkboxes') || gone(o, 'on-off-switches') }),
    good: SNORE_GOOD, clean: SNORE_CLEAN, harm: [],
  },
  nicesnore: {
    paper: fixPaper2,
    planted: snorePlanted({ n: 8, what: 'settings-checkboxes (older) contradicts on-off-switches', repaired: (o) => gone(o, 'settings-checkboxes') }),
    good: [...SNORE_GOOD, 'on-off-switches'], clean: SNORE_CLEAN, harm: [{ screen: 'settings', re: /(with|to|into|use) checkboxes|checkboxes instead/i }],
  },
  dashboard: {
    paper: dashFixPaper,
    planted: [
      { n: 1, what: 'two rules say one thing: prices doubles money', repaired: (o) => gone(o, 'prices') },
      { n: 2, what: 'a rule about one screen: reports-export', repaired: (o) => gone(o, 'reports-export') },
      { n: 3, what: 'a component only one screen uses: export-button', repaired: (o) => gone(o, 'export-button') },
      { n: 4, what: 'stock draws the side nav by hand', repaired: (o) => redrawn(o, 'stock', /nav|side/i) },
      { n: 5, what: 'products says low stock is under 5 units, stock (newer) says under 10', repaired: (o) =>
        has(o, (x) => x.op === 'add-rule' && /\b10\b/.test(x.text) && !/\b5\b/.test(x.text)) || redrawn(o, 'products', /\b10\b/) },
      { n: 6, what: 'Email customers on customers leads nowhere', repaired: (o) => redrawn(o, 'customers', /email/i) || noted(o, /email/i) },
      { n: 7, what: 'the table suppliers is used by no screen', repaired: (o) => gone(o, 'suppliers') },
      { n: 8, what: 'dates-us (older) contradicts dates', repaired: (o) => gone(o, 'dates-us') },
      { n: 9, what: 'the low stock card is drawn by hand on overview, orders and products', repaired: (o) => addedFrom(o, dashCard) },
      { n: 10, what: 'two components say one thing: return-link doubles back', repaired: (o) => gone(o, 'return-link') },
    ],
    good: ['side-nav', 'date-range', 'back', 'money', 'order-status', 'dates', 'change', 'orders', 'products'],
    clean: ['order-details', 'product-details', 'store-settings'],
    harm: [{ screen: '*', re: /\b(Nov|Oct) \d{1,2},|under 5\b/i }],
  },
}
