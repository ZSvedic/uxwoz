// Voice input: what the user says becomes an Edit. Two parts, no DOM at the top level so tests can import it:
// VoiceMachine turns transcript pieces into events (wake, countdown, send), and SpeechInput feeds it from the
// browser's speech recognition and starts that again whenever it stops on its own. voice-ui.ts shows it.

export type VoiceState = 'off' | 'asleep' | 'awake' | 'countdown'

export type VoiceEvent =
  | { type: 'state'; state: VoiceState }
  | { type: 'interim'; text: string }
  | { type: 'countdown'; text: string; secondsLeft: number }
  | { type: 'send'; text: string }
  | { type: 'error'; message: string }

/** The time and timers the machine uses; tests pass a fake one. */
export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}

/** Lower case, letters and digits only, one space between words. */
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// "hey woz", and what recognizers often hear instead. Only at the start of a piece: in the middle of one it is
// more likely part of an unrelated sentence ("they say hey was a greeting").
const WAKE = /^[^\p{L}\p{N}]*hey[\s,]+(?:woz|was|waz)\b[\s,.!?;:]*/iu
const STOP = ['woz sleep', 'woz stop', 'stop listening']
const CANCEL = ['cancel', 'never mind', 'nevermind']

export class VoiceMachine {
  state: VoiceState = 'off'
  /** What was said so far for the next Edit (final pieces only). */
  private said = ''
  private deadline = 0
  private timer: unknown = null

  constructor(private emit: (e: VoiceEvent) => void, private opts: { countdownMs?: number; idleMs?: number; clock?: Clock } = {}) {}

  private get clock() { return this.opts.clock ?? realClock }

  private to(s: VoiceState) {
    if (this.state === s) return
    this.state = s
    this.emit({ type: 'state', state: s })
  }

  private stopTimer() {
    if (this.timer != null) this.clock.clearTimeout(this.timer)
    this.timer = null
  }

  /** Forget what was said; the shown text goes too. */
  private drop() {
    this.stopTimer()
    if (this.said) { this.said = ''; this.emit({ type: 'interim', text: '' }) }
  }

  /** The microphone is on: wait for the wake phrase. */
  start() { if (this.state === 'off') this.to('asleep') }

  /** The microphone is off: nothing is sent. */
  stop() { this.drop(); this.to('off') }

  /** Stop for good after a failure, with the reason. */
  fail(message: string) { this.stop(); this.emit({ type: 'error', message }) }

  /** The Cancel button, or "cancel" said: drop the text and keep listening. */
  cancel() {
    if (this.state !== 'awake' && this.state !== 'countdown') return
    this.drop()
    this.to('awake')
  }

  /** No final piece came after the user spoke again (a pause, or the browser stopped listening): count down with what was said. */
  ended() {
    if (this.state === 'awake' && this.said) this.countdown()
  }

  /** A piece of transcript: interim pieces change as the user speaks, a final one is settled. */
  hear(text: string, final: boolean) {
    if (this.state === 'off') return
    const w = words(text)
    if (!final) {
      if (!w) return
      if (this.state === 'asleep') {
        // Show the words after "hey Woz" at once; the state changes only with the final piece.
        const m = WAKE.exec(text)
        if (m) this.emit({ type: 'interim', text: text.slice(m[0].length).trim() })
        return
      }
      // Speaking again holds the countdown. If no final piece follows soon, it starts again with what was said.
      if (this.said) {
        this.stopTimer()
        this.to('awake')
        this.timer = this.clock.setTimeout(() => this.ended(), this.opts.idleMs ?? 1500)
      }
      this.emit({ type: 'interim', text: join(this.said, text.trim()) })
      return
    }
    // Stop phrases and cancel count only as the whole piece: "a button that says stop listening" is an Edit.
    if (STOP.includes(w)) { this.drop(); return this.to('asleep') }
    if (this.state === 'asleep') {
      const m = WAKE.exec(text)
      if (!m) return
      this.to('awake')
      text = text.slice(m[0].length)
      if (STOP.includes(words(text))) return this.to('asleep')
      if (CANCEL.includes(words(text))) return
    } else if (CANCEL.includes(w)) return this.cancel()
    if (!words(text)) return
    this.said = join(this.said, text.trim())
    this.countdown()
  }

  private countdown() {
    this.stopTimer()
    this.deadline = this.clock.now() + (this.opts.countdownMs ?? 3000)
    this.to('countdown')
    this.tick()
  }

  private tick() {
    const left = this.deadline - this.clock.now()
    if (left <= 0) {
      const text = this.said
      this.said = ''
      this.timer = null
      // After a send, the next Edit starts with the wake phrase again.
      this.to('asleep')
      this.emit({ type: 'send', text })
      return
    }
    this.emit({ type: 'countdown', text: this.said, secondsLeft: Math.ceil(left / 1000) })
    this.timer = this.clock.setTimeout(() => this.tick(), left % 1000 || 1000)
  }
}

/**
 * What the Edit field shows when voice writes `spoken` into it. `shown` is what voice wrote last and `mine` the
 * user's own text kept in front: when the field differs from `shown`, the user changed it, and that becomes `mine`.
 * Typed text is never overwritten.
 */
export function voiceField(field: string, shown: string, mine: string, spoken: string): { value: string; mine: string } {
  if (field !== shown) mine = field.trim()
  return { value: join(mine, spoken), mine }
}

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b)

// ---- The browser's speech recognition

export interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
export type RecognitionClass = new () => Recognition

const recognitionClass = (): RecognitionClass | undefined => {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Whether this browser can turn speech into text. */
export const speechSupported = () => !!recognitionClass()

export const BLOCKED = 'The browser blocked the microphone.'
export const GAVE_UP = 'Voice input stopped. Click the microphone to start again.'
const MAX_FAILURES = 5

/** Feeds the machine from the microphone. The browser stops listening after a silence or an error; this starts it again while the machine is on. */
export class SpeechInput {
  private rec: Recognition | null = null
  private failures = 0
  private retry: unknown

  /** Tests pass a fake recognition and clock. */
  constructor(readonly machine: VoiceMachine, private opts: { Recognition?: RecognitionClass; clock?: Clock } = {}) {}

  private get clock() { return this.opts.clock ?? realClock }

  toggle() { this.machine.state === 'off' ? this.start() : this.stop() }

  start() {
    const R = this.opts.Recognition ?? recognitionClass()
    if (!R) return
    if (!this.rec) {
      const rec = this.rec = new R()
      rec.continuous = true
      rec.interimResults = true
      // Edits are written in English, so the words are heard as English.
      rec.lang = 'en-US'
      rec.onresult = (e) => {
        this.failures = 0
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!
          if (r.isFinal) this.machine.hear(r[0]!.transcript, true)
          else interim += r[0]!.transcript
        }
        if (interim) this.machine.hear(interim, false)
      }
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') return this.give(BLOCKED)
        // A silence is routine. Anything else counts, "aborted" too, so two tabs cannot take the microphone from each other forever.
        if (e.error !== 'no-speech') this.failures++
      }
      rec.onend = () => { this.machine.ended(); this.again() }
    }
    this.failures = 0
    this.machine.start()
    this.listen()
  }

  stop() {
    this.clock.clearTimeout(this.retry)
    this.machine.stop()
    try { this.rec?.stop() } catch { /* not listening */ }
  }

  private give(message: string) {
    this.clock.clearTimeout(this.retry)
    this.machine.fail(message)
    try { this.rec?.stop() } catch { /* not listening */ }
  }

  private listen() {
    if (this.machine.state === 'off') return
    try { this.rec!.start() } catch { this.failures++; this.again() }
  }

  /** Listening ended: start again after a short wait, longer after each failure, until five in a row. */
  private again() {
    if (this.machine.state === 'off') return
    if (this.failures >= MAX_FAILURES) return this.give(GAVE_UP)
    this.clock.clearTimeout(this.retry)
    this.retry = this.clock.setTimeout(() => this.listen(), 250 + 500 * this.failures)
  }
}
