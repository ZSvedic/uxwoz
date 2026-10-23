"""Todo task: reference state and checks on what the UI shows."""

from __future__ import annotations

import re

START = [("Buy milk", False), ("Write report", True), ("Call Alice", False)]
NEW_TASK = "Pay rent"


def shows_count_left(text: str, n: int) -> bool:
    """A counter of not-done tasks: "2 items left", "Remaining: 2", "2 active", "Active (2)"..."""
    words = r"(left|remaining|active|to do|open|pending|incomplete)"
    return bool(re.search(rf"(?<![\d.]){n}(?![\d.])[^\n\d]{{0,20}}\b{words}\b", text, re.I)
                or re.search(rf"\b{words}\b[^\n\d]{{0,12}}(?<![\d.]){n}(?![\d.])", text, re.I))


def requirement_checklist(text: str) -> dict[str, bool]:
    t = text.lower()
    return {
        "shows_three_start_tasks": all(name.lower() in t for name, _ in START),
        "new_task_input": "new task" in t or "add" in t,
        "filters_all_active_done": all(re.search(rf"\b{w}\b", t) for w in ("all", "active", "done")),
        "counter_2_left": shows_count_left(text, 2),
    }
