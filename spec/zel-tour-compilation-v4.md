Text in [ brackets ] is the button.

# App layout

Top Navigation bar: 
[W+] [←] [ UXWoz Tour v ] [→] [100% v]
Where:
[W+]    New UXWoz logo, tap on it opens the app menu left panel.
[←]     Navigate to the previous mock/box (same as browser).
[ UXWoz Tour v ]    Dropdown containing all screens in a hierarchical tree, then vertical separator, then each of the specification and fixer boxes.
If the number of screens becomes too large, maybe better way is to have dropdown with a mock tree and on the top of that dropdown a bar with boxes navigation in one row (📐 Rules, 🧩 Components, 🗄️ Data, 🕵️ Fixer)?
[→]     Navigate to the mext mock/box (same as browser).
[100% v]    Shows current zoom. 
Dropdown menu opens zoom options, same as in current uxwoz.

Middle content: 
* Canvas with stars as background (same as now).
* One mock screen centered in the canvas (not two variants like now).
* Since on mobile it is hard to see multiple mocks at once, add a navigation animation which animates going from one mockup to another (<1sec), so the mobile users have a feeling what it where on canvas. 
That is also good because percieved wait time will be shorter. 
While the canvas animates to a new position LLM is called in the background.

Below are four mock action buttons:
[  🎲  ]  [  ✏️  ]  [  ⏪  ]  [  ℹ️  ]
[ New ]  [ Edit ]  [History]  [ Info ]

# Mock size

When new mockup is created it has the size and aspect ratio compatible with the current device it is run on.
But, that can present a problem for mockup cacheing, as every user and different devices from the same user will have different viewport.
One idea Zel as is to have predefined viewport sizes:
* Small phone, portrait.
* Large phone, portrait.
* Tablet/laptop, landscape.
* Large monitor, landscape.
The most appropriate viewpoer is selected based on the current device viewport. 
That way it will be possible to cache tutorial and sample apps with max 8 cached mocks per step (4 predefined viewport sizes x 2 variants).

# UXWoz Tutorial

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

# Behavior

# Mock action buttons

Main difference is that, in order to be mobile frienldy, edit/info boxes don't show on the right side panel.
Instead, mock is replaced in place with edit/info box (flip animation), and then flipped back once it is done.

[  🎲  ]
[ New ]
First time it is pressed, it generates another variants of the mock, and replaces the current mock.
The second time it is pressed, it replaces mock with edit mock prompt screen:
```md
Both varaints were rejected, please edit the current screen prompt:
{ current screen prompt input box }

[ Regenerate]
(Suports voice input by holding 🎙️ button.)
```
I am not sure about the wording, but that is the gist. 
After new prompt is entered, 2 new variants can be generated, then edit prompt again.

[  ✏️  ]
[ Edit ]
Edit box replaces the mock, edit layout the same as in current uxwoz (with past changes). 
After hitting [ Make the change ], edit box is replaced with edited mock.
Suports voice input by holding 🎙️ button. 

[  ⏪  ]
[History]
History box replaces the mock, it has undo/redo at the top, and condensed list of previous mocks below.
I am not sure if History should be merged with Edit, maybe that is more intuitive?

[  ℹ️  ]
[ Info ]
Shows info for the screen, but less info than now:
* Idea: {A live demo: a mini mockup you tap to see the next screen appear, with a stepped timeline on the side}
* Link ID: {@lesson-click}
* Reached by: {
  - Click anything to draw the next screen 
  - Tap a button or link and the app draws in L1 UX Woz }
* Model: {Claude Haiku 5.5} in {4.3 s} for {$0.0010}
* Prompt: {The lesson click screen, opened by "3. Click anything to draw the next screen Tap a button or link and the app draws"}
* Spec edits: {none}
The only problem is, it is not obvious what is the difference between an Idea and a Prompt? 
That should be clear from the info panel.

[  ❌  ]
[Delete]
I am not sure if delete should be a separate action or a part of the Edit box?

# Box action buttons
Also put them below a box. 
Of course, actions should be similar as box actions in the current uxwoz, and different than mock action buttons.
For example, Rules has an action to add items, Fixer has an action to run fixer.
Suggest icons and names for boxes:
📐 Rules, 🧩 Components, 🗄️ Data, 🕵️ Fixer

# Behavior on larger screens
Above minimal design works on mobile devices. 
On larger screens, navigation bar becomes larger and can have additional icons like +, -, ⛶, and 🎙️.
Also, navigation bar can have quick links to boxes, as now (📐 Rules, 🧩 Components, 🗄️ Data, 🕵️ Fixer). 
