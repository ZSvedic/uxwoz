// The design sheet's script (sheet.html, at /design): the colour table read from the app's own CSS, and a ▶ per
// sound through fx.ts. Bun does not bundle an inline module script, so it is a file of its own.
import { play } from './fx.ts'

/** Every custom property on :root, by day and inside the dark rule by night, from every sheet and its imports; not the
    ones Bun adds when it bundles. */
const light = new Map<string, string>(), dark = new Map<string, string>()
function walk(rules: CSSRuleList, into: Map<string, string>) {
  for (const r of rules) {
    if (r instanceof CSSImportRule && r.styleSheet) walk(r.styleSheet.cssRules, into)
    else if (r instanceof CSSMediaRule && r.conditionText.includes('prefers-color-scheme: dark')) walk(r.cssRules, dark)
    else if (r instanceof CSSStyleRule && r.selectorText === ':root') for (const p of r.style) if (p.startsWith('--') && !p.startsWith('--buncss')) into.set(p, r.style.getPropertyValue(p).trim())
  }
}
for (const s of document.styleSheets) try { walk(s.cssRules, light) } catch { /* another origin's sheet */ }

/** A value with its var() chain followed, by day or by night. */
const at = (night: boolean) => (n: string) => (night && dark.get(n)) || light.get(n) || ''
const resolve = (v: string, get: (n: string) => string) => { for (let i = 0, m; i < 9 && (m = v.match(/^var\((--[\w-]+)\)$/)); i++) v = get(m[1]!); return v }
const span = (text: string, swatch?: string) => {
  const s = document.createElement('span'), i = document.createElement('i')
  if (swatch && (/gradient\(/.test(swatch) || (!swatch.includes('var(') && CSS.supports('color', swatch)))) { i.className = 'sheet-sw'; i.style.background = swatch; s.append(i) }
  s.append(text)
  return s
}
const isRole = (n: string) => /^var\(/.test(light.get(n)!)
const names = [...light.keys()].sort((a, b) => Number(isRole(a)) - Number(isRole(b)))
document.getElementById('colours')!.append(...names.flatMap((n) => {
  const head = span(n + ' ')
  if (isRole(n)) head.append(Object.assign(document.createElement('em'), { textContent: `→ ${light.get(n)!.slice(4, -1)}` }))
  return [head, ...[false, true].map((night) => { const v = night ? dark.get(n) ?? light.get(n)! : light.get(n)!; const r = resolve(v, at(night)); return span(r, r) })]
}))

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sound]')) b.addEventListener('click', () => play(b.dataset.sound as Parameters<typeof play>[0]))
