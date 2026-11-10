// Voice input's state machine: the wake phrase, the countdown, stop and cancel, with a fake clock.
import { expect, test } from 'bun:test'
import { BLOCKED, GAVE_UP, SpeechInput, VoiceMachine, voiceField, type Clock, type Recognition, type VoiceEvent } from '../packages/web/src/voice.ts'

class FakeClock implements Clock {
  t = 0
  private timers = new Map<number, { at: number; fn: () => void }>()
  private next = 1
  now = () => this.t
  setTimeout = (fn: () => void, ms: number) => { const id = this.next++; this.timers.set(id, { at: this.t + ms, fn }); return id }
  clearTimeout = (id: unknown) => { this.timers.delete(id as number) }
  advance(ms: number) {
    const end = this.t + ms
    for (;;) {
      const due = [...this.timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      this.timers.delete(due[0])
      this.t = due[1].at
      due[1].fn()
    }
    this.t = end
  }
}

function setup() {
  const clock = new FakeClock()
  const events: VoiceEvent[] = []
  const m = new VoiceMachine((e) => events.push(e), { clock })
  const sent = () => events.filter((e) => e.type === 'send').map((e) => (e as { text: string }).text)
  return { clock, events, m, sent }
}

/** A SpeechInput on a fake recognition, turned on: `rec` is the one it made. */
function speech() {
  const clock = new FakeClock()
  const events: VoiceEvent[] = []
  const recs: FakeRecognition[] = []
  class FakeRecognition implements Recognition {
    continuous = false; interimResults = false; lang = ''; starts = 0
    onresult: Recognition['onresult'] = null; onerror: Recognition['onerror'] = null; onend: Recognition['onend'] = null
    constructor() { recs.push(this) }
    start() { this.starts++ }
    stop() {}
  }
  const input = new SpeechInput(new VoiceMachine((e) => events.push(e), { clock }), { Recognition: FakeRecognition, clock })
  input.start()
  return { clock, events, input, rec: recs[0]! }
}

test('stays off until started', () => {
  const { m, events } = setup()
  m.hear('hey woz use switches', true)
  expect(m.state).toBe('off')
  expect(events).toEqual([])
  m.start()
  expect(m.state).toBe('asleep')
})

test('the wake phrase alone wakes it; then interim, final, countdown, send', () => {
  const { m, clock, events, sent } = setup()
  m.start()
  m.hear('Hey Woz', true)
  expect(m.state).toBe('awake')
  m.hear('use swi', false)
  expect(events.at(-1)).toEqual({ type: 'interim', text: 'use swi' })
  m.hear('use switches', true)
  expect(m.state).toBe('countdown')
  expect(events.at(-1)).toEqual({ type: 'countdown', text: 'use switches', secondsLeft: 3 })
  clock.advance(1000)
  expect(events.at(-1)).toEqual({ type: 'countdown', text: 'use switches', secondsLeft: 2 })
  clock.advance(1999)
  expect(sent()).toEqual([])
  clock.advance(1)
  expect(sent()).toEqual(['use switches'])
  // After a send, the next Edit starts with the wake phrase again.
  expect(m.state).toBe('asleep')
})

test('words after the wake phrase are the first utterance', () => {
  const { m, clock, sent } = setup()
  m.start()
  m.hear('hey, Woz, make the button blue', true)
  expect(m.state).toBe('countdown')
  clock.advance(3000)
  expect(sent()).toEqual(['make the button blue'])
})

test('"hey was" and "hey waz" wake it too', () => {
  for (const said of ['hey was', 'Hey waz.']) {
    const { m } = setup()
    m.start()
    m.hear(said, true)
    expect(m.state).toBe('awake')
  }
})

test('the wake phrase wakes only at the start of a piece: in the middle it is likely another sentence', () => {
  const { m } = setup()
  m.start()
  m.hear('they said hey was a greeting', true)
  m.hear('I told him hey woz is here', true)
  expect(m.state).toBe('asleep')
})

test('a second final during the countdown appends and restarts it', () => {
  const { m, clock, sent } = setup()
  m.start()
  m.hear('hey woz use switches', true)
  clock.advance(2500)
  m.hear('and a bigger title', true)
  expect(m.state).toBe('countdown')
  clock.advance(2500)
  expect(sent()).toEqual([])
  clock.advance(500)
  expect(sent()).toEqual(['use switches and a bigger title'])
})

test('speaking during the countdown holds it until the next final piece', () => {
  const { m, clock, events, sent } = setup()
  m.start()
  m.hear('hey woz use switches', true)
  m.hear('and a', false)
  expect(m.state).toBe('awake')
  expect(events.at(-1)).toEqual({ type: 'interim', text: 'use switches and a' })
  clock.advance(1000)
  m.hear('and a ti', false)
  clock.advance(1000)
  expect(sent()).toEqual([])
  m.hear('and a title', true)
  clock.advance(3000)
  expect(sent()).toEqual(['use switches and a title'])
})

test('an interim piece with no final one after it does not hold the countdown forever', () => {
  const { m, clock, sent } = setup()
  m.start()
  m.hear('hey woz use switches', true)
  m.hear('um', false)
  clock.advance(1499)
  expect(m.state).toBe('awake')
  clock.advance(1)
  expect(m.state).toBe('countdown')
  clock.advance(3000)
  expect(sent()).toEqual(['use switches'])
})

test('the browser stopping to listen restarts a held countdown', () => {
  const { m, clock, sent } = setup()
  m.start()
  m.hear('hey woz use switches', true)
  m.hear('um', false)
  m.ended()
  expect(m.state).toBe('countdown')
  clock.advance(3000)
  expect(sent()).toEqual(['use switches'])
})

test('while asleep, the words after the wake phrase show at once; the state changes with the final piece', () => {
  const { m, events } = setup()
  m.start()
  m.hear('Hey Woz, use swi', false)
  expect(m.state).toBe('asleep')
  expect(events.at(-1)).toEqual({ type: 'interim', text: 'use swi' })
  m.hear('so they said', false)
  expect(events.filter((e) => e.type === 'interim').at(-1)).toEqual({ type: 'interim', text: 'use swi' })
})

test('a stop phrase, as the whole piece, puts it to sleep without sending', () => {
  for (const said of ['woz sleep', 'Woz, stop.', 'Stop listening!']) {
    const { m, clock, sent } = setup()
    m.start()
    m.hear('hey woz use switches', true)
    m.hear(said, true)
    expect(m.state).toBe('asleep')
    clock.advance(5000)
    expect(sent()).toEqual([])
  }
})

test('a stop phrase inside a request is part of the request', () => {
  const { m, clock, sent } = setup()
  m.start()
  m.hear('hey woz add a button that says stop listening', true)
  expect(m.state).toBe('countdown')
  clock.advance(3000)
  expect(sent()).toEqual(['add a button that says stop listening'])
})

test('voice never overwrites typed text: it keeps it in front of the spoken words', () => {
  // Nothing typed: the spoken words replace what voice wrote before.
  expect(voiceField('use sw', 'use sw', '', 'use switches')).toEqual({ value: 'use switches', mine: '' })
  // The user typed: their text stays first.
  expect(voiceField('Make it dark.', '', '', 'use switches')).toEqual({ value: 'Make it dark. use switches', mine: 'Make it dark.' })
  // Later words keep the same typed text.
  expect(voiceField('Make it dark. use', 'Make it dark. use', 'Make it dark.', 'use switches')).toEqual({ value: 'Make it dark. use switches', mine: 'Make it dark.' })
  // Dropped words leave the typed text.
  expect(voiceField('Make it dark. use', 'Make it dark. use', 'Make it dark.', '').value).toBe('Make it dark.')
})

test('the microphone gives up after five failures in a row, "aborted" included', () => {
  const { clock, events, input, rec } = speech()
  expect(rec.lang).toBe('en-US')
  // A silence is routine: it restarts without counting.
  for (let i = 0; i < 10; i++) { rec.onerror!({ error: 'no-speech' }); rec.onend!(); clock.advance(10000) }
  expect(input.machine.state).toBe('asleep')
  // Another tab took the microphone: each "aborted" counts.
  for (let i = 0; i < 5; i++) { rec.onerror!({ error: 'aborted' }); rec.onend!(); clock.advance(10000) }
  expect(input.machine.state).toBe('off')
  expect(events.at(-1)).toEqual({ type: 'error', message: GAVE_UP })
  expect(rec.starts).toBe(15)
})

test('"cancel" or "never mind" during the countdown drops the text and keeps listening', () => {
  for (const said of ['cancel', 'Never mind.']) {
    const { m, clock, events, sent } = setup()
    m.start()
    m.hear('hey woz use switches', true)
    m.hear(said, true)
    expect(m.state).toBe('awake')
    expect(events.slice(-2)).toEqual([{ type: 'interim', text: '' }, { type: 'state', state: 'awake' }])
    clock.advance(5000)
    expect(sent()).toEqual([])
  }
})

test('the Cancel button drops the text', () => {
  const { m, clock, sent } = setup()
  m.start()
  m.hear('hey woz use switches', true)
  m.cancel()
  clock.advance(5000)
  expect(sent()).toEqual([])
  expect(m.state).toBe('awake')
})

test('the countdown length is configurable; stop turns it off with nothing sent', () => {
  const clock = new FakeClock()
  const events: VoiceEvent[] = []
  const m = new VoiceMachine((e) => events.push(e), { clock, countdownMs: 1500 })
  m.start()
  m.hear('hey woz one', true)
  expect(events.at(-1)).toEqual({ type: 'countdown', text: 'one', secondsLeft: 2 })
  clock.advance(1500)
  expect(events.at(-1)).toEqual({ type: 'send', text: 'one' })
  m.hear('hey woz two', true)
  m.stop()
  clock.advance(5000)
  expect(m.state).toBe('off')
  expect(events.filter((e) => e.type === 'send')).toHaveLength(1)
})

test('fail stops it and says why', () => {
  const { m, events } = setup()
  m.start()
  m.fail('The browser blocked the microphone.')
  expect(m.state).toBe('off')
  expect(events.at(-1)).toEqual({ type: 'error', message: 'The browser blocked the microphone.' })
})

test('what Chrome hears for "hey Woz" and "hey wizard" wakes it, and the words after it are the Edit', () => {
  const cases: [string, string][] = [
    [' he was you switches', 'you switches'], [' hey was make the title bigger', 'make the title bigger'],
    [' they was make the title bigger', 'make the title bigger'], [' There Was You switches', 'You switches'],
    ['hey wizard you switchers', 'you switchers'], [' he wizard use switches', 'use switches'], [' very wizard use switches', 'use switches'],
  ]
  for (const [said, edit] of cases) {
    const { m, clock, sent } = setup()
    m.start()
    m.hear(said, true)
    clock.advance(3000)
    expect([said, sent()]).toEqual([said, [edit]])
  }
})

test('a bare " he was" wakes it; the next settled piece is the Edit', () => {
  const { m, clock, sent } = setup()
  m.start()
  m.hear(' he was', true)
  expect(m.state).toBe('awake')
  m.hear(' use switches', true)
  clock.advance(3000)
  expect(sent()).toEqual(['use switches'])
})

test('these do not wake it: the phrase mid-piece, wizard in a longer word or after two words, "wasn\'t", hey alone', () => {
  for (const said of ['hello this is a test he was you switches', 'wizardry is fun', "he wasn't there", 'the old grey wizard came', ' hey make the title bigger']) {
    const { m } = setup()
    m.start()
    m.hear(said, false)
    m.hear(said, true)
    expect([said, m.state]).toEqual([said, 'asleep'])
  }
})

test('the stop phrases as Chrome hears them, and with wizard, alone or after the wake phrase', () => {
  for (const said of ['was stop', 'Was stopped.', 'was sleep', 'wizard stop', 'Wizard, sleep']) {
    const { m, clock, sent } = setup()
    m.start()
    m.hear('hey woz use switches', true)
    m.hear(said, true)
    expect([said, m.state]).toEqual([said, 'asleep'])
    m.hear(said, true)
    m.hear(` he was ${said}`, true)
    m.hear(`hey wizard, ${said}`, true)
    expect([said, m.state]).toEqual([said, 'asleep'])
    clock.advance(5000)
    expect(sent()).toEqual([])
  }
})

test('every piece with words is heard, interim and final, with whether it woke; none for empty pieces or while off', () => {
  const { m, events } = setup()
  const heard = () => events.filter((e) => e.type === 'heard')
  m.hear('hey woz use switches', true)
  expect(heard()).toEqual([])
  m.start()
  m.hear('', true)
  m.hear(' ', false)
  expect(heard()).toEqual([])
  m.hear(' so they said', false)
  m.hear(' so they said', true)
  m.hear(' he was use', false)
  m.hear(' he was use switches', true)
  m.hear(' and a title', false)
  expect(heard()).toEqual([
    { type: 'heard', text: 'so they said', final: false, woke: false },
    { type: 'heard', text: 'so they said', final: true, woke: false },
    { type: 'heard', text: 'he was use', final: false, woke: true },
    { type: 'heard', text: 'he was use switches', final: true, woke: true },
    { type: 'heard', text: 'and a title', final: false, woke: true },
  ])
})

test('no speech says so and is no failure; no microphone and no network show at once, once per kind until turned on again', () => {
  const { clock, events, input, rec } = speech()
  const errors = () => events.filter((e) => e.type === 'error').map((e) => (e as { message: string }).message)
  for (let i = 0; i < 6; i++) { rec.onerror!({ error: 'no-speech' }); rec.onend!(); clock.advance(10000) }
  expect(events.filter((e) => e.type === 'quiet')).toHaveLength(6)
  expect(errors()).toEqual([])
  expect(input.machine.state).toBe('asleep')
  for (const kind of ['audio-capture', 'network', 'audio-capture']) { rec.onerror!({ error: kind }); rec.onend!(); clock.advance(10000) }
  expect(errors()).toEqual(['No microphone found.', 'Speech recognition needs the internet.'])
  expect(input.machine.state).toBe('asleep')
  input.stop()
  input.start()
  rec.onerror!({ error: 'network' })
  rec.onerror!({ error: 'bad-grammar' })
  expect(errors().slice(2)).toEqual(['Speech recognition needs the internet.', 'Voice input had a problem (bad-grammar). Trying again.'])
})

test('a blocked microphone says how to allow it and turns voice off', () => {
  for (const kind of ['not-allowed', 'service-not-allowed']) {
    const { events, input, rec } = speech()
    rec.onerror!({ error: kind })
    expect(input.machine.state).toBe('off')
    expect(events.at(-1)).toEqual({ type: 'error', message: BLOCKED })
    expect(BLOCKED).toContain('address bar')
  }
})
