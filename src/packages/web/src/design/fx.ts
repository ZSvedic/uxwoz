// The look's motion and sound: sparks, the three sounds and their setting, the still flag, and the pick (pickFx).
// Every animation is CSS in motion.css; this file only adds classes, sparks and sounds. It keys on classes and ids
// that feature code sets (HOOKS), and runs nothing without a page, so bun test (or the design sheet) can import it.

/** The classes, ids and attributes this file and motion.css key on, each with the feature file that sets it. The
 *  microphone's states (voice-awake, voice-countdown) are `voice-${state}` in voice-ui.ts, with VoiceState from voice.ts. */
export const HOOKS = {
  card: 'canvas.ts', side: 'canvas.ts', pickable: 'canvas.ts', or: 'canvas.ts', screen: 'canvas.ts', head: 'canvas.ts',
  'pick-hint': 'canvas.ts', 'data-id': 'canvas.ts', 'data-key': 'canvas.ts', rail: 'boxes.ts', box: 'boxes.ts',
  drawer: 'index.html', sound: 'index.html', logo: 'index.html', voice: 'voice-ui.ts', 'voice-off': 'voice-ui.ts',
} as const

/** Sounds play only when the stored setting says so: off by default. */
export const soundOn = (stored: string | null) => stored === 'on'
/** How long a pick waits before the other design may go, in ms: at once when calm. */
export const pickWait = (calm: boolean) => (calm ? 0 : 800)

const DOM = typeof document !== 'undefined', KEY = 'uxwoz.sound'
const WON = ['var(--spark-gold)', 'var(--spark-white)', 'var(--spark-blue)'], LOST = ['var(--spark-green)', 'var(--spark-mint)']

/** The still look: the same F with no animation, no sound and no tilt. */
export const still = () => DOM && document.documentElement.dataset.design === 'still'
/** Still, or the system asks for reduced motion. */
export const calm = () => still() || (DOM && matchMedia('(prefers-reduced-motion: reduce)').matches)

let sound = false, gestured = false, picking = false, lastWhoosh = 0, ac: AudioContext | null = null
// ---- Sounds, made with Web Audio: no files.
type Sound = (a: AudioContext) => void
const bell = (a: AudioContext, f: number, d: number, v = 0.18) => {
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + d
  o.type = 'sine'; o.frequency.value = f
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.75)
}
const SOUNDS: Record<'chime' | 'tinkle' | 'whoosh', Sound> = {
  chime: (a) => [784, 988, 1175, 1568, 2093].forEach((f, i) => { bell(a, f, i * 0.07); bell(a, f * 2.01, i * 0.07 + 0.02, 0.05) }),
  tinkle: (a) => { bell(a, 1760, 0, 0.08); bell(a, 2637, 0.06, 0.06) },
  whoosh: (a) => {
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
/** Play a sound: never when sounds are off, in the still look, or while the microphone is on (it would hear it). */
export function play(name: keyof typeof SOUNDS) {
  const mic = DOM ? document.querySelector('.voice') : null
  if (!sound || still() || (mic && !mic.classList.contains('voice-off'))) return
  const a = audio(); if (a) SOUNDS[name](a)
}
/** Play one sound from a click whatever the setting, for the design sheet's buttons. */
export function playSound(name: keyof typeof SOUNDS) { const a = audio(true); if (a) SOUNDS[name](a) }

/** Small stars that fly out of a card and fade; none when calm. */
function burst(card: Element, n: number, colours: string[]) {
  if (calm()) return
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'), r = 60 + Math.random() * 90, a = Math.random() * 6.28
    s.className = 'spark'; s.textContent = '✦'
    s.style.cssText = `--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;--c:${colours[i % colours.length]};animation-delay:${Math.random() * 0.2}s`
    card.append(s); setTimeout(() => s.remove(), 1200)
  }
}

/**
 * The pick: both sides and the OR's ✕ are locked, the picked side rises and glows, the other dissolves, sparks and the
 * chime. `wait` resolves when the other side may go (0.8 s, at once when calm); `done()` takes the classes and sparks
 * off whatever is still there, so a pick the server refuses leaves both sides as they were. 10 s is a safety net.
 */
export function pickFx(key: string, index: number): { wait: Promise<void>; done: () => void } {
  if (!DOM) return { wait: Promise.resolve(), done() {} }
  const cards = [...document.querySelectorAll<HTMLElement>('.card[data-id]')].filter((c) => c.dataset.id!.startsWith(`${key}#`))
  const or = [...document.querySelectorAll<HTMLElement>('.or[data-key]')].filter((o) => o.dataset.key === key)
  const all = [...cards, ...or]
  picking = true; for (const e of all) e.classList.add('fx-lock')
  for (const c of cards) {
    const won = c.dataset.id === `${key}#${index}`
    c.classList.add(won ? 'fx-won' : 'fx-lost')
    burst(c, won ? 16 : 10, won ? WON : LOST)
  }
  play('chime')
  const done = () => {
    clearTimeout(net); picking = false
    for (const e of all) { e.classList.remove('fx-lock', 'fx-won', 'fx-lost'); for (const s of e.querySelectorAll('.spark')) s.remove() }
  }
  const net = setTimeout(done, 10_000), ms = pickWait(calm())
  return { wait: ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve(), done }
}

/** A hint's step done (onboarding.ts): the pick's sparks out of the hint and its chime (`sound` false when a pick plays its own). */
export function stepFx(hint: Element, sound = true) {
  if (!DOM) return
  burst(hint, 12, WON)
  if (sound) play('chime')
}

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
    // Made inside the click, so Safari lets the later sounds play; the tinkle says sounds are on.
    if (sound && audio(true)) play('tinkle')
  })
  // Designs appearing (a pair is one whoosh) and the drawer swinging in.
  document.addEventListener('animationstart', (e) => {
    if (e.animationName !== 'summon' && e.animationName !== 'hand') return
    const t = performance.now()
    if (t - lastWhoosh > 300) { lastWhoosh = t; play('whoosh') }
  })
  // Entering a side that can be picked, from outside it.
  document.addEventListener('pointerover', (e) => {
    const c = e.target instanceof Element ? e.target.closest('.card.side.pickable') : null
    if (!c || picking || (e.relatedTarget instanceof Node && c.contains(e.relatedTarget))) return
    play('tinkle'); burst(c, 6, ['var(--spark-gold)'])
  })
}
