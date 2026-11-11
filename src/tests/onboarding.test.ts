// The public's hints (spec/behavior.md, The public): which one is due, kept in this browser, the spark on a step done.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Coach, HINTS, LIVE, due, fresh, record, veteran, type Hint, type Step } from '../packages/web/src/onboarding.ts'

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
    expect(due(five)).toEqual({ text: 'That is the whole app. Now describe your own.', opens: true })
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

  test('kept in storage: a reload shows the hint still due, and a second begin changes nothing', () => {
    const a = coach()
    a.c.begin(false)
    a.c.did('ready')
    const b = coach(a.saved())
    b.c.begin(true)
    expect(b.shown).toEqual(['Pick the one you like.'])
    expect(coach('{broken').c.p).toBeNull()
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
