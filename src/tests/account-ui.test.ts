// The public's account button, menu and card (spec/behavior.md, The public): what each shows, given `me` and why
// the card opened, and what a refused request leads to. No DOM.
import { describe, expect, test } from 'bun:test'
import { buttonOf, cardOf, forget, menuOf, refusalOf, shows, sideOf, type Me } from '../packages/web/src/account-ui.ts'

const fresh: Me = { role: 'new', left: 0.1, allowance: 0.1, screensLeft: 14 }
const visitor: Me = { role: 'visitor', left: 0.0984, allowance: 0.1, screensLeft: 14, more: 30, may: { share: false, exportZip: false } }
const user: Me = { role: 'user', email: 'ana@example.com', left: 0, allowance: 0.25, screensLeft: 0, may: { share: true, exportZip: true } }

describe('the account button', () => {
  test('only in the public app, and never for the owner', () => {
    expect(shows({ role: 'owner' }, true)).toBe(false)
    expect(shows(visitor, false)).toBe(false)
    expect(shows(null, true)).toBe(false)
    expect(shows(fresh, true)).toBe(true)
  })

  test('a visitor\'s free screens once they made a live design, a user\'s first letter, else the icon', () => {
    expect(buttonOf(fresh)).toEqual({ text: '', letter: false })
    expect(buttonOf({ ...visitor, left: 0.1 })).toEqual({ text: '', letter: false })
    expect(buttonOf(visitor)).toEqual({ text: '14 free', letter: false })
    expect(buttonOf(user)).toEqual({ text: 'A', letter: true })
  })

  test('its menu', () => {
    expect(menuOf(visitor).map((r) => r.text)).toEqual(['About 14 free screens left', 'Register', 'Privacy'])
    expect(menuOf({ ...visitor, screensLeft: 1 })[0]!.text).toBe('About 1 free screen left')
    expect(menuOf(user).map((r) => r.text)).toEqual(['No free screens left', 'ana@example.com', 'Ask for more', 'Sign out', 'Delete my account…', 'Privacy'])
    expect(menuOf({ ...user, screensLeft: 5 }).some((r) => r.kind === 'ask')).toBe(false)
    expect(menuOf({ ...user, request: { at: 1 } }).some((r) => r.kind === 'ask')).toBe(false)
  })
})

describe('the account card', () => {
  test('a visitor: why it opened, the email, Send the code, the line on the code with Privacy', () => {
    const c = cardOf(visitor, 'allowance', 'email', '')
    expect(c.lead).toBe('You have used your free screens. Register to get about 30 more.')
    expect(cardOf(visitor, 'register', 'email', '').lead).toBe('Register to get about 30 more free screens.')
    expect(cardOf(fresh, 'allowance', 'email', '').lead).toBe('You have used your free screens. Register to get about 21 more.')
    expect(cardOf(visitor, 'guests', 'email', '').lead).toBe('Today\'s free screens for guests are used up. Register to carry on.')
    expect([c.field?.kind, c.send, c.note, c.privacy, c.again]).toEqual(['email', 'Send the code', 'No password: we email you a six-digit code.', true, false])
    expect(cardOf(visitor, 'share', 'email', '').lead).toBe('Register to share a mockup.')
    expect(cardOf(visitor, 'export', 'email', '').lead).toBe('Register to export it.')
    expect(cardOf(visitor, 'address', 'email', '').lead).toBe('This network has used today\'s free screens. Register to carry on.')
    expect(cardOf(fresh, 'register', 'email', '').field?.kind).toBe('email')
  })

  test('then the code, Verify and Send a new one', () => {
    const c = cardOf(visitor, 'allowance', 'code', 'ana@example.com')
    expect(c.lead).toBe('We sent a code to ana@example.com.')
    expect([c.field?.kind, c.send, c.again, c.privacy]).toEqual(['code', 'Verify', true, false])
  })

  test('verified into a new account: thanks with the screens it has now, nothing to fill in, no word of waiting', () => {
    const c = cardOf({ ...user, screensLeft: 30 }, 'allowance', 'thanks', 'ana@example.com')
    expect(c.lead).toBe('Thanks. You have about 30 more free screens.')
    expect([c.field, c.send]).toEqual([null, null])
  })

  test('Delete my account: the words, the email once more, Delete and Cancel', () => {
    const c = cardOf(user, 'ask', 'delete', '')
    expect(c.lead).toBe('Delete your account? Its mockups and its links go at once, for good. Type your email once more.')
    expect([c.field?.kind, c.send, c.cancel, c.again]).toEqual(['confirm', 'Delete', true, false])
  })

  test('a registered user with none left asks for more, once', () => {
    const c = cardOf(user, 'allowance', 'email', '')
    expect([c.lead, c.field?.label, c.send]).toEqual(['You have used your free screens.', 'What are you building?', 'Ask for more'])
    expect(cardOf(user, 'ask', 'asked', '').lead).toBe('Asked. The answer comes by email.')
    expect(cardOf({ ...user, request: { at: 1 } }, 'ask', 'email', '').lead).toBe('Asked. The answer comes by email.')
    expect(cardOf({ ...user, request: { at: 1, answer: 'refused' } }, 'ask', 'email', '').send).toBe('Ask for more')
  })
})

describe('a refused request', () => {
  test('402 for free screens opens the card; paused and blocked are the red pill with the server\'s words', () => {
    expect(refusalOf(402, { error: 'Your free screens are used up.', reason: 'allowance' })).toEqual({ card: 'allowance' })
    expect(refusalOf(402, { error: 'x', reason: 'address' })).toEqual({ card: 'address' })
    expect(refusalOf(402, { error: 'Live designs are paused for now. The starters still work.', reason: 'paused' })).toEqual({ pill: 'Live designs are paused for now. The starters still work.' })
    expect(refusalOf(402, { error: 'This account is closed.', reason: 'blocked' })).toEqual({ pill: 'This account is closed.' })
    expect(refusalOf(403, { error: 'Register first.', reason: 'register' })).toEqual({ card: 'register' })
  })

  test('402 for the guests\' day opens the card too', () => {
    expect(refusalOf(402, { error: 'Today\'s free screens for guests are used up. Register to carry on.', reason: 'guests' })).toEqual({ card: 'guests' })
  })

  test('a side of an A OR B the meter refused: Register for a visitor, Ask for more for a user', () => {
    expect(sideOf('Your free screens are used up.', visitor)).toEqual({ text: 'Register', why: 'allowance' })
    expect(sideOf('Today\'s free screens for guests are used up. Register to carry on.', fresh)).toEqual({ text: 'Register', why: 'guests' })
    expect(sideOf('This network has used today\'s free screens. Register to carry on.', visitor)).toEqual({ text: 'Register', why: 'address' })
    expect(sideOf('Your free screens are used up.', user)).toEqual({ text: 'Ask for more', why: 'ask' })
    expect(sideOf('the model timed out', visitor)).toBeNull()
    expect(sideOf('Your free screens are used up.', { role: 'owner' })).toBeNull()
  })

  test('anything else is not the account\'s', () => {
    expect(refusalOf(401, { error: 'x', reason: 'new' })).toBeNull()
    expect(refusalOf(403, { error: 'Only Claude Haiku is open to the public.' })).toBeNull()
    expect(refusalOf(409, { error: 'One at a time: wait for this one.' })).toBeNull()
    expect(refusalOf(500, null)).toBeNull()
  })
})

describe('after Delete my account', () => {
  test('every uxwoz: key is gone from a storage, the others stay', () => {
    const m = new Map([['uxwoz:app', 'x'], ['uxwoz:hints', '{}'], ['other', '1'], ['uxwoz:current:a', 'k']])
    const s = { get length() { return m.size }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => void m.delete(k) }
    forget(s)
    expect([...m.keys()]).toEqual(['other'])
  })
})
