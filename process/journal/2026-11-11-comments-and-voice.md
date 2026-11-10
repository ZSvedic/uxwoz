# 2026-11-11: voice works, comments sit beside the screens

Both pieces of [the prompt](../plans/2026-11-10-comments-and-voice-prompt.md) are on `main`, built overnight
while you were away. 190 tests pass, typecheck is clean, nothing is pushed. The plans, with every decision
I made for you and why: [voice](../plans/2026-11-10-voice.md), [comments](../plans/2026-11-10-comments.md).

## Why voice did nothing

Chrome never writes *woz*. Ten macOS voices said "hey Woz" twenty times through the MacBook's speakers into
its microphone: Chrome heard *he was* 7 times, *hey was* 4, *they was*, *there was* and *hey* once each,
lost the phrase 3 times and heard nothing 3 times. The old list woke on 4 of 20, and showed nothing for the
rest. Your microphone and the permission were fine.

## Your checklist

Run `cd src && bun run dev` (restart it if it was running: there are new frontend files).

1. **Voice.** Click a screen, turn the microphone on, say *"hey Woz, use switches"*, pause. A label above
   the microphone shows what Chrome heard (*Heard: he was you switches*), the words land in the Edit
   field, the countdown runs. If it does not wake, the label says what it heard and *Start with "hey
   Woz"*. Try *"hey wizard, …"* too.
2. **A false wake.** With the microphone on, start a sentence with *"he was …"*. It wakes: Cancel within
   three seconds. Say if this happens too often in real use.
3. **The check.** `cd src && bun scripts/voice-check.ts --voice Karen` with the app running and a mockup
   open. It plays a synthetic voice and ends with PASS or FAIL. It costs nothing.
4. **A reviewer.** Project menu, *Share…*, make a Comment link, open it in a private window. Click
   through without a name. Press **Comment**: it asks your name once, then click a part and write.
   Reload: the pin and the card are still there. Click a control with no screen behind it. Try 375 px.
5. **The owner.** Back in the app, the screen carries the pins. Click one: the drawer opens on
   **Comments**. Resolve one, reopen it. Open *Feedback* in the project menu and click a comment line.
6. **A comment survives an Edit.** Edit a screen that has a pinned comment so the part's words stay: the
   pin stays. Remove the part: the comment says *About an earlier version*.

## What was built

| Step | Builder | Critic found | Commits |
|---|---|---|---|
| Voice | 8 min, fixes 5 min | 7 (the nothing-heard label nagged every 8 s; the check let the warm-up call a model) | cb77e54, d061879 |
| Comments, the reviewer | 11 min, fixes 2 min | 6 (the frame stayed in pick mode after *The whole screen*; no storage meant no comments) | a2c944b, 02f7b38 |
| Comments, the owner | 7 min, fixes 2 min | 5, none serious (the tab showed on a mockup never shared; a pin could stay ringed) | 2ce92a0, 8c158b5 |

- **Voice**: wakes on *hey*/*he* + *woz*/*was*/*waz* and on *wizard* (alone or after *hey*, *he*, *hi*,
  *very*); the label; the red pill at the first error of each kind; *Click a screen first.* on waking;
  `src/scripts/voice-check.ts` and its part in the README.
- **Comments**: a name before any feedback or trip is stored; **Comment** then a click pins a comment to a
  part, or to the whole screen; a margin beside the screen; no dialogs (a dead control and **Done** use
  the same card); the owner's pins on the canvas, the **Comments** tab with **Resolve**, the Feedback
  pane as an index that jumps. New: `pins.ts`, `comments.ts`, `POST /api/feedback`, `GET
  /api/s/:token/feedback`. Old feedback loads and gets ids.
- The CSS is 576 lines and 45 KB against the caps of 700 and 52.

## What I decided for you

- "hey wizard" also wakes it, because Chrome hears *wizard* right. *They was* and *there was* do not wake
  it: they start ordinary sentences, and a false wake can cost an Edit.
- A reviewer sees only their own comments, and nobody replies: comments only this round, the owner
  resolves. A customer who reads the others first is no longer a fresh pair of eyes.
- The owner's comments sit in the drawer beside the screen, with pins on the canvas. A comment column on
  the canvas would have meant changing the tree layout.
- A trip is stored only once the visitor gave a name, like all feedback. A silent visitor leaves nothing.
- An anchor is the part's words, tag and place among equals; no CSS path.
- Thumbs and **Done** stay. Kind `dead` is read and no longer written.

## What I saw myself

- The check with sound, three runs on the merged code: Karen, *"Hey Woz, use switches"* → Chrome heard
  *hey was you switches*, PASS. Samantha, *"Hey Woz, make the title bigger"* → *he was made the title
  bigger*, PASS. Samantha, *"Hey wizard, …"* → *play wizard make the title bigger*, FAIL, and the label
  said so. No Chrome and no profile were left behind.
- The player on port 3001: a comment pinned to Record, its card in the margin, both back after a reload.
- The app: pin 2 on Record on the canvas, a click opened Comments with both comments, and the pin stayed
  on Record after a real Edit of another line (about a cent).

## Not verified

- **A human voice.** Every clip was synthetic. *Samantha* saying the short *"Hey Woz, use switches"* came
  back empty in two runs; other voices and longer sentences worked. Use `--voice Karen` for the check.
- Chrome's fake microphone: it does not reach speech recognition in Chrome 157, so the check needs
  speakers the microphone can hear. Your default output was the LG screen; I played through the
  MacBook's speakers with ffmpeg (`--player` takes any command).
- Voice errors on screen (no microphone, no network, blocked): tested with a fake recognizer only.
- An edit link with the new code, and Safari and Firefox.
- The player at 375 px by hand (the builder looked; the browser tool cannot click in the scaled frame).
- Resolve seen from the reviewer's side after a reload.

## Budget

Six Opus subagents (three builders, three critics); fixes went back to the same builders. The 5-hour
window went from 51% to 72% before it reset; the week from 4% to 7%. Model credits: one Edit and the
warm-ups on port 3001, a few cents. No cassette changed, because no prompt byte changed.
