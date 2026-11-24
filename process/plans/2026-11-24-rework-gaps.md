# Rework gaps: what the prompt and the tour leave open

This plan lists what [zel-rework-prompt.md](../../spec/zel-rework-prompt.md) and
[zel-tour-compilation-v4.md](../../spec/zel-tour-compilation-v4.md) do not settle, each with the answer
I suggest. It decides nothing about the look: the logo versions and the black-and-white mocks come next.

Status: Zel answered on 2026-11-24. Gap 3 is four sizes, gap 4 waits for a yes, the rest stand as
suggested. Nothing is built.

## How to answer

Answer by number. Anything you skip, I build as suggested.

```
OK all. 2: keep the long sheet. 6: keep "hey Woz" too. 18: call it Reroll.
```

## Eight choices that shape the build

1. **What settles a mock, now that nobody picks?** Filing and the fixer start at a pick today. Suggest:
   a mock is settled when you click on from it or Edit it. Filing runs then, and the next mock waits for
   it (5 s at most, as today), so it can paste the shared components. The fixer visits every 5 settled
   mocks. Cost: the first click out of each mock is about 1 s slower. Other way: file every mock as soon
   as it is drawn and undo that on 🎲. Faster clicks, one more paid filing per roll, more code.
2. **Does a mock scroll inside its frame?** The tour says two fingers move the canvas, so one finger
   must belong to the mock. Suggest: a mock is a frame of fixed size, like a real device. Its content
   scrolls inside with one finger or the wheel, a tab bar stays at the frame's bottom, and two fingers
   (or a drag on the sky) move the canvas. On a phone the frame is as tall as the room between the two
   bars. Today a mock is one long sheet and one finger moves the canvas.
3. **How many sizes?** Decided by Zel: four, and everything is recorded again with two designs a mock.
   The window picks the size, and the mock is scaled to fit it:

   | Size | Mock | For a window |
   |---|---|---|
   | Small phone | 360 × 640 | under 400 px wide |
   | Large phone | 412 × 892 | 400 to 719 px |
   | Laptop | 1280 × 720 | 720 to 1599 px |
   | Monitor | 1920 × 1080 | 1600 px and wider |

   A project keeps the size it was made at, on every device. The New panel has a **Design for** picker
   with the four, so a laptop can design a phone app. Each of the seven starters is recorded at all
   four sizes (28 recordings, about $5), so a starter loses its kind (*Phone app*, *Web app*). Projects
   made before the rework keep their 390 and 1024.
4. **Who makes the tour's four mocks?** They hold your exact words, so they are made once and saved;
   every visitor sees the saved ones, free, with no model call. Two ways to make them once: I write
   them by hand, or I paste your words into Haiku and save what it draws. Suggest Haiku, because the
   third mock says *A cheap model generated this mock in 2.4 sec*, which is false for a mock I wrote.
   I correct any word Haiku changed, and a test keeps the saved words equal to the tour file.
5. **Edit, History, Delete.** Suggest: Edit holds the field, 🎙️, **Make the change**, and a small
   **Delete this mock…** at its bottom. History holds Undo, Redo and the list of versions; a tap on one
   shows it. So Past changes moves from Edit to History and exists once, and four buttons stay four.
   Redo is new: Undo drops a version today, so versions will be kept (the last 10) with a mark on the
   one showing.
6. **Voice.** Suggest hold-to-talk replaces "hey Woz": hold 🎙️ in the Edit or prompt field, speak, let
   go, the words are in the field, you press the button. The wake phrase, the countdown, the *Heard*
   label and the stop phrases go (about 400 lines and a page of spec). No 🎙️ in the top bar.
7. **What the W+ menu holds:** everything the bar loses. Suggest, top to bottom: **New project** (the
   prompt box and the examples), **Recent**, **Tour**. For the open project: **Share…**, **Feedback**,
   **Export project…**, **Export the boxes**, **Start over**, **Delete**. Then **Theme**, **Sound**,
   the account (free screens left, Register or the email, Sign out, Delete my account), **Privacy**.
8. **The flip on large screens too?** Suggest yes: one layout, and the drawer goes. The price: you
   cannot see a mock while you type its change. Share and Feedback become pages of the left panel. A
   mock's comments become a part of Info, their count on the button (ℹ️ 3); a pin's tap flips to them.

## Smaller gaps

**The tour**

9. A first visit (nothing in Recent) opens the tour at *This is Bill*. A later visit opens the last
   project, as today.
10. The layout shows `[ UXWoz Tour v ]`, but a person steers by the mock's name. Suggest the button
    names the current mock or box (`[ This is Bill v ]`), and the project's name is the dropdown's
    first line.
11. In the tour 🎲, ✏️ and ⏪ are grey, and a tap says *Off in the tour.* ℹ️ works. Its boxes are
    read-only.
12. *Try it now: pick Rules…* is text. The app does not check that you did it.
13. The tour's boxes need content. I write it: three rules, the big button as a component, Bill's hours
    as a table, one fixer's note.
14. The Wikipedia link: a link in a mock does nothing today. Suggest one rule for every mock: a link
    to a full web address opens in a new tab.
15. **Try another example** opens the New project panel: the examples first, *or describe your own*
    under them.
16. The tour replaces the *How UX Woz works* starter and the chain of five hints: both go. The hint
    *This design was drawn fresh for you…* stays.

**The buttons under a mock**

17. The four buttons are one bar fixed at the window's bottom, for the current mock or box, at every
    window size. The rail beside each mock goes.
18. *New* reads as a new project. Suggest 🎲 **Another**.
19. 🎲 draws the second design when pressed, not ahead: half of today's cost. It is asked to differ
    clearly from the first. Both stay in History.
20. After two designs 🎲 opens the prompt card: *Neither design fits? Describe this mock differently.*,
    the prompt, **Draw again**. It counts designs drawn from the current prompt; an Edit does not reset
    it. For Home the prompt is the project's sentence, and the project takes the new name.
21. Info says **Asked for** (the prompt: what the model was told to draw, by the link that opened the
    mock or by you) and **Drawn as** (the idea: the model's own line about what it drew). *Spec edits*
    becomes **Added to the boxes**. *Reached by* lists the links, without levels.
22. A box's bar keeps the four places: its own action first (📐 ➕ **Add rule**, 🗄️ ➕ **Add table**,
    🕵️ ▶️ **Run fixer**, 🧩 none), then ✏️ **Edit**, ⏪ **History**, ℹ️ **Info**. A tap on a component
    makes it current, and the bar is that component's.
23. In the dropdown the four boxes are one row at the top, always, with their *new* counts. The tree
    scrolls under it. Planned mocks stay, grey. Components leave the list.

**The canvas**

24. The move between mocks is a straight glide of 0.6 s at the current zoom; the new mock streams in
    where it lands. With reduced motion it jumps.
25. The tree, the ropes and the boxes right of Home stay. The default view fits the mock, and the zoom
    shows the true number (92%).
26. A large window has the same three bands. The top bar adds −, +, Fit and the four box links while
    they fit.

**Names and scope**

27. Words: a *mock* is one screen, a *project* is the whole thing, and the product is *UXWoz* in one
    word (*Woz* for short) in the app, the emails, the privacy page and the player.
28. Only the logo and the names change in the player, the admin's page, sign-up, the meter and Export.
    An edit link gets the new layout.
29. Old data: a stored open A OR B becomes a mock with A showing and B in its History.
30. The seven app starters are recorded again, two designs a mock (about $1). The admin's step *picked
    a design* becomes *clicked on from a mock*. The pick's spark and chime go with the pick.
31. I build on a branch. Nothing reaches `main`, so nothing deploys, until you say.
