# Cached Generative Exploration

Inspired by [Infinite Craft](https://en.wikipedia.org/wiki/Infinite_Craft): use an LLM to create new outputs, then reuse them instead of regenerating.

## Core loop
1. **Human input:** Create, combine, or modify inputs, or express a preference.
2. **Cache lookup:** Normalize inputs and check for an exact match (optionally a safe, well-defined similar match).
3. **Generate on miss:** Ask an LLM for an output; store the input → output mapping.
4. **Reuse on hit:** Return the cached output immediately and consistently.
5. **Human feedback:** Accept, modify, or prefer outputs; use feedback to improve future results and cache entries.

## Benefits
- **Lower cost:** LLM calls only for uncached requests.
- **Low latency:** Cache hits avoid generation time.
- **Consistency:** Shared mappings turn nondeterministic LLM responses into stable results.
- **Human-directed evolution:** Users continuously shape the system through inputs and feedback.

## Design questions
- Define canonical cache keys and when two inputs count as equivalent.
- Decide how feedback updates shared mappings without breaking consistency.
- Track model/prompt versions and provenance for generated entries.
