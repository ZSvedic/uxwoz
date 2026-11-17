# UXWoz Tutorial

Idea: https://knowyourmeme.com/memes/be-like-bill

## Screen: Bill is using coding agents wrong.

Bill has an awesome app idea. 
He types it into Claude Code. 
20 min and 2 million tokens later, the app works!
But the menu is all wrong, so Bill asks Claude for changes. 

10-minute wait. 

The dialogs are also wrong. Change them. 

15 min later, they are wrong in a different way. 

The layout could be better. Change it. 

20-minute wait. 

After three days, Bill has a working app, a GitHub repo, 670+ tests, Supabase, Railway, CI/CD, but he is still not satisfied with the app. 

Now every change takes ~1 h. 
And 10 million tokens. 
Bill has read every news site and now needs to wait 6 hours until the next Claude quota reset. 
Vibe coding is boring. 

[ Q: What is Bill doing wrong? ] 

## Screen: What is Bill doing wrong?

After 40 h of work, Bill has spent 4 h making relevant decisions and 36 h reading Claude’s explanations and waiting. 
Billions of tokens later, Anthropic is happy, but Bill is not. 

The thing is: 

> In the AI world, the number of lines of code is a vanity metric.
> Code is not the bottleneck. 
> The bottleneck is *human decisions about what to build*. 

A growing codebase makes iterations ever slower, so human input becomes rarer. 
Code is constantly rebuilt, old code is thrown away, and the tokens spent on it are wasted.

But the solution is already here. Inside your model. Models know the old witchcraft; you just need to say the magic keywords. 

[ Q: Wait, what witchcraft? ]

## Screen: The Witchcraft

In 1980, academics realized their new experimental method was already described. 
In a children's book. 

The Wizard of Oz is an ordinary man who pulls levers behind the mask. 
The [experiments named after him](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment) work the same way, from psychology to user experience research. 

For UX, a human needed to draw and switch between paper mockup screens. 
But now, you can summon your own wizard with the magic words `wireframe`, `mockup`, and `UX Wizard of Oz`.

UXWoz (short for **U**ser e**X**perience **W**izard of **Oz**) does that for you.

[ Summon the Wizard! ]

## Screen: How the Wizard works

A cheap model generated this mock in 2.4 sec.

At the bottom are the currently disabled action buttons:

🎲  Generate a new random mock from the same prompt. 
    If you hit it again, Woz asks for a new prompt.

✏️  Edit the current mock by typing or using your voice.

⏪   Opens history with Undo/Redo.

ℹ️   Shows diagnostic info.

As you select buttons or links, mocks are generated on the fly. 
But mocks are just a part of the final output.

[ What is the other part? ]

## Screen: Specification boxes

To the right of the home mock are four boxes:

📐 Rules            Rules to follow when designing an app.

🧩 Components       Reusable components.

🗄️ Data             Reusable mock data.

🕵️ Fixer's notes    Every 5 mocks, or when requested, an agent runs in the background.
                    It fixes mock discrepancies, rules, components and data. 

Like mocks, boxes have undo, so you can revert any change.

There are two ways to navigate to a mock or a box: 
- Moving the canvas (two fingers / mouse scroll).
- Using the navigation dropdown at the top. 
  Use the <-- and --> arrows on each side to navigate back/forward. 

Try them out now. 

[ I tried them. But what happened to Bill? ]

## Screen: Handoff

Bill is not waiting anymore. 
AI is both automating tedious tasks and making Bill think faster: 
- Humans take 2-5 min to draw a paper mockup. 
  A cheap model does that in 2-5 sec.
- Editing a paper mockup is messy.
  Now, one voice command changes the mock in 2-5 sec.
- As Bill gives feedback, his background fixer writes app specs and fixes things. 
- AI spits out the most probable, standard UX.
  That is great: users instantly recognize UX patterns they have seen many times before.
- The app spec is short because it is a *differential spec*. 
  Bill just states the *differences* from the most probable, standard mockup.

Once Bill is satisfied, he shows mocks to a target user. 
They can edit each screen right away, change rules, change components or mock data.

Once the prototype is approved, Bill downloads a handout with mocks and specs, in text format. 

Bill gives the handout to Claude Code, and after an afternoon nap, the app is implemented exactly as specified in the prototype.

And prototyping apps is fun again.
