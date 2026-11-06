# The canvas manual

This manual tells a designer how to add to a mockup that lives on one large sheet of paper. It owns
the rules for drawing a screen, filing what the user decided and tidying up. How the app stores
and shows the paper is in [the plan](2026-11-06-paper-canvas.md).

## Example

The paper holds NiceSnore, a snore app with 14 screens. The user taps *Nights* in the tab bar.

1. You read the titles and follow the lines. The tap leads to an empty frame titled
   `nights: every recorded night, newest first`.
2. You read the three boxes. Components has `tab-bar` and `back`. Rules has *R2 A higher snore
   score is worse*. Data has a table *Nights* with five rows.
3. You look closely at one screen: Home, where the tap came from.
4. You draw `nights` twice, as a list and as a calendar. Both paste `tab-bar`, show the five
   nights from Data and mark high scores as bad. Every row opens `night-details`.
5. The user picks the list. You ask the three filing questions and find nothing new.

## What is on the paper

Everything is on the paper, where the user can see it and change it.

- **Screens.** The first screen is at the top. A screen sits one row below the screen that opens
  it, and screens of one level share a row. A line joins a control to the screen it opens. Each
  screen has a title: a short name and one line that says what it is for.
- **Components.** Parts that look the same on every screen that has them: a tab bar, a Back
  button, a toolbar, a map legend, a game's score bar. Each has a name and one line that says
  where it belongs.
- **Rules.** A flat numbered list. A rule is one sentence that several screens must follow.
- **Data.** Small tables of example data that several screens show: the same five nights, the
  same user, the same prices.

## Drawing a screen

You were asked for one screen. Spend a minute on the paper, then draw.

1. Glance at the whole paper: titles and lines only. Leave the other screens unread.
2. Read the three boxes. They are short.
3. Study one screen, the one the click came from, and match its look.
4. Draw the screen its title asks for.
   - A part that is in Components: paste it by name. Never redraw it.
   - A part that changes from screen to screen, like a list row, is yours to draw. A rule may
     say how.
   - Follow every rule. Show Data rows where the screen shows that data, and make up the rest.
   - Every control leads somewhere: a screen on the paper, a new screen (give it a name and its
     one line), or back.
   - The rows of one list open one screen. Draw it once, for one example item. This is a mockup,
     and nobody draws the same screen three times for three items.
5. Draw it twice. The two variants share components, rules and data, and differ in layout.

## After the user decides

The user picks a variant or types a change. Ask three questions about that decision and file the
answers. Most decisions add nothing.

1. **Components.** Will other screens reuse a part of this screen as it is? Circle it, name it,
   write where it belongs.
2. **Rules.** Did the user settle something other screens must follow? Look at what the chosen
   variant has and the other lacks, and at what the user typed. Write one sentence.
3. **Data.** Did this screen make up data that another screen will show? Copy the table.

File nothing that matters to this screen alone.

## The overnight fixer

Every few screens a senior designer visits. They read the boxes and the screens added since the
last visit, and tidy up.

- Merge entries that say one thing twice. Remove an entry only one screen needs.
- Add what filing missed: a part drawn by hand on three screens, a fact two screens show
  differently (the rule takes the newer screen's side).
- Redraw a screen that breaks a rule or draws a component by hand.
- Leave a note for each change. The user can undo any of them.
- Leave alone what the user wrote by hand.

## Mistakes

Nothing here has to be perfect. The user or the fixer edits a wrong entry, and a refresh redraws a
wrong screen. When unsure, draw the simple thing and move on.
