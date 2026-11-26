// What every part of the page shares: the state, this browser's storage, and the elements looked up by id.

import type { Device } from '@uxwoz/core/frame'
import type { TreeNode } from '@uxwoz/core/tree'
import type { BoxName, Boxes, CacheEntry, Past, Version } from '@uxwoz/core'
import type { Box } from './boxes.ts'
import type { Tool } from './flip.ts'
import type { StreamRenderer } from './net.ts'

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
export const generate = $<HTMLFormElement>('generate')
export const promptInput = $<HTMLTextAreaElement>('prompt')
export const modelSelect = $<HTMLSelectElement>('model')
export const deviceSelect = $<HTMLSelectElement>('device')

/** A new mock while its one design streams in, before it is stored: where it hangs, its name until it has its own. */
export interface Making { key: string; parent: string | null; device?: Device; name: string; stream: StreamRenderer | null; version: Version | null }

export const state = {
  app: null as string | null,
  /** The open project is the tour: read-only, so nothing sends a request that changes it, and the buttons under a
   *  mock are grey and say *Off in the tour.* */
  tour: false,
  entries: new Map<string, CacheEntry>(),
  /** Each screen's level and parent, worked out on every draw. */
  tree: new Map<string, TreeNode>(),
  /** The mock the user last opened, tapped, or chose in the dropdown. */
  current: null as string | null,
  /** The box clicked or shown since: it is current instead of that mock (its buttons, its cards). */
  box: null as Box | null,
  /** A component tapped in the Components box (the box current): the box's three buttons are its own. */
  component: null as string | null,
  making: null as Making | null,
  /** A drawn mock getting a new version: an Edit with `change`, else Another. */
  revising: null as { key: string; change: string | null } | null,
  /** The card the current mock, box or component shows flipped over (cards.ts), and the comment Info rings. */
  flip: null as Tool | null,
  busy: null as AbortController | null,
  /** Counts mockups opened, so a slower earlier open gives way to a newer one. */
  starts: 0,
  /** Rules and Data (components are entries); the changes of each box that Undo can take back, oldest first. */
  boxes: null as Boxes | null,
  past: { components: [], rules: [], data: [] } as Record<BoxName, Past[]>,
  filing: false,
  visiting: false,
  /** The box whose Edit the fixer's visit is making: it says *Making the change…* until the visit ends. */
  boxEdit: null as Box | null,
  /** The project a filed() loop is waiting for, for its filing or a visit to end. */
  waiting: null as string | null,
  /** Counts changes this page applied, so a map fetched before one of them is not applied after it. */
  edits: 0,
  css: {} as Record<string, string>,
  /** The theme every screen shows in, and the ones to choose from. */
  theme: 'mockup',
  themes: [] as { id: string; label: string }[],
}

export const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

/** Enter sends the form; Shift+Enter adds a line. */
export function enterSubmits(input: HTMLTextAreaElement, form: HTMLFormElement) {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit() } })
}
