// The microphone button and what voice input shows: the words in the drawer's Edit field, "Sending in 3…" with
// Cancel, then the same submit as Enter in that field. voice.ts does the listening.
// Imported by toolbar.ts; at the top level this module uses only itself and state.ts (see app.ts).

import { renderDrawer } from './drawer.ts'
import { hint, showError } from './net.ts'
import { SpeechInput, VoiceMachine, speechSupported, voiceField, type VoiceState } from './voice.ts'
import { $, changeInput, state } from './state.ts'

const GOOGLE = 'In Chrome, the audio goes to Google to be turned into text.'
const TITLES: Record<VoiceState, string> = {
  off: 'Voice: click to turn the microphone on',
  asleep: "Voice is on: say 'hey Woz', then the change. Click to turn it off",
  awake: 'Listening: say the change, then pause',
  countdown: 'Sending the change',
}

const MIC = '<svg class="icon" viewBox="0 0 16 16"><path d="M8 1.5a2 2 0 0 0-2 2V8a2 2 0 0 0 4 0V3.5a2 2 0 0 0-2-2zM4 7.5a4 4 0 0 0 8 0M8 11.5v3M6 14.5h4"/></svg>'

/** Turn a toolbar button into the microphone. It stays hidden in a browser without speech recognition. */
export function initVoice(button: HTMLButtonElement) {
  button.hidden = !speechSupported()
  if (button.hidden) return
  button.type = 'button'
  button.className = 'voice voice-off'
  button.innerHTML = MIC
  button.before(Object.assign(document.createElement('i'), { className: 'sep' }))

  // "Sending in 3…" and Cancel, under the Edit field.
  const count = Object.assign(document.createElement('div'), { className: 'voice-count', hidden: true })
  const left = document.createElement('span')
  const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancel' })
  count.append(left, cancel)
  changeInput.after(count)

  /** A screen or box the Edit goes to. */
  const target = () => (state.box ? !!state.boxes : !!(state.current && state.entries.get(state.current)?.versions.length))
  // What voice last wrote, and the user's own text in front of the spoken words: typed text is never overwritten.
  let shown = '', mine = '', typed = false
  changeInput.addEventListener('input', () => { typed = true })
  const show = (text: string, force = false) => {
    // The user is typing in the field: leave it alone until they stop (a send still adds the words).
    if (!force && typed && document.activeElement === changeInput) return
    const f = voiceField(changeInput.value, shown, mine, text)
    mine = f.mine
    typed = false
    // Open the drawer on Edit without taking the focus from the screen.
    if (text && target() && state.drawer !== 'edit') { state.drawer = 'edit'; renderDrawer() }
    changeInput.value = shown = f.value
  }

  const machine = new VoiceMachine((e) => {
    if (e.type === 'state') {
      button.className = `voice voice-${e.state}`
      button.title = `${TITLES[e.state]}. ${GOOGLE}`
      button.setAttribute('aria-pressed', String(e.state !== 'off'))
      count.hidden = e.state !== 'countdown'
    } else if (e.type === 'interim') show(e.text)
    else if (e.type === 'countdown') { show(e.text); left.textContent = `Sending in ${e.secondsLeft}…` }
    else if (e.type === 'error') showError(e.message)
    else if (e.type === 'send') {
      show(e.text, true)
      // The text stays in the field for when a screen is chosen.
      if (!target()) return hint('Click a screen first.')
      mine = ''
      ;($('editPane') as HTMLFormElement).requestSubmit()
    }
  })
  const input = new SpeechInput(machine)
  button.title = `${TITLES.off}. ${GOOGLE}`
  button.addEventListener('click', () => input.toggle())
  cancel.addEventListener('click', () => machine.cancel())
}
