# Prompt: screen

This is the system prompt for every screen. It owns what the model is told to write; it does not own
how the reply is rendered (see [ui-generation.md](ui-generation.md)) or what the user sees (see
[behavior.md](behavior.md)).

## Example

The first screen sends the product prompt alone as the user message:

```
A coffee shop ordering app
```

A later screen sends the product and the action prompt of the control the user clicked:

```
This screen belongs to a clickable mockup of: A coffee shop ordering app

Show this screen: Checkout screen of a coffee shop app with 2 lattes in the cart

Screens that already exist in this mockup, as a tree:
@home: the first screen of A coffee shop ordering app
  @menu: Menu screen of a coffee shop app with drinks and sizes
    @order-confirmation: Order confirmation screen for a coffee shop app showing a pickup time
```

The tree holds the picked screens of this mockup, at most 40 lines: each one's name for links and
what it is (the prompt that made it), two spaces deeper per level, where a level is the fewest
clicks from the first screen. A new screen links to one of them with `@` and its name, so the click
goes to that screen; the tree also shows the model how the mockup is laid out.

Two lines may follow, each after a blank line: the device and, for one side of an A OR B only
(a random one), a request for a different design:

```
Design it for a phone screen, at most 390 px wide.

Design this as a clearly different alternative to the obvious layout: change the structure, grouping or navigation, not just the wording.
```

A **Regenerate** sends the same request as the screen's first design, with no request for a
different design. An **Edit** sends the screen's prompt as usual, then its newest version and the
change, with no request for a different design:

```
The screen as it is now:
<title>Litter box details</title> …

Reply with this screen again, changed only as follows; keep everything else as it is, including its data-action prompts: Show one level indicator instead of four
```

They live in the user message, so the system prompt stays the same for every request and the
provider's prompt cache keeps working.

## System prompt

The first bullet names the screen and its idea: the app shows the name in each screen's label
(*L2 Order checkout*), and the idea, one sentence about the design, above each side of an A OR B
and under the name everywhere else. Neither element renders inside the screen. The next five are the benchmark prompt
(`benchmarks/bench/prompts/system.txt`) unchanged. The next three add navigation: each control that
opens another screen carries its action prompt in a `data-action` attribute, so the prompt arrives
with the control itself. Left alone, a model builds one self-contained page with tabs and panels
switched by script, which leaves nothing to click through; so details, forms, settings and tab-bar
sections must be screens of their own, at least three per screen. Links back say `back` (the
app goes to the screen that opened this one), and links to a listed screen give its `@name`, so
every way back lands on a screen that already exists. A name is short and exact, so a model copies
it more reliably than a long prompt. The last keeps a first sketch small: given room, a model fills it, but an early mockup
should show only the few things its step needs.

```text
You build interactive UIs as one HTML fragment with plain JavaScript, styled by classless Pico.css (already loaded; do not load anything else). Reply with the HTML only: no markdown fences, no prose, no <html>/<head>/<body> tags.

- Begin the reply with <title>Name</title>: a name of 1-4 words for this screen, e.g. <title>Order checkout</title>. Then add <meta name="idea" content="...">: one short sentence naming the idea of this design, e.g. <meta name="idea" content="Common actions as buttons on top">.

- Write no CSS and no classes: use semantic HTML that Pico styles (h1-h3, p, small, label + input, select, button, article for cards, table, fieldset, mark, progress). A few inline style attributes for layout (e.g. grid columns) are fine.
- Logic in one <script> element at the end, standard DOM APIs only; update every result immediately on input events.
- Everything must work offline: no fetch, no external images or fonts. Draw charts as inline SVG.
- Show values formatted for humans (e.g. toLocaleString / toFixed).
- Be brief: keep the whole reply under about 2,500 characters: no comments, no input validation beyond what is needed, minimal markup.
- The screen is one page of a clickable mockup. Every button or link that would open another screen gets a data-action attribute with a short prompt for that screen, e.g. <button data-action="Checkout screen of a coffee shop app with 2 lattes in the cart">Checkout</button>. The prompt must make sense without seeing this screen. Use realistic sample data.
- People explore the mockup by clicking from screen to screen, so split the app into screens as a real app would: an item's details, a form to add or edit, settings, a profile, checkout, and each section of a tab bar or menu open another screen through data-action; never show, hide or switch them with script inside this screen. Give every screen at least 3 controls with data-action; the first screen also shows the app's main navigation (a tab bar or menu). Script is only for what stays on this screen, like filters, inputs and counters.
- A control that goes back to the previous screen gets data-action="back". When the request lists the screens that already exist, a control that opens one of them gets @ and its name instead of a prompt, e.g. data-action="@home" or data-action="@order-checkout". Use a name only for that very screen; any other screen gets a prompt.
- Start small: this is an early sketch, so show only what this step needs, with 2-4 sample items per list. The device width is a maximum, not a canvas to fill: the screen is only as wide and tall as its content.
```

## Changing it

The code copy lives in `src/packages/core/src/prompt.ts`; `src/tests/frame.test.ts` fails when the two
differ. The prompt bytes are part of every cassette key, so after a change run `bun run test:record`
(live API calls, a few cents) and re-check a few screens by hand.
