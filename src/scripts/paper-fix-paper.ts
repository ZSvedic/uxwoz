// The paper of the Fix part (process/plans/2026-11-06-paper-canvas.md, step 1): NiceSnore with 12
// drawn screens and 10 planted mistakes. The screens start from round r1 of the Draw part, cleaned
// by hand; then the mistakes went in. PLANTED says what each one is and what repairs it; the check
// in paper-fix-test.ts reads replies against it. No model sees PLANTED.

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

const has = (ops: Op[], f: (o: Op) => boolean) => ops.some(f)
const merged = (ops: Op[], from: string, into?: string) => has(ops, (o) => o.op === 'merge' && o.a === from && (!into || o.b === into))
const removed = (ops: Op[], id: string) => has(ops, (o) => o.op === 'remove' && o.a === id)
const gone = (ops: Op[], id: string) => removed(ops, id) || merged(ops, id)
const redrawn = (ops: Op[], screen: string, re: RegExp) => has(ops, (o) => o.op === 'redraw' && o.a === screen && re.test(o.text))
const noted = (ops: Op[], re: RegExp) => has(ops, (o) => o.op === 'note' && re.test(o.text))

/** The banner's part number on each of the three screens that draw it by hand. */
export const BANNER_PARTS: Record<string, number> = Object.fromEntries(['home', 'history', 'remedies'].map((id) => {
  const html = numberParts(fixPaper.screens.find((s) => s.id === id)!.html!)
  return [id, Number(html.match(/<article data-part="(\d+)">\s*<p data-part="\d+">🎙/)![1])]
}))

export const PLANTED: Planted[] = [
  { n: 1, what: 'two rules say one thing: time-lengths doubles durations', repaired: (o) => gone(o, 'time-lengths') },
  { n: 2, what: 'a rule about one screen: edit-name-button', repaired: (o) => gone(o, 'edit-name-button') },
  { n: 3, what: 'a component only one screen uses: remedy-chart', repaired: (o) => gone(o, 'remedy-chart') },
  { n: 4, what: 'history draws the tab bar by hand', repaired: (o) => redrawn(o, 'history', /tab|nav/i) },
  { n: 5, what: 'sleep-summary says higher is better, remedies (newer) says lower is better', repaired: (o) =>
    has(o, (x) => x.op === 'add-rule' && /(higher|more)[^.]*(worse|bad)|lower[^.]*(better|less snoring)/i.test(x.text) && !/higher[^.]*better/i.test(x.text))
    || redrawn(o, 'sleep-summary', /lower|higher[^.]*worse|direction|score/i) },
  { n: 6, what: 'Sign out on profile leads nowhere', repaired: (o) => redrawn(o, 'profile', /sign.?out/i) || noted(o, /sign.?out/i) },
  { n: 7, what: 'the table devices is used by no screen', repaired: (o) => gone(o, 'devices') },
  // The manual says the later rule wins, so dropping either side settles it; the screens all use switches.
  { n: 8, what: 'settings-checkboxes contradicts on-off-switches', repaired: (o) => gone(o, 'settings-checkboxes') || gone(o, 'on-off-switches') },
  { n: 9, what: "the tonight banner is drawn by hand on home, history and remedies", repaired: (o) =>
    has(o, (x) => x.op === 'add-component' && BANNER_PARTS[x.b] === Number(x.text)) },
  { n: 10, what: 'two components say one thing: back-link doubles back', repaired: (o) => gone(o, 'back-link') },
]

/** Entries that are right as they are: removing, merging away or adding over one is new damage. */
export const GOOD = ['tab-bar', 'back', 'watch-status', 'durations', 'dates', 'clock', 'nights', 'remedies']
/** Screens with no planted mistake: a redraw of one is counted apart, and read. */
export const CLEAN_SCREENS = ['recording', 'remedy-add', 'settings', 'sleep-goal', 'account']
