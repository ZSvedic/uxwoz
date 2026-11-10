# Behavior: what the user sees

This doc owns the product flow of the MVP: the toolbar, the generate panel, the canvas of screens,
A OR B and picking, the rail and the drawer, the boxes, filing and the fixer, navigation, the cache,
pickers and the numbers on screen. It does not own the screen format, rendering or model settings (see
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
6. Right of L1, the boxes have filled in the background: Rules holds *box-levels: Levels show as a
   percentage*, and after Zel's Edit asking for a tab bar, Components holds `tab-bar`, which every
   later screen pastes.
7. After the fifth pick the fixer visits. Its note, in Fixer's notes, reads *merged `box-level` into
   `box-levels`; redrew settings: paste tab-bar*, with its time and cost and an Undo beside each.

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

One wooden bar, about 58 px tall, at the bottom centre of the window. The logo (the hat and *UX Woz*)
is its first item. A thin vertical line stands between the others: the mockup menu | ← Nav → | **+** |
Rules | Fixer | Components | Data | Theme | zoom | the speaker | the microphone (in a browser with
speech input).
**+** opens the generate panel (New mockup). The four menus (mockup, Nav, Theme, zoom) look alike,
have the same chevron, and open upward, never taller than the window above the bar. The bar never
scrolls sideways and nothing in it runs past its edge: short of room, the mockup's name gets shorter
first, then the screen's, then the theme's. Under 900 px the logo is the hat alone. Under 720 px the
bar has two rows (the hat, the mockup menu, ← Nav → and **+** above, the rest below, with no lines)
and menus span the window.

- **Project menu**: a button with the mockup's prompt, cut short (at 12 characters under 900 px).
  Its menu has **Recent mockups** (the last ten, the open one
  ticked; choosing one opens it), and, with a mockup open, **⇩ Export the boxes** (a markdown file
  of Components, Rules and Data), **⇩ Export project…** (a zip, see Export below), **↺ Start over** (deletes every screen and the boxes, and makes
  the first screen again) and **✕ Delete** (deletes the mockup). Both ask first.
- **Nav**: names the current screen (*L2 Camera ▾*). Its menu lists every screen as an
  indented tree, each with the control that opened it (*via Camera*), the path to the current
  screen in ember. Choosing one makes it current and scrolls to it. Planned screens (see
  Navigation) are in the tree too, greyed, marked *not made yet*; choosing one makes it, as its
  link would. The components follow, under a **Components** row that moves the view to their box.
- **← and →** (either side of Nav): back to the screen looked at before, and forward again, like a
  browser: every screen that becomes current is a step, and reaching a screen any other way drops
  the steps ahead. Screens deleted since are skipped. ⌘[ and ⌘] do the same (also while a screen
  has the focus), and so do the mouse's back and forward buttons.
- **Rules, Fixer, Components, Data**: each moves the view to its box (Fixer to Fixer's
  notes). A number beside it counts the entries filing or the fixer added or changed (for Fixer,
  the fixer's visits) since the user last looked; three seconds after a look, they count as seen
  and lose their *new* mark. The box becomes current. In a window 1,200 px wide or less, the four
  fold into one **Boxes ▾** menu above its button: each item keeps its number, and the button shows
  their sum.
- **Theme** (left of the zoom): a menu of the themes, the one showing ticked; see Pickers.
- **Zoom**: **−**, the zoom level, **+** and **Fit screen**, the first and last drawn as icons
  at the size of the text (Fit screen's is four corners pointing out). The level opens a menu: Zoom
  in ⌘+, Zoom out ⌘−, 50%, 100% ⌘0, 200%, Fit all ⇧1, Fit screen ⇧2, Fit screen width ⇧3. The keys
  work anywhere outside a text field (Ctrl in place of ⌘ off a Mac). Under 900 px wide only the
  level stays, and the logo is the hat alone. The keys also work while a screen has the focus.

Menus close on Esc, on a press outside them, or on a click into a screen.

### Export

Once a mockup is final, **Export project…** downloads it as one zip (*nicesnore-a-snore-app-with-recording-as.zip*)
for a coding agent or a design agent to build the real front end from. It holds the product, not
the process: no fixer's notes, no design that was not picked, no older versions.

- `HANDOFF.md`: one page for the agent: what the folder is, that the rules bind, that the data is
  sample data to seed with, that the screens' structure and navigation are the spec and the sketch
  look is not, the build order (components, then screens from Home outward), and a prompt to paste.
- `README.md`: the prompt as typed, the device, the model, and the screen tree: each screen with
  its one line and the controls that lead to it. Planned screens are listed as *Not drawn yet*.
- `rules.md`, `data.md` (the tables), `components.md` (each with where it belongs and its HTML).
- `screens/<name>.html`: each drawn screen as a page of its own, components pasted, the Mockup
  theme inside it, as wide as its device. It opens from disk: a control that names a drawn screen
  opens that page, `back` goes back, any other control does nothing. Home is `home.html`.

## Generate panel

The prompt box takes a product description (up to 2,000 characters) and grows with it; Enter makes
the mockup, Shift+Enter adds a line. Under it, the **Model** and **Device** pickers sit
in one row, and a large **Generate** button below them. Under that come **Templates** (example
prompts that start a mockup at once) and **Recent mockups** (every mockup in the cache, most
recently changed first, with its number of screens; the list comes from the server, so it is the
same in every browser). The panel is the same with or without a mockup open: with none it shows on
its own, and **+** shows it over the dimmed canvas, where Esc or a press outside closes it.
A prompt seen before opens its mockup from the cache, at no cost, with the current screen it had
last time in this browser. A reload opens the mockup that
was open, with its A OR B if one was waiting for a pick; it never starts a new design by itself.

## Canvas

The canvas holds every picked screen of the mockup, laid out as a tree on a night sky. Nothing is
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
- **Lines**: a rope from each screen to the screen it hangs under, an open A OR B too: straight
  down to the bottom of the parent's row, then one S-curve across the gap to the child, ending
  above the child's name; straight down all the way in the same column. Every rope has the same
  shape, and their ends keep their order, so no two cross. Other buttons between screens draw no line.
- **Names**: above each screen, on a parchment chip, its level and the short name the model gave it
  (*L2 Camera*), and under that, its idea, on up to two lines; a longer idea ends in **more**, which
  shows the rest (and **less** folds it again). Names and ideas keep their size on screen at any
  zoom; below 50% only the names show. Hovering a name shows it whole.
- **Current screen**: the one the user last picked, clicked in, or chose in Nav. It has a gold
  ring and glow and its rail at full strength; other screens show their rail on hover. Fit screen uses
  it. A box can be current instead (see Boxes): then Fit screen and Fit screen width fit the box
  and its rail, top first, and opening the drawer keeps the box in view. A click in a screen makes
  the screen current again.
- **Live screens**: a picked screen works: controls that open another screen are blue, in both
  themes; everything else keeps the theme's own ink.
- **A screen is as tall as its content**, and at least one device screen tall (844 px on a phone),
  so nothing scrolls inside it: scrolling over a screen moves the canvas. `100vh` is one device
  screen, so "full-screen" screens keep a normal size; a screen that still grows with its window
  grows to 8,000 px at most.
- **Size**: every screen of a device is as wide as the device, so the screens of a mockup line up.
  The model is told to start small.
- **Opening a mockup** fits its current screen, and fits it again once the screen has its real
  size. **Fit screen** keeps a tall screen readable and shows its top, like the A OR B fit.
- **Pan and zoom**: scroll, or drag the empty canvas, to pan. Pinch or Ctrl/Cmd + scroll zooms
  around the pointer, also over a screen, from 10% to 200%. The stars zoom with
  the canvas.
- **Errors** show in a red pill at the bottom of the canvas, above the bar, until closed, or until the next screen
  or change starts. Time and cost are in Info.

## A OR B

Every new screen, the first one and every click to a new screen, comes as two designs made at the
same time. One of them, on a random side, is asked to be a clearly different design, so the side
says nothing about which is which. Both appear out of a blur, the second a beat later.

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
  lifts it with a gold glow, rings it in gold and shows **Pick this design**.
- **Picking**: a click anywhere on a finished side keeps it as the screen's first version and
  deletes the other. If the other is still streaming, it stops at once and nothing of it is kept.
  Both sides and the ✕ are locked, and for 0.8 s the picked one rises and the other dissolves;
  once the server has kept it, the other is deleted and the zoom and scroll come back. If the
  server refuses, both sides come back as they were. If another mockup was opened meanwhile, the
  pick is not drawn into it. The frame does not reload, so the
  picked screen stays as it was, and it ends where it started.
- **Failures**: a side that fails shows its error in its place. If both fail, the A OR B goes
  away.
- **✕** under the OR drops both designs; for the first screen, that drops the mockup.
- **Reloads**: an A OR B stays open until a pick, so a reload shows the same two designs again, at
  no cost. A side that was still streaming at the reload shows as not finished.
- **Deletes win**: a side that finishes after its A OR B was dropped, or its mockup deleted or
  started over, is not kept.

## Rail

A column of large round parchment buttons right of each picked screen, at the canvas's scale like
the screens: 60 px of canvas wide, 40 px buttons at 100%. So a full view packs tight and a rail stays the
same size beside its screen; far out its buttons are too small to hit, so the user zooms in to
use them:

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

A 360 px card docked at the right edge, level, rounded, with a double gold line inside its edge,
for the current screen or box (see Boxes for a box's). It swings in over 0.45 s and closes at once.
The canvas gets narrower and scrolls so the screen stays fully visible beside it. Esc or ✕ closes
it. It has two tabs:

- **Edit**: *What should change?* Type it and click **Make the change** (or press Enter): the
  model gets this screen and the request, and returns the same screen with only that change, as a
  new version in place. **Past changes** lists the versions, newest first: *Edit: show one level
  indicator, not four*, *Fixer: paste tab-bar*, *Regenerated*, *The design you picked*, the one
  showing marked.
- **Info**: name, idea, the click that opened it, what made the version showing (the pick, an Edit
  and its request, or Regenerate), the number of versions, model, device, when it was made, time to
  first text, total time, cost, cost of all versions, finish reason, size and prompt. Then the
  screen's last filing: *Filing: added light-theme, 1.0 s, ~$0.0015* (or why it failed), and each
  line filing's reply had that code refused, with the reason.

Choosing another screen or box while the drawer is open shows that one in it.

## Voice

The user can say an Edit instead of typing it. A microphone button sits last in the toolbar; a click
turns it on or off. The browser asks for the microphone the first time. In a browser that cannot
turn speech into text, the button is not there. Its tooltip says that in Chrome the audio goes to
Google to be turned into text. It hears English, the language Edits are written in.

1. **On** (the icon in gold; no sound plays while it is on): it listens for **"hey Woz"** at the start of what the user says
   (also heard as *hey was* or *hey waz*). The phrase in the middle of a sentence does nothing, so
   talk about something else does not start an Edit.
2. **Listening** (a pulsing dot): the words show live in the drawer's Edit field of the current
   screen or box, and the drawer opens on Edit; the focus stays where it was. Words said right
   after "hey Woz" count too, and show while they are said: *"Hey Woz, use switches"*. Text the
   user typed in the field stays, in front of the spoken words, and voice does not write while the
   user is typing there.
3. **Sending in 3…**: a pause starts a three-second countdown under the field, with **Cancel**.
   Speaking again holds it, and the new words join the old ones, so a breath does not split one
   request in two. If the browser settles no words within 1.5 seconds, or stops listening, the
   countdown starts again with what was said.
4. At zero the Edit runs, exactly as Enter in the field would. Then it waits for "hey Woz" again.
   With no screen or box current, the hint says *Click a screen first.* and the words stay in the
   field.

**Cancel** (the button, or saying **"cancel"** or **"never mind"**) works while it listens or counts
down: it drops the words and keeps listening. **"Woz sleep"**, **"Woz stop"** or **"stop
listening"** drops them and waits for "hey Woz" again. These phrases count only when said on their
own: *"add a button that says stop listening"* is an Edit.

The browser stops listening by itself after a silence; UX Woz starts it again at once. After five
failures in a row (another tab taking the microphone counts) the red pill says *Voice input stopped. Click the microphone to start again.*
If the browser blocks the microphone, it says *The browser blocked the microphone.* and turns off.

## Boxes

Right of the first screen and its rail, in its row, four labelled boxes stand side by side, at the
canvas's scale, tops level with the first screen: **Rules**, **Fixer's notes**, **Components**,
**Data**. A box is at most as tall as the first screen (and at least one device screen); the rest
scrolls inside it, and the wheel scrolls the box while it can, then pans the canvas. So the first
row is as tall as the first screen, and the rows below start under it; a child that does not fit below the first screen goes right, under
the boxes, and another screen with no parent goes right of the boxes. Every model call reads
Components, Rules and Data in full, so what is in them is what the screens share.

The boxes are index cards with ruled lines, a gold pin and an edge that glows in the box's colour.
Rules, Data and Fixer's notes lean by at most 1.5° and stand straight while current; Components,
which holds live screens, never leans. A click in a box (not in a component card) or on its toolbar
button makes it current: its glow turns gold and its rail is at full strength, as a current screen has; other boxes show their rail on
hover. Each box's rail is like a screen's, right of it: first its own button (Rules **+ Rule**,
Fixer's notes **▶ Visit now**, Data **+ Table**; Components has none), then:

- **✎ Edit** opens the drawer on the box: *What should change in Rules?* (or the box's name) and
  **Make the change**. The request goes to the fixer as a visit that starts from it: the fixer
  does what the user asks first, and may then change entries the user wrote in that box; then it
  tidies up as on any visit. Each change gets its line and Undo in Fixer's notes, under *You
  asked: …*. While a visit runs, Make the change and Visit now wait (+ Rule and + Table do not).
  An Edit asked for before the first screen is picked says *Wait for Home's pick*. **Past
  changes** lists, newest first, the changes Undo can take back, each with what it was and when:
  *Edit: merge the two score rules*, *Visit*, *Filing after home*, *You changed score-direction*.
  For Fixer's notes it lists the visits (*Visit, 4 changes*), an undone one struck through.
- **↶ Undo** puts the box back as it was before its last change, whoever made it: the user in
  place, filing, an Edit or a visit (a filing, or a visit with its redraws, is one change). Each box
  keeps its last 10 states; Undo again goes further back. A component the Undo drops leaves its
  HTML in the screens that paste it; one it brings back is pasted on no screen until a screen
  pastes it again (its Info says so). An ID the Undo drops is not used again. On Fixer's notes,
  Undo undoes every change of the newest visit not undone yet; a change it cannot undo (the user
  changed the entry since, a full box) is skipped and named in the red pill, its own Undo stays,
  and the next Undo goes to the visit before. It shows only when there is something to undo.
- **ⓘ Info** opens the drawer on Info: the box's count against its limit, a table's limits, how
  many entries are the user's, how many are new since the user looked, and what Undo can take back;
  for Fixer's notes, the visits kept and the picks left before the next one.

- **Components**: small cards like screens, as tall as their content, each with its ID and the line
  that says where it belongs. A screen pastes a component by ID; a changed component (Edit, Undo)
  shows at once on every screen that pastes it, and a deleted one leaves nothing in its place. The
  rail has ✎ Edit, ↶ Undo, ⓘ Info (where it belongs, the screens that paste it, the screen it was
  taken from) and ✕ Delete.
- **Rules**: one line each, the ID and one sentence; an entry the user wrote is marked *yours*, in
  Data too. Click the sentence to change it; Enter or a
  click elsewhere saves, Esc puts it back, an empty sentence deletes it. **+ Rule** on the rail
  adds an empty rule at the end with the cursor in it; its sentence's first words make its ID, and
  left empty it goes.
- **Data**: small tables, each with an ID, named columns and rows. Click a cell to change it; a row
  left empty or a column without a name goes when the table saves. **+ row**, **+ column**, ✕, and
  **+ Table** on the rail, which adds a table with only its name, the cursor in it: the name makes
  its ID, and it gets the columns *name* and *value* and one empty row. Left empty, it goes.
- **Limits**, as the manual says: 20 components, 20 rules of at most 120 characters, 10 tables of at
  most 6 columns and 8 rows. A full box takes nothing new; a refused edit says why in the red pill.
  An ID is 1 to 4 lowercase words joined by dashes, unique in its box, and never used again.
- **Filing**: after a pick or an Edit, GPT-6.1 Terra reads the paper and the decision and files what
  it settles, in the background: a part the screen shows the same as other screens will (it moves
  to Components, and the screen pastes it where it was, so it looks the same), a rule, a table.
  The screen's Info says what it filed. A click that opens a new screen waits for it, at most 5
  seconds; an Edit too.
- **New** marks an entry filing or the fixer added or changed since the user last looked at its box.
- **Fixer's notes**: every 5th pick of a mockup, on **Visit now** and on an Edit of a box, GPT-6.1 Terra
  visits in the background, after any filing (the two never run at once). It reads the boxes, the
  titles and the screens added or changed since its last visit (all of them on the first), and
  merges entries that say one thing twice (the older ID stays), removes what one screen or none
  needs, adds or changes a rule, a table or a component filing missed, and redraws at most 5 screens or components that break a
  rule, draw a component by hand, have a control that leads nowhere or show a fact differently
  from a newer screen. A redraw is an Edit with the
  fixer's sentence as the change: a new version, no filing. An entry the user wrote is never
  changed or removed (except in the box the user asked about with Edit), a screen whose A OR B is open is not redrawn, and a component that goes
  leaves its HTML in the screens that paste it, so they look the same. A visit whose reply comes
  after Start over or the mockup's delete is dropped; a line about a screen or entry deleted
  meanwhile is refused, and a screen the user changed during the visit is not redrawn. A pick that
  comes while a visit runs brings none: the next visit reads its screen. At most 5 redraws a visit
  keeps a visit's cost to about a cent.
- **A note per visit**, newest first: when, what the user asked (for an Edit), how many screens it read, each change on its line with
  the fixer's reason and an **Undo**, the lines code refused and why, time and cost (the redraws
  included). Undo of a merge or a remove puts the entry back with its ID and place, of an added
  entry deletes it (unless the user rewrote it since), of a change puts the old entry back (unless the entry changed since), of a
  redraw drops that version. An undone change is struck through. A redraw reads *redrawing* until
  its version is stored. An old mockup with empty boxes gets them filled this way.

## Navigation

Each control that opens another screen carries the ID of that screen (its name) and, for a new
screen, its one line, written by the model (`data-action="@sleep-report: Sleep report of last
night with…"`), and is blue; clicking a new one asks for that screen, drawn from the paper. A
link without a name (`<a href>`, or an action with no `@`) leads nowhere: a click says *This
control leads nowhere yet*, and the fixer redraws it. Other controls (filters, inputs) work inside the screen. Only a real click opens a screen.

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
- **The paper in each request**: every request lists the mockup's screens, made and planned, as
  titles (`sleep-report: what it is for`, the first screen first, planned ones and open A OR Bs
  marked *no drawing yet*) and lines (`home -> sleep-report` for each link between two of them),
  then the three boxes in full, each component with the screens that paste it (see
  [prompt-screen.md](prompt-screen.md)). The model links to a
  screen on the paper with `@` and its ID alone (`data-action="@sleep-report"`), back with `back`,
  and to a new screen with an ID and its one line. A link by ID alone with no screen and no plan
  behind it makes a screen from the ID and the button's words.
- **Back** never makes a screen: a control with the action `back` goes to the screen this one hangs
  under (the first screen, if it has none). What a control says never decides where it goes.
- **The current link**: a control that opens the screen it sits on (a tab bar's own tab) is marked
  current and shows bold and underlined; a click on it stays.
- A click that leads to a screen already on the canvas (by name, or Back and Home) makes it current and scrolls to it, at no cost; so does one on a screen whose
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

Every screen is stored under its name (`product » @sleep-report`), the first screen under the
normalized product prompt: lowercase, single spaces, no trailing punctuation. A screen holds its versions (the last one shows) and, until a pick, its open A OR B.
Opening a stored screen makes no model call and costs nothing. The cache lives on the server and
survives restarts, so every browser shares it. Each screen also stores its name and the screen and
click that first made it; levels are worked out, never stored. Each side of an A OR B is stored as soon as it finishes, so a design
that was paid for is kept even if the browser leaves. The current screen is remembered per mockup
in this browser.

The cache file is version 5 and also holds each mockup's boxes. A file from version 3 or 4 loads
with empty boxes; the spec feature's `specs` and `reviews` go at the next save. A file from a newer app is left as it is: the app says so in the red pill and saves nothing. A file from before names (version 2, or older) is moved aside to
`screen-cache.json.before-names`, and the cache starts empty. Screens of version 3 and 4 that
were stored under their prompt keep their place in the tree, through the click that made them;
their links with no `@` lead nowhere.

## Pickers

- **Model**: Claude Haiku 5.5 (default), GPT-6 Luna (fast), GPT-6.1 Sol Ultrafast. It applies to the
  next design made; stored screens stay as they are, with their maker in Info.
- **Device**: Phone (default, 390 px wide) or Desktop (1024 px). The model is told which one, and
  every screen is that wide and at least one device screen tall. It applies to new screens; Edit and Regenerate
  keep the screen's own device. While a mockup is open, the picker shows the device of its first
  screen, so its next screens, and Start over, match it; **+** (New mockup) and closing the mockup
  bring back the saved choice. Screens made before devices existed show at 800 px.
- **Theme** (in the toolbar): Mockup (default) or Clean. Mockup is black and white with a handwriting font and
  wobbly borders, so a screen reads as a sketch; even the model's chart colours turn grey, except
  the blue of controls that open a screen. Clean is plain Pico with neutral buttons and links.
  Switching restyles the screens at once; the model never sees the theme.

Loading the page and picking a model each send a short warm-up request to warm the prompt cache.
All three choices are remembered in this browser when they change, and Model and Device again on Generate.

## Sharing

The owner sends a link to a reviewer or a potential customer, who clicks through the mockup in the
browser and says what they think. Nothing is real-time and nobody signs in: a link is the key.

- **Share…** (project menu) opens the drawer on *Share and feedback*: pick a role, **Make a link**
  (it is copied), and the links below, each with when it was made, how often it was opened, **Copy**
  and **Revoke** (it stops working for everyone). Roles:
  - **View**: the player (below). A control with no drawn screen behind it says *Not designed yet*.
    Nothing is generated, so a viewer costs nothing.
  - **Comment**: the player plus feedback (below).
  - **Edit**: the whole app on that mockup only, without the project menu; it cannot delete the
    first screen. It has a budget (20 by default) of model calls (a new screen, a pick, an Edit,
    Regenerate, an Edit of a box, Visit now), since they cost the owner's credits; the link shows
    how much is used. Past it, the red pill
    says *This link's budget is used up*.
- **The player** shows one screen at a time in its device frame, in the Mockup theme, components
  pasted, in an ivory frame on the night sky; on a parchment strip at the top, the hat, **← Back**,
  its name and the trail of names (each one clickable). It plays no sounds and no animation. A click on a
  control opens the screen it names; `back` goes to the screen it hangs under; a control whose
  action names no screen (plain words) leads nowhere, as in the app. A desktop screen
  shrinks to fit a phone.
- **Feedback** (comment links), on the wooden bar at the bottom, **Done** in ember: 👍 and 👎 for the screen (a visitor's
  newest counts), **Comment on this screen** (with an optional part: **Pick a part** and click it in
  the screen, and its words fill *About*), and **Done**, which asks *Would you use this? Why or why
  not?*. A dead control asks *Not designed yet. What did you expect here?* and keeps the control's
  words. The visitor's name is asked once in each form, optional, and kept in the browser.
- **Trips** (comment links): the player sends each visit's screens, in order, and the dead controls
  clicked, as they change (the first 50 of each).
- **What the owner sees**: **Feedback** (project menu) opens the same pane at *Feedback*: by screen,
  the newest first, with its thumbs (*👍 2 · 👎 1*) and each comment and dead-control answer with the
  visitor's name; then the answers to *Would you use this?*; then the trips, as
  *Ana: Home → Nights → Settings, 1 dead click (Pair watch)*. A screen's Info lists its thumbs and
  comments too. A mockup keeps its last 500 comments, 500 thumbs, 500 answers and 500 trips; a text
  is at most 1,000 characters. Deleting the mockup, or Start over, deletes its links and feedback.
- **The owner** (`UXWOZ_OWNER`): when set, the app and its API answer only a browser that opened
  `/?owner=<secret>` once (it keeps a cookie); others see *This UX Woz is private.* Share links work
  for everyone. Unset, the app is as before.

## Colours

Black and white is the mockup, and blue is a control in a mockup that opens another screen, in
both themes. UX Woz itself sits on a night sky, its menus and panels parchment by day and indigo
by night. Ember is UX Woz's actions: Generate, Make the change, Pick; it also marks Nav's path and
what is *new*. Gold is the OR, the box numbers, the pins, and the ring and glow of the current
screen or box. Lines are tan ropes with a dark twist.

## Look

Sounds are off by default; the speaker in the bar turns them on, kept in this browser: a whoosh
when designs appear and when the drawer opens, a chime on a pick, a tinkle on hovering a side.
Turning them on plays the tinkle once. With the system's reduced-motion setting there are no sparks
and nothing moves (every animation jumps to its end); sounds still follow the speaker.
`?design=still` in the address shows the same look with no animation, no sound and no tilt (the
logo and the boxes sit level), for checks and screenshots.
