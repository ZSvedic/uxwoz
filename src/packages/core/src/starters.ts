// The starters: ready prompts a first-time visitor picks from. Each replays a recording
// (recordings/<id>.json), so picking one calls no model. Data only: this file also runs in the browser.

export interface Starter {
  id: string
  /** The card's title. */
  label: string
  /** The product prompt, 1 to 5 sentences. A recording is made for these exact words. */
  prompt: string
}

export const STARTERS: Starter[] = [
  { id: 'plants', label: 'Plant care',
    prompt: 'A plant care app: my plants with the next watering day, a plant\'s page with a care log and its light needs, add a plant by its name, and a weekly watering schedule.' },
  { id: 'bill', label: 'Split a bill',
    prompt: 'Split a bill with friends: a list of shared tabs, a tab with its items and who had what, add an item, and a summary of who owes whom with a Settle up button.' },
  { id: 'recipes', label: 'Recipe box',
    prompt: 'A recipe box that plans the week\'s shopping: saved recipes, a recipe with ingredients and steps, a week planner, and a shopping list grouped by aisle.' },
  { id: 'clinic', label: 'Clinic front desk',
    prompt: 'A web app for a small clinic\'s front desk: today\'s appointments by doctor, a patient\'s record with past visits, booking a new appointment, and the waiting room list.' },
  { id: 'invoices', label: 'Freelancer invoices',
    prompt: 'A web app for a freelancer\'s invoices: a dashboard with paid, due and overdue totals, the invoice list, an invoice editor with line items, and clients.' },
  { id: 'podcast', label: 'Podcast editor',
    prompt: 'A desktop app for editing a podcast episode: a library of episodes, an editor with a waveform timeline and a track for each speaker, a panel that cuts silences, and export settings.' },
  { id: 'words', label: 'Daily word puzzle',
    prompt: 'A daily word puzzle game: a main menu, the puzzle with a letter grid and a timer, a result screen with stars and a streak, a shop for hints, and a leaderboard among friends.' },
]
