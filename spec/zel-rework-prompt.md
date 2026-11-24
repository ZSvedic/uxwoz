# Rework goals

The current iteration of UXWoz on https://app.uxwoz.com/ is not good. 
A complete rework is needed:

* The current app layout doesn't work on mobile. 
The toolbar is too big, two card versions are too small when looked on phone screen, and it would be better if the mock action buttons are below the mock, not to the right.

* Because of that I have redesigned the app, it should be mobile first. 
Here is how I imagined the the initial tour when first accessing the website:
[zel-tour-compilation-v4.md](zel-tour-compilation-v4.md)

* L1, LX names: There is no need for this level IDs.
On canvas screens below are level higher. 
On navigation dropdown, indentation tells which level it is.

* Logo: I don't like the current hat logo. 
The thing is that space is limited both on mobile and in users attention. 
Currently we have this: (hat logo) UXWoz, all 3 in different color. 
That is too much, how about:
  - Logo being just W+ where + is a yellow sparkle in W's superscript.
  - When there is enough space, we can show UXW+oz, and when there is none (e.g. favicon), just W+.

# Rework process
Follow Zel's process of think, mock, and approve first, then spec and tests, code last. 
I suggest:
* Detect gaps in this prompt and [zel-tour-compilation-v4.md](zel-tour-compilation-v4.md), with suggestions on how to close them. 
Zel approves.
* Create a new logo in multiple versions, and B/W mocks of the new app and tour. 
Zel approves.
* Change spec and tests if you think that is needed. 
We still want fast iteration in the future.
* Create a deletion, refactoring, and new code plan.
Remember, we want fast iteration so codebase should stay small. 
Zel approves.
* Implement deletion, refactoring, and new code.
* Run critic subagents in order to check from different angles. 
Implement subagents feedback if the best option is clear, ask Zel if best option is not clear.
* After all is implemented, tested, and reviewed, run the local app and tell Zel exact steps to test.
