// The starters: ready prompts a first-time visitor picks from. Each replays a recording
// (recordings/<id>.json), so picking one calls no model. Data only: this file also runs in the browser.

import type { Device } from './frame.ts'

export interface Starter {
  id: string
  /** The card's title and its kind line. */
  label: string
  kind: 'Guide' | 'Phone app' | 'Web app' | 'Desktop app' | 'Game'
  device: Device
  /** The product prompt, 1 to 5 sentences. A recording is made for these exact words. */
  prompt: string
}

export const STARTERS: Starter[] = [
  { id: 'how', label: 'How UX Woz works', kind: 'Guide', device: 'phone',
    prompt: 'A short guide to UX Woz, a tool that turns one sentence into a clickable mockup. Home lists eight lessons as cards, each with what it teaches: Describe your product (the mockup is named by the sentence you type), Pick one of two designs, Click anything to draw the next screen, Change a screen in plain words with Edit, A sketch on purpose (it has no colour so you judge the layout, and Theme in the toolbar switches to a look with colour), Rules and Components keep every screen consistent, The same data everywhere (names and numbers can differ between screens at first: the Data box holds the shared data, the fixer tidies every 5 picks, and Edit fixes one screen), and Share and Export (Share makes a link for feedback, Export a zip for a coding agent, and both are in the mockup\'s menu at the left of the toolbar). Each lesson is its own screen with a small sketch of that step, two sentences that explain it, and a Next button to the following lesson, except the last one, Share and Export, which ends with a button that says Now describe your own.' },
  { id: 'plants', label: 'Plant care', kind: 'Phone app', device: 'phone',
    prompt: 'A plant care app: my plants with the next watering day, a plant\'s page with a care log and its light needs, add a plant by its name, and a weekly watering schedule.' },
  { id: 'bill', label: 'Split a bill', kind: 'Phone app', device: 'phone',
    prompt: 'Split a bill with friends: a list of shared tabs, a tab with its items and who had what, add an item, and a summary of who owes whom with a Settle up button.' },
  { id: 'recipes', label: 'Recipe box', kind: 'Phone app', device: 'phone',
    prompt: 'A recipe box that plans the week\'s shopping: saved recipes, a recipe with ingredients and steps, a week planner, and a shopping list grouped by aisle.' },
  { id: 'clinic', label: 'Clinic front desk', kind: 'Web app', device: 'desktop',
    prompt: 'A web app for a small clinic\'s front desk: today\'s appointments by doctor, a patient\'s record with past visits, booking a new appointment, and the waiting room list.' },
  { id: 'invoices', label: 'Freelancer invoices', kind: 'Web app', device: 'desktop',
    prompt: 'A web app for a freelancer\'s invoices: a dashboard with paid, due and overdue totals, the invoice list, an invoice editor with line items, and clients.' },
  { id: 'podcast', label: 'Podcast editor', kind: 'Desktop app', device: 'desktop',
    prompt: 'A desktop app for editing a podcast episode: a library of episodes, an editor with a waveform timeline and a track for each speaker, a panel that cuts silences, and export settings.' },
  { id: 'words', label: 'Daily word puzzle', kind: 'Game', device: 'phone',
    prompt: 'A daily word puzzle game: a main menu, the puzzle with a letter grid and a timer, a result screen with stars and a streak, a shop for hints, and a leaderboard among friends.' },
]
