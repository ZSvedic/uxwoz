# Behavior: what the user sees

This doc owns the product flow of the MVP: the toolbar, the generate panel, the canvas of screens,
A OR B and picking, the rail and the drawer, navigation, the cache, pickers and the numbers on
screen. It does not own the screen format, rendering or model settings (see
[ui-generation.md](ui-generation.md)) or types and env vars (see [code-contract.md](code-contract.md)).

Only screens the user picked exist. A new screen shows two designs side by side; the user clicks
one, and the other is gone. After that, the user changes a screen by asking for an edit.

## Example

1. Zel types *a cat litter box app* and clicks **Generate**. The canvas zooms to fit two screens
   side by side, with a large **OR** between them. Above each is one sentence naming its idea:
   *Status cards first, actions below* and *One big clean button on top*. Both stream in, and
   neither is clickable inside.
2. Zel clicks anywhere on the right one. It becomes *L1 Home*, the zoom goes back to what it was
   before, and the left one is deleted.
3. Zel clicks *Camera* inside L1. The new screen's A OR B appears below L1, in L2's place. Zel
   picks one.
4. Zel clicks ✎ in the rail to the right of L2. A drawer opens at the window's right edge. Zel
   types *show one level indicator, not four* and clicks **Make the change**. L2 updates in place,
   and **↶ Undo** brings the old version back.
5. Back in L1, Zel clicks *Settings*. Its A OR B appears in a new column beside the Camera branch,
   still at level 2. **Fit all** shows the whole tree, like a Figma page.

```
 L1 Home ──────────────┐
 ┌────────┐            │
 │        │ ✎ ↻ ⓘ ✕    │
 └────────┘            │
     │                 │
 L2 Camera         L2 Settings
 ┌────────┐        ┌────────┐
 │        │        │        │
 └────────┘        └────────┘
```

## Toolbar

One bar, 44 px tall, with three parts:

- **Project menu** (left): a button with the mockup's prompt, cut short. Its menu has
  **New mockup…** (opens the generate panel), **Templates** (example prompts that start a mockup
  at once), **Recent mockups** (every mockup in the cache, most recently changed first, with its
  number of screens; the list comes from the server, so it is the same in every browser), and at
  the bottom **↺ Start over** (deletes every screen and makes the first one again) and **✕ Delete**
  (deletes every screen). Both ask first.
- **Nav** (middle): names the current screen (*L2 Camera ▾*). Its menu lists every screen as an
  indented tree, each with the control that opened it (*via Camera*), the path to the current
  screen in orange. Choosing one makes it current and scrolls to it.
- **Zoom** (right): **−**, the zoom level, **+** and **⤢ Fit screen**. The level opens a menu: Zoom
  in ⌘+, Zoom out ⌘−, 50%, 100% ⌘0, 200%, Fit all ⇧1, Fit screen ⇧2, Fit screen width ⇧3. The keys
  work anywhere outside a text field (Ctrl in place of ⌘ off a Mac). Under 900 px wide only the
  level stays. The keys also work while a screen has the focus.

Menus close on Esc, on a press outside them, or on a click into a screen.

## Generate panel

The prompt box takes a product description (up to 2,000 characters) and grows with it; Enter makes
the mockup, Shift+Enter adds a line. Under it, the **Model**, **Device** and **Theme** pickers sit
in one row, and a large **Generate** button below them. With no mockup open, the panel sits large in the middle of the canvas with Templates and
Recent mockups under it. With one open, **New mockup…** shows it as a popover under the project
menu; Esc or a press outside closes it. A prompt seen before opens its mockup from the cache, at no
cost, with the current screen it had last time in this browser. A reload opens the mockup that
was open, with its A OR B if one was waiting for a pick; it never starts a new design by itself.

## Canvas

The canvas holds every picked screen of the mockup, laid out as a tree on a dot grid. Nothing is
hidden when the user branches.

- **Rows are levels.** Each level is a row, as tall as its tallest screen. A screen's first child
  sits straight below it, in the same column; each later child starts a new column to the right of
  the subtrees before it.
- **Lines**: one thin orange line from a parent to each child it made: straight down in the same
  column, an elbow for a branch. A click back to a screen already there draws no line.
- **Names**: above each screen, its level and the short name the model gave it (*L2 Camera*), and
  under that, its idea, on up to two lines; a longer idea ends in **more**, which shows the rest
  (and **less** folds it again). Names and ideas keep their size on screen at any zoom; below
  50% only the names show. Hovering a name shows it whole.
- **Current screen**: the one the user last picked, clicked in, or chose in Nav. It has an orange
  outline and its rail at full strength; other screens show their rail on hover. Fit screen uses
  it.
- **Live screens**: a picked screen works: controls that open another screen are blue, in both
  themes; everything else keeps the theme's own ink.
- **A screen is as tall as its content**, so nothing scrolls inside it: scrolling over a screen
  moves the canvas. A screen sees an 800 px tall window (`100vh` is 800 px), so "full-screen"
  screens keep a normal size; a screen that still keeps growing with its window stops after four
  steps.
- **Size**: a screen is only as wide as its content; the device width is the most it takes, even
  when its content cannot shrink to fit. The model is told to start small.
- **Opening a mockup** fits its current screen, and fits it again once the screen has its real
  size. **Fit screen** keeps a tall screen readable and shows its top, like the A OR B fit.
- **Pan and zoom**: scroll, or drag the empty canvas, to pan. Pinch or Ctrl/Cmd + scroll zooms
  around the pointer, also over a screen, from 10% to 200%. The dot grid's spacing follows the
  zoom.
- **Errors** show in a red pill at the bottom of the canvas until closed, or until the next screen
  or change starts. Time and cost are in Info.

## A OR B

Every new screen, the first one and every click to a new screen, comes as two designs made at the
same time. One of them, on a random side, is asked to be a clearly different design, so the side
says nothing about which is which.

- **Fit and restore**: before an A OR B shows, the canvas remembers its zoom and scroll, then fits
  both designs to the stage's width, top first. Once both have finished and taken their real size
  (usually narrower than the device), it fits them again, height included, unless the user has
  scrolled, zoomed, used a fit or chosen a screen in Nav meanwhile; a very tall pair keeps a readable
  zoom and shows its top. After the pick, the zoom and scroll come back, and the picked screen
  scrolls into view. A new mockup's first screen has no view to come back to: it is fitted instead.
- **The idea** sits above each side in larger type: one sentence the model writes about the design
  (*One big clean button on top*).
- **Locked previews**: both stream in live, and their scripts run once finished, so charts draw.
  Nothing inside them can be clicked. A side can be picked once it has finished: hovering it
  outlines it and shows **Pick this design**.
- **Picking**: a click anywhere on a finished side keeps it as the screen's first version and
  deletes the other. If the other is still streaming, it stops and nothing of it is kept. The
  frame does not reload, so the picked screen stays as it was.
- **Failures**: a side that fails shows its error in its place. If both fail, the A OR B goes
  away.
- **✕** under the OR drops both designs; for the first screen, that drops the mockup.
- **Reloads**: an A OR B stays open until a pick, so a reload shows the same two designs again, at
  no cost. A side that was still streaming at the reload shows as not finished.
- **Deletes win**: a side that finishes after its A OR B was dropped, or its mockup deleted or
  started over, is not kept.

## Rail

A column of large icon buttons right of each picked screen, kept at 40 px on screen whatever the
zoom:

- **✎ Edit** opens the drawer on Edit.
- **↻ Regenerate** makes one new design of the screen in its place, from the screen's prompt, at
  once.
- **↶ Undo** brings back the version before the newest. It shows only when there are two or more.
- **ⓘ Info** opens the drawer on Info.
- **✕ Delete** asks, then deletes the screen and the screens only it leads to. A screen that
  another click also reaches stays, under that click. Deleting the first screen deletes the
  mockup.

Using a rail button makes its screen current. While a screen is being made or changed, the rail's
buttons wait (Info still works).

## Drawer

A 360 px panel docked at the right edge, for the current screen. The canvas gets narrower and
scrolls so the screen stays fully visible beside it. Esc or ✕ closes it. It has two tabs:

- **Edit**: *What should change?* Type it and click **Make the change** (or press Enter): the
  model gets this screen and the request, and returns the same screen with only that change, as a
  new version in place. **Past changes** lists the versions, newest first: *Edit: show one level
  indicator, not four*, *Regenerated*, *The design you picked*, the one showing marked.
- **Info**: name, idea, the click that opened it, what made the version showing (the pick, an Edit
  and its request, or Regenerate), the number of versions, model, device, when it was made, time to
  first text, total time, cost, cost of all versions, finish reason, size and prompt.

Choosing another screen while the drawer is open shows that screen in it.

## Navigation

Each control that opens another screen carries a short action prompt written by the model, and is
blue; clicking it asks for *product prompt + action prompt*. The model is told to make details,
forms, settings and tab-bar sections screens of their own, so a mockup has screens to click
through. A plain link the screen does not handle asks for "the screen shown after clicking
*label*"; in-page links (`#…`) stay put. Other controls (filters, inputs) work inside the screen.
Each request lists the screens that already exist, and the model links to them by their exact
prompt, back to the screen before with `back`, and to the first screen with `home`. Only a real
click opens a screen.

- **Back and Home** never make a screen. A control labelled *Home*, *Go home*, *Back to home* or
  *Main menu* goes to the first screen. A control with the action `back`, or labelled *Back*,
  *Go back*, *Return*, *Back to …* (*Back to cats*) or only an arrow (*←*, *‹*, *«*), goes to the
  screen that opened this one (the first screen, if it has none). Icons and arrows in front of a
  label (*🏠 Home*, *⬅ Back*, icon-font words like *arrow_back*) do not count. The label wins over
  the action prompt, since models sometimes give Back a long prompt for the home screen.
- A click that leads to a screen already on the canvas makes it current and scrolls to it. It is
  stored as a link, with no line.
- One screen is made at a time: while one is being made or changed, a click that would open
  another does nothing, and a note says so for a moment at the bottom of the canvas.

## Streaming and timing

While the model writes, a screen is rebuilt at most every 300 ms. Controls do nothing until the
last build, because their handlers arrive at the end of the reply. Info shows each version's time
to first text, total time and cost. Cost is billed cost for Claude Haiku (reported by OpenRouter);
for the GPT models an estimate from tokens, marked *~* and *(est.)*.

A design that is not complete after 20 s, stops early, or hits the token limit fails; nothing of it
is cached. A failed Edit or Regenerate leaves the screen as it was.

## Cache

Every screen is stored under its normalized prompt: lowercase, single spaces, no trailing
punctuation. A screen holds its versions (the last one shows) and, until a pick, its open A OR B.
Opening a stored screen makes no model call and costs nothing. The cache lives on the server and
survives restarts, so every browser shares it. Each screen also stores the screen and click that
first made it, and its level. Each side of an A OR B is stored as soon as it finishes, so a design
that was paid for is kept even if the browser leaves. The current screen is remembered per mockup
in this browser.

A cache file from before versions keeps only each screen's picked variant; screens that only other
variants led to go. The old file stays beside the new one as `screen-cache.json.before-versions`.

## Pickers

- **Model**: Claude Haiku 5.5 (default), GPT-6 Luna (fast), GPT-6.1 Sol Ultrafast. It applies to the
  next design made; stored screens stay as they are, with their maker in Info.
- **Device**: Phone (default, at most 390 px wide) or Desktop (at most 1024 px). The model is told
  which one, and the screen gets a window that wide. It applies to new screens; Edit and Regenerate
  keep the screen's own device. While a mockup is open, the picker shows the device of its first
  screen, so its next screens, and Start over, match it; **New mockup…** and closing the mockup
  bring back the saved choice. Screens made before devices existed show at 800 px.
- **Theme**: Mockup (default) or Clean. Mockup is black and white with a handwriting font and
  wobbly borders, so a screen reads as a sketch; even the model's chart colours turn grey, except
  the blue of controls that open a screen. Clean is plain Pico with neutral buttons and links.
  Switching restyles the screens at once; the model never sees the theme.

Loading the page and picking a model each send a short warm-up request to warm the prompt cache.
All three choices are remembered in this browser, when they change and again on Generate.

## Colours

Black and white is the mockup, blue is a control in a mockup that opens another screen, and burnt
orange is UX Woz itself: Generate, the current screen, lines, the OR, Nav's path and the picked
outline.
