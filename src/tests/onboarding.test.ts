// The public's hints (spec/behavior.md, The public): which one is due, kept in this browser, the spark on a step done.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Coach, HINTS, LIVE, OnShow, doneBy, due, fits, fresh, left, record, veteran, type Hint, type Step, type Where } from '../packages/web/src/onboarding.ts'

const walk = (...steps: Step[]) => steps.reduce(record, fresh())
const text = (p: ReturnType<typeof fresh>) => due(p)?.text ?? null

function coach(stored: string | null = null) {
  const shown: (string | null)[] = [], fx: boolean[] = [], waits: (() => void)[] = []
  let saved = stored
  const c = new Coach({
    load: () => saved, save: (j) => { saved = j }, show: (h: Hint | null) => shown.push(h?.text ?? null),
    fx: (s) => fx.push(s), later: (run) => waits.push(run),
  })
  return { c, shown, fx, waits, saved: () => saved }
}

describe('the chain of five', () => {
  test('each hint in its turn, and each stays until the visitor does the thing', () => {
    expect(text(fresh())).toBeNull()
    expect(text(walk('ready'))).toBe('Pick the one you like.')
    expect(text(walk('ready', 'ready'))).toBe('Pick the one you like.')
    expect(text(walk('ready', 'pick'))).toBe('Click anything in it.')
    expect(text(walk('ready', 'pick', 'click'))).toBeNull() // until the second pick
    expect(text(walk('ready', 'pick', 'click', 'ready', 'pick'))).toBe('Change it in words: press Edit.')
    expect(text(walk('ready', 'pick', 'click', 'pick', 'editSent'))).toBeNull() // until the Edit made a version
    expect(text(walk('ready', 'pick', 'click', 'pick', 'editSent', 'edited'))).toBe('Changed your mind? Undo brings the old one back.')
    const five = walk('ready', 'pick', 'click', 'pick', 'editSent', 'edited', 'undo')
    expect(due(five)).toEqual({ text: 'That is the whole app. Now describe your own.', opens: true, after: 'undo' })
    expect(text(record(five, 'own'))).toBeNull()
  })

  test('never to a visitor who already did it', () => {
    expect(text(walk('own', 'undo', 'click', 'ready', 'pick', 'pick'))).toBe('Change it in words: press Edit.')
    expect(text(walk('click', 'ready', 'pick'))).toBeNull()
    expect(text(walk('edited', 'undo', 'own'))).toBeNull()
    expect(text(veteran())).toBeNull()
  })
})

describe('the live hint', () => {
  test('the first design a model makes shows it ahead of the chain, until the next thing the visitor does', () => {
    const live = walk('ready', 'pick', 'live')
    expect(due(live)).toBe(LIVE)
    expect(text(record(live, 'ready'))).toBe(LIVE.text)
    expect(text(record(live, 'click'))).toBeNull()
    expect(text(record(record(live, 'pick'), 'live'))).toBe('Click anything in it.') // only the first time
    expect(text(walk('ready', 'pick', 'click', 'pick', 'editSent', 'edited', 'live'))).toBe(LIVE.text)
  })
})

describe('Coach', () => {
  test('a first-time browser starts fresh; one with mockups in Recent has done it all', () => {
    const a = coach()
    a.c.begin(false)
    a.c.did('ready')
    expect(a.shown).toEqual([null, 'Pick the one you like.'])
    const b = coach()
    b.c.begin(true)
    b.c.did('ready')
    b.c.did('live')
    expect(b.shown).toEqual([null, null, null])
  })

  test('kept in storage: a reload shows no hint, the one still due comes back at the next step', () => {
    const a = coach()
    a.c.begin(false)
    a.c.did('ready')
    const b = coach(a.saved())
    b.c.begin(true)
    expect(b.shown).toEqual([null])
    expect(b.c.p?.ready).toBe(true)
    b.c.did('ready')
    expect(b.shown.at(-1)).toBe('Pick the one you like.')
    b.c.begin(true) // Recent loaded again: the hint on show stays
    expect(b.shown.at(-1)).toBe('Pick the one you like.')
    expect(coach('{broken').c.p).toBeNull()
  })

  test('a hint that went away does not come back over the next mockup: only the step that brings it shows it', () => {
    const a = coach()
    a.c.begin(false)
    for (const s of ['ready', 'pick', 'click', 'pick', 'editSent', 'edited'] as Step[]) a.c.did(s)
    a.waits.splice(0).forEach((w) => w())
    expect(a.shown.at(-1)).toBe('Changed your mind? Undo brings the old one back.')
    a.c.away() // the visitor started their own mockup from the panel
    expect(a.shown.at(-1)).toBeNull()
    const from = a.shown.length
    for (const s of ['ready', 'pick', 'click', 'pick'] as Step[]) a.c.did(s) // six screens of it
    a.waits.splice(0).forEach((w) => w())
    expect(a.shown.slice(from).filter(Boolean)).toEqual([])
    a.c.did('edited') // a new Edit brings it again
    expect(a.shown.at(-1)).toBe('Changed your mind? Undo brings the old one back.')
  })

  test('going elsewhere takes the hint away, still due, until the next step', () => {
    const a = coach()
    a.c.begin(false)
    a.c.did('ready')
    a.c.away()
    expect(a.shown.at(-1)).toBeNull()
    expect(due(a.c.p!)?.text).toBe('Pick the one you like.')
    a.c.did('ready')
    expect(a.shown.at(-1)).toBe('Pick the one you like.')
  })


  test('a step done plays the spark (a pick plays its own sound), then the next hint shows', () => {
    const a = coach()
    a.c.begin(false)
    a.c.did('ready')
    a.c.did('pick')
    expect(a.fx).toEqual([false])
    expect(a.shown.at(-1)).toBe('Pick the one you like.')
    a.waits.shift()!()
    expect(a.shown.at(-1)).toBe('Click anything in it.')
    a.c.did('click')
    expect(a.fx).toEqual([false, true])
    a.c.did('click') // nothing on show: no spark
    expect(a.fx).toEqual([false, true])
    a.c.did('ready')
    a.waits.shift()!() // a newer show came after it: the late one does nothing
    expect(a.shown.at(-1)).toBeNull()
  })

  test('a press: the live hint goes, the last one opens the generate panel', () => {
    const a = coach()
    a.c.begin(false)
    a.c.did('live')
    expect(a.c.press()).toBe(false)
    expect(a.shown.at(-1)).toBeNull()
    for (const s of ['ready', 'pick', 'click', 'pick', 'editSent', 'edited', 'undo'] as Step[]) a.c.did(s)
    expect(a.c.press()).toBe(true)
  })

  test('the spec says each hint word for word', () => {
    const spec = readFileSync(new URL('../../spec/behavior.md', import.meta.url), 'utf8').replace(/\s+/g, ' ')
    for (const h of HINTS) expect([h.text, spec.includes(`*${h.text}*`)]).toEqual([h.text, true])
  })
})

describe('a hint on show goes stale', () => {
  const at: Where = { app: 'a', current: 'k', box: null, drawer: null, card: false, drawn: true, choice: false }
  const pick: Hint = { text: 'Pick the one you like.', after: 'ready' }, edit = HINTS.find((h) => h.drawer)!
  test('press Edit shows only on a drawn screen with no A OR B open', () => {
    expect(fits(edit, at)).toBe(true)
    expect(fits(edit, { ...at, choice: true })).toBe(false)
    expect(fits(edit, { ...at, drawn: false })).toBe(false)
    expect(fits(pick, { ...at, choice: true, drawn: false })).toBe(true)
  })
  test('opening Edit is the step that ends press Edit', () => {
    expect(doneBy(edit, { ...at, drawer: 'edit' })).toBe('editSent')
    expect(doneBy(edit, { ...at, drawer: 'info' })).toBeNull()
    expect(doneBy(pick, { ...at, drawer: 'edit' })).toBeNull()
    const p = record({ picks: 2, ready: true, click: true }, doneBy(edit, { ...at, drawer: 'edit' })!)
    expect(due(p)).toBeNull()
  })
  test('when the visitor opens another mockup, screen, box, drawer, or a card', () => {
    expect(left(pick, at, { ...at })).toBe(false)
    expect(left(pick, at, { ...at, app: 'b' })).toBe(true)
    expect(left(pick, at, { ...at, current: 'k2' })).toBe(true)
    expect(left(pick, at, { ...at, box: 'rules' })).toBe(true)
    expect(left(pick, at, { ...at, drawer: 'info' })).toBe(true)
    expect(left(pick, at, { ...at, card: true })).toBe(true)
  })
  test('closing a drawer, a box or a card is no move', () => {
    expect(left(pick, { ...at, drawer: 'edit' }, at)).toBe(false)
    expect(left(pick, { ...at, box: 'rules' }, at)).toBe(false)
    expect(left(pick, { ...at, card: true }, at)).toBe(false)
  })
  test('but not when they open the drawer the hint asks for', () => {
    expect(edit.text).toBe('Change it in words: press Edit.')
    expect(left(edit, at, { ...at, drawer: 'edit' })).toBe(false)
    expect(left(edit, at, { ...at, drawer: 'info' })).toBe(true)
  })
  test('where a hint shows is taken once its step has finished: a pick shows it before the picked screen is current', () => {
    const o = new OnShow()
    o.show(edit)
    // The parent was current when the pick showed it; the next draw sees the picked screen.
    expect(o.stale({ ...at, current: 'picked' })).toBe(false)
    o.settle({ ...at, current: 'picked' })
    expect(o.stale({ ...at, current: 'picked' })).toBe(false)
    expect(o.stale({ ...at, current: 'picked', drawer: 'edit' })).toBe(false)
    expect(o.stale({ ...at, current: 'other' })).toBe(true)
    o.settle({ ...at, current: 'other' }) // settles once
    expect(o.stale({ ...at, current: 'other' })).toBe(true)
    o.show(null)
    expect(o.stale(at)).toBe(false)
  })
  test('the live hint says it in plain words', () => {
    expect(LIVE.text).toBe('This design was drawn fresh for you, so it used one of your free screens.')
  })
})
