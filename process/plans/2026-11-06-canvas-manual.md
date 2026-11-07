# Lean UI canvas manual

This manual tells a designer how to add to a mockup that lives on one large sheet of paper. It owns
the rules for drawing a screen, filing what the user decided and tidying up. How the app stores
and shows the paper is in [the plan](2026-11-06-paper-canvas.md).

The paper borrows from two things designers know. The screens and the lines between them are a
wireflow. The boxes are those of an architect's sheet: Components are the legend (a design
system's component library), Rules are the general notes, Data is the schedules, and the fixer's
notes are the revision block.

## Example

The paper holds NiceSnore, a snore app with 14 screens. The user is on `home` and taps *Nights*
in its tab bar.

1. You read the titles and follow the lines. The tap leads to a screen that has a title and no
   drawing yet: `nights: every recorded night, newest first`.
2. You read the three boxes. Components has `tab-bar` and `back`. Rules has
   `score-direction: A higher snore score is worse.` Data has the table `nights`, five rows.
3. You study `home`, the screen the tap came from.
4. You draw two variants of the whole `nights` screen, one with a list and one with a calendar.
   Both paste `tab-bar`, show the five nights from Data and mark high scores as bad. Every night
   opens `night-details`.
5. The user picks the variant with the list. You ask the three filing questions and find
   nothing new.

## What is on the paper

Everything is on the paper, where the user can see it and change it. Everything has an ID: 1 to 4
lowercase words joined by dashes, like `night-details`. An ID is unique among entries of its
kind, never changes, and is never used again after its entry goes.

- **Screens.** A screen is the whole device screen, never a part of one. The first screen is at
  the top. A screen sits one row below the screen that opens it, and screens of one level share
  a row. A line joins a control to the screen it opens. A screen's title is its ID and one line
  that says what it is for.
- **Components**, at most 20. Parts that look the same on every screen that has them: a tab bar,
  a Back button, a toolbar, a map legend, a game's score bar. Each has an ID and one line that
  says where it belongs.
- **Rules**, at most 20. Each is an ID and one sentence, at most 120 characters, that several
  screens follow. New rules go at the end of the list.
- **Data**, at most 10 tables of example data that several screens show. Each table has an ID,
  a first row of column names in lowercase words, and at most 6 columns and 8 rows.

A full box takes nothing new until an entry leaves it.

## Drawing a screen

You were asked for one screen. Spend a minute on the paper, then draw.

1. Glance at the whole paper: titles and lines only. Leave the other screens unread.
2. Read the three boxes.
3. Study the screen the click came from. The user sees the new screen right after it.
4. Draw two variants of the whole screen its title asks for. They share components, rules and
   data, and differ in layout.
   - A component goes on every screen its line names. Paste it by its ID, even where the screen
     the click came from drew it by hand. Never copy its drawing.
   - A part that changes from screen to screen, like a list row, is yours to draw.
   - Follow the rules that fit this screen. When two rules disagree, follow the later one and
     move on.
   - Show Data rows where the screen shows that data, and make up the rest.
   - Every button and link leads somewhere: a screen on the paper, a new screen (give it an ID
     and its one line), or back. A button that saves or buys leads somewhere too.
   - One purpose, one screen. Controls that do the same thing for different items (rows of a
     list, pins on a map, cards in a grid) open the same screen, drawn once for one example item.

## After the user decides

The user picks a variant, or types a change on a screen variant. Ask three questions about that
decision and file the answers. Most picks add nothing. What the user types usually adds a rule.

1. **Components.** Will another screen show a part of this screen exactly as it is, words and
   all? Give it an ID and add it to Components, with one line that says where it belongs. A list,
   a form or a card about one item changes from screen to screen: it is no component.
2. **Rules.** Did the user settle something other screens must follow? Look at what the user
   typed, and at what the chosen variant has and the other lacks. Add one sentence to Rules. How
   this one screen is laid out is no rule, unless the user typed it for every screen.
3. **Data.** Did this screen make up rows that another screen will show? Add them to Data as a
   table.

Read the box before you add to it. If an entry already says it, in any words, add nothing. If the
decision changes an entry, change that entry and keep its ID.

## The overnight fixer

Every few screens a senior designer visits, reads the boxes and the screens added since the last
visit, and tidies up.

- Go through the boxes entry by entry. Ask of each: do two or more screens need it? If one screen
  or none does, remove it, even if a screen could use it. Merge entries that say one thing twice,
  keeping the older ID. Of two rules that disagree, remove the older one.
- Add what filing missed: a part drawn by hand on three screens. Where two screens show one fact
  differently, redraw the older screen to match the newer one.
- Redraw a screen that breaks a rule, draws a component by hand, or has a control that leads
  nowhere.
- Leave a note for each change. The user can undo any of them.
- Leave alone what the user wrote by hand.

## Mistakes

Nothing here has to be perfect. The user or the fixer edits a wrong entry, and a refresh redraws a
wrong screen. When unsure, draw the simple thing and move on.
