// Run by hand from src/: bun scripts/voice-check.ts [--url http://localhost:3000] [--say "Hey Woz, use switches."]
//   [--voice Samantha] [--player "afplay"] [--keep]
// Checks voice input end to end: a macOS voice says an Edit through the speakers, a separate Chrome with its own
// profile hears it through the real microphone, and this prints what Chrome heard, what the label showed and
// whether the Edit was sent. Every POST to /api/ (the Edit's, a new screen's, the warm-up) is stopped before it
// reaches the server, so a run costs nothing. Chrome's fake microphone does not reach speech recognition, hence the speakers.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Subprocess } from 'bun'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}
const url = arg('url', 'http://localhost:3000').replace(/\/$/, '')
const say = arg('say', 'Hey Woz, use switches.')
const voice = arg('voice', 'Samantha')
const player = arg('player', 'afplay').split(' ')
const keep = process.argv.includes('--keep')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const dir = mkdtempSync(join(tmpdir(), 'uxwoz-voice-'))
const clip = join(dir, 'clip.aiff')
let chrome: Subprocess | undefined, ws: WebSocket | undefined, finishing = false
// Our Chrome is always closed and its profile deleted: on Ctrl-C, and when something throws.
process.on('SIGINT', () => finish(130, 'Stopped.'))
try { await check() } catch (e) { await finish(2, `FAIL: the check itself broke: ${e instanceof Error ? e.message : e}`) }

async function check() {
  if ((await Bun.spawn(['say', '-v', voice, '-o', clip, say]).exited) !== 0) await finish(2, `FAIL: say could not make the clip with the voice ${voice}`)

  // A free port for Chrome's remote debugging.
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = probe.port
  probe.stop(true)
  chrome = Bun.spawn([CHROME, `--user-data-dir=${join(dir, 'profile')}`, `--remote-debugging-port=${port}`, '--no-first-run',
    '--no-default-browser-check', '--use-fake-ui-for-media-stream', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })

  let tab: { webSocketDebuggerUrl: string } | undefined
  for (let i = 0; i < 40 && !tab; i++) {
    await Bun.sleep(250)
    const list = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json() as Promise<{ type: string; webSocketDebuggerUrl: string }[]>).catch(() => [])
    tab = list.find((t) => t.type === 'page')
  }
  if (!tab) await finish(2, 'FAIL: Chrome did not start (is Google Chrome in /Applications?)')

  // CDP over a WebSocket: numbered calls, and the Edit's request recorded and failed when it comes.
  const socket = new WebSocket(tab!.webSocketDebuggerUrl)
  ws = socket
  await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = no })
  let next = 0
  const waiting = new Map<number, (v: any) => void>()
  let sent: string | null = null
  socket.onmessage = (m) => {
    const d = JSON.parse(String(m.data))
    if (d.id) waiting.get(d.id)?.(d.result ?? { error: d.error })
    if (d.method === 'Fetch.requestPaused') {
      const { requestId, request } = d.params
      if (request.method !== 'POST') return cdp('Fetch.continueRequest', { requestId })
      if (request.url.includes('/api/revise')) sent = JSON.parse(request.postData ?? '{}').change ?? ''
      cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
    }
  }
  const cdp = (method: string, params: object = {}) => new Promise<any>((ok) => { waiting.set(++next, ok); socket.send(JSON.stringify({ id: next, method, params })) })
  const run = async (expression: string) => (await cdp('Runtime.evaluate', { expression, userGesture: true, returnByValue: true, awaitPromise: true })).result?.value

  // Before the page loads: log every recognition event with its time since the page started.
  const LOG = `window.__voice = []; const t0 = Date.now(), log = (...a) => window.__voice.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + a.join(' '));
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (R) { class Logged extends R { constructor() { super();
    for (const n of ['start', 'audiostart', 'speechstart', 'end']) this.addEventListener(n, () => log(n));
    this.addEventListener('error', (e) => log('error', e.error));
    this.addEventListener('result', (e) => { for (let i = e.resultIndex; i < e.results.length; i++) log('result', e.results[i].isFinal ? 'final' : 'interim', JSON.stringify(e.results[i][0].transcript)) }) } }
    window.SpeechRecognition = window.webkitSpeechRecognition = Logged }`
  await cdp('Page.enable')
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] })
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: LOG })
  await cdp('Page.navigate', { url: `${url}/?design=still` })
  await Bun.sleep(2500)

  // A screen must be current for the Edit: open the newest mockup from Recent, then press its first screen.
  const hasCard = () => run(`!!document.querySelector('.card iframe')`)
  if (!(await hasCard())) {
    if (!(await run(`(() => { const b = document.querySelector('#recent .item'); b?.click(); return !!b })()`))) await finish(2, 'open a mockup with a screen first')
    for (let i = 0; i < 20 && !(await hasCard()); i++) await Bun.sleep(250)
    if (!(await hasCard())) await finish(2, 'open a mockup with a screen first')
  }
  await Bun.sleep(1000)
  const at = await run(`(() => { const r = document.querySelector('.card .screen')?.getBoundingClientRect(); return r && [r.left + 6, r.top + 6] })()`)
  if (!at) await finish(2, 'open a mockup with a screen first')
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 })

  const mic = await run(`(() => { const b = document.querySelector('button.voice'); if (!b || b.hidden) return null; b.click(); return b.className })()`)
  if (!mic) await finish(1, 'FAIL: no microphone button (this Chrome has no speech recognition?)')
  console.log(`Microphone on. Waiting 6 s, then playing "${say}" (${voice}).`)

  // Watch the page while the clip plays and for 15 s after: the label, the Edit field, the hint, the red pill.
  const seen = { label: new Set<string>(), hint: new Set<string>(), error: new Set<string>(), woke: false, field: '' }
  const look = async () => {
    const s = await run(`JSON.stringify({ label: document.querySelector('.voice-heard:not([hidden])')?.textContent ?? '',
      field: document.getElementById('change')?.value ?? '', mic: document.querySelector('button.voice')?.className ?? '',
      hint: document.getElementById('hint')?.hidden ? '' : document.getElementById('hint')?.textContent ?? '',
      error: document.getElementById('error')?.hidden ? '' : document.getElementById('errorText')?.textContent ?? '' })`)
    const v = JSON.parse(s ?? '{}')
    for (const k of ['label', 'hint', 'error'] as const) if (v[k]) seen[k].add(v[k])
    if (/voice-(awake|countdown)/.test(v.mic)) seen.woke = true
    if (v.field) seen.field = v.field
  }
  const watch = async (ms: number) => { for (const end = Date.now() + ms; Date.now() < end && sent == null; await Bun.sleep(200)) await look() }
  await watch(6000)
  const play = Bun.spawn([...player, clip]).exited
  await watch(1000)
  await play
  await watch(15000)

  const events: string[] = (await run('window.__voice')) ?? []
  console.log('\nRecognition events:\n' + (events.map((e) => '  ' + e).join('\n') || '  none'))
  console.log('\nThe label showed:\n' + ([...seen.label].map((l) => '  ' + l).join('\n') || '  nothing'))
  for (const h of seen.hint) console.log(`The hint said: ${h}`)
  for (const e of seen.error) console.log(`The red pill said: ${e}`)
  console.log(`The Edit field: "${seen.field}"\n`)

  const errors = events.filter((e) => / error /.test(e) && !/no-speech/.test(e)).map((e) => e.split(' error ')[1])
  const heard = events.filter((e) => / result final /.test(e)).map((e) => JSON.parse(e.split(' result final ')[1]!) as string).filter((t) => t.trim())
  if (sent != null) console.log(`The Edit sent: "${sent}"`)
  if (sent != null && (sent as string).trim()) await finish(0, `PASS: the Edit was sent: "${sent}"`)
  if (sent != null) await finish(1, 'FAIL: woke but sent no words')
  if (!events.length) await finish(1, 'FAIL: no recognition events: speech recognition never started')
  if (errors.length) await finish(1, `FAIL: recognition reported an error: ${[...new Set(errors)].join(', ')}`)
  if (!heard.length) await finish(1, 'FAIL: nothing heard: is the room quiet and can the microphone hear the speakers?')
  if (!seen.woke) await finish(1, `FAIL: heard but did not wake: ${heard.map((t) => `"${t.trim()}"`).join(', ')}`)
  await finish(1, 'FAIL: woke but no Edit was sent')
}

/** Say how it ended, close our Chrome, delete its profile unless --keep, and exit. */
async function finish(code: number, line: string): Promise<never> {
  if (finishing) return new Promise<never>(() => {})
  finishing = true
  console.log(line)
  ws?.close()
  chrome?.kill()
  await chrome?.exited
  if (keep) console.log(`Kept the clip and the profile in ${dir}`)
  else rmSync(dir, { recursive: true, force: true })
  process.exit(code)
}
