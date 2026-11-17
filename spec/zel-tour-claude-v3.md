# UXWoz Tutorial

Claude's v3 draft of [zel-tour.md](zel-tour.md). A line in [ brackets ] is the button to the next screen.

Idea: https://knowyourmeme.com/memes/be-like-bill

## Screen: This is Bill.

This is Bill.  
Bill has an awesome app idea.  
He types it into Claude Code.  
20 min and 2 million tokens later, the app works!

But the menu is wrong. Change.  
10 min.  
The dialogs are wrong. Change.  
15 min.  
Now they are wrong in a different way. Change.  
20 min.

After a week, Bill has a GitHub repo, 670+ tests, Supabase, Railway and CI/CD.  
He still does not like the app.  
Now every change takes 1 h and 10 million tokens.  
Bill has read every news site, and his Claude quota resets in 6 hours.

[ Poor Bill. What went wrong? ]

## Screen: What went wrong?

Bill worked 40 hours.  
He decided things for 4.  
He waited for 36.

> The bottleneck is *human decisions about what to build*.

Bill wanted to see a different menu. To show him one, Claude rebuilt a real app with 670 tests.  
Hundreds of millions of tokens later, Anthropic is happy, but Bill is not.

(Bill is me, by the way.)

[ So what should Bill do? ]

## Screen: The Wizard

In 1980, researchers tested software that did not exist yet: a person hid in the next room and typed the
computer's answers. They named the trick after the man behind the curtain: the
[Wizard of Oz experiment](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment).

Now the model hides behind the curtain and pretends to be your app.

UXWoz (**U**ser e**X**perience **W**izard of **Oz**), Woz for short, turns your idea into a clickable mock
that you change before a coding agent builds it.

Asking Claude for a wireframe gets you one picture. Woz draws the next mock on every click, keeps the same
rules and components on all of them, and packs the result for your coding agent.

Pay no attention to the model behind the curtain.

[ Summon the Wizard! ]

## Screen: How Woz works

Claude Haiku, a cheap model, drew this mock in 2.4 sec for less than half a cent.
Click any button or link in it, and Woz draws the next mock.

The buttons under the mock (off during this tour):

- 🎲 Don't like it? Roll again.
- ✏️ Say or type what to change.
- ⏪ Changed your mind? Go back.

Four boxes to the right of the home mock hold what all mocks share:

- 📐 **Rules** every mock follows.
- 🧩 **Components** the mocks reuse.
- 🗄️ **Data**, made up, that the mocks reuse.
- 🕵️ **Fixer's notes**: every 5 mocks, the fixer makes mocks and boxes agree and notes what it changed.

Like mocks, boxes have edit and undo, so you can edit and revert changes.

Get around by moving the canvas (two fingers / mouse scroll), or with the navigation dropdown at the top
and its ← → arrows. Try it now: pick Rules in the dropdown, then press ←.

[ Done. But what happened to Bill? ]

## Screen: Be like Bill

Bill types his new idea into Woz.  
3 sec later, there is a mock.

The menu is wrong. Change.  
3 sec.  
The dialogs are wrong. Change.  
3 sec.

Bill says only what is different from the usual app: "Same checkout, but pay without an account."
The model already knows the usual part.

Bill shows the mocks to target users. They change what confuses them, right on the mock.

After one afternoon, Bill has zero tests, zero Supabase, and mocks that his users like.  
He downloads the handoff, the mocks and the boxes as text, and gives it to Claude Code.  
Claude Code still writes the real data and logic, but only once: the decisions are already made.

Bill is smart.  
Be like Bill.

[ Create my first mock ]
