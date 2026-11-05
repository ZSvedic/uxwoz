// Round D: the tabs and Back code draws. Back reads ‹ Back while ui.back is open, and a redraw in
// place (a spec change, by message) gives the same screen as a first build with the new spec.
import { describe, expect, test } from 'bun:test'
import { DEFAULT_BACK, applyChrome, chromeOf, drawChrome, framePage, parsePlan, setUserLine, type Spec } from '@uxwoz/core'

const spec = (nav: string | null, back: string | null): Spec => {
  const s = parsePlan('ui.nav ? main navigation\nui.back ? the label Back shows')
  if (nav) setUserLine(s, 'ui.nav', nav)
  if (back) setUserLine(s, 'ui.back', back)
  return s
}
const SCREEN = '<a data-ui="back" data-action="back">Settings</a><h1>Night</h1><nav data-ui="tabs" style="position:sticky"><a data-action="@home">Home</a></nav><script>start()</script>'
const BARE = '<h1>Night</h1><button data-ui="back" data-action="back">←</button><script>start()</script>'

describe('Back\'s label while ui.back is open', () => {
  test('is ‹ Back, open or missing; the quoted label takes over once the row is filled', () => {
    expect(DEFAULT_BACK).toBe('‹ Back')
    expect(drawChrome(SCREEN, spec(null, null), 'night')).toContain('<a data-ui="back" data-action="back">‹ Back</a>')
    expect(drawChrome(SCREEN, {}, 'night')).toContain('>‹ Back</a>')
    expect(drawChrome(SCREEN, spec(null, '"← Nights", top left'), 'night')).toContain('>← Nights</a>')
  })
})

describe('a redraw gives what a first build gives', () => {
  const cases: [string, Spec, Spec][] = [
    ['tabs relabelled', spec('Tabs: Home @home, History @history', null), spec('Tabs: Home @home, Nights @history, Remedies @remedies', null)],
    ['Back decided', spec('Tabs: Home @home, History @history', null), spec('Tabs: Home @home, History @history', '"← Back", top left')],
    ['the tab bar arrives', spec(null, null), spec('Tabs: Home @home, History @history', null)],
  ]
  for (const [what, before, after] of cases) test(what, () => {
    for (const html of [SCREEN, BARE]) {
      const first = drawChrome(html, before, 'history')
      expect(applyChrome(first, chromeOf(after, 'history'))).toBe(drawChrome(html, after, 'history'))
    }
  })

  test('the frame page applies the chrome on its first build, and its script redraws in place on a message', () => {
    const s = spec('Tabs: Home @home, History @history', '"‹ Back", top left')
    const page = framePage(SCREEN, '', true, 'phone', false, chromeOf(s, 'night'))
    expect(page).toContain(`<main>${drawChrome(SCREEN, s, 'night')}</main>`)
    expect(page).toContain("e.data.uxwoz === 'chrome'")
    expect(page).toContain("navs[0].outerHTML = bar")
  })
})
