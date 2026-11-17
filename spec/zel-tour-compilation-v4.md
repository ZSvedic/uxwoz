# UXWoz Tutorial

Text in [ brackets ] is the button to the next screen.

Idea: https://knowyourmeme.com/memes/be-like-bill

## Screen: This is Bill.

Bill has an awesome app idea. He types it into Claude Code.
20 min and 2 million tokens later, the app works!

The menu is wrong. Change. 10 min.

The dialogs are wrong. Change. 15 min.

Now the dialogs are wrong in a different way. Change. 20 min.

Bill worked 40h. 
4h making decisions. 
The other 36h waiting and reading walls of text.

Now he has a working app, 670 tests, Supabase, Railway, CI/CD. 
A change takes 1h. 
He still doesn't like the app.

[ Poor Bill. What went wrong? ]

## Screen: Meet Woz.

The bottleneck is *human decisions about what to build*.

To show Bill a different menu, Claude rebuilt a real app with 670 tests.  
Hundreds of millions of tokens later, Anthropic is happy, but Bill is not.

(Bill was me, by the way.)

The solution is already in the models. 
The magic phrase is "[Wizard of Oz experiment](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment)". 
A person behind the curtain makes a system appear to work.

Now the model hides behind the curtain and pretends to be your app.

UXWoz (**U**ser e**X**perience **W**izard of **Oz**), Woz for short, turns your idea into a clickable and editable mock before a coding agent builds it.

Woz draws the next mock on every click, keeps shared rules and components, and exports the result for your coding agent.

[ Summon the Wizard! ]

## Screen: How Woz works

A cheap model generated this mock in 2.4 sec.

The buttons under the mock (off in this tour):

- 🎲 Don't like it? Roll again.
- ✏️ Say or type what to change.
- ⏪ Changed your mind? Undo.

Four boxes to the right of the home mock hold what all mocks share:

- 📐 **Rules** every mock follows.
- 🧩 **Components** the mocks reuse.
- 🗄️ **Data**, made up, that the mocks reuse.
- 🕵️ **Fixer's notes**: every 5 mocks, the fixer makes mocks and boxes agree and notes what it changed.

Like mocks, boxes have edit and undo, so you can edit and revert changes.

Get around by moving the canvas (two fingers / mouse scroll), or with the navigation dropdown at the top and its ← → arrows. Try it now: pick Rules in the dropdown, then press ←.

[ Done. But what happened to Bill? ]

## Screen: Be like Bill

Bill types his new idea into Woz. 
3 sec later, there is a mock. 

The menu is wrong. Change. 3 sec. 

The dialogs are wrong. Change. 3 sec. 

The model already knows the usual app patterns. 
Bill just states the *differences* from the standard mockup:
"Same checkout, but pay without an account."
The app spec stays short.

Bill shows the mocks to target users and fixes what confuses them. 
Then he exports the mocks and specs for his coding agent.

Prototyping apps is fun again.
Bill is smart. Be like Bill.

[ Try another example ]