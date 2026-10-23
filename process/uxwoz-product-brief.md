# UXWOZ — Product Brief

**Domain:** [uxwoz.com](https://uxwoz.com)  
**Concept:** Infinite, AI-generated interactive UI mockups, inspired by *Wizard of Oz* prototyping and [Cached Generative Exploration (CGE)](cached-generative-exploration.md).

## Experience
1. User enters a product prompt or chooses an example; UXWOZ generates an initial screen.
2. User navigates by clicking controls; each action opens the next AI-generated screen, allowing arbitrarily large mockups without building a backend.
3. User refines a screen with text feedback, **Regenerate**, or **Generate 3 variants** and selects the preferred version.
4. Accepted screens and their navigation paths accumulate into a mockup for handoff to a coding agent (e.g., Claude Code).

## Generation pipeline
Each screen is streamed in **three ordered parts**:
1. **Semantic, classless HTML** — render immediately, before interactivity is ready.
2. **JavaScript** — attach handlers to buttons, dropdowns, sliders, etc.; handlers trigger mock navigation rather than real application logic.
3. **Action prompts** — short LLM prompts mapped to handlers, used to generate destination screens.

**Styling:** Prebuilt Pico CSS-based themes, never LLM-generated CSS. Themes may mimic hand-drawn wireframes (monochrome, handwritten, wobbly lines), Material Design, or iOS.

## Cached Generative Exploration (CGE)
UXWOZ applies **CGE** to interactive screen generation: users explore and refine a growing space of screens, while shared cached results make revisits instant and consistent.

- **Key:** Screen-generation prompt plus any required context; whether parent-screen ID belongs in the key remains undecided because several paths can reach the same screen.
- **Value:** HTML + JavaScript + action prompts.
- **Miss:** Generate and cache a screen. **Hit:** Display the previously generated screen instantly and consistently.
- **Feedback:** A change request extends the prompt and regenerates the screen; regeneration/variant selection creates a new candidate rather than silently overwriting the shared result.

## Design priorities / open decisions
- Optimize **time to first visible screen**: stream HTML before JS and prompts; ensure controls only become usable once their handlers and prompts are ready.
- Use reusable, deterministic cached screens to minimize latency and inference cost while letting humans continuously direct the design.
- Define cache-key context, screen identity across navigation paths, feedback/variant versioning, and the export format for coding-agent handoff.
