// The look's motion and sound (design/fx.ts): it loads without a page, sound is off by default, its hook classes are
// still set by the feature files, and every animation lives in motion.css.
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { HOOKS, playSound, soundOn } from '../packages/web/src/design/fx.ts'

const WEB = resolve(import.meta.dir, '../packages/web/src')
const DESIGN = resolve(WEB, 'design')
const read = (path: string) => readFileSync(path, 'utf8')

describe('fx.ts', () => {
  test('loads under bun with no page, and a sound there is harmless', () => {
    expect(typeof document).toBe('undefined')
    playSound('whoosh')
  })

  test('sound is off unless stored as on', () => {
    expect([soundOn(null), soundOn('off'), soundOn(''), soundOn('on')]).toEqual([false, false, false, true])
  })

  test('every hook is set by the feature file named for it', () => {
    // A quoted class list or id that holds the name (el('div', 'or'), class="drawer", `box box-${name}`), a key of the
    // classes canvas.ts toggles ({ side: v.side, … }), or for data-id the line that sets dataset.id.
    for (const [name, file] of Object.entries(HOOKS)) {
      const data = name.startsWith('data-') ? `|\\.dataset\\.${name.slice(5)} = ` : ''
      const set = new RegExp(`(['"\`])(?:[\\w-]+ )*${name}(?: [^'"\`]*)?\\1|[{,] ${name}: ${data}`)
      expect([name, file, set.test(read(resolve(WEB, file)))]).toEqual([name, file, true])
    }
  })

  test('every keyframe, animation and transition in design/ is in motion.css', () => {
    const motion = /@keyframes|\banimation(-[\w-]+)?\s*:|\btransition(-[\w-]+)?\s*:/
    for (const f of readdirSync(DESIGN).filter((f) => f.endsWith('.css') && f !== 'motion.css')) {
      expect([f, read(resolve(DESIGN, f)).match(motion)?.[0] ?? null]).toEqual([f, null])
    }
    const css = read(resolve(DESIGN, 'motion.css'))
    for (const name of ['summon', 'hand']) expect([name, css.includes(`@keyframes ${name} `)]).toEqual([name, true])
  })
})
