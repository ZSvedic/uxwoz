# Behavior: what the user sees

This doc owns the product flow of the MVP: the prompt box, the feed of screens, variants and
picking, navigation, the cache, pickers and the numbers on screen. It does not own the screen
format, rendering or model settings (see [ui-generation.md](ui-generation.md)) or types and env
vars (see [code-contract.md](code-contract.md)).

## Example

1. Zel types *A coffee shop ordering app* and presses **Generate**.
2. Two variants of the first screen stream in side by side. After about 1 s the metrics line reads
   *First visible screen 0.9 s*; at the end it reads *all variants interactive 6.0 s · $0.0016 for 2*.
3. Zel likes variant 2 and clicks **Checkout** inside it. That picks variant 2, and a second row
   appears below with two variants of the checkout. A line runs from variant 2 down into it,
   labelled *Checkout*. The page scrolls to it.
4. Neither checkout is right. Zel types *one big pay button* in the **Neither?** tile and clicks
   **Make 2 more**: variants 3 and 4 join the row, and variants 1 and 2 stay.
5. Zel clicks **Back to menu** inside variant 4. The page scrolls up to the first row; no new row.

## First screen

The prompt box takes a product description (up to 2,000 characters); the example buttons fill
it in and submit. A new prompt starts a new mockup. A prompt this browser has seen before shows
the rows it had last time, from the cache, at no cost.

**History** lists every mockup in the cache, most recently changed first, with its number of
screens. Choosing one opens it like typing its prompt again. The list comes from the server, so
it is the same in every browser.

## Feed

The mockup is a feed: one row per step of the flow, from the first screen at the top down to the
latest. A row holds the variants of one screen side by side, then a **Neither?** tile. Scrolling
down walks through the flow; scrolling sideways compares variants. On a narrow window a row snaps
to one variant at a time, so the next variant is one swipe away.

```
 1 · Menu
 [ Variant 1 ✓ ]  [ Variant 2 ]  [ Neither? ]
        │
        │ Checkout
        ↓
 2 · Checkout
 [ Variant 1 ]  [ Variant 2 ✓ ]  [ Variant 3 ]  [ Variant 4 ]  [ Neither? ]
```

- **Lineage**: a line drops from the bottom of the picked variant in each row into the next row,
  labelled with the control that was clicked. Pick another variant and the line moves to it. When
  the picked variant is scrolled out of the row, the line stays at the row's edge.

- **Every variant is live**: its controls work, in any row.
- **A screen is as tall as its content**, so nothing scrolls inside it: scrolling over a screen
  moves the page and the row. A screen sees an 800 px tall window (`100vh` is 800 px), so
  "full-screen" screens keep a normal size; a screen that still keeps growing with its window
  stops after four steps.
- **Size**: every screen shows at 100%, never shrunk, so its text stays readable and its sketch
  lines stay whole. A row too wide for the window scrolls sideways. For an overview, use the
  browser's zoom: it shrinks the whole page evenly.
- Each variant's bar names its model and cost. The picked variant has a blue outline and
  *✓ Picked*; the others have a **Pick** button.

## Variants and picking

Every new screen comes as two variants made at the same time. The second is asked to be a clearly
different design, so the two are not near copies. If one fails, the other still arrives, with an
error line naming the failure.

- **Pick by using**: a click inside a variant that opens another screen picks that variant, then
  opens the next row. **Pick** picks without going anywhere.
- **Neither?**: an optional note on what to change, then **Make 2 more**. Two more variants join
  the end of the row, made with the note; older variants never go away. Hovering a variant shows
  the note it was made with.
- The pick is stored with the screen, so every later visit shows it as the picked variant.

## Navigation

Each control that opens another screen carries a short action prompt written by the model; clicking
it asks for *product prompt + action prompt*. A plain link the screen does not handle asks for "the
screen shown after clicking *label*"; in-page links (`#…`) stay put. Other controls (filters,
inputs) work inside the screen. Each request lists the screens that already exist, and the model
links to them by their exact prompt, and to the first screen with `home`. Only a real click opens
a screen.

- A click that leads to a screen already in the feed scrolls to its row and adds nothing. This is
  how "Back to menu" works.
- A click in an earlier row that leads to a new screen replaces the rows below that row. The
  replaced screens stay in the cache: the same click brings them back at once.
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
it is cached. If both variants fail, a new row goes away and a regenerated row keeps the variants
it had.

## Cache

Every screen is stored under its normalized prompt: lowercase, single spaces, no trailing
punctuation, with all its variants and the pick. Opening a stored screen makes no model call,
costs nothing, and shows the same variants every time. The cache lives on the server and survives
restarts, so every browser shares it. Two browsers opening the same new screen at once both
generate it; the second pair joins as variants 3 and 4. Which rows a mockup showed is remembered
per browser.

## Pickers

- **Model**: Claude Haiku 5.5 (default), GPT-6 Luna (fast), GPT-6.1 Sol Ultrafast. It applies to the
  next generated screen; cached screens stay as they are, with their maker named on each variant.
- **Device**: Phone (default, 390 px wide) or Desktop (1024 px). The model is told which one, and
  the screen gets a window that wide. Like the model, it applies to the next generated screen.
  Screens made before devices existed show at 800 px.
  Loading the page and picking a model each send a short warm-up request to warm the prompt cache.
- **Theme**: Mockup (default) or Clean. Mockup is black and white with a handwriting font and
  wobbly borders, so a screen reads as a sketch; even the model's chart colours turn grey. Clean
  is plain Pico. Switching restyles the screens at once; the model never sees the theme.

All three choices are remembered in this browser.
