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
export interface Hint {
  text: string
  /** A press on it opens the generate panel. */
  opens?: true
  live?: true
  /** The drawer tab that following it opens: opening that one does it (`ends`), and does not take it away. */
  drawer?: string
  ends?: Step
  /** Shows only while a drawn screen is current and no A OR B is open: there is something to change. */
  onScreen?: true
  /** The step that brings it: it shows at that step only, so it never comes back over something else. */
  after: Step
}

export const LIVE: Hint = { text: 'This design was drawn fresh for you, so it used one of your free screens.', live: true, after: 'live' }
const CHAIN: [Hint, (p: Progress) => boolean][] = [
  [{ text: 'Pick the one you like.', after: 'ready' }, (p) => !!p.ready && p.picks < 1],
  [{ text: 'Click anything in it.', after: 'pick' }, (p) => p.picks >= 1 && !p.click],
  [{ text: 'Change it in words: press Edit.', drawer: 'edit', ends: 'editSent', onScreen: true, after: 'pick' }, (p) => p.picks >= 2 && !p.editSent],
  [{ text: 'Changed your mind? Undo brings the old one back.', after: 'edited' }, (p) => !!p.edited && !p.undo],
  [{ text: 'That is the whole app. Now describe your own.', opens: true, after: 'undo' }, (p) => !!p.undo && !p.own],
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

/** Where the visitor is, as far as a hint on show cares: the mockup, the screen or box, the drawer, a card or panel. */
export interface Where {
  app: string | null; current: string | null; box: string | null; drawer: string | null; card: boolean
  /** A drawn screen is current (not a box); an A OR B is open somewhere in the mockup. */
  drawn: boolean; choice: boolean
}

/** Whether `h` may show where the visitor is now. */
export const fits = (h: Hint, w: Where) => !h.onScreen || (w.drawn && !w.choice)

/** The step done by opening the drawer the hint asks for, if the visitor is there now. */
export const doneBy = (h: Hint, w: Where): Step | null => (h.drawer && h.ends && w.drawer === h.drawer ? h.ends : null)

/**
 * The visitor went somewhere else since `h` showed at `then`: another mockup or screen, or they opened a box, a
 * drawer (other than the one the hint asks for), a card or a panel. Closing one is no move.
 */
export function left(h: Hint, then: Where, now: Where): boolean {
  const opened = (a: string | null, b: string | null) => b !== null && b !== a
  return then.app !== now.app || then.current !== now.current || opened(then.box, now.box)
    || (opened(then.drawer, now.drawer) && now.drawer !== h.drawer) || (now.card && !then.card)
}

/**
 * The hint on show and where it showed. Where is taken once the step that showed it has finished (`settle`, a tick
 * later): a pick shows its hint before the picked screen is current, and that screen is where the hint belongs.
 */
export class OnShow {
  hint: Hint | null = null
  private at: Where | null = null
  show(h: Hint | null) { this.hint = h; this.at = null }
  settle(w: Where) { if (this.hint && !this.at) this.at = w }
  /** The visitor went elsewhere since it settled (`left`); never before. */
  stale(w: Where) { return !!this.hint && !!this.at && left(this.hint, this.at, w) }
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

  /**
   * The first time this browser is seen: with mockups in Recent it is no first-time visitor. A page load shows no
   * hint: one still due shows again only at the step that brings it. Recent loads again often: only the first counts.
   */
  begin(hasMockups: boolean) {
    if (this.begun) return
    this.begun = true
    if (!this.p) { this.p = hasMockups ? veteran() : fresh(); this.deps.save(JSON.stringify(this.p)) }
    this.show(null)
  }
  private begun = false
  /** The hint on show, if any. */
  private on: Hint | null = null
  private show(h: Hint | null) { this.on = h; this.deps.show(h) }

  /** The visitor went elsewhere (`left`): the hint on show goes, kept due, until the step that brings it. */
  away() {
    this.show(null)
  }

  /**
   * The visitor did `step`: keep it, play the spark if that finished the hint on show, then show what is due, if this
   * step brings it or it is already on show; a hint due but brought by another step stays away (it belongs elsewhere).
   */
  did(step: Step) {
    const before = this.on
    const p = this.p = record(this.p ?? fresh(), step)
    this.deps.save(JSON.stringify(p))
    const due_ = due(p), now = due_ && (due_ === before || due_.after === step) ? due_ : null
    if (before && now !== before && !before.live) {
      this.deps.fx(step !== 'pick')
      this.on = null
      this.deps.later(() => { if (this.p === p) this.show(now) }, 900)
    } else this.show(now)
  }

  /** A press on the hint: the live one goes; the last of the chain says to open the generate panel (true). */
  press(): boolean {
    const h = this.p && due(this.p)
    if (h?.live) { this.p = { ...this.p!, live: 'done' }; this.deps.save(JSON.stringify(this.p)); this.show(null) }
    return !!h?.opens
  }
}
