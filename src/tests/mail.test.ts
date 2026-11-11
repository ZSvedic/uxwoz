// Mail through Resend with a fake fetch, and the texts of the emails.
import { expect, test } from 'bun:test'
import type { Fetch } from '@uxwoz/core'
import { MAIL_FROM, RESEND_URL, answerMail, codeMail, mailReady, readyMail, requestMail, send, waitingMail } from '../packages/web/src/mail.ts'

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
  expect(readyMail('a@b.co', 0.15, 'https://app.uxwoz.com/')).toEqual({
    to: 'a@b.co', subject: 'Your free screens are ready', text: expect.stringContaining('about 21 free screens'),
  })
  expect(readyMail('a@b.co', 0.15, 'https://app.uxwoz.com/').text).toContain('https://app.uxwoz.com/')
  const r = requestMail('owner@x.co', { email: 'ana@example.com', note: 'For a pitch on Friday', spent: 0.25, allowance: 0.25 }, 'https://app.uxwoz.com/admin')
  expect(r.to).toBe('owner@x.co')
  expect(r.subject).toContain('ana@example.com')
  expect(r.text).toContain('For a pitch on Friday')
  expect(r.text).toContain('$0.25 of $0.25')
  expect(r.text).toContain('/admin')
  expect(answerMail('a@b.co', true, 0.5, 'u').text).toContain('about 71 more screens')
  expect(answerMail('a@b.co', false, 0.5, 'u').subject).toContain('request')
  expect(waitingMail('o@x.co', 1, 'u').subject).toBe('UX Woz: 1 sign-up waiting')
  expect(waitingMail('o@x.co', 3, 'u').subject).toBe('UX Woz: 3 sign-ups waiting')
  for (const m of [codeMail('a', '1'), readyMail('a', 1, 'u'), r, answerMail('a', true, 1, 'u'), answerMail('a', false, 1, 'u'), waitingMail('a', 2, 'u')])
    expect(m.subject + m.text).not.toContain('—')
})
