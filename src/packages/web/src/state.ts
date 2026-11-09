// What every part of the page shares: the state, this browser's storage, and the elements looked up by id.

import type { Device } from '@uxwoz/core/frame'
import type { TreeNode } from '@uxwoz/core/tree'
import type { BoxName, Boxes, CacheEntry, Past, Version } from '@uxwoz/core'
import type { Box } from './boxes.ts'
import type { View } from './canvas.ts'
import type { StreamRenderer } from './net.ts'

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
export const generate = $<HTMLFormElement>('generate')
export const promptInput = $<HTMLTextAreaElement>('prompt')
export const modelSelect = $<HTMLSelectElement>('model')
export const deviceSelect = $<HTMLSelectElement>('device')
export const drawer = $('drawer')
export const changeInput = $<HTMLTextAreaElement>('change')

/** One side of a new screen's A OR B while it streams. */
export interface Side { stream: StreamRenderer | null; version: Version | null; error: string | null }
/** A new screen whose A OR B streams in before it is stored. */
export interface Making { key: string; parent: string | null; device: Device; sides: Side[] }

export const state = {
  app: null as string | null,
  entries: new Map<string, CacheEntry>(),
  /** Each screen's level and parent, worked out on every draw. */
  tree: new Map<string, TreeNode>(),
  /** The screen the user last picked, clicked in, or chose in Nav. */
  current: null as string | null,
  /** The box clicked or shown since: it is current instead of that screen (its rail, the drawer). */
  box: null as Box | null,
  making: null as Making | null,
  /** Why a side of an A OR B failed, by card id, so it still shows once the screen is stored. */
  failed: new Map<string, string>(),
  /** A pick on its way to the server, so a second click does not pick again. */
  picking: false,
  /** A picked screen getting a new version: an Edit with `change`, else a Regenerate. */
  revising: null as { key: string; change: string | null } | null,
  drawer: null as 'edit' | 'info' | 'share' | null,
  busy: null as AbortController | null,
  /** The view before an A OR B was fitted, to go back to after the pick. */
  before: null as View | null,
  /** Counts mockups opened, so a slower earlier open gives way to a newer one. */
  starts: 0,
  /** Rules and Data (components are entries); the changes of each box that Undo can take back, oldest first. */
  boxes: null as Boxes | null,
  past: { components: [], rules: [], data: [] } as Record<BoxName, Past[]>,
  filing: false,
  visiting: false,
  /** A filed() loop is waiting for filing or a visit to end. */
  waiting: false,
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
