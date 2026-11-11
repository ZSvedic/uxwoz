// The hints that teach a first-time visitor by the moment (spec/behavior.md, The public): a chain of five and the live
// one. Which hint is due follows from what the visitor has done, kept in this browser. No DOM: the page hands in how
// to keep the progress, show a hint and play the step's spark (net.ts), so bun test runs it as it is.

/** What the visitor has done, as far as the hints care. */
export interface Progress {
  picks: number
  ready?: true; click?: true; editSent?: true; edited?: true; undo?: true; own?: true
  /** A model made a design: the live hint is due until the next thing the visitor does, then done. */
  live?: 'due' | 'done'
}
/** Two designs ready, a pick, a click in a screen, an Edit sent and one made, an Undo, the generate panel opened, a design made live. */
export type Step = 'ready' | 'pick' | 'click' | 'editSent' | 'edited' | 'undo' | 'own' | 'live'
export interface Hint { text: string; /** A press on it opens the generate panel. */ opens?: true; live?: true }

export const LIVE: Hint = { text: 'From here your designs are made live.', live: true }
const CHAIN: [Hint, (p: Progress) => boolean][] = [
  [{ text: 'Pick the one you like.' }, (p) => !!p.ready && p.picks < 1],
  [{ text: 'Click anything in it.' }, (p) => p.picks >= 1 && !p.click],
  [{ text: 'Change it in words: press Edit.' }, (p) => p.picks >= 2 && !p.editSent],
  [{ text: 'Changed your mind? Undo brings the old one back.' }, (p) => !!p.edited && !p.undo],
  [{ text: 'That is the whole app. Now describe your own.', opens: true }, (p) => !!p.undo && !p.own],
]
export const HINTS = [...CHAIN.map(([h]) => h), LIVE]

export const fresh = (): Progress => ({ picks: 0 })
/** A visitor who already has mockups did it all: no hint, ever. */
export const veteran = (): Progress => ({ picks: 2, ready: true, click: true, editSent: true, edited: true, undo: true, own: true, live: 'done' })

/** The progress after a step: the live hint gives way to anything the visitor does next. */
export function record(p: Progress, step: Step): Progress {
  const next: Progress = { ...p }
  if (step === 'live') next.live ??= 'due'
  else {
    if (step === 'pick') next.picks = p.picks + 1
    else next[step] = true
    if (next.live === 'due' && step !== 'ready' && step !== 'edited') next.live = 'done'
  }
  return next
}

/** The hint to show now, if any: the live one first, else the first of the chain that is due. */
export function due(p: Progress): Hint | null {
  if (p.live === 'due') return LIVE
  return CHAIN.find(([, when]) => when(p))?.[0] ?? null
}

export interface CoachDeps {
  load(): string | null
  save(json: string): void
  show(hint: Hint | null): void
  /** The spark and sound of a step done; `sound` is false for a pick, which plays its own. */
  fx(sound: boolean): void
  /** Wait before the next hint, so the done one's sparks are seen; the page passes setTimeout. */
  later(run: () => void, ms: number): void
}

/** The hints in one browser: started once Recent is known, then told each step. */
export class Coach {
  p: Progress | null
  constructor(private deps: CoachDeps) {
    let p: Progress | null = null
    try { p = JSON.parse(deps.load() ?? 'null') } catch { /* a broken record starts again */ }
    this.p = p && typeof p.picks === 'number' ? p : null
  }

  /** The first time this browser is seen: with mockups in Recent it is no first-time visitor. */
  begin(hasMockups: boolean) {
    if (!this.p) { this.p = hasMockups ? veteran() : fresh(); this.deps.save(JSON.stringify(this.p)) }
    this.deps.show(due(this.p))
  }

  /** The visitor did `step`: keep it, play the spark if that finished the hint on show, then show what is due. */
  did(step: Step) {
    const before = this.p ? due(this.p) : null
    const p = this.p = record(this.p ?? fresh(), step)
    this.deps.save(JSON.stringify(p))
    const now = due(p)
    if (before && now !== before && !before.live) {
      this.deps.fx(step !== 'pick')
      this.deps.later(() => { if (this.p === p) this.deps.show(now) }, 900)
    } else this.deps.show(now)
  }

  /** A press on the hint: the live one goes; the last of the chain says to open the generate panel (true). */
  press(): boolean {
    const h = this.p && due(this.p)
    if (h?.live) { this.p = { ...this.p!, live: 'done' }; this.deps.save(JSON.stringify(this.p)); this.deps.show(due(this.p)) }
    return !!h?.opens
  }
}
