# UI generation benchmark (lite)

This benchmark measures how fast and how correctly each of the three chosen models writes one
interactive screen as semantic HTML + vanilla JS styled by classless Pico.css. It does not compare
formats or other models: that exploration is archived in the sibling folder `ux-woz-full-benchmark` (not in this repo), and its
conclusions are in [../spec/ui-generation.md](../spec/ui-generation.md).

## Example

```bash
cd benchmarks
uv sync && uv run playwright install chromium
uv run uvicorn bench.main:app --port 8100     # then open http://127.0.0.1:8100
```

In the page, pick a task, keep the three models ticked, set 3 repetitions and press **Start run**.
A run of 9 attempts takes about 30 s. The summary at the top pools every stored run.

From the shell:

```bash
uv run python -m bench.score                   # the summary table as markdown
uv run python -m bench.recheck <run_id>        # re-grade a stored run after changing a check (server running)
uv run pytest                                  # offline tests, including the baseline scores
```

## What one attempt does

1. The runner streams the model's reply (`bench/providers.py`) and relays each chunk to a headless
   Chromium page, `web/harness.html`.
2. The harness renders the HTML in a sandboxed iframe (scripts and forms allowed, no same-origin
   access) with Pico inlined, and timestamps first visible and fully rendered.
3. `bench/interaction.py` types the task's reference inputs into the live UI and reads what it
   shows: 4 BMI cases plus the scale marker's position, 4 mortgage cases plus table and chart,
   6 todo steps.
4. `bench/grading.py` turns that into Fail, Partial or Pass with named defects, and
   `bench/score.py` into one score per model.

## Score

Score = 100 × C² × S × P, and 0 when C < 0.5.

- **C** correctness: (Pass + 0.5 × Partial) / attempts, per task, averaged over the three tasks.
- **S** speed: 1 at 3 s or less to fully rendered, 0 at the 20 s budget.
- **P** price: 1 at $0.005 or less per screen, down to 0.8 at $0.20 (log scale).

## Data

`data/runs/<run_id>/` holds `run.json`, one JSON per attempt (prompt timings, usage, cost, source,
recorded chunks, test results, grade) and PNG screenshots. The 11 runs there on 2026-10-23 are the
baseline imported from the full benchmark; `tests/test_api.py` checks they still score 76, 70
and 67. Move a run out of `data/runs` to leave it out of the summary.

## Settings

Keys come from the repo root `.env` (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`). Environment variables:
`BENCH_DATA` (data directory), `BENCH_CONCURRENCY` (default 6), `BENCH_REQUEST_TIMEOUT_S`
(default 20) and `BENCH_HARNESS_ORIGIN` (default `http://127.0.0.1:8100`; must match the port).

This benchmark is Python, an exception to the repo's TypeScript rule: it is a measuring tool that
imports no app code, and its checks were validated against the full benchmark.
