// The look's motion and sound (design/fx.ts): it loads without a page, sound is off by default, a calm pick waits for
// nothing, its hook classes are still set by the feature files, and every animation lives in motion.css.
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { HOOKS, pickFx, pickWait, soundOn } from '../packages/web/src/design/fx.ts'

const WEB = resolve(import.meta.dir, '../packages/web/src')
const DESIGN = resolve(WEB, 'design')
const read = (path: string) => readFileSync(path, 'utf8')

describe('fx.ts', () => {
  test('loads under bun with no page, and a pick there resolves at once', async () => {
    expect(typeof document).toBe('undefined')
    await pickFx('x', 0)
  })

  test('sound is off unless stored as on', () => {
    expect([soundOn(null), soundOn('off'), soundOn(''), soundOn('on')]).toEqual([false, false, false, true])
  })

  test('a pick waits 800 ms, and nothing when still or with reduced motion', () => {
    expect([pickWait(false), pickWait(true)]).toEqual([800, 0])
  })

  test('every hook is set by the feature file named for it', () => {
    // A quoted class list or id that holds the name (el('div', 'or'), class="drawer"), or a key of the classes
    // canvas.ts toggles ({ side: v.side, … }).
    for (const [name, file] of Object.entries(HOOKS)) {
      const set = new RegExp(`(['"])(?:[\\w-]+ )*${name}(?: [\\w-]+)*\\1|[{,] ${name}: `)
      expect([name, file, set.test(read(resolve(WEB, file)))]).toEqual([name, file, true])
    }
  })

  test('no colour literal: sparks take their colours from tokens', () => {
    expect(read(resolve(DESIGN, 'fx.ts')).match(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i)?.[0] ?? null).toBeNull()
  })

  test('every keyframe, animation and transition in design/ is in motion.css', () => {
    const motion = /@keyframes|\banimation(-[\w-]+)?\s*:|\btransition(-[\w-]+)?\s*:/
    for (const f of readdirSync(DESIGN).filter((f) => f.endsWith('.css') && f !== 'motion.css')) {
      expect([f, read(resolve(DESIGN, f)).match(motion)?.[0] ?? null]).toEqual([f, null])
    }
    const css = read(resolve(DESIGN, 'motion.css'))
    for (const name of ['summon', 'lift', 'won', 'lost', 'spark', 'hand']) expect([name, css.includes(`@keyframes ${name} `)]).toEqual([name, true])
  })
})
