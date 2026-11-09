// Export project: a mockup as a zip a coding or design agent can build the real front end from.
// The prompt, the boxes, every drawn screen as a page that opens from disk; no fixer's notes, no history.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEVICES, HOME_NAME, LEGACY_WIDTH, VIEWPORT_H, MODELS, NAV_CSS, SCREEN_CSS, componentsOf, isComponent, linksIn, normalizePrompt, pasteComponents,
  plannedScreens, screenKey, screenName, screenTree, tableMarkdown, zip, type Boxes, type CacheEntry, type ScreenCache, type ZipFile,
} from '@uxwoz/core'

const THEMES_DIR = resolve(import.meta.dir, '../themes')

/** The file name of a mockup: letters, digits and dashes from its prompt, at most 40. */
export const slugOf = (app: string) => app.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'mockup'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** The prompt's first line, cut at a word to at most `n` characters. */
const short = (s: string, n: number) => {
  const l = s.split('\n')[0]!.trim(), cut = l.lastIndexOf(' ', n - 1)
  return l.length <= n ? l : l.slice(0, cut > 0 ? cut : n - 1) + '…'
}
const nameOf = (e: CacheEntry) => e.name ?? HOME_NAME
const titleOf = (e: CacheEntry) => e.versions.at(-1)?.name || screenName(e.versions.at(-1)?.html ?? '') || nameOf(e)

// In the export a click on a control whose action names a drawn screen opens its page; `back` goes
// back; any other control, and any plain link, does nothing.
const linkScript = (files: Record<string, string>) => `(() => {
  const files = ${JSON.stringify(files)}
  const go = (action) => {
    const a = String(action || '').trim()
    if (/^back$/i.test(a)) return history.back()
    const m = a.match(/^@([a-z0-9][a-z0-9_-]*)/i)
    const file = files[m ? m[1].toLowerCase() : /^home$/i.test(a) ? 'home' : '']
    if (file) location.href = file
  }
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element && e.target.closest('[data-action], a[href]')
    if (!el || el.matches('form')) return
    e.preventDefault()
    go(el.getAttribute('data-action'))
  }, true)
  document.addEventListener('submit', (e) => {
    e.preventDefault()
    go(e.target.getAttribute('data-action') || (e.submitter && e.submitter.getAttribute('data-action')))
  }, true)
})()`

/** One drawn screen as a standalone page: the theme inlined, components pasted, as wide as its device and at least as tall. */
export function screenPage(e: CacheEntry, components: Record<string, string>, css: string, files: Record<string, string>): string {
  const v = e.versions.at(-1)!
  const d = v.device && DEVICES[v.device]
  // The screen sits centred on a grey page, as wide as its device and at least as tall. A transform
  // makes it hold its fixed bars (a bottom tab bar), as the app's frame does.
  const size = `html, body { background: #e4e4e4; } body { margin: 0; padding: 24px 0; }
body > main { max-width: ${d ? d.width : LEGACY_WIDTH}px; margin: 0 auto; transform: translateZ(0); background: var(--pico-background-color, #fff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, .15); min-height: ${d ? d.height : VIEWPORT_H}px; }`
  const html = vhToPx(pasteComponents(v.html, components), d ? d.height : VIEWPORT_H)
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titleOf(e))}</title>`
    + `<style>${css.replace(/<\/style/gi, '<\\/style')}</style><style>${SCREEN_CSS}\n${NAV_CSS}\n${size}</style>`
    + `<script>${linkScript(files)}</script></head><body><main>${html}</main></body></html>\n`
}

/** vh units in the screen's styles become pixels of the device's height, as the app's frame turns them, so the page looks the same on any window. */
export function vhToPx(html: string, height: number): string {
  const px = (css: string) => css.replace(/(-?\d*\.?\d+)[dsl]?vh\b/g, (_, n: string) => `${parseFloat(n) * height / 100}px`)
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_, a: string, css: string, b: string) => a + px(css) + b)
    .replace(/(\sstyle\s*=\s*)("[^"]*"|'[^']*')/gi, (_, a: string, s: string) => a + px(s))
}

/** README.md: the prompt, devices and models, the screen tree with the controls that lead to each screen, the screens not drawn yet. */
function readme(app: string, all: CacheEntry[], screens: CacheEntry[], components: Record<string, string>): string {
  const tree = screenTree(all), byKey = new Map(screens.map((e) => [e.key, e]))
  const versions = screens.map((e) => e.versions.at(-1)!)
  const devices = [...new Set(versions.map((v) => (v.device ? `${DEVICES[v.device].label} (${DEVICES[v.device].width} px wide)` : `${LEGACY_WIDTH} px wide`)))]
  const models = [...new Set(versions.map((v) => MODELS[v.model]?.label ?? v.model))]
  // Who leads to each screen: "label" on the screen the control sits on.
  const into = new Map<string, string[]>()
  for (const from of screens) for (const l of linksIn(pasteComponents(from.versions.at(-1)!.html, components))) {
    const to = l.action.match(/^@([a-z0-9][a-z0-9_-]*)/i)?.[1]?.toLowerCase() ?? (normalizePrompt(l.action) === 'home' ? HOME_NAME : '')
    const by = `"${l.label || '(no label)'}" on ${titleOf(from)}`
    if (to && to !== nameOf(from) && !into.get(to)?.includes(by)) into.set(to, [...into.get(to) ?? [], by])
  }
  const line = (e: CacheEntry, depth: number) => `${'  '.repeat(depth)}- **${titleOf(e)}** ([screens/${nameOf(e)}.html](screens/${nameOf(e)}.html), \`@${nameOf(e)}\`): `
    + `${e.action ?? 'the first screen'}${into.get(nameOf(e)) ? `. Reached by ${into.get(nameOf(e))!.join(', ')}` : ''}`
  const out: string[] = [], seen = new Set<string>()
  const walk = (key: string, depth: number) => {
    const e = byKey.get(key)
    if (e) { out.push(line(e, depth)); seen.add(key) }
    for (const [k, n] of tree) if (n.parent === key) walk(k, e ? depth + 1 : depth)
  }
  walk(screenKey(app, null), 0)
  const unreached = screens.filter((e) => !seen.has(e.key))
  const planned = plannedScreens(all)
  return [
    `# ${short(app, 80)}`, '', 'A clickable mockup made with UX Woz. Read HANDOFF.md first.', '',
    '## Prompt', '', 'As the user typed it:', '', '```text', app, '```', '',
    `- Device: ${devices.join(', ')}`, `- Drawn by: ${models.join(', ')}`, `- Screens: ${screens.length} drawn, ${planned.length} not drawn yet`, '',
    '## Screens', '', 'Each screen hangs under the screen with the fewest clicks to it, starting at Home.', '', ...out, '',
    ...unreached.length ? ['## Not reached from Home', '', ...unreached.map((e) => line(e, 0)), ''] : [],
    ...planned.length ? ['## Not drawn yet', '', 'Screens the drawn ones link to. Design them in the style of the rest.', '',
      ...planned.map((p) => `- \`@${p.name}\`: ${p.action}${into.get(p.name!) ? `. Reached by ${into.get(p.name!)!.join(', ')}` : ''}`), ''] : [],
  ].join('\n')
}

const HANDOFF = (app: string) => `# Handoff

This folder is a clickable mockup of one app, made with UX Woz. Build the real front end from it.

## What is here

- \`README.md\`: the prompt the app came from, the device, and the screen tree: every screen, what it is for, and which controls lead to it.
- \`screens/\`: one HTML page per screen. Open \`screens/home.html\` in a browser and click through: the blue controls open other screens.
- \`rules.md\`: the rules every screen follows. They are binding: the real app must follow them too.
- \`data.md\`: sample data the screens show. Seed the app with it, so the first build looks like the mockup.
- \`components.md\`: the parts shared across screens (a tab bar, a header). Build each one once and reuse it.

## What is the spec and what is not

The screens' structure is the spec: what each screen shows, in what order, its controls and labels, and where each control leads.
The look is not: the hand-drawn sketch style and the blue of the links only mark a mockup. Replace them with a real theme or the project's design system.

## Build order

1. The components in \`components.md\`.
2. The screens, from Home outward, level by level as \`README.md\` lists them.
3. The screens under "Not drawn yet", if any, in the style of the rest.

## Prompt to paste

\`\`\`text
In this folder is a clickable mockup of "${short(app, 120)}". Read HANDOFF.md and README.md,
then build the real front end: follow rules.md, seed with data.md, build the components in
components.md first, then every screen in screens/ from Home outward, with the same structure,
labels and navigation. Use a real theme instead of the sketch look.
\`\`\`
`

/** The zip's files for a mockup, or null when it has no picked first screen. */
export function exportFiles(app: string, entries: CacheEntry[], boxes: Boxes, css: string): ZipFile[] | null {
  const root = entries.find((e) => e.key === screenKey(app, null))
  if (!root?.versions.length) return null
  const components = componentsOf(entries)
  const screens = entries.filter((e) => !isComponent(e) && e.versions.length)
  const parts = entries.filter((e) => isComponent(e) && e.versions.length)
  const files = Object.fromEntries(screens.map((e) => [nameOf(e), `${nameOf(e)}.html`]))
  return [
    { name: 'HANDOFF.md', data: HANDOFF(app) },
    { name: 'README.md', data: readme(app, entries, screens, components) },
    { name: 'rules.md', data: ['# Rules', '', 'Every screen follows these.', '', ...boxes.rules.map((r) => `- ${r.id}: ${r.text}`), ''].join('\n') },
    { name: 'data.md', data: ['# Data', '', 'Sample data the screens show.', '', ...boxes.data.flatMap((t) => [`## ${t.id}`, '', ...tableMarkdown(t), '']), ''].join('\n') },
    { name: 'components.md', data: ['# Components', '', 'Parts shared across screens. A screen holds one where it has `data-component="ID"`.', '',
      ...parts.flatMap((c) => [`## ${c.name}`, '', `Where it belongs: ${c.action ?? ''}`, '', '```html', c.versions.at(-1)!.html, '```', ''])].join('\n') },
    ...screens.map((e) => ({ name: `screens/${nameOf(e)}.html`, data: screenPage(e, components, css, files) })),
  ]
}

/** The mockup theme as one stylesheet: Pico, then mockup.css. */
const themeCss = () => ['pico', 'mockup'].map((n) => readFileSync(join(THEMES_DIR, `${n}.css`), 'utf8')).join('\n')

/** GET /api/export?app=…: the mockup as a zip download; 404 for an unknown mockup. */
export const exportRoute = (cache: ScreenCache) => (req: Request): Response => {
  const app = new URL(req.url).searchParams.get('app')?.trim() ?? ''
  if (!app || app.length > 2000) return Response.json({ error: 'app must be 1-2000 characters' }, { status: 400 })
  const { entries, boxes } = cache.map(app)
  const first = entries.find((e) => e.key === screenKey(app, null))
  const files = first && exportFiles(first.app, entries, boxes, themeCss())
  if (!files) return Response.json({ error: 'no such mockup' }, { status: 404 })
  // One folder named like the zip, so unzip makes one folder.
  const slug = slugOf(first.app)
  return new Response(zip(files.map((f) => ({ ...f, name: `${slug}/${f.name}` }))), { headers: {
    'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${slug}.zip"`, 'Cache-Control': 'no-store',
  } })
}
