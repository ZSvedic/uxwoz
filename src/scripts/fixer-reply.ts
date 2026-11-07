// Print what the fixer's model replies to a visit of one mockup in a cache file, as the app would
// send it on a first visit (every screen). Nothing is applied.
//   bun --env-file=../.env scripts/fixer-reply.ts <cache.json> [times] [start of the app's prompt]
import { HOME_LINE, HOME_NAME, ScreenCache, askBackground, isComponent, numberParts, visitRequest } from '@uxwoz/core'

const [file, times = '1', start = ''] = process.argv.slice(2)
const loaded = new ScreenCache(file!)
const app = loaded.apps().find((a) => a.app.startsWith(start))!.app
const all = loaded.map(app).entries.filter((e) => !isComponent(e) && e.versions.length)
const user = visitRequest(loaded.paper(app, all[0]!.versions.at(-1)!.device), all.map((e) => ({ id: e.name ?? HOME_NAME, line: e.action ?? HOME_LINE, html: numberParts(e.versions.at(-1)!.html) })))
if (process.env.SHOW) console.log(user)
await Promise.all(Array.from({ length: Number(times) }, async (_, i) => {
  const t0 = performance.now()
  const { reply, final } = await askBackground(user, {}, 8000)
  console.log(`--- reply ${i + 1}, ${((performance.now() - t0) / 1000).toFixed(1)} s, $${final.costUsd?.toFixed(4)}\n${reply}`)
}))
