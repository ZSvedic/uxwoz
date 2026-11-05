// The review pass: after every 5 picked screens, a strong model reads the spec and the tree in the
// background. It may add open rows the mockup turned out to need, and suggest merging or rewording
// lines; a suggestion changes nothing until the user accepts it. It never changes or removes a
// filled row (spec/prompt-review.md holds the same prompt; a test keeps them equal).

import type { ModelId } from './models.ts'
import { streamModel, type Fetch } from './providers.ts'
import { MAX_LINE, fits, isSpecKey, knownKey, shapeOf, valueOf, type Spec } from './spec.ts'

export const REVIEW_MODEL: ModelId = 'gpt-6.1-sol-ultrafast'
/** A review runs after this many picked screens, and after each further this many. */
export const REVIEW_EVERY = 5
/** The longest a review may take; it runs in the background, so this only bounds its cost. */
export const REVIEW_MS = 20_000
/** At most this many rows added and suggestions made per review. */
export const MAX_REVIEW_ADDS = 3
export const MAX_REVIEW_SUGGESTIONS = 3

export const REVIEW_PROMPT = `You review the spec of a clickable mockup: the short rows every new screen of it follows. Screens are made one at a time by a cheap model, each alone, so whatever two screens must agree on belongs in the spec. You get the app, the spec (filled rows as key = value with who set them, open rows as key ? question) and the tree of its screens. Reply with plain lines only, at most 3 of each kind, no markdown, no prose; reply with nothing when the spec needs nothing.

- add key ? question: an open row the mockup turned out to need, because two or more of its screens show it and could disagree, e.g. add data.units ? which units distances use. Use ui.nav, ui.back, ui.forms, ui.lists, ui.toggles, ui.colors, ui.charts, ui.map or ui.hud when one fits, else ui., product. or data. and 1-3 lowercase words joined by dashes. Never a key the spec has.
- reword key = text: a clearer line for a filled row, saying the same decision.
- merge key, key = text: two rows that say one thing, as one line for the first key.

Never change what a row decides, never remove a row, and never ask about one screen's content. Each line is at most 120 characters.`

/** A suggestion the user may accept or dismiss: a clearer line for a row, or two rows as one. */
export interface Suggestion { id: string; kind: 'reword' | 'merge'; keys: string[]; text: string }
/** What one review did, for the spec panel. */
export interface ReviewInfo { at: string; screens: number; ms: number; costUsd: number | null; added: string[]; suggested: number; error?: string }

/** The review's request: the app, the spec with who set each line, and the tree. */
export function reviewRequest(app: string, spec: Spec, tree: string[]): string {
  const rows = Object.entries(spec).map(([k, r]) => {
    const v = r.values.at(-1)
    return v ? `${k} = ${v.text} (set by ${v.from === 'user' ? 'the user' : `a ${v.from}`})` : `${k} ? ${r.ask ?? ''}`.trimEnd()
  })
  return `The app: ${app}\n\nThe spec:\n${rows.join('\n') || '(empty)'}\n\nThe screens, as a tree:\n${tree.join('\n') || '(none)'}`
}

/**
 * The review's reply, checked: rows to add (keys the spec does not have, questions of at most 120
 * characters, within the limits) and suggestions (for filled rows only, in the shape their key needs).
 */
export function parseReview(reply: string, spec: Spec, idPrefix = ''): { adds: { key: string; ask: string }[]; suggestions: Suggestion[] } {
  const adds: { key: string; ask: string }[] = []
  const suggestions: Suggestion[] = []
  const room: Spec = JSON.parse(JSON.stringify(spec))
  for (const raw of reply.split('\n')) {
    const l = raw.trim().replace(/^[-*]\s+/, '')
    const add = l.match(/^add\s+([a-z][a-z0-9.-]*)\s+\?\s+(.+)$/i)
    if (add) {
      const key = knownKey(add[1]!.toLowerCase()), ask = add[2]!.trim()
      if (adds.length < MAX_REVIEW_ADDS && isSpecKey(key) && !room[key] && ask.length <= MAX_LINE && !ask.includes('<') && fits(room, key)) {
        room[key] = { ask, from: 'review', values: [] }
        adds.push({ key, ask })
      }
      continue
    }
    const sug = l.match(/^(reword|merge)\s+([a-z][a-z0-9.,\s-]*?)\s*=\s*(.+)$/i)
    if (!sug || suggestions.length >= MAX_REVIEW_SUGGESTIONS) continue
    const kind = sug[1]!.toLowerCase() as Suggestion['kind']
    const keys = sug[2]!.split(',').map((k) => knownKey(k.trim().toLowerCase())).filter(Boolean)
    const text = sug[3]!.replace(/\s+/g, ' ').trim()
    if ((kind === 'reword' ? keys.length !== 1 : keys.length !== 2 || keys[0] === keys[1]) || keys.some((k) => valueOf(spec, k) == null)) continue
    if (text.length > MAX_LINE || text.includes('<') || text === valueOf(spec, keys[0]!)) continue
    const shape = shapeOf({ key: keys[0]!, text })
    if (!('text' in shape)) continue
    suggestions.push({ id: `${idPrefix}${suggestions.length}`, kind, keys, text: shape.text })
  }
  return { adds, suggestions }
}

export interface ReviewOptions { fetch?: Fetch; env?: Record<string, string | undefined>; ms?: number; idPrefix?: string }

/** One review of a mockup's spec. Throws on an error or a slow reply. */
export async function makeReview(app: string, spec: Spec, tree: string[], o: ReviewOptions = {}) {
  const t0 = performance.now()
  let reply = '', costUsd: number | null = null
  const signal = AbortSignal.timeout(o.ms ?? REVIEW_MS)
  for await (const ev of streamModel({ model: REVIEW_MODEL, system: REVIEW_PROMPT, user: reviewRequest(app, spec, tree), maxTokens: 4000, signal, fetch: o.fetch, env: o.env })) {
    if (ev.type === 'text') { reply += ev.text; continue }
    if (ev.finishReason !== 'stop') throw new Error(`the review was cut off (${ev.finishReason ?? 'no end'})`)
    costUsd = ev.costUsd
  }
  return { ...parseReview(reply, spec, o.idPrefix), ms: Math.round(performance.now() - t0), costUsd }
}
