# UXWoz Tutorial

The words of the first-run tour, screen by screen. A line in [ brackets ] is the button to the next screen.
This is Claude's v3 draft of [zel-tour.md](zel-tour.md); how the tour is built is not here.

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

Hundreds of millions of tokens later, Anthropic is happy, but Bill is not.

> The bottleneck is *human decisions about what to build*.

Bill wanted to see a different menu.
To show him one, Claude rebuilt a real app with 670 tests.

Bill did not need an app yet. He needed a mock: a picture of the app that he can click.

(Bill is me, by the way.)

The solution is already here, and it is older than Bill.

[ What solution? ]

## Screen: The Wizard

In 1980, researchers wanted to test software that did not exist yet.  
So a person hid in the next room and typed the computer's answers.  
They named the trick after the ordinary man who pulls levers behind a curtain:
the [Wizard of Oz experiment](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment).

Now it works the other way round. The model hides behind the curtain and pretends to be your app.

UXWoz (**U**ser e**X**perience **W**izard of **Oz**), Woz for short, turns your idea into a clickable mock.
You change it until it is right. Then a coding agent builds it.

You could ask Claude for a wireframe yourself, and you would get one picture.
Woz draws the next mock on every click, keeps the same rules and components on all of them, undoes any
change, and packs the result for your coding agent.

Pay no attention to the model behind the curtain.

[ Summon the Wizard! ]

## Screen: How Woz works

Claude Haiku, a cheap model, drew this mock in 2.4 sec for less than half a cent.
Click any button or link in it, and Woz draws the next mock on the spot.

Under the mock are its buttons (off during this tour):

- 🎲 Don't like it? Roll again.
- ✏️ Say or type what to change.
- ⏪ Changed your mind? Go back.

To the right of the home mock, four boxes hold what all mocks share:

- 📐 **Rules**: what every mock must follow.
- 🧩 **Components**: parts the mocks reuse.
- 🗄️ **Data**: made-up data the mocks reuse.
- 🕵️ **Fixer's notes**: every 5 mocks, or when you ask, the fixer makes the mocks and the boxes agree, and
  notes what it changed.

Like mocks, boxes have edit and undo, so you can edit and revert changes.

There are two ways to get to a mock or a box:

- Move the canvas (two fingers / mouse scroll).
- The navigation dropdown at the top, with ← and → for back and forward.

Try it now: pick Rules in the dropdown, then press ← to come back.

[ Done. But what happened to Bill? ]

## Screen: Be like Bill

Bill has a new app idea. He types it into Woz.  
3 sec later, there is a mock.

The menu is wrong. Bill says so.  
3 sec.  
The dialogs are wrong. Change.  
3 sec.  
The layout could be better. Change.  
3 sec.

Bill says only what is different from the usual app: "Same checkout, but pay without an account."
The usual part, the model already knows. The fixer writes it all down in the boxes.

Then Bill shows the mocks to target users. They change what confuses them, right on the mock.

After one afternoon, Bill has zero tests, zero Supabase and an empty repo.
He also has mocks that he and his users like.

Now Bill downloads the handoff: the mocks and the boxes, as text. He gives it to Claude Code.
The data and the logic were fake until now, so Claude Code still writes the real ones. But it writes them
once, because the decisions are already made.

Bill is smart.  
Be like Bill.

[ Create my first mock ]
