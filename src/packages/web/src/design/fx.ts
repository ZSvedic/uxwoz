// The look's sound: the whoosh and its setting, and the still flag. Every animation is CSS in motion.css; this file
// only plays the whoosh when one starts. It keys on classes and ids that feature code sets (HOOKS), and runs nothing
// without a page, so bun test (or the design sheet) can import it. app.ts imports it for its effect.

/** The classes, ids and attributes this file and motion.css key on, each with the feature file that sets it. */
export const HOOKS = {
  card: 'canvas.ts', streaming: 'canvas.ts', screen: 'canvas.ts',
  'data-id': 'canvas.ts', rail: 'boxes.ts', box: 'boxes.ts', drawer: 'index.html', sound: 'index.html', logo: 'index.html',
} as const

/** Sounds play only when the stored setting says so: off by default. */
export const soundOn = (stored: string | null) => stored === 'on'

const DOM = typeof document !== 'undefined', KEY = 'uxwoz.sound'

/** The still look: the same F with no animation, no sound and no tilt. */
export const still = () => DOM && document.documentElement.dataset.design === 'still'

let sound = false, gestured = false, lastWhoosh = 0, ac: AudioContext | null = null
// ---- The sound, made with Web Audio: no files.
const SOUNDS = {
  whoosh: (a: AudioContext) => {
    const n = (a.sampleRate * 0.45) | 0, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / n)
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime
    s.buffer = b; f.type = 'lowpass'; f.Q.value = 0.8; g.gain.value = 0.16
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.2)
    f.frequency.exponentialRampToValueAtTime(500, t + 0.45)
    s.connect(f).connect(g).connect(a.destination); s.start(t)
  },
}

// The browser lets a page make sound only after the user has clicked or typed in it; `now` says this is a click.
const audio = (now = false) => {
  if (!ac && (gestured || now) && typeof AudioContext !== 'undefined') ac = new AudioContext()
  void ac?.resume(); return ac
}
/** Play a sound: never when sounds are off or in the still look. */
export function play(name: keyof typeof SOUNDS) {
  if (!sound || still()) return
  const a = audio(); if (a) SOUNDS[name](a)
}
/** Play one sound from a click whatever the setting, for the design sheet's buttons. */
export function playSound(name: keyof typeof SOUNDS) { const a = audio(true); if (a) SOUNDS[name](a) }

/** The speaker in the bar shows the setting. */
function showSound() {
  const b = document.getElementById('sound'); if (!b) return
  b.setAttribute('aria-pressed', String(sound)); b.title = 'Sounds'; b.classList.toggle('off', !sound)
}

if (DOM) {
  if (new URLSearchParams(location.search).get('design') === 'still') document.documentElement.dataset.design = 'still'
  try { sound = soundOn(localStorage.getItem(KEY)) } catch {}
  showSound()
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { gestured = true }, true)
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element && e.target.closest('#sound'))) return
    sound = !sound
    try { localStorage.setItem(KEY, sound ? 'on' : 'off') } catch {}
    showSound()
    // Made inside the click, so Safari lets the later sounds play.
    if (sound) audio(true)
  })
  // A design appearing and the drawer swinging in.
  document.addEventListener('animationstart', (e) => {
    if (e.animationName !== 'summon' && e.animationName !== 'hand') return
    const t = performance.now()
    if (t - lastWhoosh > 300) { lastWhoosh = t; play('whoosh') }
  })
}
