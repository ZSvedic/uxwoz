// Gone: the drawer is the cards a mock or a box flips to (cards.ts). Left only for sharing.ts, which imports from
// here until its rework lands; delete this file then, with sharing.ts importing renderCards from cards.ts.
export { renderCards as renderDrawer } from './cards.ts'
export const openDrawer = (_tab: string) => {}
