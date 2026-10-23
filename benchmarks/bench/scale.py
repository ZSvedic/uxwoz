"""Does the visual BMI scale point at the right category?

Input: element-geometry snapshots of the live UI (frontend/src/lib/geometry.ts), one per BMI shown
(the default input, then each typed-in case). The check is layout-agnostic:

1. The category bar is the widest run of 4 horizontally contiguous, filled, text-free boxes at the
   same height (HTML backgrounds or SVG shapes), with at least 3 distinct colours, that stays put.
2. The marker is any element near the bar whose horizontal centre moves between inputs.
3. At each input the marker's centre must lie inside the segment of the expected category.

If no marker moves and nothing near the bar changes at all (position, fill, opacity), the scale looks
the same for every BMI and cannot show where it falls: status "static", a defect. Bars with another
segment count, gradients, and designs that restyle the active segment instead of moving a marker are
reported as not checkable (not as a defect).
"""

from __future__ import annotations

from decimal import Decimal

from . import bmi

CATEGORY_INDEX = {c: i for i, c in enumerate(bmi.CATEGORIES)}
EDGE_TOL = 2.0  # px a marker centre may sit past a segment edge
MAX_GAP = 8.0  # px between contiguous segments


def _cx(i: dict) -> float:
    return i["x"] + i["w"] / 2


def find_bar(snap: list[dict]) -> list[dict] | None:
    cands = [i for i in snap if i["fill"] and not i["text"] and i["w"] >= 6 and 2 <= i["h"] <= 48]
    best: list[dict] | None = None
    for seed in cands:
        row = sorted((c for c in cands if abs(c["y"] - seed["y"]) <= 2 and abs(c["h"] - seed["h"]) <= 2),
                     key=lambda c: c["x"])
        run: list[dict] = []
        for c in row:
            if run and -3 <= c["x"] - (run[-1]["x"] + run[-1]["w"]) <= MAX_GAP:
                run.append(c)
            else:
                if len(run) == 4 and _good(run) and (best is None or _width(run) > _width(best)):
                    best = run
                run = [c]
        if len(run) == 4 and _good(run) and (best is None or _width(run) > _width(best)):
            best = run
    return best


def _width(run: list[dict]) -> float:
    return run[-1]["x"] + run[-1]["w"] - run[0]["x"]


def _good(run: list[dict]) -> bool:
    return len({r["fill"] for r in run}) >= 3 and _width(run) >= 80


def check(snapshots: list[list[dict]], bmis: list[str]) -> dict:
    """snapshots[k] shows BMI bmis[k]; returns {"status": ok|wrong|not_checkable, ...}."""
    if len(snapshots) < 2:
        return {"status": "not_checkable", "reason": "fewer than two inputs observed"}
    bar = find_bar(snapshots[0])
    if not bar:
        return {"status": "not_checkable", "reason": "no 4-segment category bar found"}
    bar_keys = {b["key"] for b in bar}
    by_key = [{i["key"]: i for i in s} for s in snapshots]
    # The bar must stay put; otherwise positions are not comparable.
    for snap in by_key[1:]:
        for b in bar:
            moved = snap.get(b["key"])
            if not moved or abs(moved["x"] - b["x"]) > 1 or abs(moved["w"] - b["w"]) > 1:
                return {"status": "not_checkable", "reason": "category bar moves or resizes between inputs"}

    bar_cy = bar[0]["y"] + bar[0]["h"] / 2
    expected = [CATEGORY_INDEX[bmi.category(Decimal(v))] for v in bmis]
    best: dict | None = None
    for key, first in by_key[0].items():
        if key in bar_keys or first["w"] > _width(bar) / 3 or abs(first["y"] + first["h"] / 2 - bar_cy) > 60:
            continue
        track = [s.get(key) for s in by_key]
        if any(t is None for t in track):
            continue
        xs = [_cx(t) for t in track]
        if max(xs) - min(xs) <= 3:
            continue
        positions = []
        for x, want, value in zip(xs, expected, bmis):
            seg = bar[want]
            ok = seg["x"] - EDGE_TOL <= x <= seg["x"] + seg["w"] + EDGE_TOL
            got = next((i for i, s in enumerate(bar) if s["x"] - EDGE_TOL <= x <= s["x"] + s["w"] + EDGE_TOL), None)
            positions.append({"bmi": value, "expected": bmi.CATEGORIES[want],
                              "shown": bmi.CATEGORIES[got] if got is not None else "off the bar", "ok": ok})
        score = sum(p["ok"] for p in positions)
        if best is None or score > best["correct"] or (score == best["correct"] and first["w"] < best["w"]):
            best = {"key": key, "tag": first["tag"], "w": first["w"], "correct": score, "positions": positions}
    if not best:
        def near(i: dict) -> bool:
            return (not i["text"] and abs(i["y"] + i["h"] / 2 - bar_cy) <= 60
                    and i["x"] < bar[-1]["x"] + bar[-1]["w"] and i["x"] + i["w"] > bar[0]["x"])
        look = lambda i: (round(i["x"]), round(i["y"]), round(i["w"]), round(i["h"]), i["fill"], i.get("opacity"))
        states = [{k: look(i) for k, i in s.items() if near(i)} for s in by_key]
        if all(st == states[0] for st in states[1:]):
            return {"status": "static", "reason": "the scale looks identical for every BMI (no marker moves)",
                    "bmis": bmis}
        return {"status": "not_checkable", "reason": "scale restyles rather than moving a marker"}
    total = len(best["positions"])
    return {
        "status": "ok" if best["correct"] == total else "wrong",
        "correct": best["correct"],
        "total": total,
        "marker": f'{best["tag"]} ({best["key"]})',
        "positions": best["positions"],
    }
