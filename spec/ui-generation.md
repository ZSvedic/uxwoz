# UI generation: format and models

This doc owns how one screen is generated: what the model writes, how the browser renders it, and
which models to call with which settings. It does not own the product flow, caching or navigation
(see [behavior.md](behavior.md)).

## Example

The app sends the system prompt in [prompt-screen.md](prompt-screen.md) (the benchmark's
`benchmarks/bench/prompts/system.txt`, 208 tokens, plus bullets for the name and idea, navigation and size) and a screen request. The model streams back one HTML fragment, ending in one `<script>`:

```html
<h1>BMI calculator</h1>
<label>Height (cm) <input id="h" type="number" value="175"></label>
<label>Weight (kg) <input id="w" type="number" value="70"></label>
<h2 id="out"></h2>
<script>
  const f = () => out.textContent = (w.value / (h.value / 100) ** 2).toFixed(1)
  h.oninput = w.oninput = f; f()
</script>
```

The app wraps it as `<main>` in a page with the theme CSS inlined and loads it into a sandboxed
iframe. Pico styles the bare elements, so the model writes no CSS.

## Format: semantic HTML + vanilla JS + classless Pico.css

- **What the model writes:** semantic elements Pico styles (h1-h3, p, label + input, select, button,
  article, table, fieldset, mark, progress), no CSS and no classes, a few inline styles for layout,
  charts as inline SVG, logic in one `<script>` at the end using plain DOM APIs, no fetch or
  external assets, no markdown fences. "Keep the reply under about 2,500 characters" keeps it fast.
- **Rendering:** `<iframe sandbox="allow-scripts allow-forms" srcdoc=...>`. The sandbox keeps
  generated code away from the app; `allow-forms` matters because models often build todo-style
  screens as `<form>`, and both OpenUI and CopilotKit failed the todo task by blocking submit.
- **Size:** every screen of a device is as wide as the device (390 px phone, 1024 px desktop) and
  at least one device screen tall (844 px, 768 px); a longer screen grows, and the frame is as tall
  as its content and never scaled. vh units are pixels of the device's height. This replaced "only
  as wide as its content": screens of one mockup differed in width, and some did not fill a phone. Shrinking a 1280 px screen to fit
  made 5 px text and broke the sketch theme's thin curved borders into gaps. Text is a fixed 16 px: Pico grows it with the window (up to
  21 px), which made screens look larger than the app around them.
- **Inline the theme CSS** into the srcdoc. A null-origin frame cannot be relied on to fetch a
  stylesheet (one browser skipped it), and web fonts in it need CORS headers or `data:` URLs.
- **Streaming:** rebuild the srcdoc at most every 300 ms while chunks arrive (each rebuild reloads
  the frame), then once at the end. The script runs on the final build, so controls work only then.
  First visible UI came at 1.1-1.6 s, fully rendered at 3.5-5 s.
- **Strip only a markdown fence** if a model adds one; never patch the code.

## Themes

The model never sees the theme, so a theme changes looks and nothing else. A theme is a drop-in
stylesheet loaded instead of, or after, Pico: override the `--pico-*` variables (font, colours,
radius, borders). A hand-drawn wireframe look needs a handwriting font, thick dark borders and
irregular corners (`border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px`). Clean keeps the
model's colours; Mockup turns them grey with a filter on each topmost part of the screen that holds
no control opening another screen. Those controls are blue in both themes (our frame CSS), and
Pico's own blue becomes a neutral ink, so blue always means "opens a screen". Blue links have no
underline until hovered: Pico drops it inside `<nav>` and Mockup makes it wavy elsewhere, so the
same tab bar would look different depending on the markup. Re-check BMI screenshots after a theme change: the deterministic tests
read text and positions, so a theme that moves elements can change the scale check.

## Models

All three were measured on 2026-10-22/23 with the lite benchmark (`benchmarks/`).

| Model | Call | Score | Correct | Time | $/screen |
|---|---|---:|---:|---:|---:|
| **Claude Haiku 5.5** (default) | OpenRouter `anthropic/claude-haiku-5.5`, `reasoning: {enabled: false}` | 70 | 0.89 | 4.9 s | 0.0007 |
| GPT-6 Luna, fast tier | OpenAI Responses API `gpt-6-luna`, `service_tier: "fast"`, `reasoning: {effort: "none"}` | 67 | 0.83 | 3.5 s | ~0.0008 |
| GPT-6.1 Sol Ultrafast | OpenAI Responses API `gpt-6.1-sol`, `service_tier: "ultrafast"`, `reasoning: {effort: "low"}` | 76 | 1.00 | 4.6 s | ~0.10 |

- **Haiku** is the default: nearly Sol's correctness at 1/140 of the price, billed cost reported by
  OpenRouter. Pin the provider: `provider: {order: ["anthropic"], allow_fallbacks: false,
  require_parameters: true}`. Calling Anthropic directly (`ANTHROPIC_API_KEY`) is untested.
- **Luna fast** is the fastest. Luna rejects `ultrafast`. With reasoning `none` it sometimes writes
  its planning notes as plain text into the reply; in HTML they show as stray text, in a pure
  script they break it. Its cost is an estimate (2x the $0.10 / $0.50 standard price, unconfirmed).
- **Sol Ultrafast** is the most correct. `ultrafast` works only on the Responses API (Chat
  Completions rejects it), and Sol rejects reasoning `none` and `minimal`. Cost is an estimate
  (6x the $2 / $10 standard price).
- **All three** got the mortgage and todo screens right every time. The small models' one
  weakness is placing the BMI scale marker in the right category.

## Calling the models

- Stop a request at 20 s: a slower screen is useless, and keep-alive comments can stall a stream
  forever, so use an overall deadline, not a read timeout.
- Read the served model and tier from the response and log substitutions.
- Send one short warm-up request with the same system prompt before a session: prompt caching
  makes the following screens faster.

## Ruled out

Model-written CSS, other formats (OpenUI, CopilotKit, Alpine.js, VanJS, ClojureScript, the invented
CalcMD, Salt, WireMD, Grafiq, ASCII) and other models (Mercury 3, Gemini 3.8 Flash, GPT-5.6 Terra,
Claude Sonnet 5.5; Opus on price). Reasons and data: `EXPERIMENTS.md` in the sibling folder `ux-woz-full-benchmark` (not in this repo).
