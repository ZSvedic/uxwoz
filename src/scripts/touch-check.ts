// Two fingers in headless Chrome (Blink, the engine of Chrome on Android) over the current mock, through the DevTools
// protocol: prints the zoom and the canvas's scroll after each step. A pan should keep the zoom; a pinch should grow it
// steadily. `bun run scripts/touch-check.ts [url] [pan|pinch|panSky|pinchSky] [ms between steps]`, with the demo running.
import { mkdtempSync } from 'node:fs'

const url = process.argv[2] ?? 'http://127.0.0.1:3131/tour'
const mode = process.argv[3] ?? 'pan'
const port = 9333
const chrome = Bun.spawn(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync('/tmp/uxwoz-touch-')}`, '--no-first-run', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let target: any
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t: any) => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const waiting = new Map<number, (v: any) => void>()
ws.addEventListener('message', (e) => { const m = JSON.parse(String(e.data)); if (m.id && waiting.has(m.id)) { waiting.get(m.id)!(m.result ?? m.error); waiting.delete(m.id) } })
const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async (expr: string) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value

await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 740, deviceScaleFactor: 3, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.navigate', { url })
await sleep(3000)
const state = () => evalJs(`(() => { const s = document.getElementById('stage'); return document.getElementById('zoomPct').textContent.trim() + ' ' + Math.round(s.scrollLeft) + ',' + Math.round(s.scrollTop) })()`)
const frameBox = await evalJs(`(() => { const f = document.querySelector('.card.current iframe') || document.querySelector('iframe'); const r = f.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })()`)
console.log('mode', mode, 'frame', frameBox.map(Math.round).join(' '), 'start', await state())
const [fl, ft, fw, fh] = frameBox
// Over the mock: the middle of the frame; over the sky: left of the frame when there is room, else above it.
let cx = fl + fw / 2, cy = ft + fh / 2
if (mode.endsWith('Sky')) { cx = 215; cy = Math.max(60, ft - 40) }
let spread = 120
const pts = (x: number, y: number, d: number) => [{ x: x - d / 2, y, id: 0 }, { x: x + d / 2, y, id: 1 }]
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(cx, cy, spread) })
const out: string[] = []
for (let i = 0; i < 30; i++) {
  if (mode.startsWith('pinch')) spread += 6
  else { cy -= 6; cx -= 2; spread += (i % 2 ? 2 : -2) } // a pan, with the small wobble real fingers have
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(cx, cy, spread) })
  await sleep(Number(process.argv[4] ?? 16))
  out.push(await state())
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
console.log(out.join(' | '))
ws.close()
chrome.kill()
process.exit(0)
