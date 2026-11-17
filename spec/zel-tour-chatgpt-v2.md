# UXWoz Tutorial

Idea: https://knowyourmeme.com/memes/be-like-bill

## Screen: This is Bill.

Bill has an awesome app idea. He types it into Claude Code.
20 min later, the app works!

The menu is wrong. Change.
10 min.

The dialogs are wrong. Change.
15 min.

The layout could be better. Change.
20 min.

Bill works 40 hours. Four making decisions. Thirty-six reading explanations and waiting.
He has a working app, 670+ tests, Supabase, Railway, CI/CD. He still doesn't like the app.
Anthropic is happy. Bill is not.

Bill has read every news site. Six hours until his Claude quota resets.

[ Can we skip the waiting? ]

## Screen: Meet Woz.

The bottleneck is *human decisions about what to build*.
Bill needs to try a different menu before rebuilding the app.

The solution is already here. Models know how to draw mockups.
UXWoz, or Woz for short, turns your idea into a clickable prototype you can change before coding.
Each click draws the next screen. Shared rules and components keep screens consistent.
An export gives your coding agent the mocks and specs.

The name comes from [Wizard of Oz experiments](https://en.wikipedia.org/wiki/Wizard_of_Oz_experiment): a person behind the curtain makes a system appear to work.

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

Like mocks, boxes have edit and undo, so you can edit and revert changes.
The model knows the usual app patterns. Bill only writes down what differs:
“Use the same checkout, but let customers pay without an account.”

To find a mock or box, move the canvas with two fingers or mouse scrolling, or use the navigation dropdown at the top.
The <-- and --> arrows beside it take you back and forward.

[ Try navigating, then come back. ]

## Screen: Handoff

The menu is wrong. Change. A few seconds.
The dialogs need work. Change. A few seconds.
The layout could be better. Change. A few seconds.

Bill catches a confusing checkout before anyone builds it.
He shows the mocks to target users, makes changes, and exports a handoff with the mocks and specs.
Claude Code starts with the screens and decisions already worked out.

Prototyping apps is fun again.
Bill is smart. Be like Bill.

[ Create my first prototype. ]
