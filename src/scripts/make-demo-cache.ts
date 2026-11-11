// Writes tests/fixtures/demo-cache.json: a small made-up mockup (a habit tracker) for `bun run demo` and its test.
// Built through ScreenCache so the file format is right by construction. Run from src/: bun scripts/make-demo-cache.ts

import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { ScreenCache, type Version } from '@uxwoz/core'

export const DEMO_FILE = resolve(import.meta.dir, '../tests/fixtures/demo-cache.json')
export const DEMO_APP = 'A habit tracker for small daily habits'
/** Fixed, fake share tokens; they must be hex like real ones, as the app reads an edit link's token from its path. */
export const DEMO_TOKENS = { view: '0'.repeat(31) + '1', comment: '0'.repeat(31) + '2', edit: '0'.repeat(31) + '3' } as const
/** The visitor who left the pinned comment; put it in the player's storage as `uxwoz:visitor` to see it there. */
export const DEMO_VISITOR = 'dec0de0000000001'

/** A fixed clock, so the file comes out the same on every run: each new Date() is one minute after the last. */
function fixClock() {
  const RealDate = Date
  let tick = RealDate.parse('2026-11-01T09:00:00Z')
  globalThis.Date = class extends RealDate {
    constructor(...a: unknown[]) { if (a.length) super(...(a as [string])); else super((tick += 60_000)) }
    static now() { return tick }
  } as DateConstructor
}
const at = () => new Date().toISOString()

const ver = (html: string, extra: Partial<Version> = {}): Version => ({
  html, model: 'claude-haiku-5.5', servedModel: 'anthropic/claude-haiku-5.5', createdAt: at(),
  costUsd: 0, costEstimated: false, firstChunkMs: 900, totalMs: 4000, finishReason: 'stop', device: 'phone',
  name: html.match(/<title>([^<]*)/)?.[1], idea: html.match(/content="([^"]*)"/)?.[1], ...extra,
})

const TABS = '<div data-component="tab-bar"></div>'
const HOME = `<title>Today</title><meta name="idea" content="Today's habits as one checklist">
<h1>Today</h1>
<article><label><input type="checkbox" checked> Drink water</label> <a data-action="@habit-detail: one habit, its streak and history">Details</a></article>
<article><label><input type="checkbox"> Read 10 pages</label></article>
<article><label><input type="checkbox"> Stretch</label></article>
<button data-action="@add-habit: a form to add a habit">Add a habit</button>
<a data-action="@settings: reminders off, week starts Monday">Settings</a>
${TABS}`
const DETAIL_1 = `<title>Habit detail</title><meta name="idea" content="One habit with its streak">
<a data-action="back">Back</a>
<h1>Drink water</h1>
<p>Streak: 12 days</p>
<button>Check off today</button>
<a data-action="@reminders: when to remind me of this habit">Reminders</a>
${TABS}`
const DETAIL_2 = DETAIL_1.replace('<p>Streak: 12 days</p>', '<h2>12 days</h2><p>Current streak</p>')
const ADD = `<title>Add a habit</title><meta name="idea" content="A short form, one field per line">
<a data-action="back">Back</a>
<h1>Add a habit</h1>
<form><label>Name <input value="Walk"></label><label>Goal <select><option>Every day</option><option>Weekdays</option></select></label>
<button type="button" data-action="@home">Save</button></form>`
const STATS = `<title>Stats</title><meta name="idea" content="This week as bars, one per habit">
<h1>This week</h1>
<p>Drink water <progress value="6" max="7"></progress></p>
<p>Read 10 pages <progress value="3" max="7"></progress></p>
<a data-action="@habit-detail">Drink water</a>
<a data-action="@history: every past week, newest first">History</a>
${TABS}`
const REMINDERS = `<title>Reminders</title><meta name="idea" content="One time per habit">
<a data-action="back">Back</a>
<h1>Reminders</h1>
<label>Drink water <input type="time" value="09:00"></label>
<label><input type="checkbox" role="switch" checked> Remind me</label>`
const HISTORY_A = `<title>History</title><meta name="idea" content="Weeks as a table">
<a data-action="back">Back</a><h1>History</h1>
<table><tr><th>Week</th><th>Done</th></tr><tr><td>Oct 27</td><td>15 of 21</td></tr><tr><td>Oct 20</td><td>18 of 21</td></tr></table>`
const HISTORY_B = `<title>History</title><meta name="idea" content="Weeks as cards with a bar each">
<a data-action="back">Back</a><h1>History</h1>
<article>Oct 27 <progress value="15" max="21"></progress></article><article>Oct 20 <progress value="18" max="21"></progress></article>`
const TAB_BAR = '<nav><ul><li><a data-action="@home">Today</a></li><li><a data-action="@stats: this week, per habit">Stats</a></li></ul></nav>'

export function makeDemoCache(file: string): ScreenCache {
  rmSync(file, { force: true })
  const cache = new ScreenCache(file)
  const app = DEMO_APP
  const draw = (action: string | null, html: string, parent: { key: string; label: string } | null) => {
    const e = cache.propose(app, action, 0, ver(html), parent)!
    cache.propose(app, action, 1, ver(html))
    return cache.pick(e.key, 0)!
  }

  const home = draw(null, HOME, null)
  const detail = draw('@habit-detail: one habit, its streak and history', DETAIL_1, { key: home.key, label: 'Details' })
  draw('@add-habit: a form to add a habit', ADD, { key: home.key, label: 'Add a habit' })
  const stats = draw('@stats: this week, per habit', STATS, { key: home.key, label: 'Stats' })
  draw('@reminders: when to remind me of this habit', REMINDERS, { key: detail.key, label: 'Reminders' })
  // A second version, so Undo on Habit detail has one to take back.
  cache.addVersion(detail.key, ver(DETAIL_2, { feedback: 'Make the streak the biggest thing on the screen' }))
  // The open A OR B: both sides done, none picked.
  cache.propose(app, '@history: every past week, newest first', 0, ver(HISTORY_A), { key: stats.key, label: 'History' })
  cache.propose(app, '@history: every past week, newest first', 1, ver(HISTORY_B))

  cache.addComponent(app, 'tab-bar', 'bottom of every main screen', ver(TAB_BAR, { name: undefined, idea: undefined }), 'filing', { key: home.key, label: 'Today' })
  cache.setBox(app, 'add', 'rules', { id: 'one-tap-check', text: 'Checking off a habit takes one tap from Today.' }, 'filing')
  cache.setBox(app, 'add', 'data', { id: 'habits', columns: ['habit', 'goal', 'streak'], rows: [['Drink water', 'Every day', '12'], ['Read 10 pages', 'Weekdays', '3'], ['Stretch', 'Every day', '0']] }, 'filing')
  // One visit of the fixer, which added a rule; its Undo drops it.
  const visitAt = at()
  cache.setBox(app, 'add', 'rules', { id: 'streak-reset', text: 'A streak ends after a whole missed day.' }, 'fixer')
  cache.noteVisit(app, { at: visitAt, ms: 6200, costUsd: 0, screens: 5, refused: [], seen: false, changes: [
    { text: 'added rule streak-reset: A streak ends after a whole missed day.', note: 'Today and Habit detail counted a streak differently.', undo: { drop: 'rules', id: 'streak-reset' } },
  ] })

  const shared = cache.ownShared(app)
  shared.shares.push(
    { token: DEMO_TOKENS.view, role: 'view', createdAt: at(), used: 0, opens: 0 },
    { token: DEMO_TOKENS.comment, role: 'comment', createdAt: at(), used: 0, opens: 0 },
    { token: DEMO_TOKENS.edit, role: 'edit', createdAt: at(), cap: 20, used: 0, opens: 0 },
  )
  const who = { visitor: DEMO_VISITOR, name: 'Demo Visitor' }
  shared.feedback.push(
    { id: 'demo000000000001', at: at(), ...who, screen: detail.key, title: 'Habit detail', kind: 'comment', text: 'I expected this button to say how many days are left.', about: 'Check off today', tag: 'button', nth: 0 },
    { id: 'demo000000000002', at: at(), visitor: 'dec0de0000000002', name: 'Second Visitor', screen: home.key, title: 'Today', kind: 'comment', text: 'Nice and short.', resolved: at() },
  )
  shared.trips.push({ id: 'dec0de00000000a1', ...who, at: at(), screens: ['Today', 'Habit detail', 'Reminders'], dead: [] })
  cache.save()
  // Once more through a load, so the file is in the form a load and save keep unchanged.
  const again = new ScreenCache(file)
  again.save()
  return again
}

if (import.meta.main) {
  fixClock()
  makeDemoCache(DEMO_FILE)
  console.log(`wrote ${DEMO_FILE}`)
}
