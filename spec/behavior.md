# Behavior: what the user sees

This doc owns the product flow: the top bar, the menu, New project, the tour, the canvas of mocks, the
four buttons under a mock and the cards they flip to, the boxes, filing and the fixer, navigation,
the cache, sharing and the public. It does not own the mock format, rendering or model settings (see
[ui-generation.md](ui-generation.md)) or types and env vars (see [code-contract.md](code-contract.md)).

A **mock** is one screen of the product being designed. A **project** is the whole thing: its mocks
and its four boxes. The product is **UXWoz**, *Woz* for short. The app is built for a phone first: one
mock at a time fills the view, and a larger window shows more of the same canvas.

## Example

1. Zel opens UXWoz on his phone for the first time. The tour's first mock, *This is Bill.*, fills
   the view. He reads four mocks, tapping the one button on each, and the last opens **New project**.
2. He types *a cat litter box app* and taps **Draw it**. The canvas shows one card named *Home*, and
   the mock streams into it. Under it are four buttons: 🎲 **Another**, ✏️ **Edit**, ⏪ **History**,
   ℹ️ **Info**.
3. He taps 🎲. A second, clearly different design replaces the first. History holds both.
4. He taps *Camera* inside Home. The canvas glides down a rope to where the new mock goes while the
   model draws it. The name in the top bar reads *Camera*.
5. He taps ✏️. The mock flips to a card of the same size. He holds 🎙️, says *show one level
   indicator, not four*, lets go and taps **Make the change**. The card flips back and the mock
   changes in place. ⏪ has **Undo**.
6. He opens the dropdown under the name. The four boxes are one row at its top, *Rules* with a 2 on
   its corner: two rules were added since he last looked. Below is the tree: *Home*, and one step in,
   *Camera* and a grey *Settings · not made yet*.
7. After the fifth mock he clicked on from, the fixer visits. Its note, in the Fixer box, reads
   *merged `box-level` into `box-levels`; redrew settings: paste tab-bar*, with an Undo beside each.

```
 [W+] [←] [ Camera ▾ ] [→] [100% ▾]      the top bar
        │
      Camera                              the name
 ┌────────────┐
 │            │                           the mock: a frame of fixed size,
 │            │                           its content scrolls inside
 └────────────┘
  🎲  ✏️  ⏪  ℹ️                           its buttons, on the canvas
        │
```

## Top bar

One bar at the top of the window, 52 px tall, five buttons on a phone: the logo, **←**, the name,
**→**, the zoom. The name takes the room the others leave. Every button is inside the window and at
least 36 px high.

- **The logo** is *W* with a yellow sparkle above its last stroke. A tap opens the menu (below). In a
  window 720 px or wider it is the wordmark *UXWoz* with the same W.
- **The name** is the current mock's or box's name (*Camera ▾*, *📐 Rules ▾*), cut short with *…*
  when it must be. A tap opens the dropdown, as wide as the window on a phone:
  - **The four boxes** in one row at the top, always: 📐 **Rules**, 🧩 **Components**, 🗄️ **Data**,
    🕵️ **Fixer**. A tap moves the view to that box and makes it current. A number on a box's corner
    counts the entries filing or the fixer added or changed (for Fixer, the fixer's visits) since
    the user last looked. Three seconds after a look they count as seen and lose their *new* mark.
  - **The project's sentence** on one line, cut short.
  - **The tree** of mocks, scrolling under the row. A step in is one click further from Home. The
    current mock is marked. A planned mock (see Navigation) is grey and says *not made yet*;
    choosing it makes it, as its link would. Choosing a drawn mock makes it current and the canvas
    glides to it.
- **← and →**: back to the mock or box looked at before, and forward again, like a browser. Every
  mock or box that becomes current is a step, and reaching one any other way drops the steps ahead.
  Mocks deleted since are skipped. ⌘[ and ⌘] do the same, and so do the mouse's back and forward
  buttons and the browser's own (see The address).
- **The zoom** shows the level. Its menu: Zoom in ⌘+, Zoom out ⌘−, 50%, 100% ⌘0, 200%, Fit all ⇧1.
  The keys work anywhere outside a text field (Ctrl in place of ⌘ off a Mac), also while a mock has
  the focus. Where the device cannot hover, menus leave out their keys.
- **A window 720 px or wider** adds, while they fit: the four boxes as buttons with their counts,
  right of **→**, and **−**, **+** and **⌖** (100%, the current mock, ⌘0) around the zoom. Fit all
  stays in the zoom's menu and on ⇧1. When the boxes do not fit they stay in the dropdown only. The
  bar never scrolls sideways.

Menus close on Esc, on a press outside them, or on a click into a mock.

## The menu

A tap on the logo opens a panel at the window's left edge, over the dimmed canvas. It holds what
the bar has no room for. Esc, ✕ (on the same disc as a card's) or a press outside closes it.

- **➕ New project** opens the New project panel (below).
- **🕘 Recent**: the last ten projects, the open one ticked; choosing one opens it. The list comes
  from the server, so it is the same in every browser.
- **🎓 Tour** opens the tour at its first mock.
- **This project**, with a project open (not in the tour):
  - **🔗 Share…** and **💬 Feedback** turn the panel to that page, with **←** back to the menu (see
    Sharing).
  - **⇩ Export project…** (a zip, see Export) and **⇩ Export the boxes** (a markdown file of
    Components, Rules and Data).
  - **↺ Start over** deletes every mock and the boxes, and draws Home again. **✕ Delete** deletes
    the project, then opens the newest other project, or the tour when there is none. Both ask
    first.
- **UXWoz**: **🎨 Theme** (see Choices), **🔈 Sound** (on or off), the account (the public's, see
  The public), **Privacy**. The owner has **Model** here too.

### Export

Once a project is final, **Export project…** downloads it as one zip
(*nicesnore-a-snore-app-with-recording-as.zip*) for a coding agent or a design agent to build the
real front end from. Once it is saved, a brief hint names the file (*Saved nicesnore-….zip to your
downloads.*), and a failure shows in the red pill. It holds the product, not the process: no
fixer's notes and no older versions.

- `HANDOFF.md`: one page for the agent: what the folder is, that the rules bind, that the data is
  sample data to seed with, that the mocks' structure and navigation are the spec and the sketch
  look is not, the build order (components, then mocks from Home outward), and a prompt to paste.
- `README.md`: the sentence as typed, the size, the model, and the tree: each mock with its one
  line and the controls that lead to it. Planned mocks are listed as *Not drawn yet*.
- `rules.md`, `data.md` (the tables), `components.md` (each with where it belongs and its HTML).
- `screens/<name>.html`: each drawn mock as a page of its own, the version showing, components
  pasted, the Mockup theme inside it, as wide as its size (from disk its font cannot load, so it
  shows in a handwriting font the system has, else sans-serif). It opens from disk: a control that names
  a drawn mock opens that page, `back` goes back, any other control does nothing. Home is
  `home.html`.

## New project

A panel over the canvas, from the menu and from the tour's last button. Esc or ✕ closes it and
shows what was open before.

- **The examples**: seven cards with their names (*Plant care*, *Split a bill*). A tap opens that
  project at the size in **Design for** and replays a recording (see The public).
- **The prompt box** takes a product description (up to 2,000 characters) and grows with it; Enter
  draws, Shift+Enter adds a line. 🎙️ **Hold to talk** is beside it (see Voice).
- **Design for** picks the size of the project's mocks (see A mock). It starts at this window's
  size, so a laptop can design a phone app.
- **Draw it** makes the project and draws Home.

A newcomer (no projects) sees the heading *Turn one sentence into a clickable mock*, the line *Pick
an example, or describe your own.*, the examples first and the box under *or describe your own*. A
person with projects sees *What should we mock up?* and the box first. A sentence the person
already has a project for opens that project, at no cost, at the mock it showed last in this
browser.

## The tour

Four mocks that explain UXWoz in the app itself: *This is Bill.*, *Meet Woz.*, *How Woz works*,
*Be like Bill*. A first visit (nothing in Recent) opens it at the first mock. A later visit opens
the last project, and the tour is in the menu.

- **It is a project like any other**, read from saved files: the four mocks hang under each other
  on ropes, the button at the foot of each leads to the next, and its boxes hold three rules, one
  component, one table and one fixer's note. No model is called, so it costs nothing.
- **It is read-only.** All four buttons under a mock are grey, and a tap says *Off in the tour.*
  The boxes cannot be changed. The dropdown, ← →, the zoom and moving the canvas work, so *Try it
  now: pick Rules in the dropdown, then press ←* can be tried. The app does not check that it was.
- **A tour mock never scrolls.** All of its text and its button fit a small phone (360 × 500), the
  button at the bottom of the mock, in the same place on all four, however long the text above it.
  It has no title inside: its name is on the tag above it. Every window shows the same four mocks,
  scaled to fit.
- **The text has a shape, not a wall.** Lines that belong together sit tight, groups have a gap
  between them. The numbers that carry the story are bold (*Change. **10 min.*** against *Change.
  **3 sec.***; **40h** against **4h**), a punchline is in italics with more room above it (*He still
  doesn't like the app.*, *Bill is smart. Be like Bill.*), an aside is grey italics (*(Bill was me,
  by the way.)*), and *How Woz works* opens its lists with short bold lead-ins (**Under the mock:**,
  **Right of Home:**, **Get around:**). The tour calls the fixer's box **Fixer**.
- **Bill**, a stick figure, stands at the right of the first and last mocks, a quarter of the
  width, the text beside him.
- **The last button**, *Try another example*, opens New project.
- The Wikipedia link in *Meet Woz.* opens in a new tab, as every link to a full web address does
  (see Navigation).

The saved files in `tour/` are the source: an edit to one shows on reload.

## Canvas

The canvas holds every mock of the project, laid out as a tree on a night sky. Nothing is hidden
when the user branches.

- **Rows**: Home is the top row. Each mock hangs under a mock one click before it on a shortest
  path from Home: the one whose click first made it, when that is one, else the first other. The
  app works this out each time from the links in each mock's showing version, plus the click that
  first made each mock; nothing about it is stored. So an Edit that adds a button on Home straight
  to a mock two rows down moves it up a row at once, and Undo moves it back.
- **Places**: the mocks of a row sit side by side, children in the order of their parents. A
  mock's first child sits straight below it when that place is free, else in the next free place
  to the right. A parent never moves to make room for its children. Every mock of a project is the
  same size, so every row is as tall as the others.
- **Ropes**: a rope from each mock to the mock it hangs under: straight down to the bottom of the
  parent's row, then one S-curve across the gap to the child, ending above the child's name;
  straight down all the way in the same column. No two cross. Other links between mocks draw no
  rope.
- **Names**: above each mock, on a parchment tag, the short name the model gave it (*Camera*).
  Names keep a readable size when zoomed out. Hovering a name shows it whole.
- **The current mock** is the one last opened, tapped, or chosen in the dropdown. It has a gold
  ring and its buttons under it. A box can be current instead (see Boxes). A tap on the sky leaves
  nothing current: no ring, no buttons, and the bar's name stays.
- **100%** is the starting view: the current mock as a card with its name above, its buttons under
  and its ropes showing, as large as the canvas allows, at most 1.5 times the mock's real size.
  Opening a project, choosing a mock and a tap on a link all show the current mock this way, at
  the zoom the user has. The zoom goes from 10% to 200%. On a phone 100% fits the part of the
  window the browser's own bars leave free, so the buttons under the mock show.
- **Fit all** shows the whole tree and the boxes.
- **The glide**: when another mock or box becomes current, the canvas glides to it in a straight
  line, 0.6 s, at the current zoom. With the system's reduced-motion setting it jumps. When the
  dropdown, **←** **→** (and ⌘[ ⌘], Back and Forward) or the bar's boxes make it current and the
  zoom is below 75% of its 100%, the glide ends at 75%; it never zooms out. A tap on a mock or a
  click inside one keeps the zoom.
- **Pan and zoom** with a mouse or trackpad: scroll or drag the sky to pan. Over a mock the scroll
  moves the mock's content first while it can, then the canvas. Pinch or Ctrl/Cmd + scroll zooms
  around the pointer, also over a mock. The zoom menu, **+**, **−** and the keys zoom around the
  current mock or box. The stars zoom with the canvas.
- **Touch**: one finger on a mock belongs to the mock: it scrolls its content, and a tap clicks.
  When the content reaches its end, the rest of that swipe moves the canvas, so the buttons below
  come into view. One finger on the sky, or two fingers anywhere, move the canvas. Two fingers
  pinch to zoom: they only pan until their spread has changed by more than 5%, then the zoom
  follows them, so a pan does not wobble the zoom.
- **The edges**: the sky left of and above the tree is only as wide as Home needs to come to the
  middle, so a pan or flick to the top left corner ends on Home. Right of and below the tree there
  is room for any mock to come to the middle. A zoom near that corner still keeps the point under
  the fingers or the pointer: the canvas grows there as much as it needs, and gives the room back
  as a pan leaves it (or at the next 100%, Fit all or glide).
- **The window**: when its size really changes (or it moves to another display), the canvas shows
  the current mock or box at 100% again, unless the user zoomed or panned by hand since. A
  keyboard that opens on a phone moves nothing. Nothing makes the page wider than the window.
- **Errors** show in a red pill at the bottom of the canvas until closed, or until the next mock
  or change starts.

## A mock

A mock is a frame of fixed size, like a real device, drawn as a white card with round corners.

- **Its size** is the project's, chosen when the project is made:

  | Size | Mock | Offered first to a window |
  |---|---|---|
  | Small phone | 360 × 500 | under 400 px wide |
  | Large phone | 412 × 620 | 400 to 719 px |
  | Laptop | 1280 × 560 | 720 to 1599 px |
  | Monitor | 1920 × 780 | 1600 px and wider |

  Each is its window less what the app needs around a mock. A project keeps its size on every
  device: a laptop project opened on a phone is scaled down to fit. Projects made before the
  rework keep their 390 × 844 and 1024 × 768.
- **Its content scrolls inside** with one finger or the wheel. What the mock pins (a tab bar)
  stays at the frame's bottom.
- **Scroll corners**: an edge with more content beyond it has flat corners and fades into the sky.
  At the top of a long mock the bottom is flat and fades; at its end the top is; in the middle both.
- **It works**: controls that open another mock are blue, in both themes; everything else keeps
  the theme's own ink. Filters and inputs work inside the mock.
- **Drawing**: a new mock streams into its place while a note at the bottom of the canvas says
  *Drawing Care log…*. Until it is done its controls do nothing, and 🎲 ✏️ ⏪ are grey; ℹ️ works.
- **A design that fails** (see Streaming and timing) shows its reason in the red pill. A new mock
  that failed is not kept: the canvas glides back to where the click came from, and the mock stays
  planned, so the same link draws it again. A first Home that failed opens New project with the
  sentence still in it.

## The buttons under a mock

Four buttons on the canvas, centred under the current mock, narrow, with room between them. They
zoom with the mock. No other mock shows any.

Edit, History and Info **flip** the mock: it turns over in place to a card of the same size, with
one clean edge and ✕ in its corner, on a dark disc a finger can hit (about 40 px). A card that
scrolls has the same scroll corners as a mock. On an Info card each label (*Asked for*, *Model*) is bold ink
over its value. The pressed button is dark. ✕, Esc or the same
button again flips back to the mock; another button turns the card to that one. Choosing another
mock flips back first.

- **🎲 Another** draws one more design of the mock from the same words, asked to be clearly
  different, and shows it in place of the first. Both stay in History. After two designs from the
  same words, the next press flips to **Describe it differently**: *Neither design fits? Say what
  this mock should be.*, the mock's words in a field, **Draw again** and 🎙️ **Hold to talk**, which
  draws a design from the new words. Then 🎲 gives one more, and the press after that asks again.
  An Edit does not reset the count. For Home the words are the project's sentence, and the project
  takes the new sentence as its name; a sentence another project already has is refused.
- **✏️ Edit**: *What should change?*, a field, **Make the change** (or Enter) and 🎙️ **Hold to
  talk**. The card flips back, the mock's note says *Making the change…*, and the model returns
  the same mock with only that change, as a new version in place. At the card's bottom, **Delete
  this mock…** asks, then deletes the mock and the mocks only it leads to. A mock that a link in
  another mock also reaches stays, under that mock. Home's card has no Delete: the project's is in
  the menu.
- **⏪ History**: **↶ Undo** and **↷ Redo** at the top, then every version, newest first, the one
  showing marked: *Edit: show one level indicator, not four*, *Fixer: paste tab-bar*, *New words:
  a camera with one big button*, *Another design*, *First design*, each with when. Undo shows the
  version before the one showing, Redo the one after, and a tap on a version shows that one. The
  card flips back to it. A mock keeps its last 10 versions; a new version goes to the end of the
  list. Everything else (links, the tree, Export, the player) reads the version showing.
- **ℹ️ Info**: **Asked for** (the words the model was told to draw, from the link that opened the
  mock or from the user), **Drawn as** (the model's own line about what it drew), **Link ID**
  (*@plant-page*), **Reached by** (the links that lead here: *A plant's row in Home*), **Model**
  (*Claude Haiku 5.5 in 2.9 s for $0.0010*, or *… in 3.7 s, free* for a design that cost nothing,
  as a replayed example), **Added to the boxes** (what filing took from this mock, or why it
  failed), and for a project with share links its thumbs and **Comments** (see
  Sharing), counted on the button (*ℹ️ 2*).

## Voice

The user can say words instead of typing them. Every field for the model has 🎙️ **Hold to talk**
beside it: New project's prompt box, Edit (a mock's and a box's) and Describe it differently. On a
card the field's own button comes first, on one line, and 🎙️ Hold to talk to its right in the room
left; where that is too narrow it reads 🎙️ **Hold**, and where even that does not fit, 🎙️ alone (its
name stays *Hold to talk*).

1. Hold the button and speak. The words show in the field as the browser hears them, after any
   text already typed there.
2. Let go. The words stay in the field, to correct by hand.
3. Press the field's own button (**Make the change**, **Draw again**, **Draw it**). Voice never
   sends by itself.

On a phone a finger holds the button as a mouse does: a long press selects none of its words and
opens no menu. On a laptop the mouse or Space on the focused button holds it.

The browser asks for the microphone the first time. In a browser that cannot turn speech into text
the button is not there. Its tooltip says that in Chrome the audio goes to Google to be turned into
text. It hears English, the language Edits are written in. A problem shows in the red pill: *No
microphone found.*, *Speech recognition needs the internet.*, *The browser blocked the microphone.
To allow it, click the lock or tune icon in the address bar.*, or *Voice input had a problem (<the
browser's word for it>).*

## Boxes

Right of Home, in its row, four labelled boxes stand side by side, tops level with Home: **Rules**,
**Components**, **Data**, **Fixer** (the fixer's notes), the order of the bar and the dropdown. A box is as wide as the project's mock, at most 520
px: 360 or 412 in a phone project, 520 in a laptop or monitor project. A box has room for 10
ruled lines to start and grows with what it holds up to 20 lines, the same rule for all four;
past 20 lines the rest scrolls inside it, with the same scroll corners as a mock: its writing
fades into the paper on a side with more. The cap holds
even where 20 lines are taller than Home. Their bottoms differ, and each box's buttons sit under
its own bottom. A child of Home that does not fit below Home goes right, under the boxes; the row
of Home's children and the ropes into it start below the tallest box and its buttons. Components is the
exception in width: it is as wide as a mock, so a component shows at its real size. The boxes
stand close together, 40 px apart. Every model call reads Components, Rules and Data in full, so
what is in them is what the mocks share.

A box is a page of ruled paper with dark ink, as a mock is white paper: Rules a light yellow
legal pad, Fixer a very light red, Components a light blue, Data a light green. Its pin is
the dark of its own colour: dark amber, dark red, dark blue, dark green. Each entry is a line or
two of writing on the ruling with no frame round it. A box flipped to Edit, History or Info shows
a parchment card of the box's size; where it scrolls its words fade into the parchment. A tap in a box, or on its button in the dropdown or the bar, makes
it current: a gold ring, the top bar's name (*📐 Rules*), and its buttons under it. A tap on an
entry of a box that is not current only makes the box current; the next tap edits the entry. From
the keyboard, Tab to an entry of the current box edits it, and Enter edits one already focused. A box's buttons
are a mock's four with its own action in 🎲's place:

| Box | First button | Then |
|---|---|---|
| 📐 Rules | ➕ **Add rule** | ✏️ Edit, ⏪ History, ℹ️ Info |
| 🗄️ Data | ➕ **Add table** | ✏️ Edit, ⏪ History, ℹ️ Info |
| 🕵️ Fixer | ▶️ **Run fixer** | ✏️ Edit, ⏪ History, ℹ️ Info |
| 🧩 Components | none | ✏️ Edit, ⏪ History, ℹ️ Info, centred |

- **✏️ Edit** flips the box to *What should change in Rules?* (or the box's name), a field,
  **Make the change** and 🎙️. The request goes to the fixer as a visit that starts from it: the fixer
  does what the user asks first, and may then change entries the user wrote in that box; then it
  tidies up as on any visit. The card flips back at once, and until the visit ends the box's title
  line says *Making the change…* and Fixer's says *Visiting…* (as on any visit; after a reload
  during it, Fixer's line alone says so). Each change gets its line and Undo in Fixer, under *You
  asked: …*. While a visit runs, Make the change and Run fixer wait (Add rule and Add table do
  not). An Edit asked for before Home is drawn says *Wait for Home.*
- **⏪ History** flips to **↶ Undo** and the changes it can take back, newest first, each with
  what it was and when: *Edit: merge the two score rules*, *Visit*, *Filing after home*, *You
  changed score-direction*. Undo puts the box back as it was before its last change, whoever made
  it: the user in place, filing, an Edit or a visit (a filing, or a visit with its redraws, is one
  change). Each box keeps its last 10 states; Undo again goes further back. A box has no Redo. A
  component the Undo drops leaves its HTML in the mocks that paste it; one it brings back is
  pasted on no mock until a mock pastes it again. An ID the Undo drops is not used again. On
  Fixer the list is the visits (*Visit, 4 changes*), an undone one struck through, and
  Undo undoes every change of the newest visit not undone yet; a change it cannot undo (the user
  changed the entry since, a full box) is skipped and named in the red pill, and its own Undo
  stays.
- **ℹ️ Info** flips to the box's count against its limit, a table's limits, how many entries are
  the user's, how many are new since the user looked; for Fixer, the visits kept and the
  mocks left before the next one.

What each box holds:

- **Components**: each is its ID, the line that says where it belongs, and the thing itself, drawn
  as in a mock. A mock pastes a component by ID; a changed component shows at once on every mock
  that pastes it, and a deleted one leaves nothing in its place. A tap on a component makes it
  current, with a line round it, and the three buttons are that component's: Edit (with **Delete
  this component…** at its bottom), History (Undo, Redo and its versions, as a mock's), Info
  (where it belongs, the mocks that paste it, the mock it was taken from). A tap elsewhere in the
  box gives the buttons back to the box.
- **Rules**: one line each, the ID and one sentence; an entry the user wrote is marked *yours*,
  in Data too. In the current box, tap the sentence to change it; Enter or a tap elsewhere saves, Esc puts it back, an
  empty sentence deletes it. **Add rule** adds an empty rule at the end with the cursor in it; its
  sentence's first words make its ID, and left empty it goes.
- **Data**: small tables, each with an ID, named columns and rows. In the current box, tap a cell to change it; a row
  left empty or a column without a name goes when the table saves. **+ row**, **+ column**, ✕
  under each table. **Add table** adds a table with only its name, the cursor in it: the name
  makes its ID, and it gets the columns *name* and *value* and one empty row. Left empty, it goes.
- **Limits**, as the manual says: 20 components, 20 rules of at most 120 characters, 10 tables of
  at most 6 columns and 8 rows. A full box takes nothing new; a refused edit says why in the red
  pill. An ID is 1 to 4 lowercase words joined by dashes, unique in its box, and never used again.
- **New** marks an entry filing or the fixer added or changed since the user last looked at its
  box.

### Filing

Nobody picks a design any more, so a mock is **settled** by use: the first time the user clicks on
from it to another mock, and each time the user Edits it. Then GPT-6.1 Terra reads the paper and
the mock and files what it settles: a part the mock shows the same as other mocks will (it moves
to Components, and the mock pastes it where it was, so it looks the same), a rule, a table. Info
says what it filed.

- The mock a click opens waits for the filing, at most 5 seconds, so it can paste the shared
  components. An Edit waits the same way. The first click out of a mock is about a second slower
  for it.
- A new design (🎲, Draw again) of a settled mock is filed at the next click on from it.
- The tour and a replayed example file nothing live (see The public).

### The fixer

Every 5th settled mock of a project, on **Run fixer** and on an Edit of a box, GPT-6.1 Terra visits
in the background, after any filing (the two never run at once). It reads the boxes, the titles
and the mocks added or changed since its last visit (all of them on the first), and:

- merges entries that say one thing twice (the older ID stays),
- removes what one mock or none needs,
- adds or changes a rule, a table or a component filing missed,
- redraws at most 5 mocks or components that break a rule, draw a component by hand, have a
  control that leads nowhere or show a fact differently from a newer mock.

A redraw is an Edit with the fixer's sentence as the change: a new version, no filing. An entry
the user wrote is never changed or removed (except in the box the user asked about with Edit), a
mock being drawn is not redrawn, and a component that goes leaves its HTML in the mocks that paste
it, so they look the same. A visit whose reply comes after Start over or the project's delete is
dropped; a line about a mock or entry deleted meanwhile is refused, and a mock the user changed
during the visit is not redrawn. A mock settled while a visit runs brings no visit: the next one
reads it. At most 5 redraws keeps a visit's cost to about a cent.

**Fixer** holds the fixer's notes, one per visit, newest first: when, what the user asked (for an Edit),
how many mocks it read, each change on its line with the fixer's reason and an **Undo**, the lines
code refused and why, time and cost (the redraws included), and last *The next visit comes after 3
more mocks.* Undo of a merge or a remove puts the entry back with its ID and place, of an added
entry deletes it (unless the user rewrote it since), of a change puts the old entry back (unless
the entry changed since), of a redraw shows the version before it. An undone change is struck
through. A redraw reads *redrawing* until its version is stored.

## Navigation

Each control that opens another mock carries the ID of that mock (its name) and, for a new mock,
its one line, written by the model (`data-action="@sleep-report: Sleep report of last night
with…"`), and is blue. Clicking a new one asks for that mock, drawn from the paper. Only a real
click opens a mock.

- **The name says which mock**: every link to one mock uses one name, so a mock is made once
  however many buttons lead to it, and however they word it. Home is always `home`. A mock keeps
  the name of the link that first opened it; an Edit that changes its title keeps the name. Info
  shows it.
- **Planned mocks**: a name that a drawn mock links to, but that no mock has yet, is a planned
  mock: it belongs to the project from that moment, hangs in the tree like any mock, grey in the
  dropdown, and is made, with the words of the first link that names it, when someone first opens
  it. It goes away when no mock links to it any more (after an Edit, an Undo or a delete). Deleting
  a mock that other mocks still link to makes it planned again; the mocks only it led to go with it.
- **The paper in each request**: every request lists the project's mocks, drawn and planned, as
  titles (`sleep-report: what it is for`, Home first, planned ones marked *no drawing yet*) and
  lines (`home -> sleep-report` for each link between two of them), then the three boxes in full,
  each component with the mocks that paste it (see [prompt-screen.md](prompt-screen.md)). The model
  links to a mock on the paper with `@` and its ID alone, back with `back`, and to a new mock with
  an ID and its one line. A link by ID alone with no mock and no plan behind it makes a mock from
  the ID and the button's words.
- **Back** never makes a mock: a control with the action `back` goes to the mock this one hangs
  under (Home, if it has none). What a control says never decides where it goes.
- **The current link**: a control that opens the mock it sits on (a tab bar's own tab) is marked
  current and shows bold and underlined; a click on it stays.
- **A link to a full web address** (`<a href="https://…">`) opens in a new tab.
- **A control that leads nowhere** (a link with no address, an action with no `@`): a click says
  *This control leads nowhere yet*, and the fixer redraws it.
- A click that leads to a mock already drawn makes it current and glides to it, at no cost.
- One mock is drawn at a time: while one is being drawn or changed, a click that would draw
  another does nothing, and a note says so for a moment at the bottom of the canvas.

### The address

The address bar shows the open project and mock by short IDs, never the sentence's words:
`/m/<project>/<mock>` (`/m/k3f9x2/a7`). A project's ID is 6 letters and digits, a mock's (a
component's too) 2 to 4, unique within its project; both are kept in the cache file. A box's
address ends in its name: `/m/k3f9x2/box-rules`, `box-components`, `box-data`, `box-fixer`. The
tour's is `/tour/<mock>` (`/tour/meet-woz`), and `/` opens the last project, or the tour when
there is none.

- **Opening, reloading or pasting** an address opens that project at that mock or box;
  `/m/<project>` alone opens it at Home. A mock deleted since opens the project at Home, whose
  address replaces it, with the brief hint *That mock is not here.*
- **What the address names**: the mock or box that became current last. A new mock's address comes
  once its first design is stored; a mock that merely redraws keeps its address. While a new
  project's Home is drawn the address stays what it was, and the project's own is written when
  its ID arrives.
- **Back and Forward** of the browser walk the mocks and boxes that became current, each one a
  step, the same steps as ← and →. A reload and Back and Forward themselves change the address in
  place, so Back always returns to what showed before.
- **Not here**: an address of a project this person does not have (deleted, or another person's)
  opens `/` with the brief hint *That project is not here.* Sign out and Delete my account start
  again at `/`.
- **Not a share link**: an address works only for the person whose project it is, through the same
  gate as `/`. An edit link keeps its own address (`/s/<token>`): its page writes none and follows
  none.

## Streaming and timing

While the model writes, a mock is rebuilt at most every 300 ms. Controls do nothing until the last
build, because their handlers arrive at the end of the reply. Info shows the showing version's
time and cost. Cost is billed cost for Claude Haiku (reported by OpenRouter); for the GPT models
an estimate from tokens, marked *~*.

A design that is not complete after 20 s, stops early, or hits the token limit fails; nothing of
it is cached. A failed Edit, Another or Draw again leaves the mock as it was.

## Cache

Every mock is stored under its name (`product » @sleep-report`), Home under the normalized
sentence: lowercase, single spaces, no trailing punctuation. A mock holds its versions and which
one shows. Opening a stored mock makes no model call and costs nothing. The cache lives on the
server and survives restarts, so every browser shares it. Each mock also stores its name and the
mock and click that first made it; rows are worked out, never stored. A design is stored as soon
as it finishes, so one that was paid for is kept even if the browser leaves. The current mock is
remembered per project in this browser. A reload opens the project that was open; it never starts
a new design by itself.

The cache file is version 6. A version 5 file loads as it is, with one change: a mock that was an
open A OR B becomes a mock with A showing and B in its History (the one side that finished, when
only one did; a mock with neither is planned again). Older files load as before. A file from a
newer app is left as it is: the app says so in the red pill and saves nothing.

## Choices

- **Design for** (New project): the four sizes in A mock. It applies to the project being made;
  every later mock, Edit and redraw keeps the project's size, and so does Start over.
- **Theme** (the menu): Mockup (default) or Clean. Mockup is black and white with a handwriting
  font and wobbly borders, so a mock reads as a sketch; even the model's chart colours turn grey,
  except the blue of controls that open a mock. Clean is plain Pico with neutral buttons and
  links. Switching restyles the mocks at once; the model never sees the theme.
- **Model** (the menu, the owner only): Claude Haiku 5.5 (default), GPT-6 Luna
  (fast), GPT-6.1 Sol Ultrafast. It applies to the next design made; stored mocks stay as they
  are, with their maker in Info. The public always gets Claude Haiku.

Loading the page and picking a model each send a short warm-up request to warm the prompt cache.
The choices are remembered in this browser.

## Sharing

The owner sends a link to a reviewer or a potential customer, who clicks through the project in
the browser and says what they think. Nothing is real-time and nobody signs in: a link is the key.

- **Share…** (the menu) turns the left panel to *Share*: pick a role, **Make a link** (it is
  copied), and the links below, each with the day it was made (*Nov 12*), how often it was opened,
  **Copy** and **Revoke** (it stops working for everyone). While the page is open it reads its
  links and feedback again when the tab gets focus and every 10 seconds, so a comment that came in
  shows. Roles:
  - **View**: the player (below). A control with no drawn mock behind it says *Not designed yet*.
    Nothing is generated, so a viewer costs nothing.
  - **Comment**: the player plus feedback (below).
  - **Edit**: the whole app on that project only. Its menu has Export the boxes, Theme, Sound and
    Privacy, and it cannot delete Home. It has a budget (20 by default) of model calls (a new
    mock, Another, Draw again, an Edit, an Edit of a box, Run fixer), since they cost the owner's
    credits; the link shows how much is used. Past it, the red pill says *This link's budget is
    used up*.
- **The player** shows one mock at a time in its frame, in the Mockup theme, components pasted, on
  the night sky; on a parchment strip at the top, the logo, **← Back**, its name and the trail of
  names (each one clickable); Home has no **← Back** and no trail. The mock scrolls inside its
  frame as in the app. It plays no sounds and no animation. A click on a control opens the mock it
  names; `back` goes to the mock it hangs under; a control whose action names no mock leads
  nowhere, as in the app. A mock wider than the window shrinks to fit.
- **A name first, once** (comment links): the first press of **Comment**, a thumb or **Done**, or a
  dead control, asks *Your name, so the owner knows who said it* in a card beside the mock, with
  **Continue**; then what the reviewer started carries on. The browser keeps the name, so it is
  never asked again. Nothing is stored about a visitor without a name: no feedback, no trip.
- **Feedback** (comment links), on the wooden bar at the bottom, **Done** in ember: 👍 and 👎 for
  the mock (a visitor's newest counts), **Comment** and **Done**. **Comment** is a mode for one
  click: pressed, it says *Click the part you mean*, and the margin offers *The whole screen*; Esc
  or a second press ends it. A click on a part opens a card pinned to that part, with a gold pin on
  it numbered by time; *The whole screen* opens one pinned to no part. **Send** (Enter) keeps it,
  Shift+Enter adds a line, **Cancel** drops it. A dead control opens the same card pinned to the
  control, asking *Not designed yet. What did you expect here?*; it is a comment too. **Done** asks
  *Would you use this? Why or why not?* in the margin. There are no dialogs, and nothing covers a
  card's buttons.
- **The margin** sits right of the mock when the window has room for the mock and about 280 px,
  and under it otherwise. It lists this mock's comments by this visitor, by pin number: the part's
  words (or *The whole screen*), the text, and *Resolved* once the owner resolved it. A comment
  whose part is not in the mock any more says *About an earlier version* and has no pin. A pin's
  click shows its card. Before the first comment the margin says *Comment pins what you say to a
  part of the screen.* A reviewer sees only their own comments, which load with the page; nothing
  polls. Why: a potential customer who reads the others' comments first is no longer a fresh pair
  of eyes.
- **A part's words** are the texts inside it joined by spaces (*Desk 1 Desk 2*); a label shows at
  most about 40 characters, then *…*.
- **An anchor** is the part's words, its tag and its place among the parts with the same tag and
  words. To find it again, the mock looks for the same tag and words, then the same words under
  any tag. The model rewrites the markup on every Edit; the words are what survive.
- **Pins follow their part**: a pin moves with its part as the mock scrolls and hides while the
  part is outside the frame, in the player and in the app.
- **Trips** (comment links): from the moment there is a name, the player sends each visit's mocks,
  in order, and the dead controls clicked, as they change (the first 50 of each), the ones seen
  before the name included.
- **What the owner sees**: **Feedback** (the menu) turns the left panel to *Feedback*: by mock,
  the newest first, with its thumbs (*👍 2 · 👎 1*) and each comment with the visitor's name and
  the part it is about; then the answers to *Would you use this?*; then the trips, as *Ana: Home →
  Nights → Settings, 1 dead click (Pair watch)*. A comment there is a button: it closes the panel,
  makes its mock current and flips it to Info at that comment (a comment on a deleted mock stays a
  plain line). A project keeps its last 500 comments, 500 thumbs, 500 answers and 500 trips; a
  text is at most 1,000 characters. Deleting the project, or Start over, deletes its links and
  feedback.
- **Pins on the canvas**: every drawn mock with open comments shows their gold pins on its parts,
  numbered by time as in the player, at the canvas's scale. A mock being drawn or changed shows
  none; a comment about the whole screen, or whose part is gone, has no pin. A pin takes only its
  own tap: it makes its mock current and flips it to Info at its comment, which gets a gold ring
  for a moment. The comments load when a project opens and when Share, Feedback or Info opens.
- **A comment's number** is its place by time among all of its mock's comments, on a part or the
  whole screen, resolved or not, so Resolve and Reopen change no number; it is the same in the
  player and the app. A comment on the whole screen has its number in both lists, and no pin.
- **Comments in Info** lists the mock's comments from every reviewer: the open ones by number,
  then the resolved ones, muted. Each shows its number in a gold dot, the
  reviewer's name, the part's words (*The whole screen*; *At "Pair watch", not designed yet* for a
  dead control), the text, when it was sent, *About an earlier version* when its part is not in
  the mock any more, and **Resolve** (or **Reopen**). The reviewer sees *Resolved* on reload. An
  edit link shows no feedback, so it has no pins and no comments.
- **The owner** (`UXWOZ_OWNER`): when set, the app and its API answer only a browser that opened
  `/?owner=<secret>` once (it keeps a cookie); others see *This UXWoz is private.* Share links
  work for everyone. Unset, the app is as before.

## The public

With `UXWOZ_PUBLIC` set, anyone may open the app. A stranger lands in the tour with no marketing
page before it, so the app teaches itself. Shapes and limits: [public.md](public.md).

- **Examples**: the seven cards in New project. Picking one opens its project and replays a
  recording: the mock draws at the speed it was first made, and no model is called. In an example,
  Home and every mock Home links to are recorded at all four sizes, two designs each, so clicks
  and the first 🎲 are free there.
- **Live designs.** A visitor's own sentence, Draw again, an Edit, a box's Edit, Run fixer, and a
  click or 🎲 with no recording behind it call the models, and count against the visitor's free
  mocks. The first time a mock's design is made by a model (it cost more than 0), a hint at the
  bottom of the canvas says *This design was drawn fresh for you, so it used one of your free
  mocks.*, until the visitor's next click, Edit, Undo or a press on it. It is the only hint: the
  tour teaches the rest.
- **The account** is a line in the menu, for the public only (not the owner). A visitor's reads
  *👤 25 free mocks · Register* (*No free mocks left* at none); a registered user's shows the
  email, cut short at the panel's edge, the mocks left, **Ask for more** (at none), **Sign out**
  and **Delete my account…**. The count is read again after every live call ends (for a filing or
  a visit, when it ends), after a refusal, and when the tab gets focus, so a gift from the owner
  shows without a reload. **Delete my account…** opens the account card: *Delete your account? Its
  projects and its links go at once, for good. Type your email once more.*, the email field,
  **Delete** and **Cancel**; Delete removes the projects, the links and the account at once, and
  every `uxwoz:` key this browser kept but the one that counted its arrival. After Sign out or
  Delete the page starts again; after Delete it says briefly *Your account is deleted.*
- **The account card** opens over the dimmed canvas when a live design is refused for lack of free
  mocks, or from **Register**. After a sign-up the request that was refused is sent again: a
  first Home, a click into a new mock, Another, Draw again or an Edit. If the person closes the
  card instead of a refused first Home, New project opens with the sentence still in it. Esc or a
  press outside closes it. What was typed and the step stay while it is closed; Enter sends; a
  refusal (*Sign-ups are full for today.*) shows in the card in the server's words.
  - A visitor: *You have used your free mocks. Register to get about 37 more.* (from
    **Register**: *Register to get about 37 more free mocks.*; for the network's day: *This
    network has used today's free mocks. Register to carry on.*; for the guests' day: *Today's
    free mocks for guests are used up. Register to carry on.*) The number is what a new account
    adds, as `/api/me` says (`more`). An email field, **Send the code**, and *No password: we
    email you a six-digit code.* with a link to Privacy.
  - Then *We sent a code to ana@example.com.*, a field for it, **Verify** and *Send a new one*. A
    wrong code says *That code is not right.*
  - Verified, a new account: its free mocks are there at once, and the card says *Thanks. You
    have about 37 more free mocks.*, the number it promised; it leaves by itself after 3 s, or
    at a press outside.
  - Verified, an account that exists: the card closes and the projects made as a visitor are in
    Recent.
  - A registered user with none left: *You have used your free mocks.* A field *What are you
    building?*, **Ask for more**, then *Asked. The answer comes by email.*
- **Paused.** When the owner switched the public to examples only, or the day's or the month's cap
  is reached, a live design answers with the red pill: *Live designs are paused for now. The
  examples still work.* A visitor refused because guests used 70% of the day's cap gets the
  account card (above), not the pill. A blocked account's says *This account is closed. Write to*
  and the contact address.
- **What needs an account**: Share (View and Comment links) and Export project. A visitor who
  presses either (or Feedback) gets the account card with *Register to share a project* or
  *Register to export it*. Edit links are the owner's only. Export the boxes, voice and the boxes
  work for everyone.
- **The admin's page** (`/admin`, the owner): today's and the month's public spend beside their
  caps, and the switch **Open / Examples only**; the caps and allowances, each editable; the steps
  by day for 30 days (arrived, finished the tour, picked an example, clicked on from a mock, typed
  an own sentence, hit the limit, asked for a code, verified); **Requests** (who, their note, what
  they spent, an amount, **Approve** and **Refuse**; the user gets the answer by email);
  **People** (email or *visitor*, since, last seen, spent of allowance, projects; **Give more**,
  **Block**, **Delete**); every dollar amount also says about how many screens it is; *Your
  address as the server sees it*; and whether the examples were recorded with today's prompt.
- **Privacy** (`/privacy`, everyone): a short page on what is stored (the email, sentences and
  projects, a scrambled network address for one day, counts of steps), who else handles it
  (Railway the host, Resend the mail service, OpenRouter with Anthropic's Claude and OpenAI the
  model providers), how long (a visitor's projects 30 days after the last visit, an account's
  until it is deleted), and whom to write to.

## Colours

Black and white is the mock, and blue is a control in a mock that opens another mock, in both
themes. UXWoz itself sits on a night sky, its bar wood, its menus, panels and cards parchment, its
boxes paper in four light colours with a pin in the dark of each. Ember is UXWoz's actions: Draw it, Make the
change, Draw again; it also marks what is *new*. Gold is the box counts, the comment pins, and the ring
of the current mock or box. The sparkle of the logo is yellow. Ropes are tan with a dark twist.

## Look

UXWoz has one look. It does not follow the system's dark setting: the app, the player, the
admin's page and the privacy page look the same with it on or off.

**Too old a browser** (a 10-year-old iPad) cannot run the app at all. Rather than a broken page,
the app's page and the player show one plain line: *This browser is too old for UXWoz. Please open
it in a newer browser.* A small script at the top of each page tries what the app needs (`?.`,
`??`, `??=`, `Array.prototype.at`, `Object.hasOwn`) and, when one is missing, puts that line in
place of the page. Nothing else is done for such a browser.

Sounds are off by default; **Sound** in the menu turns them on, kept in this browser: a whoosh
when a mock is drawn and when a card flips. Turning them on plays it once. With the system's
reduced-motion setting nothing moves: the glide jumps, a flip swaps at once, and every animation
jumps to its end; sounds still follow the menu. `?design=still` in the address shows the same
look with no animation and no sound, for checks and screenshots.
