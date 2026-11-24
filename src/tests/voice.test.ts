// Hold to talk (spec/behavior.md, Voice): the words go after the typed text, stay on release, and a problem reads
// plainly. Runs on a fake recognition: no browser, no microphone.
import { describe, expect, test } from 'bun:test'
import { BLOCKED, HoldToTalk, Talk, problem, speechSupported, type Recognition } from '../packages/web/src/voice.ts'

class FakeRec implements Recognition {
  static last: FakeRec
  continuous = false; interimResults = false; lang = ''; started = 0; stopped = 0
  onresult: Recognition['onresult'] = null
  onerror: Recognition['onerror'] = null
  onend: Recognition['onend'] = null
  constructor() { FakeRec.last = this }
  start() { this.started++ }
  stop() { this.stopped++ }
  say(...pieces: string[]) { this.onresult!({ results: pieces.map((t) => [{ transcript: t }]) }) }
}

const rig = () => {
  const shown: string[] = [], pills: string[] = []
  const v = new HoldToTalk((s) => shown.push(s), (m) => pills.push(m), FakeRec)
  return { v, shown, pills }
}

describe('hold to talk', () => {
  test('the words show after the text already typed, as the browser hears them', () => {
    const shown: string[] = []
    const t = new Talk((s) => shown.push(s))
    t.press('Make it blue. ')
    t.heard('and bigger')
    t.heard('and bigger buttons')
    expect(shown).toEqual(['Make it blue. and bigger', 'Make it blue. and bigger buttons'])
    const empty = new Talk((s) => shown.push(s))
    empty.press('')
    empty.heard(' a dark header')
    expect(shown.at(-1)).toBe('a dark header')
  })

  test('nothing shows before a press or after listening ended', () => {
    const shown: string[] = []
    const t = new Talk((s) => shown.push(s))
    t.heard('early')
    t.press('x')
    t.end()
    t.heard('late')
    expect(shown).toEqual([])
  })

  test('a press listens in English with interim words, settled and interim pieces joined', () => {
    const { v, shown } = rig()
    v.press('Hi')
    const r = FakeRec.last
    expect([r.continuous, r.interimResults, r.lang, r.started]).toEqual([true, true, 'en-US', 1])
    r.say('add a', ' search bar')
    expect(shown).toEqual(['Hi add a search bar'])
    v.press('again') // already listening: no second recognition
    expect(FakeRec.last).toBe(r)
  })

  test('release stops listening; words the browser settles after it still show, then the words stay', () => {
    const { v, shown } = rig()
    v.press('')
    const r = FakeRec.last
    r.say('use a')
    v.release()
    expect(r.stopped).toBe(1)
    r.say('use a table')
    r.onend!()
    expect(v.talk.listening).toBe(false)
    r.say('ignored')
    expect(shown).toEqual(['use a', 'use a table'])
  })

  test('the four problems the red pill says; a silence or a stop says nothing', () => {
    expect(problem('audio-capture')).toBe('No microphone found.')
    expect(problem('network')).toBe('Speech recognition needs the internet.')
    expect([problem('not-allowed'), problem('service-not-allowed')]).toEqual([BLOCKED, BLOCKED])
    expect(BLOCKED).toBe('The browser blocked the microphone. To allow it, click the lock or tune icon in the address bar.')
    expect(problem('bad-grammar')).toBe('Voice input had a problem (bad-grammar).')
    expect([problem('no-speech'), problem('aborted')]).toEqual([null, null])
    const { v, pills } = rig()
    v.press('')
    FakeRec.last.onerror!({ error: 'no-speech' })
    FakeRec.last.onerror!({ error: 'audio-capture' })
    expect(pills).toEqual(['No microphone found.'])
  })

  test('without speech recognition there is nothing to press', () => {
    expect(speechSupported()).toBe(false)
    const shown: string[] = []
    const v = new HoldToTalk((s) => shown.push(s), () => {}, undefined)
    v.press('x')
    v.release()
    expect([v.talk.listening, shown]).toEqual([false, []])
  })
})
