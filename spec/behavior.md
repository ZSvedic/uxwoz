# Behavior: what the user sees

This doc owns the product flow of the MVP: the prompt box, the canvas, navigation, the cache,
versions, pickers and the numbers on screen. It does not own the screen format, rendering or model settings (see
[ui-generation.md](ui-generation.md)) or types and env vars (see [code-contract.md](code-contract.md)).

## Example

1. Zel types *A coffee shop ordering app* and presses **Generate**.
2. The screen fills in while the model writes it. After about 1 s the metrics line reads
   *First visible screen 0.8 s*; at the end it adds *interactive 6.0 s · $0.0008 · Claude Haiku 5.5*.
3. Zel clicks **Checkout** inside the screen. A new card streams in to the right, joined by an
   arrow labelled *Checkout*, and the canvas glides over to it.
4. Zel clicks **Back to menu** inside the checkout. The first card is current again at once
   (*Cached · shown in 0.01 s · $0 now*), and a dashed arrow arcs back to it.
5. Zel clicks **Regenerate**: a second version streams in, and the toolbar shows
   *Version 2 of 2* with **Use this version**. Without that click, a revisit still shows version 1.

## First screen

The prompt box takes a product description (up to 2,000 characters); the three example buttons fill
it in and submit. A new prompt starts a new mockup and clears the Back history.

## Canvas

Every screen of the mockup is a card on one canvas, and every click that led from one screen to
another is an arrow labelled with the control's text. Screens sit left to right in the order clicks
found them; a screen's place is fixed by the first click that reached it, and later clicks to it
(back to the menu, a shortcut) are dashed arrows that arc above the cards.

- **Cards are as tall as their screens**, so nothing scrolls inside a card: scrolling anywhere,
  also over a screen, moves the canvas. Screens fill the card's width with tight Pico spacing.
- **The current card** has a blue outline and is the only live one: its controls work.
- **Other cards** are previews. Clicking one makes it the current screen, from the cache.
- **Focus**: after each step the canvas shows the top of the current card at full width, a little
  right of centre, so the screen that led to it and the arrow stay in view. **Current screen**
  does it again.
- **Fit all** zooms out to show every screen and arrow.
- Drag or scroll to pan; pinch or Ctrl/Cmd + scroll to zoom. A prompt that already has screens
  shows all of them at once.

## Streaming and timing

While the model writes, the screen is rebuilt at most every 300 ms. Controls do nothing until the
last build, because their handlers arrive at the end of the reply. The metrics line shows:

- **First visible screen**: from the click to the first frame load that shows text.
- **Interactive**: from the click to the load of the final screen, scripts included.
- **Cost**: billed cost for Claude Haiku (reported by OpenRouter); for the GPT models an estimate
  from tokens, marked *~* and *(est.)*. A running total for this browser tab follows.

A screen that is not complete after 20 s, stops early, or hits the token limit fails with an
error; nothing is cached, and the previous screen comes back.

## Navigation

Each control that opens another screen carries a short action prompt written by the model; clicking
it asks for *product prompt + action prompt*. A plain link the screen does not handle asks for "the
screen shown after clicking *label*"; in-page links (`#…`) stay put. Other controls (filters,
inputs) work inside the screen. Each request lists the screens that already exist, and the model
links to them by their exact prompt, and to the first screen with `home`, so going back lands on
the cached screen. Only a real click opens a screen. **← Back** walks the history; **Home** opens
the first screen.

## Cache and versions

Every screen is stored under its normalized prompt: lowercase, single spaces, no trailing
punctuation. Opening a stored screen makes no model call, costs nothing, and shows the same screen
every time. The cache lives on the server and survives restarts, so every browser shares it. Two
browsers opening the same new screen at once both generate it; the second becomes version 2.

**Regenerate** always makes a new version and never replaces an old one. The ‹ › buttons flip
between versions. Revisits show the version marked *(shown on revisit)*; only **Use this version**
changes it.

## Pickers

- **Model**: Claude Haiku 5.5 (default), GPT-6 Luna fast, GPT-6.1 Sol Ultrafast. It applies to the
  next generated screen; cached screens stay as they are, with their maker named in the metrics.
  Loading the page and picking a model each send a short warm-up request to warm the prompt cache.
- **Theme**: Mockup (default) or Clean. Mockup is black and white with a handwriting font and
  wobbly borders, so a screen reads as a sketch; even the model's chart colours turn grey. Clean
  is plain Pico. Switching restyles the screens at once; the model never sees the theme.

Both choices are remembered in this browser.
