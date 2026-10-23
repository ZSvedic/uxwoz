"""One score per model over every stored run: correctness and speed decide, price only trims.

    Score = 0 if C < 0.5, else 100 x C^2 x S x P
      C  correctness: (Pass + 0.5 x Partial) / attempts, per task, averaged over the tasks
      S  speed: 1 at <= 3 s to fully rendered, 0 at >= 20 s (median per task, averaged)
      P  price: 1 at <= $0.005 per screen, down to 0.8 at >= $0.20 (log scale)

    uv run python -m bench.score     # prints the table (markdown)
"""

from __future__ import annotations

import math
import statistics as st
from collections import defaultdict

from . import storage
from .config import MODELS, REQUEST_TIMEOUT_S, TASKS

PARTIAL_CREDIT = 0.5  # a usable UI with defects counts half
MIN_CORRECTNESS = 0.5  # below this the UI is wrong too often to use: score 0
SCREENS_IN_A_ROW = 2  # C ** 2: chance that two consecutive screens of an app both come out right
FAST_S, BUDGET_S = 3.0, REQUEST_TIMEOUT_S  # full speed credit at <= 3 s, none at >= 20 s
CHEAP_USD, PRICEY_USD = 0.005, 0.20  # price factor 1.0 at <= $0.005/screen, its floor at >= $0.20
MAX_PRICE_PENALTY = 0.2  # price can take at most 20% off: it trims, it never decides


def clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def correctness(attempts: list[dict]) -> float:
    g = [a["grade"]["grade"] for a in attempts]
    return (g.count("pass") + PARTIAL_CREDIT * g.count("partial")) / len(g)


def seconds(a: dict) -> float:
    # A request stopped at the budget counts as the budget.
    t = a["timings"].get("fully_rendered_ms") or a["timings"].get("generation_complete_ms") or BUDGET_S * 1000
    return min(t / 1000, BUDGET_S)


def score_rows() -> list[dict]:
    """A row per model that has attempts on every task. Pools every stored run: move a run out of
    data/runs to leave it out."""
    by = defaultdict(lambda: defaultdict(list))  # model -> task -> attempts
    for run in storage.list_runs():
        for a in storage.load_attempts(run["id"]):
            by[a["model"]][a["task"]].append(a)
    rows = []
    for model, tasks in by.items():
        if set(tasks) != set(TASKS) or model not in MODELS:
            continue
        c = st.mean(correctness(tasks[t]) for t in TASKS)  # tasks weigh equally
        t = st.mean(st.median(seconds(a) for a in tasks[t]) for t in TASKS)
        cost = st.mean(a.get("cost_usd") or 0 for t in TASKS for a in tasks[t])
        speed = clamp((BUDGET_S - t) / (BUDGET_S - FAST_S))
        pricey = clamp(math.log(max(cost, 1e-9) / CHEAP_USD) / math.log(PRICEY_USD / CHEAP_USD))
        price = 1 - MAX_PRICE_PENALTY * pricey
        score = 0.0 if c < MIN_CORRECTNESS else 100 * c ** SCREENS_IN_A_ROW * speed * price
        rows.append({"model": model, "score": score, "C": c, "t": t, "cost": cost, "S": speed, "P": price,
                     "n": sum(len(v) for v in tasks.values()),
                     "tasks": {k: {g: [a["grade"]["grade"] for a in tasks[k]].count(g) for g in ("pass", "partial", "fail")}
                               for k in TASKS}})
    return sorted(rows, key=lambda r: -r["score"])


def summary() -> dict:
    return {
        "rows": score_rows(),
        "constants": {"partial_credit": PARTIAL_CREDIT, "min_correctness": MIN_CORRECTNESS, "fast_s": FAST_S,
                      "budget_s": BUDGET_S, "cheap_usd": CHEAP_USD, "pricey_usd": PRICEY_USD,
                      "max_price_penalty": MAX_PRICE_PENALTY},
    }


if __name__ == "__main__":
    print("| # | Model | Score | Correct C | Time t | Speed S | Cost/screen | Price P | Attempts |")
    print("|---:|---|---:|---:|---:|---:|---:|---:|---:|")
    for i, r in enumerate(score_rows(), 1):
        print(f"| {i} | {MODELS[r['model']]['label']} | **{r['score']:.0f}** | {r['C']:.2f} | {r['t']:.1f} s | "
              f"{r['S']:.2f} | ${r['cost']:.4f} | {r['P']:.2f} | {r['n']} |")
