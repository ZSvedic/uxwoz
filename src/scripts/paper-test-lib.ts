// Shared parts of the paper test, build step 1 of process/plans/2026-11-06-paper-canvas.md:
// the models the three scripts call, one call with timing and cost, and the paper as text.
// The manual under test is the system prompt of every call, read as it is from its file.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEVICES, MODELS, streamModel, type Device, type ModelConfig, type ModelId } from '@uxwoz/core'

export const ROOT = resolve(import.meta.dir, '../../temp/paper-test')
export const MANUAL_FILE = resolve(import.meta.dir, '../../process/plans/2026-11-06-canvas-manual.md')
export const manual = () => readFileSync(MANUAL_FILE, 'utf8')

/**
 * Models the test adds for itself, in the scripts only: models.ts keeps its three. Prices are USD
 * per million tokens, standard tier, as the vendors' pages give them (see the journal entry).
 */
const EXTRA: Record<string, ModelConfig> = {
  'gpt-6-luna': {
    id: 'gpt-6-luna' as ModelId, label: 'GPT-6 Luna (standard)', provider: 'openai', model: 'gpt-6-luna',
    serviceTier: 'default', reasoning: { effort: 'none' },
    pricePerMTok: { input: 0.1, cachedInput: 0.01, output: 0.5 }, costEstimated: true,
  },
  'gpt-6.1-terra': {
    id: 'gpt-6.1-terra' as ModelId, label: 'GPT-6.1 Terra', provider: 'openai', model: 'gpt-6.1-terra',
    serviceTier: 'default', reasoning: { effort: 'low' },
    pricePerMTok: { input: 1.0, cachedInput: 0.05, output: 5.0 }, costEstimated: true,
  },
  // The two cheap models with the same low reasoning effort Terra and Gemini get, for a fair File test.
  'claude-haiku-5.5-think': {
    id: 'claude-haiku-5.5-think' as ModelId, label: 'Claude Haiku 5.5 (low reasoning)', provider: 'openrouter', model: 'anthropic/claude-haiku-5.5',
    providerOrder: ['anthropic'], reasoning: { effort: 'low' }, costEstimated: false,
  },
  'gpt-6-luna-low': {
    id: 'gpt-6-luna-low' as ModelId, label: 'GPT-6 Luna (standard, low reasoning)', provider: 'openai', model: 'gpt-6-luna',
    serviceTier: 'default', reasoning: { effort: 'low' },
    pricePerMTok: { input: 0.1, cachedInput: 0.01, output: 0.5 }, costEstimated: true,
  },
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash' as ModelId, label: 'Gemini 3.8 Flash', provider: 'openrouter', model: 'google/gemini-3.8-flash',
    reasoning: { effort: 'low' }, costEstimated: false,
  },
}
for (const [id, cfg] of Object.entries(EXTRA)) (MODELS as Record<string, ModelConfig>)[id] = cfg

export const isTestModel = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(MODELS, v)

export interface Call { reply: string; ms: number; costUsd: number; inputTokens: number | null; outputTokens: number | null; finish: string | null; servedModel: string | null }

/** One call with the manual as the system prompt; retries twice on an error. */
export async function callModel(model: string, user: string, maxTokens = 12000): Promise<Call> {
  for (let attempt = 1; ; attempt++) {
    const t0 = performance.now()
    let reply = ''
    try {
      for await (const ev of streamModel({ model: model as ModelId, system: manual(), user, maxTokens, signal: AbortSignal.timeout(180_000) })) {
        if (ev.type === 'text') { reply += ev.text; continue }
        return {
          reply: reply.trim(), ms: Math.round(performance.now() - t0), costUsd: ev.costUsd ?? 0,
          inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, finish: ev.finishReason, servedModel: ev.servedModel,
        }
      }
      throw new Error('the stream ended without a final event')
    } catch (err) {
      if (attempt >= 3) throw err
      console.warn(`  retry ${attempt}: ${err instanceof Error ? err.message : err}`)
    }
  }
}

/** Run jobs a few at a time. */
export async function pool<T>(items: T[], size: number, job: (t: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: size }, async () => { for (let t = queue.shift(); t !== undefined; t = queue.shift()) await job(t) }))
}

// The paper ---------------------------------------------------------------------------------------

export interface Screen { id: string; line: string; html?: string }
export interface Component { id: string; where: string; html: string }
export interface Rule { id: string; text: string }
export interface Table { id: string; rows: string[][] }
export interface Paper {
  app: string
  device: Device
  screens: Screen[]
  components: Component[]
  rules: Rule[]
  data: Table[]
}

/** The data-action targets of a fragment, pasted components put in first. */
export function actionsIn(html: string, components: Component[] = []): { target: string; line: string | null; label: string }[] {
  const full = pasteAll(html, components)
  const out: { target: string; line: string | null; label: string }[] = []
  for (const m of full.matchAll(/<(a|button)\b([^>]*)\bdata-action\s*=\s*(["'])(.*?)\3([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const v = m[4]!.trim()
    const label = m[6]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const at = v.match(/^@([a-z0-9-]+)\s*(?::\s*([\s\S]*))?$/)
    if (at) out.push({ target: at[1]!, line: at[2]?.trim() || null, label })
    else out.push({ target: v, line: null, label })
  }
  return out
}

/** Put each component's HTML into its empty paste element, as the app will when it shows a screen. */
export function pasteAll(html: string, components: Component[]): string {
  return html.replace(/<(\w+)\b[^>]*\bdata-component\s*=\s*(["'])([^"']+)\2[^>]*>([\s\S]*?)<\/\1>/gi, (all, _t, _q, id) => {
    const c = components.find((c) => c.id === id)
    return c ? c.html : all
  })
}

/** The links between screens, from the drawn ones: one line per distinct pair. */
export function paperLines(p: Paper): [string, string][] {
  const ids = new Set(p.screens.map((s) => s.id))
  const out: [string, string][] = []
  for (const s of p.screens) {
    if (!s.html) continue
    for (const a of actionsIn(s.html, p.components))
      if (ids.has(a.target) && a.target !== s.id && !out.some(([f, t]) => f === s.id && t === a.target)) out.push([s.id, a.target])
  }
  return out
}

export const tableText = (t: Table) => `${t.id}\n${t.rows.map((r) => r.join(' | ')).join('\n')}`

/** The paper as every call sends it: app, device, titles, lines, then the three boxes in full. */
export function paperText(p: Paper, opts: { drawnMark?: boolean } = {}): string {
  const titles = p.screens.map((s) => `${s.id}: ${s.line}${opts.drawnMark !== false && !s.html ? ' (no drawing yet)' : ''}`)
  return [
    `App: ${p.app}`,
    `Device: ${DEVICES[p.device].request}.`,
    '',
    'Screens, the first screen first (id: what it is for):',
    ...titles,
    '',
    'Lines (a control on the first screen opens the second):',
    ...paperLines(p).map(([f, t]) => `${f} -> ${t}`),
    '',
    `Components (${p.components.length} of 20), each with its ID, where it belongs, and its HTML:`,
    ...p.components.map((c) => `${c.id}: ${c.where}\n${c.html}`),
    '',
    `Rules (${p.rules.length} of 20):`,
    ...p.rules.map((r) => `${r.id}: ${r.text}`),
    '',
    `Data (${p.data.length} of 10 tables):`,
    ...p.data.map(tableText).join('\n\n').split('\n'),
  ].join('\n')
}

/** Visible text of a fragment, for the checks and for reading. */
export function visibleText(html: string): string {
  return html.replace(/<(script|style|title)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<meta\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lsaquo;/g, '‹').replace(/&rsaquo;/g, '›')
    .replace(/\s+/g, ' ').trim()
}

/** Number the parts of a variant, as filing in the app does. */
export { numberParts } from '@uxwoz/core'

