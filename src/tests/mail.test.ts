// Mail through Resend with a fake fetch, and the texts of the emails.
import { expect, test } from 'bun:test'
import type { Fetch } from '@uxwoz/core'
import { MAIL_FROM, RESEND_URL, answerMail, codeMail, contactOf, mailReady, requestMail, send } from '../packages/web/src/mail.ts'

function fake(status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  const f: Fetch = async (url, init) => { calls.push({ url, init: init! }); return new Response(status === 200 ? '{"id":"x"}' : 'nope', { status }) }
  return { f, calls }
}

test('a mail goes to Resend with the key, the sender, one recipient and plain text', async () => {
  const { f, calls } = fake()
  expect(await send(codeMail('ana@example.com', '123456'), { fetch: f, env: { RESEND_API_KEY: 're_test' } })).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe(RESEND_URL)
  expect(calls[0]!.init.method).toBe('POST')
  expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
  expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
    from: MAIL_FROM, to: ['ana@example.com'], subject: 'Your UX Woz code: 123456', text: expect.stringContaining('15 minutes'),
  })
})

test('UXWOZ_MAIL_FROM changes the sender', async () => {
  const { f, calls } = fake()
  await send(codeMail('a@b.co', '000001'), { fetch: f, env: { RESEND_API_KEY: 'k', UXWOZ_MAIL_FROM: 'Me <me@x.co>' } })
  expect(JSON.parse(calls[0]!.init.body as string).from).toBe('Me <me@x.co>')
})

test('a refusal or a network error is false and logged', async () => {
  const logs: string[] = []
  const { f } = fake(422)
  expect(await send(codeMail('a@b.co', '1'), { fetch: f, env: { RESEND_API_KEY: 'k' }, log: (m) => logs.push(m) })).toBe(false)
  const broken: Fetch = async () => { throw new Error('offline') }
  expect(await send(codeMail('a@b.co', '1'), { fetch: broken, env: { RESEND_API_KEY: 'k' }, log: (m) => logs.push(m) })).toBe(false)
  expect(logs).toEqual([expect.stringContaining('422'), expect.stringContaining('offline')])
})

test('no key: logged on a dev machine, not sent in production', async () => {
  const { f, calls } = fake()
  const logs: string[] = []
  expect(await send(codeMail('a@b.co', '654321'), { fetch: f, env: {}, log: (m) => logs.push(m) })).toBe(true)
  expect(logs[0]).toContain('654321')
  expect(await send(codeMail('a@b.co', '654321'), { fetch: f, env: { NODE_ENV: 'production' }, log: (m) => logs.push(m) })).toBe(false)
  expect(logs[1]).not.toContain('654321')
  expect(calls).toHaveLength(0)
  expect(mailReady({ env: {} })).toBe(true)
  expect(mailReady({ env: { NODE_ENV: 'production' } })).toBe(false)
  expect(mailReady({ env: { NODE_ENV: 'production', RESEND_API_KEY: 'k' } })).toBe(true)
})

test('the texts', () => {
  const r = requestMail('owner@x.co', [{ email: 'ana@example.com', note: 'For a pitch on Friday', spent: 0.25, allowance: 0.25 }], 'https://app.uxwoz.com/admin')
  expect(r.to).toBe('owner@x.co')
  expect(r.subject).toBe('UX Woz: ana@example.com asks for more')
  expect(r.text).toContain('For a pitch on Friday')
  expect(r.text).toContain('$0.25 of $0.25')
  expect(r.text).toContain('/admin')
  const two = requestMail('o@x.co', [{ email: 'a@x.co', note: 'one', spent: 0, allowance: 0.25 }, { email: null, note: 'two', spent: 0, allowance: 0.25 }], 'u')
  expect(two.subject).toBe('UX Woz: 2 people ask for more')
  expect(two.text).toMatch(/one[\s\S]*someone spent[\s\S]*two/)
  expect(answerMail('a@b.co', true, 0.5, 'u').text).toContain('about 125 more screens')
  expect(answerMail('a@b.co', false, 0.5, 'u').subject).toContain('request')
  for (const m of [codeMail('a', '1'), r, two, answerMail('a', true, 1, 'u'), answerMail('a', false, 1, 'u')])
    expect(m.subject + m.text).not.toContain('—')
  expect(contactOf({ UXWOZ_CONTACT: ' c@x.co ', UXWOZ_ADMIN_EMAIL: 'o@x.co' })).toBe('c@x.co')
  expect(contactOf({ UXWOZ_ADMIN_EMAIL: 'o@x.co' })).toBe('o@x.co')
  expect(contactOf({})).toBe('')
})
