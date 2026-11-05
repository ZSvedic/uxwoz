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

Screens of this mockup, as a tree:
@home: the first screen of A coffee shop ordering app
  @menu: Menu screen of a coffee shop app with drinks and sizes
    @order-checkout: Checkout screen of a coffee shop app with 2 lattes in the cart (not made yet)
    @order-confirmation: Order confirmation screen for a coffee shop app showing a pickup time
  @profile: Profile screen of a coffee shop app with saved cards (not made yet)
```

The tree holds the screens of this mockup, at most 80 lines: each one's name for links and what it
is (its prompt), two spaces deeper per level, where a level is the fewest clicks from the first
screen. Planned screens, the ones a made screen links to that nobody has opened yet, are marked
"(not made yet)"; the screen being made or changed, when it is in the tree, "(this screen)". A new screen links to any of them with `@` and its name, so every link to one
screen uses one name and every click on it reaches the same screen; the tree also shows the model
how the mockup is laid out.

The mockup's spec follows the tree, after a blank line, when it has rows (see
[the spec note](../process/plans/2026-11-05-spec-memory.md)): filled rows as `key = value`, open
ones as `key ? question`, then one fixed markup for each of `ui.nav`, `ui.back` and `ui.toggles`
that is in the spec, so the theme can style tabs, Back and switches alike on every screen:

```
The spec of this mockup: decisions every screen follows, one per line; a row with ? is not decided yet.
product.core-flow = @home → @recording → @morning-report
ui.nav = Tabs: Tonight @home, History @night-history, Settings @settings
ui.back ? how Back looks and where it sits
data.score ? what the snore score measures and whether higher means worse

Tabs of ui.nav: last on every screen, in this markup, … <nav data-ui="tabs"><a data-action="@name">Label</a>…</nav>
Back of ui.back: where ui.back says, with its label, in this markup: <a data-ui="back" data-action="back">Label</a>. The tab screens have no Back.
```

Two lines may follow, each after a blank line: the device and, for one side of an A OR B only
(a random one), a request for a different design. Both sides follow the spec, so the different
design is another layout of the same content:

```
Design it for a phone screen, 390 px wide.

Design this as a clearly different alternative to the obvious layout: arrange this screen's content another way, not just the wording, and keep whatever the spec decides.
```

A **Regenerate** sends the same request as the screen's first design, with no request for a
different design. An **Edit** sends the screen's prompt as usual, then its newest version and the
change, with no request for a different design:

```
The screen as it is now:
<title>Litter box details</title> …

Reply with this screen again, changed only as follows; keep everything else as it is, including its data-action links, and add no second control for a screen it already links to. If the change decides something other screens must follow, add a <meta name="spec"> line that sets it: Show one level indicator instead of four
```

They live in the user message, so the system prompt stays the same for every request and the
provider's prompt cache keeps working.

## System prompt

The first bullet names the screen and its idea: the app shows the name in each screen's label
(*L2 Order checkout*), and the idea, one sentence about the design, above each side of an A OR B
and under the name everywhere else. Neither element renders inside the screen. It also asks for up
to three spec lines (`<meta name="spec" content="key = value">`): what this design decides that
other screens must follow. Code takes them out of the stored screen; a pick fills open rows with
them, an Edit sets rows. The next five are the benchmark prompt
(`benchmarks/bench/prompts/system.txt`) unchanged. The next three add navigation: each control that
opens another screen carries that screen's name and prompt in a `data-action` attribute
(`@order-checkout: Checkout screen of…`), so both arrive with the control itself. Left alone, a
model builds one self-contained page with tabs and panels switched by script, which leaves nothing
to click through; so details, forms, settings and tab-bar sections must be screens of their own, at
least three per screen. Links back say `back` (the app goes to the screen one level up), and links
to a listed screen give its `@name` alone. The name, not the prompt, says which screen a link opens:
two prompts for one screen are never worded alike, but a short name in front of the model is copied
exactly, so a screen is made once however many screens link to it. Tabs and Back count toward the three links. The next keeps links to what the spec's core flow
needs: left alone, side branches sprawled (seven export screens) while Stop recording led nowhere.
The last keeps a first sketch small: given room, a model fills it, but an early mockup should show
only the few things its step needs. Every screen is the device's width: code sets it.

```text
You build interactive UIs as one HTML fragment with plain JavaScript, styled by classless Pico.css (already loaded; do not load anything else). Reply with the HTML only: no markdown fences, no prose, no <html>/<head>/<body> tags.

- Begin the reply with <title>Name</title>: a name of 1-4 words for this screen, e.g. <title>Order checkout</title>. Then add <meta name="idea" content="...">: one short sentence naming the idea of this design, e.g. <meta name="idea" content="Common actions as buttons on top">. Then, one per line, up to 3 <meta name="spec" content="key = value"> lines for what this design decides that other screens must follow: a value for a row of the request's spec marked ? that this screen settles, or a new data. fact that two screens could get wrong, e.g. <meta name="spec" content="data.prices = Prices in USD with two decimals">. Never a line for a row that has a value already; no line when this screen decides nothing.

- Write no CSS and no classes: use semantic HTML that Pico styles (h1-h3, p, small, label + input, select, button, article for cards, table, fieldset, mark, progress). A few inline style attributes for layout (e.g. grid columns) are fine.
- Logic in one <script> element at the end, standard DOM APIs only; update every result immediately on input events.
- Everything must work offline: no fetch, no external images or fonts. Draw charts as inline SVG.
- Show values formatted for humans (e.g. toLocaleString / toFixed).
- Be brief: keep the whole reply under about 2,500 characters: no comments, no input validation beyond what is needed, minimal markup.
- The screen is one page of a clickable mockup. Every button or link that would open another screen gets a data-action attribute: @, a name for that screen (1-4 lowercase words joined by dashes), a colon and a short prompt for it, e.g. <button data-action="@order-checkout: Checkout screen of a coffee shop app with 2 lattes in the cart">Checkout</button>. The prompt must make sense without seeing this screen; leave it out only for a screen the request lists. Use realistic sample data.
- People explore the mockup by clicking from screen to screen, so split the app into screens as a real app would: an item's details, a form to add or edit, settings, a profile, checkout, and each section of a tab bar or menu open another screen through data-action; never show, hide or switch them with script inside this screen. Give every screen at least 3 controls with data-action (tabs and Back count); the first screen also shows the app's main navigation (a tab bar or menu). Script is only for what stays on this screen, like filters, inputs and counters.
- A control that goes back to the previous screen gets data-action="back". The request lists the mockup's screens as a tree of names, made and planned: a control that opens one of them gets just @ and its name, e.g. data-action="@home" or data-action="@order-checkout". One screen has one name, and one name is one screen: the details of two items are two screens, e.g. @latte-details and @mocha-details. Before you make up a new name, look in the tree and in this screen's links for one that already opens that screen; a new name is only for a screen the mockup does not have.
- Link only what serves the core flow or what the user asked for. Show the phone's own screens (mail, share targets) as plain buttons, not as screens. A control that finishes a task (Stop, Save, Send) goes to the next step of the core flow, else to a real screen or back.
- Start small: this is an early sketch, so show only what this step needs, with 2-4 sample items per list. The screen fills the device's width: set no width on the page.
```

## Changing it

The code copy lives in `src/packages/core/src/prompt.ts`; `src/tests/frame.test.ts` fails when the two
differ. The prompt bytes are part of every cassette key, so after a change run `bun run test:record`
(live API calls, a few cents) and re-check a few screens by hand.
