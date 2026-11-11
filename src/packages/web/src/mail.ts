// Mail through Resend (spec/public.md, Mail) and the texts of the emails the public app sends.

import type { Io } from '@uxwoz/core'
import { screensOf } from './people.ts'

export const RESEND_URL = 'https://api.resend.com/emails'
export const MAIL_FROM = 'UX Woz <hello@mail.uxwoz.com>'
export interface Mail { to: string; subject: string; text: string }
type Env = Record<string, string | undefined>
const envOf = (io: Io): Env => io.env ?? process.env

/** True when mail can go out: a key, or a machine that is not production (it logs instead). */
export const mailReady = (io: Io = {}) => !!envOf(io).RESEND_API_KEY || envOf(io).NODE_ENV !== 'production'

/** Sends one email. With no key outside production it logs the message. False when it did not go. */
export async function send(mail: Mail, io: Io = {}): Promise<boolean> {
  const env = envOf(io)
  const log = io.log ?? console.log
  const key = env.RESEND_API_KEY
  if (!key) {
    if (env.NODE_ENV === 'production') { log(`mail: no RESEND_API_KEY, not sent to ${mail.to}`); return false }
    log(`mail to ${mail.to}: ${mail.subject}\n${mail.text}`)
    return true
  }
  try {
    const res = await (io.fetch ?? fetch)(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.UXWOZ_MAIL_FROM || MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    })
    if (res.ok) return true
    log(`mail: Resend answered ${res.status} for ${mail.to}: ${(await res.text()).slice(0, 200)}`)
  } catch (e) {
    log(`mail: ${(e as Error).message} for ${mail.to}`)
  }
  return false
}

const about = (usd: number) => `about ${screensOf(usd)}`
const money = (usd: number) => `$${usd.toFixed(2)}`

/** The six-digit code. */
export const codeMail = (to: string, code: string): Mail => ({
  to, subject: `Your UX Woz code: ${code}`,
  text: `Your code is ${code}.\n\nType it in the tab where you asked for it. It works for 15 minutes.\n\nIf you did not ask for it, ignore this email.\n`,
})

/** The waiting top-up arrived (or the owner approved it early). */
export const readyMail = (to: string, usd: number, appUrl: string): Mail => ({
  to, subject: 'Your free screens are ready',
  text: `Your ${about(usd)} free screens are ready in UX Woz. Carry on where you left off:\n\n${appUrl}\n`,
})

/** A quota request, to the owner at once. */
export const requestMail = (to: string, r: { email: string; note: string; spent: number; allowance: number }, adminUrl: string): Mail => ({
  to, subject: `UX Woz: ${r.email} asks for more`,
  text: `${r.email} spent ${money(r.spent)} of ${money(r.allowance)} and asks for more:\n\n${r.note}\n\nApprove or refuse: ${adminUrl}\n`,
})

/** The owner's answer to a quota request, to the user. */
export const answerMail = (to: string, approved: boolean, usd: number, appUrl: string): Mail => approved
  ? { to, subject: 'You have more free screens', text: `Your request was approved: ${about(usd)} more screens are ready in UX Woz.\n\n${appUrl}\n` }
  : { to, subject: 'About your request for more screens', text: `Sorry, we cannot give more free screens right now. Your mockups stay open: look, click, export.\n\n${appUrl}\n` }

/** Sign-ups waiting for their top-up, to the owner, one email an hour at most (the caller keeps the hour). */
export const waitingMail = (to: string, count: number, adminUrl: string): Mail => ({
  to, subject: `UX Woz: ${count} sign-up${count === 1 ? '' : 's'} waiting`,
  text: `${count} new user${count === 1 ? ' waits' : 's wait'} for free screens. Approve now or let the 12 hours run: ${adminUrl}\n`,
})
