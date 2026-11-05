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
  **New mockup…** (opens the generate panel), **Recent mockups** (the last ten, the open one
  ticked; choosing one opens it), and, with a mockup open, **↺ Start over** (deletes every screen
  and makes the first one again) and **✕ Delete** (deletes every screen). Both ask first.
- **Nav** (middle): names the current screen (*L2 Camera ▾*). Its menu lists every screen as an
  indented tree, each with the control that opened it (*via Camera*), the path to the current
  screen in orange. Choosing one makes it current and scrolls to it. Planned screens (see
  Navigation) are in the tree too, greyed, marked *not made yet*; choosing one makes it, as its
  link would.
- **← and →** (either side of Nav): back to the screen looked at before, and forward again, like a
  browser: every screen that becomes current is a step, and reaching a screen any other way drops
  the steps ahead. Screens deleted since are skipped. ⌘[ and ⌘] do the same (also while a screen
  has the focus), and so do the mouse's back and forward buttons.
- **Spec** (right, with a mockup open): opens the spec panel in the drawer (see Spec).
- **Zoom** (right): **−**, the zoom level, **+** and **⤢ Fit screen**. The level opens a menu: Zoom
  in ⌘+, Zoom out ⌘−, 50%, 100% ⌘0, 200%, Fit all ⇧1, Fit screen ⇧2, Fit screen width ⇧3. The keys
  work anywhere outside a text field (Ctrl in place of ⌘ off a Mac). Under 900 px wide only the
  level stays. The keys also work while a screen has the focus.

Menus close on Esc, on a press outside them, or on a click into a screen.

## Generate panel

The prompt box takes a product description (up to 2,000 characters) and grows with it; Enter makes
the mockup, Shift+Enter adds a line. Under it, the **Model**, **Device** and **Theme** pickers sit
in one row, and a large **Generate** button below them. Under that come **Templates** (example
prompts that start a mockup at once) and **Recent mockups** (every mockup in the cache, most
recently changed first, with its number of screens; the list comes from the server, so it is the
same in every browser). The panel is the same with or without a mockup open: with none it shows on
its own, and **New mockup…** shows it over the canvas, where Esc or a press outside closes it.
A prompt seen before opens its mockup from the cache, at no cost, with the current screen it had
last time in this browser. A reload opens the mockup that
was open, with its A OR B if one was waiting for a pick; it never starts a new design by itself.

## Canvas

The canvas holds every picked screen of the mockup, laid out as a tree on a dot grid. Nothing is
hidden when the user branches.

- **Levels**: a screen's level is the fewest clicks from the first screen (L1). The app works it
  out each time from the buttons in each screen's newest version, plus the click that first made
  each screen; nothing about it is stored. So an Edit that adds a button on Home straight to an L3
  screen makes it L2 at once, and Undo makes it L3 again; a delete moves screens the same way.
- **Rows are levels.** Each level is a row, as tall as its tallest screen. Each screen hangs under
  a screen one click before it on a shortest path: the one whose click first made it, when that is
  one, else the first other. The screens of a row sit side by side, children in the order of their
  parents; a screen's first child sits straight below it when that place is free, else in the next
  free place to the right. A parent never moves to make room for its children.
- **Lines**: one thin orange line from each screen to the screen it hangs under: straight down in
  the same column, else down, across and down. Each parent whose lines bend has its own height in
  the gap below its row where they go across, the leftmost parent lowest, so no two lines cross or
  run together; the gap grows with them. Other buttons between screens draw no line.
- **Names**: above each screen, its level and the short name the model gave it (*L2 Camera*), and
  under that, its idea, on up to two lines; a longer idea ends in **more**, which shows the rest
  (and **less** folds it again). Names and ideas keep their size on screen at any zoom; below
  50% only the names show. Hovering a name shows it whole.
- **Current screen**: the one the user last picked, clicked in, or chose in Nav. It has an orange
  outline and its rail at full strength; other screens show their rail on hover. Fit screen uses
  it.
- **Live screens**: a picked screen works: controls that open another screen are blue, in both
  themes; everything else keeps the theme's own ink.
- **A screen is as tall as its content**, and at least one device screen tall (844 px on a phone),
  so nothing scrolls inside it: scrolling over a screen moves the canvas. `100vh` is one device
  screen, so "full-screen" screens keep a normal size; a screen that still keeps growing with its
  window stops after four steps.
- **Size**: every screen of a device is as wide as the device, so the screens of a mockup line up.
  The model is told to start small.
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
  (at least one device screen tall), it fits them again, height included, unless the user has
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
- **✕ Delete** asks, then deletes the screen and the screens only it leads to. A screen that a
  button in another screen also reaches stays, under that screen. Deleting the first screen deletes
  the mockup.

Using a rail button makes its screen current. While a screen is being made or changed, the rail's
buttons wait (Info still works).

## Drawer

A 360 px panel docked at the right edge, for the current screen. The canvas gets narrower and
scrolls so the screen stays fully visible beside it. Esc or ✕ closes it. It has three tabs: Edit
and Info for the current screen, and Spec for the mockup (see Spec):

- **Edit**: *What should change?* Type it and click **Make the change** (or press Enter): the
  model gets this screen and the request, and returns the same screen with only that change, as a
  new version in place. **Past changes** lists the versions, newest first: *Edit: show one level
  indicator, not four*, *Regenerated*, *The design you picked*, the one showing marked. Under each
  version are the spec lines it set: the row, the value before struck through (*not set* for a new
  row), and the value now. An Edit's lines have a **✕** that takes the line back, so the value
  before counts again for new screens; **↶ Undo** of an Edit takes all its lines back. A line a
  later Edit replaced says *(replaced later)* and has no ✕. A ✕ whose line is gone already (another
  browser) says so and shows the server's spec. An Edit's lines that were not taken are listed
  struck through with why (*the row has this value already*, *the spec is full*, *longer than 120
  characters*, *a core flow names its screens*).
- **Info**: name, idea, the click that opened it, what made the version showing (the pick, an Edit
  and its request, or Regenerate), the number of versions, model, device, when it was made, time to
  first text, total time, cost, cost of all versions, finish reason, **Check** (what the screen
  misses against the spec it was made with: no control to the next step of the core flow, more
  than 2 new kinds of screen, or a reply that held the screen twice (tabs and Back are drawn by the
  app, so they are not checked); *follows the spec* when nothing), the **spec lines** the design proposed, size and prompt. On the first screen, **Plan**: the rows
  it opened, its time and cost, or why it failed (main navigation and Back were then left open).

Choosing another screen while the drawer is open shows that screen in it.

## Spec

Each mockup has a short spec: the decisions every new screen follows, so the screens of one mockup
agree on navigation, Back and facts ([the spec note](../process/plans/2026-11-05-spec-memory.md)).

- **The plan**: before the first screen, one call to GPT-6.1 Sol writes the core flow (*@home →
  @recording → @morning-report*) and up to 8 open rows, each a key and the question it settles
  (*ui.nav ? main navigation*, *data.score ? whether higher means worse*). It takes about 2 s; after
  6 s, or on an error, the first screen goes on with `ui.nav` and `ui.back` open, so its screens
  still agree on navigation and Back. A mockup is planned again as long as it has no first screen
  (a first try whose designs all failed, or ✕ under the OR); two requests for one new mockup share
  one plan. Start over plans again.
- **Every request carries the spec** after the tree: filled rows with their value, open rows with
  their question, and one markup each for the tabs of `ui.nav`, Back and switches. The tab markup goes only while
  `ui.nav` is open or its line starts with `Tabs:`; other navigation (*No tab bar: one step per
  screen with Next*) gets none, and its `@names` are not tabs.
- **The core flow and the tabs of `ui.nav` are planned screens**: they are in the tree and in Nav
  from the start, each flow step under the step before. The request for a flow step with a next
  step asks that the control finishing its task (Stop, Save, Done) opens it by its own link, not by
  script (Stop recording opens the morning report).
- **New screens**: besides tabs, Back and the main path, a screen that lists or shows items opens 1
  or 2 new kinds of screen (an item's details, a form); the details of a list's items are one kind.
  A form, or a screen that ends a task, opens none; the phone's own screens (mail, share targets)
  are plain buttons. The check flags more than 2 kinds, grouping names by their last word when it
  says what the screen does (details, edit, add…), else by their first word.
- **A reply that holds the screen twice** (Luna's sometimes do) keeps its first copy; Info notes it.
- **Lines from designs**: a design answers an open row only when its screen decides it
  (*ui.nav = Tabs: Tonight @home, History @night-history*); most screens add no line, and code
  keeps 3 at most. A design adds no row of its own, facts included: when designs could, 7 screens
  filled the spec with one screen's content. In an A OR B they show under each side's idea, before the pick, two
  text lines each: in orange with **+** the lines its pick would add, struck through with **–**
  the ones it would drop; hovering shows a line whole. The pick fills open rows with the picked
  design's lines and drops the rest, and the other design's lines; a line over 120 characters, or
  with `<` in it, is refused. Each line is one `<meta name="spec">` tag, read up to its closing
  quote; the rest of its text line stays in the screen. An Edit may set any row (the Edit request
  asks for a line when the change is a rule other screens should follow, also one that replaces a
  row's value), and a line that repeats a row's value adds nothing. A core flow or a `Tabs:` line
  from an Edit or a pick must have the plan's shape (screens by `@name`), or it is refused. A
  deleted screen's lines stay in the spec, no longer tied to it. ✕ in
  the drawer or Undo takes its values back. A Regenerate's lines are dropped. A key one letter off
  a known name (`ui.toggle`) counts as the known name.
- **Code draws tabs and Back.** Each time a screen shows, the app redraws its tab bar from
  `ui.nav` (labels, names, the current tab marked on a tab screen) and Back's label from
  `ui.back`, and hides Back on the tab screens. A screen with no tab bar gets one; a screen with
  no Back is left alone; while `ui.back` is open, Back reads `‹ Back`. Nothing stored changes, so
  an old screen follows a changed line at once. A change redraws the tabs and Back inside each
  frame by a message, so no screen reloads and its script keeps running (a recording timer goes
  on counting); only a tab bar that goes away reloads its screens, to bring back their own markup.
  Asking the models was not enough: Luna dropped a tab on 2 of 6 screens and Haiku wrote Back two
  ways. The tree counts the drawn tabs as links from every screen.
- **Shapes**: a tab bar's `ui.nav` starts with `Tabs:`, `ui.back` starts with its label in double
  quotes (`"‹ Back", top left`), and the core flow is a chain of `@names`; a line of another shape
  is refused, so the app can always read the tabs and the label.
- **Prose before the title** (*"The request as given contains no change…"*) is cut from the
  stored screen.
- Mockups made before the spec open with an empty one and work as before.
- **The review pass**: after every 5 picked screens, GPT-6.1 Sol reads the spec and the tree in
  the background ([prompt-review.md](prompt-review.md)). It may add up to 3 open rows the mockup
  turned out to need, within the limits, and suggest up to 3 rewordings or merges of filled
  lines. A suggestion changes nothing until the user accepts it. It never changes or removes a
  filled row, never holds a screen up, and a failure only shows in the panel's log.
- **The spec panel** (the drawer's Spec tab, or **Spec** in the toolbar) is the one place to read
  and change the spec. It shows how full it is (*11 of 24 lines*), then the review's suggestions
  with **Accept** and **Dismiss**, then the rows by section (Product, Screens, Facts): an open row
  with its question (*not decided yet: …*), a filled line with where it came from (*the plan*, *a
  pick on L1 Home*, *an Edit on …*, *the review pass*, *you*). **Change** (or **Decide** on an open
  row) writes the user's own line, **✕ line** deletes a row's newest line so the one before counts
  (or the row is open again), **Delete row** removes it, and **Add a line of your own** adds a row.
  The user's lines win: no Edit replaces them, and no model changes them. They keep the shapes
  (`Tabs:`, a quoted Back label, a flow of `@names`). A change to `ui.nav` or `ui.back` redraws
  every screen's tabs and Back at once. Under that, the review pass's last run: its rows,
  suggestions, time and cost.
- **Export**: the panel shows the spec as markdown, with **Copy as markdown** and **Download .md**.
  Only the spec.

## Navigation

Each control that opens another screen carries the name of that screen and a short prompt for it,
written by the model (`data-action="@sleep-report: Sleep report of last night with…"`), and is
blue; clicking it asks for *product prompt + action prompt*. The model is told to make details,
forms, settings and tab-bar sections screens of their own, so a mockup has screens to click
through. A plain link the screen does not handle asks for "the screen shown after clicking
*label*"; in-page links (`#…`) stay put. Other controls (filters, inputs) work inside the screen.
Only a real click opens a screen.

- **The name says which screen**: every link to one screen uses one name, so a screen is made
  once however many buttons lead to it, and however they word its prompt. The first screen is
  always `home`. A screen keeps the name of the link that first opened it; an Edit that changes
  its title keeps the name. Info shows it.
- **Planned screens**: a name that a picked screen links to, but that no screen has yet, is a
  planned screen: it belongs to the mockup from that moment, hangs in the tree like any screen
  (under a screen one click nearer Home), and is made, with the prompt of the first link that names
  it, when someone first opens it. It goes away when no screen links to it any more (after an Edit
  or a delete). Deleting a screen that other screens still link to makes it planned again; the
  screens only it led to go with it.
- **The tree in each request**: every request lists the mockup's screens, made and planned (the
  spec's core flow and tabs among them), as an
  indented tree of names and what each screen is (its prompt), two spaces deeper per level,
  planned ones (and ones whose A OR B is open) marked *not made yet*, the screen being made or
  changed marked *this screen*, at most 80 lines; past that, planned screens are left out first,
  deepest first, then the deepest made ones. The model links to any of them with `@` and
  the name alone (`data-action="@sleep-report"`), back to the screen before with `back`, and makes
  up a name, with a prompt, only for a screen the mockup does not have. Details of different items
  are different screens (`@latte-details`, `@mocha-details`). A link by name alone with no screen
  and no plan behind it makes a screen from the name and the button's words.
- **Screens from before names**: links that are a prompt alone still work: a click finds the
  screen made from that prompt (named or not), else makes one; at the pick it gets a name from its title,
  unique in the mockup (*Sleep report* becomes `sleep-report`, a second *Settings* `settings-2`).

- **Back and Home** never make a screen. A control labelled *Home*, *Go home*, *Back to home* or
  *Main menu* goes to the first screen. A control with the action `back`, or labelled *Back*,
  *Go back*, *Return*, *Back to …* (*Back to cats*) or only an arrow (*←*, *‹*, *«*), goes to the
  screen that opened this one (the first screen, if it has none). Icons and arrows in front of a
  label (*🏠 Home*, *⬅ Back*, icon-font words like *arrow_back*) do not count. The label wins over
  the action prompt, since models sometimes give Back a long prompt for the home screen.
- A click that leads to a screen already on the canvas (by name, by the prompt that made it, or
  Back and Home) makes it current and scrolls to it, at no cost; so does one on a screen whose
  A OR B is open.
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

Every screen is stored under its name (`product » @sleep-report`); a screen from before names, under
its normalized prompt: lowercase, single spaces, no trailing punctuation. A screen holds its versions (the last one shows) and, until a pick, its open A OR B.
Opening a stored screen makes no model call and costs nothing. The cache lives on the server and
survives restarts, so every browser shares it. Each screen also stores its name and the screen and
click that first made it; levels are worked out, never stored. Each side of an A OR B is stored as soon as it finishes, so a design
that was paid for is kept even if the browser leaves. The current screen is remembered per mockup
in this browser.

The cache file also holds each mockup's spec (version 4). A file from version 3 loads with empty
specs. A file from a newer app is left as it is: the app says so in the red pill and saves nothing. A cache file from before names (version 2) gets names for its picked screens when the server loads
it, from each screen's title, else its first heading, else its prompt; its stored levels and
clicks go. A file from before versions is moved aside to `screen-cache.json.before-versions`, and
the cache starts empty.

## Pickers

- **Model**: Claude Haiku 5.5 (default), GPT-6 Luna (fast), GPT-6.1 Sol Ultrafast. It applies to the
  next design made; stored screens stay as they are, with their maker in Info.
- **Device**: Phone (default, 390 px wide) or Desktop (1024 px). The model is told which one, and
  every screen is that wide and at least one device screen tall. The plan is told the kind of
  device, never its width. It applies to new screens; Edit and Regenerate
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
