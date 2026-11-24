// The top bar (spec/behavior.md, Top bar and New project), with no DOM: the dropdown's rows, the size a window is
// offered, when the boxes fit the bar.
import { describe, expect, test } from 'bun:test'
import { NAME_ROOM, boxName, boxesFit, sizeFor, treeRows } from '../packages/web/src/bar.ts'

describe('the dropdown\'s tree', () => {
  // Home → Monstera → Care log (planned); Home → Schedule; Home → Add a plant → Scan a label (planned).
  const parent: Record<string, string | null> = { home: null, monstera: 'home', care: 'monstera', schedule: 'home', add: 'home', scan: 'add', tab: null }
  const list = [{ key: 'home' }, { key: 'monstera' }, { key: 'schedule' }, { key: 'add' }, { key: 'tab', component: true }, { key: 'care', planned: true }, { key: 'scan', planned: true }]
  const rows = treeRows(list, (k) => parent[k] ?? null, 'monstera')

  test('Home first, a step in a level deeper, each mock under the one it hangs from; no components', () => {
    expect(rows.map((r) => [r.key, r.depth])).toEqual([['home', 0], ['monstera', 1], ['care', 2], ['schedule', 1], ['add', 1], ['scan', 2]])
  })

  test('the current mock is marked, planned mocks are planned', () => {
    expect(rows.filter((r) => r.current).map((r) => r.key)).toEqual(['monstera'])
    expect(rows.filter((r) => r.planned).map((r) => r.key)).toEqual(['care', 'scan'])
    expect(treeRows(list, (k) => parent[k] ?? null, null).some((r) => r.current)).toBe(false)
  })

  test('a mock whose parent is not listed is a tree of its own after Home\'s', () => {
    const r = treeRows([{ key: 'home' }, { key: 'lost' }, { key: 'kid' }], (k) => ({ lost: 'gone', kid: 'lost' } as Record<string, string>)[k] ?? null, null)
    expect(r.map((x) => [x.key, x.depth])).toEqual([['home', 0], ['lost', 0], ['kid', 1]])
  })

  test('the boxes by their names with their icons', () => {
    expect(['rules', 'components', 'data', 'notes'].map((b) => boxName(b as 'rules'))).toEqual(['📐 Rules', '🧩 Components', '🗄️ Data', '🕵️ Fixer'])
  })
})

describe('Design for', () => {
  test('starts at this window\'s size: under 400 a small phone, 400 to 719 a large one, 720 to 1599 a laptop, wider a monitor', () => {
    expect([320, 399, 400, 719, 720, 1599, 1600, 2560].map(sizeFor)).toEqual(['small-phone', 'small-phone', 'large-phone', 'large-phone', 'laptop', 'laptop', 'monitor', 'monitor'])
  })
})

describe('the boxes in a wide bar', () => {
  test('fit while the other buttons, the boxes and the name\'s room fit the bar', () => {
    expect(boxesFit(1280, 420, 420)).toBe(true)
    expect(boxesFit(800, 420, 420)).toBe(false)
    expect(boxesFit(420 + 420 + NAME_ROOM, 420, 420)).toBe(true)
    expect(boxesFit(420 + 420 + NAME_ROOM - 1, 420, 420)).toBe(false)
  })
})
