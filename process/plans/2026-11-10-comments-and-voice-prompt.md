# Prompt: comments beside the screens, and voice that works

Paste everything below the line into a new Claude Code session opened on this repo.

---

You are the lead for two pieces of work on UX Woz, from the user's review of the night build
(`process/journal/2026-11-10-night.md`, checklist items 3 and 6). Read `AGENTS.md` first, then the latest
file in `process/journal/` (it is `2026-11-10-design.md`: the app has a new look since the night build, and
all of its CSS lives in `src/packages/web/src/design/`). Then `spec/behavior.md`, the sections Sharing,
Voice and Look, and the code they name: `share.ts`, `sharing.ts`, `player.html`, `player.ts`,
`design/player.css`, `voice.ts`, `voice-ui.ts`.

Write a short plan for each piece to `process/plans/` in the style of `process/writing-style.md`, show it
to the user, and build after their go-ahead. The build loop is the one in the journal: one Opus builder in
a worktree, one Opus critic, fixes, the lead merges and looks at the running app.

## 1. Feedback: comments beside the screens, like Google Docs

The user's verdict on today's reviewer flow, in their words: *"this feedback is too rudimentary to be
useful. Instead of dialogs for feedback, reviewers should be able to add comments next to screens and
elements, like in Google Docs. Also, reviewers need to enter their name once, not every time. The admin
who sent them screens should be able to see all the comments next to elements."* And on a thumb given
before a name shows as *Someone*: *"No, no commenting before entering a name."*

What that asks for:

- **A name first, once.** A reviewer on a comment link types a name before they can comment or give a
  thumb, and is never asked again in that browser. No feedback is stored without a name; *Someone* goes.
  Looking and clicking through stay possible without a name.
- **Comments in place.** A reviewer clicks a part of a screen (or the screen as a whole) and writes a
  comment that stays anchored there: a marker on the part, the comment in a margin beside the screen, as
  in Google Docs. The dialogs for *Comment on this screen* and for a dead control go. Decide what happens
  to *Done* and *Would you use this?*, and to thumbs, and say why.
- **Threads, as far as they are cheap.** Decide whether a second reviewer, and the owner, can reply to a
  comment and resolve it, or whether this round is comments only. Nothing is real-time today (a link is
  the key, nobody signs in); say whether comments from others show on reload or on a timer.
- **The owner sees them where they are.** In the app, the owner sees every comment beside the element it
  is about, on the canvas next to the screen, with the reviewer's name. Today's *Feedback* pane in the
  drawer lists them by screen; decide whether it stays as an index that jumps to the comment.
- **Anchors that survive.** A screen changes (Edit, Regenerate, Undo, the fixer's redraws). Say how a
  comment finds its part again, and what shows when the part is gone (the comment stays on the screen,
  marked as *about an earlier version*). Today a comment stores the part's words (`About`); look at what
  the frame script in `core/src/frame.ts` can report about a clicked element before you choose.

Rules that stand: no runtime dependencies; the caps on feedback (500 per kind, 1,000 characters) or new
ones you justify; an edit link's rights and the owner's gate do not widen; every visible change gets its
line in `spec/behavior.md` first; all new CSS goes into `design/` under its caps, colours only in
`tokens.css`; the player stays a light version of the look (no sounds, no sparks). Old feedback in the
cache file must still load.

## 2. Voice: make it work, and prove it with a synthetic voice

The user's report: *"This just doesn't work. I tried clicking and adding a permission for website in
Chrome, but even after 3 times saying hey Woz..task..pause, nothing happened? Test with synthetic voice."*

The night build never ran voice with a real microphone: the state machine in `voice.ts` has 18 tests, and
the browser half (`voice-ui.ts`, speech recognition that restarts itself) was only read by a critic. So
start by finding out what happens, before changing anything:

1. Reproduce in real Chrome, not in the app's built-in browser pane (it may have no speech recognition).
   Feed Chrome a synthetic voice in place of a microphone: make a WAV with macOS `say` (*"hey Woz, use
   switches"*, then four seconds of silence) and start Chrome with `--use-fake-device-for-media-stream
   --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<file>`. If Chrome's recognition
   service ignores the fake device, play the file through the speakers into the real microphone and say
   so. Log every recognition event (`start`, `result` with its text and `isFinal`, `error`, `end`).
2. Say which link of the chain breaks: no recognition events at all, events with an error
   (`not-allowed`, `network`, `service-not-allowed`), results that never match the wake phrase (what did
   Chrome hear for *hey Woz*?), or a match with no screen current. The user clicked a screen and granted
   the permission, and saw nothing: no words in the Edit field, no countdown, no red pill.
3. Fix that link, and make the failure visible: whatever stops voice must say so on screen at once
   (today the red pill appears only after five failures in a row). Consider showing what was heard while
   the microphone is on, so a user can tell "it hears me but not the phrase" from "it hears nothing".
4. Leave a repeatable check behind: a script or documented steps that replay the synthetic voice against
   the running app and report whether the Edit ran, plus the phrases Chrome returned for the wake phrase
   added to the heard-as list in `voice.ts` with tests.

Rules that stand: the audio goes to Google in Chrome and the tooltip says so; sounds of the new look do
not play while the microphone is on (`design/fx.ts`); the state machine stays free of the DOM and tested.

## Already decided

- **Export project** is good for now. Do not change it.
- Hosting for share links is still open and is not part of this session.
