// The boxes' changes and the rail tools, and the drawer: Edit and Info for the current box or screen, Comments for a screen.

import { DEVICES } from '@uxwoz/core/frame'
import { BOX_STATES, BOX_TITLES, LIMITS, VISIT_EVERY, VISITS_KEPT } from '@uxwoz/core/keys'
import { isComponent } from '@uxwoz/core/tree'
import type { Boxes } from '@uxwoz/core'
import { boxesMarkdown, countLabel, countOf, el, markBox, visitToUndo, type Box, type BoxOp } from './boxes.ts'
import { canvas, side } from './app.ts'
import { coach, fmtS, fmtUsd, post, showError } from './net.ts'
import { loadMe, refused } from './account-ui.ts'
import { applyMap, currentAt, setCurrent } from './nav.ts'
import { components, draw, ideaOf, labelOf, pastedOn, removeScreen, revise, undo, views } from './screens.ts'
import { closeMenus } from './toolbar.ts'
import { isShared, loadShared, renderShare, screenFeedback, shareToken } from './sharing.ts'
import { commentsTab, renderComments } from './comments.ts'
import { $, changeInput, drawer, enterSubmits, modelSelect, state } from './state.ts'

/** A change to the boxes, an Undo, or a visit asked for (an Edit is one); the server answers with the whole mockup. True when it was done. */
export async function boxOp(o: BoxOp | { op: 'seen'; box: Box; ids: string[] }): Promise<boolean> {
  const app = state.app
  if (!app) return false
  const res = await post('/api/box', { app, ...o }).catch(() => null)
  const body = await res?.json().catch(() => null)
  // The fixer's Undo sends the map with the changes it could not undo.
  if (body?.entries && app === state.app) applyMap(body)
  // A box's Edit and Visit now call the models: a live design, as screens.ts tells the coach.
  const live = o.op === 'edit' || o.op === 'visit'
  if (live) loadMe()
  if (res?.ok && !body?.error) { if (live) coach.did('live'); return true }
  if (res && refused(res.status, body)) { draw(); return false }
  showError(`Could not change the box: ${body?.error ?? 'no answer'}`)
  draw()
  return false
}

/** What is new in a box since the user last looked: entries by ID, visits by when they started. */
export const unseen = (box: Box): string[] => (((box === 'components' ? components() : box === 'notes' ? state.boxes?.visits : state.boxes?.[box]) ?? []) as { seen?: boolean; id?: string; name?: string; at?: string }[])
  .filter((x) => !x.seen).map((x) => x.id ?? x.name ?? x.at!)

/** A toolbar button: move the view to a box, which becomes current; after a moment its new entries are no longer marked. */
export function lookAt(box: Box) {
  if (side.el.hidden) return
  focusBox(box)
  canvas.showBox(side.sections[box])
  // Only the entries new at the look count as seen: one filed meanwhile stays marked.
  const ids = unseen(box)
  if (ids.length) setTimeout(() => boxOp({ op: 'seen', box, ids }), 3000)
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-box]')) b.addEventListener('click', () => { closeMenus(); lookAt(b.dataset.box as Box) })

/** Export: the three boxes as a markdown file. */
$('exportBoxes').addEventListener('click', () => {
  closeMenus()
  if (!state.app || !state.boxes) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([boxesMarkdown(state.app, components(), state.boxes)], { type: 'text/markdown' }))
  a.download = `${state.app.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'mockup'}-boxes.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
})

// ---- The rail and the drawer

/** Make a box current: its rail at full strength, the drawer on it. The boxes' content is not redrawn, so the press still lands. */
export function focusBox(box: Box) {
  if (state.box === box) return
  state.box = box
  markBox(side, box)
  canvas.render(views(), !!state.busy)
  renderDrawer()
}

export function onTool(key: string, tool: string) {
  if (!state.entries.get(key)?.versions.length) return
  setCurrent(key)
  if (tool === 'edit' || tool === 'info') return openDrawer(tool)
  if (tool === 'regenerate' && !isComponent(state.entries.get(key)!)) return revise(key, null)
  if (tool === 'undo') return undo(key)
  if (tool === 'delete') return removeScreen(key)
}


const modelLabel = (id: string) => [...modelSelect.options].find((o) => o.value === id)?.text ?? id

export function openDrawer(tab: NonNullable<typeof state.drawer>) {
  state.drawer = tab
  if (tab === 'share' || tab === 'comments' || (tab === 'info' && !state.box)) loadShared()
  renderDrawer()
  if (tab === 'edit') changeInput.focus()
  // The canvas got narrower: keep the current box or screen in view beside the drawer.
  requestAnimationFrame(() => { const at = currentAt(); if (at) canvas.reveal(at) })
}

export const closeDrawer = () => { state.drawer = null; renderDrawer() }

/** The drawer shows the current box or screen: Edit (the change box and the past changes) or Info. */
export function renderDrawer() {
  const e = state.current && !state.box ? state.entries.get(state.current) : undefined
  // Comments is the tab of a screen of a shared mockup; an edit link has none. Elsewhere it shows Info, and the
  // drawer comes back to Comments on the next screen that has it.
  const comments = !state.box && !shareToken && !!e && isShared()
  const tab = state.drawer === 'comments' && !comments ? 'info' : state.drawer
  const v = e?.versions.at(-1)
  const open = !!(tab && (tab === 'share' ? state.app : state.box ? state.boxes : v))
  if (drawer.hidden === open) {
    drawer.hidden = !open
    if (!open) requestAnimationFrame(() => { const at = currentAt(); if (at) canvas.reveal(at) })
  }
  if (!open) return
  for (const b of drawer.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab))
  $('editPane').hidden = tab !== 'edit'
  $('infoPane').hidden = tab !== 'info'
  $('sharePane').hidden = tab !== 'share'
  $('commentsPane').hidden = tab !== 'comments'
  $('commentsTab').hidden = !comments
  if (e) $('commentsTab').textContent = commentsTab(e.key)
  if (tab === 'share') return renderShare()
  const box = state.box
  $('changeLabel').textContent = `What should change${box ? ` in ${BOX_TITLES[box]}` : ''}?`
  changeInput.placeholder = box ? 'e.g. Merge the two rules about scores' : 'e.g. Show one level indicator, not four'
  $<HTMLButtonElement>('makeChange').disabled = box ? state.visiting : !!state.busy
  if (box) return renderBoxDrawer(box, state.boxes!)
  if (!e || !v) return
  $('drawerName').textContent = labelOf(e)
  if (tab === 'comments') return renderComments(e.key)
  const history = $('history')
  const comp = isComponent(e)
  const node = state.tree.get(e.key)
  const parent = node?.parent ? state.entries.get(node.parent) : undefined
  const from = comp && e.parent ? state.entries.get(e.parent.key) : undefined, f = e.filed
  const versions: [string, string] = ['Versions', `${e.versions.length}${e.versions.length > 1 ? ' (↶ Undo goes back one)' : ''}`]
  history.replaceChildren(...e.versions.map((x, i) => el('li', i === e.versions.length - 1 ? 'now' : '', x.feedback ? `${x.by === 'fixer' ? 'Fixer' : 'Edit'}: ${x.feedback}`
    : comp ? (i === 0 ? (from ? `Taken from ${labelOf(from)} by ${e.by === 'fixer' ? 'the fixer' : 'filing'}` : 'Added') : 'Changed by filing')
      : i === 0 ? 'The design you picked' : 'Regenerated')).reverse())
  const info: [string, string][] = comp ? [
    ['Component', e.name!],
    ['Where it belongs', e.action ?? '–'],
    ['Pasted on', pastedOn(e.name!).map(labelOf).join(', ') || 'no screen'],
    ['Taken from', from ? labelOf(from) : '–'],
    ['Last written by', `${e.by === 'user' ? 'you' : e.by === 'fixer' ? 'the fixer' : 'filing'}, ${e.at ? new Date(e.at).toLocaleString() : '–'}`],
    versions,
    ['Model', modelLabel(v.model)],
    ['Size', `${v.html.length.toLocaleString()} characters`],
  ] : [
    ['Name', labelOf(e)],
    ['Idea', ideaOf(v) || '–'],
    ['Name in links', e.name ? `@${e.name}` : '–'],
    ['Reached by', parent ? `${node!.label || 'a click'} in ${labelOf(parent)}` : e.action ? '–' : 'the first screen'],
    ['Made by', v.feedback ? `${v.by === 'fixer' ? 'The fixer' : 'Edit'}: ${v.feedback}` : e.versions.length > 1 ? 'Regenerate' : 'your pick of two designs'],
    versions,
    ['Model', modelLabel(v.model) + (v.servedModel ? ` (served ${v.servedModel})` : '')],
    ['Device', v.device ? DEVICES[v.device].label : 'from before devices'],
    ['Made', new Date(v.createdAt).toLocaleString()],
    ['First text', v.firstChunkMs == null ? '–' : fmtS(v.firstChunkMs)],
    ['Total time', fmtS(v.totalMs)],
    ['Cost', v.costUsd == null ? 'unknown' : `${v.costEstimated ? '~' : ''}${fmtUsd(v.costUsd)}${v.costEstimated ? ' (est.)' : ''}`],
    ['All versions', fmtUsd(e.versions.reduce((t, x) => t + (x.costUsd ?? 0), 0))],
    ['Finish', v.finishReason ?? '–'],
    ['Size', `${v.html.length.toLocaleString()} characters`],
    ['Prompt', e.action ?? e.app],
    // What filing made of the screen's last decision, and the lines it refused.
    ...(f ? [['Filing', f.error ? `failed: ${f.error}` : `${[...f.added.map((x) => `added ${x}`), ...f.changed.map((x) => `changed ${x}`)].join(', ') || 'nothing new'}, `
      + `${fmtS(f.ms)}${f.costUsd == null ? '' : `, ~${fmtUsd(f.costUsd)}`}`], ...f.refused.map((r) => ['Refused', r])] as [string, string][] : []),
    // Its thumbs from reviewers through a comment link (their comments are in Comments).
    ...screenFeedback(e.key),
  ]
  showInfo(info)
}

const showInfo = (info: [string, string][]) => $('info').replaceChildren(...info.flatMap(([k, val]) => [el('dt', '', k), el('dd', '', val)]))
const when = (at?: string) => (at ? ` · ${new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : '')

/** A box in the drawer: its Past changes, newest first (the visits, for the fixer's notes), and its counts and limits. */
function renderBoxDrawer(box: Box, b: Boxes) {
  $('drawerName').textContent = BOX_TITLES[box]
  const n = countOf(b, components(), box)
  const past = box === 'notes' ? (b.visits ?? []).map((x) => [`${x.ask ? `Edit: ${x.ask}` : 'Visit'}, ${x.error ? 'failed' : `${x.changes.length} change${x.changes.length === 1 ? '' : 's'}`}${when(x.at)}`, x.undone ? 'undone' : ''])
    : state.past[box].map((x) => [x.what + when(x.at), ''])
  $('history').replaceChildren(...past.length ? past.map(([t, cls]) => el('li', cls, t)).reverse() : [el('li', 'none', 'No changes yet')])
  showInfo([
    [box === 'notes' ? 'Visits' : box === 'data' ? 'Tables' : 'Entries', box === 'notes' ? `${n}, the last ${VISITS_KEPT} kept; the next after ${VISIT_EVERY - (b.picks ?? 0) % VISIT_EVERY} more picks`
      : countLabel(n, box) + (box === 'data' ? `, each at most ${LIMITS.columns} columns and ${LIMITS.rows} rows` : '')],
    ['New since you looked', String(unseen(box).length)],
    ['↶ Undo', box === 'notes' ? (visitToUndo(b) ? 'takes back the newest visit not undone' : 'nothing to undo') : `${state.past[box].length} of the last ${BOX_STATES} changes can be taken back`],
  ])
}

$('editPane').addEventListener('submit', (ev) => {
  ev.preventDefault()
  const change = changeInput.value.trim()
  if (!change) return changeInput.focus()
  // Enter sends the form even while its button waits.
  if (state.box) { if (!state.visiting) boxOp({ op: 'edit', box: state.box, text: change }).then((ok) => { if (ok) changeInput.value = '' }) }
  else if (state.current) revise(state.current, change)
})
enterSubmits(changeInput, $('editPane') as HTMLFormElement)
for (const b of drawer.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.addEventListener('click', () => openDrawer(b.dataset.tab as 'edit' | 'info' | 'comments'))
$('drawerClose').addEventListener('click', closeDrawer)

