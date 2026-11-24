// Hold to talk (spec/behavior.md, Voice): while the button is held, the browser's speech recognition writes the words
// into a field, after the text already typed there; let go and the words stay, to correct by hand. Voice never sends.
// Two parts, no DOM at the top level so tests can import it: Talk keeps the field's text, HoldToTalk feeds it from the
// browser's speech recognition.

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b)

export const BLOCKED = 'The browser blocked the microphone. To allow it, click the lock or tune icon in the address bar.'
const PROBLEMS: Record<string, string> = {
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs the internet.',
  'not-allowed': BLOCKED,
  'service-not-allowed': BLOCKED,
}
/** What the red pill says for an error the browser reports, by its kind; nothing for a silence or a stop. */
export const problem = (kind: string): string | null =>
  kind === 'no-speech' || kind === 'aborted' ? null : PROBLEMS[kind] ?? `Voice input had a problem (${kind}).`

/** One hold: the field shows what was typed before it, then the words heard so far. */
export class Talk {
  listening = false
  private typed = ''
  constructor(private show: (value: string) => void) {}
  /** The button is pressed; `field` is the field's text now. */
  press(field: string) { this.typed = field.trim(); this.listening = true }
  /** Everything heard in this hold so far, settled and interim pieces together. */
  heard(words: string) { if (this.listening) this.show(join(this.typed, words.trim())) }
  /** Listening ended: the words stay in the field. */
  end() { this.listening = false }
}

// ---- The browser's speech recognition

export interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
export type RecognitionClass = new () => Recognition

const recognitionClass = (): RecognitionClass | undefined => {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Whether this browser can turn speech into text: without it there is no button. */
export const speechSupported = () => !!recognitionClass()

/** Press starts listening, release stops it; the last words the browser settles after the release still show. */
export class HoldToTalk {
  readonly talk: Talk
  private rec: Recognition | null = null
  /** Tests pass a fake recognition. */
  constructor(show: (value: string) => void, private fail: (message: string) => void, private R = recognitionClass()) {
    this.talk = new Talk(show)
  }

  press(field: string) {
    if (!this.R || this.talk.listening) return
    const rec = this.rec = new this.R()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US' // Edits are written in English
    rec.onresult = (e) => this.talk.heard(Array.from(e.results, (r) => r[0]?.transcript ?? '').join(''))
    rec.onerror = (e) => { const m = problem(e.error); if (m) this.fail(m) }
    rec.onend = () => { if (this.rec === rec) { this.rec = null; this.talk.end() } }
    this.talk.press(field)
    try { rec.start() } catch { this.rec = null; this.talk.end() }
  }

  release() { try { this.rec?.stop() } catch { /* not listening */ } }
}
