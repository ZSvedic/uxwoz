# Behavior: what the user sees

This doc owns the product flow of the MVP: the prompt box, navigation, the cache, versions, pickers
and the numbers on screen. It does not own the screen format, rendering or model settings (see
[ui-generation.md](ui-generation.md)) or types and env vars (see [code-contract.md](code-contract.md)).

## Example

1. Zel types *A coffee shop ordering app* and presses **Generate**.
2. The screen fills in while the model writes it. After about 1 s the metrics line reads
   *First visible screen 0.8 s*; at the end it adds *interactive 6.0 s · $0.0008 · Claude Haiku 5.5*.
3. Zel clicks **Checkout** inside the screen. A new checkout screen streams in.
4. Zel clicks **← Back**. The first screen is back at once: *Cached · shown in 0.01 s · $0 now*.
5. Zel clicks **Regenerate**: a second version streams in, and the toolbar shows
   *Version 2 of 2* with **Use this version**. Without that click, a revisit still shows version 1.

## First screen

The prompt box takes a product description (up to 2,000 characters); the three example buttons fill
it in and submit. A new prompt starts a new mockup and clears the Back history.

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

Each control that opens another screen carries a short action prompt written by the model. Clicking
it asks for the screen *product prompt + action prompt*. A plain link without one, which the
screen's own script does not handle, asks for "the screen shown after clicking *label*"; in-page
links (`#…`) stay put. Controls without an action prompt (filters, inputs, add to list) work inside
the screen as the model wrote them. Only a real click opens a screen: a screen's script cannot start
generations by itself. **← Back** walks the history; **Home** opens the first
screen of the mockup.

## Cache and versions

Every screen is stored under its normalized prompt: lowercase, single spaces, no trailing
punctuation. Two browsers that open the same new screen at the same moment both generate it, and
the second becomes version 2. Opening a stored screen makes no model call, costs nothing, and shows the same screen
every time. The cache lives on the server and survives restarts, so every browser shares it.

**Regenerate** always makes a new version and never replaces an old one. The ‹ › buttons flip
between versions. Revisits show the version marked *(shown on revisit)*; only **Use this version**
changes it.

## Pickers

- **Model**: Claude Haiku 5.5 (default), GPT-6 Luna fast, GPT-6.1 Sol Ultrafast. It applies to the
  next generated screen; cached screens stay as they are, with their maker named in the metrics.
  Loading the page and picking a model each send one short warm-up request so the model's prompt
  cache is ready.
- **Theme**: Pico (default) or Hand-drawn sketch. Switching restyles the current screen at once;
  the model never sees the theme.

Both choices are remembered in this browser.
