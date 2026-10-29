# Behavior: what the user sees

This doc owns the product flow of the MVP: the prompt box, names, the feed of screens, the tree,
variants and picking, navigation, the cache, pickers and the numbers on screen. It does not own the screen
format, rendering or model settings (see [ui-generation.md](ui-generation.md)) or types and env
vars (see [code-contract.md](code-contract.md)).

## Example

1. Zel types *A coffee shop ordering app* and presses **Generate**.
2. Two variants of the first screen stream in side by side, labelled *L1-A Menu* and *L1-B Order
   ahead*. After about 1 s the metrics line reads *First visible screen 0.9 s*; at the end it reads
   *all variants interactive 6.0 s · $0.0016 for 2*.
3. Zel likes L1-B and clicks its blue **Checkout** button. That picks L1-B and moves it to the front
   of its row, and a second row appears below with *L2-A* and *L2-B*, two variants of the checkout.
   A line runs from L1-B down into the new row, labelled *Checkout*.
4. Neither checkout is right. Zel clicks **✎ Change** on L2-A, adds *one big pay button* to the
   prompt and clicks **Make a new variant**: *L2-C* joins the row, and L2-A and L2-B stay.
5. Zel picks L1-A instead. The checkout row goes, since L1-A never led there. Picking L1-B again
   brings it back.

## First screen

The prompt box takes a product description (up to 2,000 characters); the example buttons fill
it in and submit. A new prompt starts a new mockup. A prompt this browser has seen before shows
the rows it had last time, from the cache, at no cost.

**History** lists every mockup in the cache, most recently changed first, with its number of
screens. Choosing one opens it like typing its prompt again. The list comes from the server, so
it is the same in every browser. **Start over** deletes every screen of the open mockup and makes
its first screen again; **Delete** only deletes them. Both ask first.

## Names

Every variant has a fixed name: the level its screen was made at, a letter, and a short name the
model gives the screen in the same reply, as in *L2-B Planning sync*. Letters count all variants
made at a level of a mockup, so the level-2 screens made from L1-A and from L1-B share one run of
letters (L2-A, L2-B, then L2-C, L2-D). A letter is never reused, even after its variant is deleted,
and a screen keeps its level when another path reaches it. Each mockup keeps a letter count
per level, so letters stay taken after their screens are gone; Start over begins again at A. So *L2-B* always means the same variant.

## Feed

The feed shows the main flow: one row per step, from the first screen at the top down to the
latest. A row holds the variants of one screen side by side, the picked one first. Scrolling down
walks through the flow; scrolling sideways compares variants. On a narrow window a row snaps to
one variant at a time, so the next variant is one swipe away.

```
 Step 1
 [ L1-B Order ahead ✓ ]  [ L1-A Menu ]
        │
        │ Checkout
        ↓
 Step 2
 [ L2-C Checkout ✓ ]  [ L2-A Checkout ]  [ L2-B Pay ]
```

- **Lineage**: a straight line runs down the left of the picked variants, from each row into the
  next, labelled with the control that was clicked. When a variant is scrolled out of its row, the
  line stays at the row's edge.
- **Other clicks**: a click that goes back to a row already in the flow (or ahead to a later one)
  scrolls there and draws a dashed arc in the gutter left of the rows, from the row clicked in to
  the row it opened, with an arrow. Hovering an arc names the control. Arcs are stored with the
  mockup, so they come back next time.
- **Every variant is live**: its controls work, in any row. Controls that open another screen are
  blue, in both themes; everything else keeps the theme's own ink.
- **A screen is as tall as its content**, so nothing scrolls inside it: scrolling over a screen
  moves the page and the row. A screen sees an 800 px tall window (`100vh` is 800 px), so
  "full-screen" screens keep a normal size; a screen that still keeps growing with its window
  stops after four steps.
- **Size**: a screen is only as wide as its content; the device width is the most it takes. The
  model is told to start small: only what this step needs. A row too wide for the window scrolls
  sideways.
- **Zoom**: pinch, or Ctrl/Cmd + scroll, zooms the feed around the pointer, also over a screen.
  The slider at the top sets it from 10% to 150%; **Fit** shows the whole flow, **100%** goes back.
  Screens stay live at any zoom. The zoom is remembered in this browser.
- Each variant's bar shows its name, a ✓ when picked (with a blue outline), and four tools.
  Hovering the bar names its model, cost and time.

## Tree

Left of the feed, a tree lists every screen of the mockup, one line per variant. The screens a
variant's clicks first made hang below it, under the label of the control that was clicked:

```
4 screens · 7 variants
L1-A Menu
  Checkout →
    L2-A Checkout
    L2-B Pay
    L2-C Checkout
L1-B Order ahead
  Checkout →
    L2-D Quick pay
```

The variants in the main flow are marked. Clicking any line makes its path the flow: each screen
on the way picks the variant the path goes through, the feed shows those rows and goes on below
the chosen variant, and the page scrolls to it. Under 700 px the tree is hidden.

## Variants and picking

Every new screen comes as two variants made at the same time. The second is asked to be a clearly
different design, so the two are not near copies. If one fails, the other still arrives, with an
error line naming the failure.

- **Pick by using**: any click in a variant, on its screen or its bar, picks it. A click that
  opens another screen also opens the next row; typing, ticking boxes or playing with a screen
  only picks it.
- **Front**: the picked variant moves to the front of its row when a click in it opens a screen,
  when the bar is clicked, and when the mockup opens. A press inside a screen does not move it
  at once, so it never jumps away from under the pointer.
- **The rows below follow the pick**: each row remembers the variant above it that its click came
  from. Picking another variant keeps the next row only if the new pick also leads there;
  otherwise the rows below go, and the new pick's own newest path comes back, if it has one.
- The pick is stored with the screen, so every later visit shows it as the picked variant.

Each variant's bar has four tools:

- **✎ Change** shows the prompt the variant was made from. Edit it and click **Make a new
  variant**: one more variant joins the end of the row, made from the edited prompt. It stays a
  variant of the same screen, so the click that leads here still lands here.
- **↻ Regenerate** makes one more variant from the same prompt.
- **✕ Delete** asks, then deletes the variant: its markup goes, its letter stays taken. Screens
  that only it led to go too, with their rows. Deleting the last variant of a screen deletes the
  screen; deleting the last variant of the first screen deletes the mockup.
- **ⓘ Info** lists the name, model, device, when it was made, time to first text, total time,
  cost, finish reason, size and prompt.

## Navigation

Each control that opens another screen carries a short action prompt written by the model, and is
blue; clicking it asks for *product prompt + action prompt*. The model is told to make details,
forms, settings and tab-bar sections screens of their own, so a mockup has screens to click
through. A plain link the screen does not handle asks for "the
screen shown after clicking *label*"; in-page links (`#…`) stay put. Other controls (filters,
inputs) work inside the screen. Each request lists the screens that already exist, and the model
links to them by their exact prompt, and to the first screen with `home`. Only a real click opens
a screen.

- A click that leads to a screen already in the feed scrolls to its row and adds nothing. This is
  how "Back to menu" works.
- A click in an earlier row that leads to a new screen replaces the rows below that row. The
  replaced screens stay in the cache and in the tree: the same click brings them back at once.
- While a screen is being made, clicks that would open another screen do nothing.

## Streaming and timing

While the model writes, the screen is rebuilt at most every 300 ms. Controls do nothing until the
last build, because their handlers arrive at the end of the reply. The metrics line shows:

- **First visible screen**: from the click to the first frame load of either variant that shows text.
- **All variants interactive**: from the click to the load of the last final variant, scripts
  included. Both variants are stored together once both finish.
- **Cost**: of the new variants together. Billed cost for Claude Haiku (reported by OpenRouter); for
  the GPT models an estimate from tokens, marked *~* and *(est.)*. A running total for this browser
  tab follows.

A variant that is not complete after 20 s, stops early, or hits the token limit fails; nothing of
it is cached. If both variants fail, a new row goes away; a failed Change or Regenerate leaves the
row as it was.

## Cache

Every screen is stored under its normalized prompt: lowercase, single spaces, no trailing
punctuation, with all its variants and the pick. Opening a stored screen makes no model call,
costs nothing, and shows the same variants every time. The cache lives on the server and survives
restarts, so every browser shares it. Each screen also stores the variant and click that first
made it, its level, and each variant's letter. Two browsers opening the same new screen at once
both generate it; the second pair joins as two more variants. Which rows a mockup showed is
remembered per browser. A cache file from before levels and letters gets them when the server
loads it, from the order things were made.

## Pickers

- **Model**: Claude Haiku 5.5 (default), GPT-6 Luna (fast), GPT-6.1 Sol Ultrafast. It applies to the
  next generated screen; cached screens stay as they are, with their maker named in each variant's
  tooltip and Info.
- **Device**: Phone (default, at most 390 px wide) or Desktop (at most 1024 px). The model is told which one, and
  the screen gets a window that wide. Like the model, it applies to the next generated screen.
  Screens made before devices existed show at 800 px.
  Loading the page and picking a model each send a short warm-up request to warm the prompt cache.
- **Theme**: Mockup (default) or Clean. Mockup is black and white with a handwriting font and
  wobbly borders, so a screen reads as a sketch; even the model's chart colours turn grey, except
  the blue of controls that open a screen. Clean is plain Pico with neutral buttons and links. Switching restyles the screens at once; the model never sees the theme.

All three choices are remembered in this browser.
