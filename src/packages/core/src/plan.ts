// The plan: one call to a strong model before a mockup's first screen, for its core flow and the
// open rows of its spec (spec/prompt-plan.md holds the same prompt; a test keeps them equal).
// A plan that fails or is slow gives an empty spec: the first screen never waits on it for long.

import type { Device } from './frame.ts'
import type { ModelId } from './models.ts'
import { streamModel, type Fetch } from './providers.ts'
import { parsePlan, type Spec } from './spec.ts'

export const PLAN_MODEL: ModelId = 'gpt-6.1-sol-ultrafast'
/** The longest the first screen waits for the plan; it took about 2 s in the planner test, 4.6 s at worst. */
export const PLAN_MS = 6_000

export const PLANNER_PROMPT = `You plan a clickable mockup before its first screen is made. A cheap model then makes the screens one at a time, each alone, so whatever two screens must agree on is decided once, in this plan. Reply with plain lines only: no markdown, no prose, no blank lines.

The first line is the core flow: the main path a user takes to reach the reason for this app, as 3 to 5 screen names from @home joined by →, each name once, e.g.
product.core-flow @home → @menu → @order-checkout → @order-status
Then up to 8 open rows, one per line: a key, a space, ?, a space, and the short question the row settles, e.g.
ui.nav ? main navigation

- A row is a rule several screens must match, such as how Back looks or what a color means. Never something one screen shows, such as the fields of one form or the content of one page, and never the screen's size: the app fixes that.
- Use these keys when they fit: ui.nav (main navigation), ui.back (how Back looks and where it sits), ui.forms (how forms and their buttons are laid out), ui.lists (how lists and their items look), ui.toggles (switches or checkboxes), ui.colors (what colors mean), ui.charts (how data is drawn), ui.map (how the map, its pins and zoom work), ui.hud (what stays on screen during play).
- Make up a key only when none of these fits: ui. and 1-3 lowercase words joined by dashes, e.g. ui.filters. Never a second name for one listed above.
- A fact that several screens show and could get wrong, such as what a score means or which units a value uses, is a data. row, e.g. data.units ? which units distances use.
- A screen name is 1-4 lowercase words joined by dashes.
- Each line is at most 120 characters. Ask only what this app needs: fewer rows beat filler.`

/** The planner's request: the app prompt and the kind of device, never its width (a width ends up in the rows). */
export const planRequest = (app: string, device: Device) =>
  `${app}\n\nThe mockup is for ${device === 'desktop' ? 'a desktop browser' : 'a phone'}.`

export interface PlanOptions {
  fetch?: Fetch
  env?: Record<string, string | undefined>
  signal?: AbortSignal
  /** The longest to wait, PLAN_MS by default. */
  ms?: number
}

/** The plan for a new mockup: its core flow and open rows. Throws on an error or a slow reply. */
export async function makePlan(app: string, device: Device, o: PlanOptions = {}): Promise<Spec> {
  const deadline = AbortSignal.timeout(o.ms ?? PLAN_MS)
  const signal = o.signal ? AbortSignal.any([o.signal, deadline]) : deadline
  let reply = ''
  try {
    for await (const ev of streamModel({ model: PLAN_MODEL, system: PLANNER_PROMPT, user: planRequest(app, device), maxTokens: 4000, signal, fetch: o.fetch, env: o.env })) {
      if (ev.type === 'text') reply += ev.text
      else if (ev.finishReason !== 'stop') throw new Error(`the plan was cut off (${ev.finishReason ?? 'no end'})`)
    }
  } catch (err) {
    if (deadline.aborted) throw new Error(`no plan within ${(o.ms ?? PLAN_MS) / 1000} s`)
    throw err
  }
  return parsePlan(reply)
}
