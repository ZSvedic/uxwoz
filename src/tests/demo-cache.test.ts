import { describe, expect, test } from 'bun:test'
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScreenCache, isComponent, plannedScreens } from '@uxwoz/core'
import { DEMO_APP, DEMO_FILE, DEMO_TOKENS, DEMO_VISITOR } from '../scripts/make-demo-cache.ts'

describe('the demo cache', () => {
  const copy = join(mkdtempSync(join(tmpdir(), 'uxwoz-demo-')), 'cache.json')
  copyFileSync(DEMO_FILE, copy)
  const cache = new ScreenCache(copy)

  test('loads, and a load and save writes it back unchanged', () => {
    expect(cache.warning).toBeNull()
    cache.save()
    expect(readFileSync(copy, 'utf8')).toBe(readFileSync(DEMO_FILE, 'utf8'))
  })

  test('has the screens, the open A OR B, a planned screen and versions to undo', () => {
    const { entries, boxes } = cache.map(DEMO_APP)
    const screens = entries.filter((e) => !isComponent(e))
    expect(screens.filter((e) => e.versions.length).map((e) => e.name)).toEqual(['home', 'habit-detail', 'add-habit', 'stats', 'reminders'])
    expect(screens.find((e) => e.name === 'history')!.proposals!.every(Boolean)).toBe(true)
    expect(plannedScreens(entries).map((e) => e.name)).toEqual(['settings'])
    expect(cache.find(DEMO_APP, '@habit-detail')!.versions).toHaveLength(2)
    expect(entries.filter(isComponent).map((e) => e.name)).toEqual(['tab-bar'])
    expect(boxes.rules).toHaveLength(2)
    expect(boxes.data).toHaveLength(1)
    expect(boxes.visits![0]!.changes[0]!.undo).toEqual({ drop: 'rules', id: 'streak-reset' })
  })

  test('has the three share links, a pinned comment, a resolved one and a trip', () => {
    for (const [role, token] of Object.entries(DEMO_TOKENS)) {
      expect(cache.share(token)?.share.role).toBe(role as 'view')
      // The app finds an edit link's token in its path only when it is hex.
      expect(token).toMatch(/^[a-f0-9]{32}$/)
    }
    const s = cache.sharedOf(DEMO_APP)
    expect(s.feedback.find((f) => f.visitor === DEMO_VISITOR && f.about && !f.resolved)).toBeDefined()
    expect(s.feedback.some((f) => f.resolved)).toBe(true)
    expect(s.trips).toHaveLength(1)
  })

  test('stays small', () => {
    expect(readFileSync(DEMO_FILE).length).toBeLessThan(40_000)
  })
})
