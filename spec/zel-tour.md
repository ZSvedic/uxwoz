# UXWoz Tutorial

Idea: https://knowyourmeme.com/memes/be-like-bill

## Screen: Bill is using coding agents wrong.

Bill has an awesome app idea. 
He types it into Claude Code. 
20min and 2 million tokens later, app works!
But menu is all wrong, so Bill asks Claude for changes. 

10min wait. 

Dialogs are also wrong, change. 

15min later, they are wrong in a different way. 

Layout could be better, change. 

20min wait. 

After three days, Bill has a working app, GitHub repo, 670+ tests, Supabase, Railway, CI/CD, but he is still not satisfied with the app. 

Now every change takes ~1h. 
And 10 million tokens. 
Bill has read every newsite, and now needs to wait 6 hours till next Claude quota reset. 
Vibe coding is boring. 

[ Q: What is Bill doing wrong? ] 

## Screen: What is Bill doing wrong?

After 40h of work, Bill spent 4h making relevant decisions, and 36h on Claude explanations and waiting. 
Billions of tokens later, Anthropic is happy, but Bill is not. 

The thing is: 

> In AI world, the number of lines of code is a vanity metric.
> Code is not the bottleneck. 
> The bottleneck is *human decisions on what to build*. 

Growing codebase makes iterations ever slower, so human inputs become rarer. 
Code is contantly rebuild, old code thrown, their tokens wasted.

But, the solution is already here. Inside your model. Models know the old whithcraft, you just need to say magic keywords. 

[ Q: Wait, what whitchcraft? ]

## Screen: The Whitchcraft

In 1980, academics realized their new experimental method was already described. 
In a children's book. 

The Wizard of Oz is an ordinary man who pulls levers behind the mask. 
The [namesake experiments](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment) work the same way, from psychology to user experience research. 

For UX, a human needed to draw and switch mock paper screens. 
But now, you summon your own wizard with magic words `wireframe`, `mockup`, and `UX Wizard of Oz`.

UXWoz (to **U**ser e**X**perience **W**izard of **Oz**) does that for you.

[ Summon the Wizard! ]

## Screen: How the Wizard works

A cheap model generated this mock in 2.4 sec.

At the bottom are currently disabled action buttons:

🎲  Generate a new random mock from the same prompt. 
    If hit again, Woz asks for a new prompt.

✏️  Edit a current mock by typing or voice.

⏪   Opens history with Undo/Redo.

ℹ️   Shows diagnostic info.

As you select buttons or links, mocks are generated on the fly. 
But, mocks are just a part of the final output.

[ What is the other part? ]

## Screen: Specification boxes

Right the the home mock are four boxes:

📐 Rules            Rules to follow when designing an app.

🧩 Components       Reusable components.

🗄️ Data             Reusable mock data.

🕵️ Fixer's notes    Every 5 mocks, or when requested, an agent runs in the background.
                    It fixes mock discrepancies, rules, components and data. 

Same as on mocks, boxes have undo, so you can revert any change.

There are two options to navigate to a mock or a box: 
- Moving the canvas (two fingers / mouse scroll).
- Using the navigation dropdown at the top. 
  Use <-- and --> arrows on each side navigate back/forward. 

Try them out now. 

[ I tried them. But what happened to Bill? ]

## Screen: Handoff

Bill is not waiting anymore. 
AI is both automating tedious tasks, and making Bill think faster: 
- Humans take 2-5 min to draw a paper mockup. 
  Cheap model does that in 2-5 sec.
- Editing a paper mockup is messy.
  Now, one voice command changes mock in 2-5 sec.
- As Bill gives feedback, his background fixer writes app specs and fixes things. 
- AI spits out the most probable, standard UX.
  That is great: users instantly recognize UX patterns seen many times before.
- App spec is short, because it is *differential spec*. 
  Bill just says *differences* from most probable, standard mockup.

Once Bill is satisfied, he shows mocks to a target user. 
They can edit each screen right away, change rules, change components or mock data.

Once the prototype is approved, Bill downloads a handout with mocks and specs, in text format. 

Bill gives handout to Claude Code, and after an afternoon nap, app is implemented exactly as specified in prototype.

And prototyping apps if fun again.
