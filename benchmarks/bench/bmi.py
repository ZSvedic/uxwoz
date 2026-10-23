"""Deterministic BMI reference values and output checks."""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal

CATEGORIES = ["underweight", "normal", "overweight", "obese"]
CATEGORY_RE = {
    # Scale legends often shorten to "Under" / "Over".
    "underweight": re.compile(r"under\s*weight|\bunder\b", re.I),
    "normal": re.compile(r"\bnormal\b|healthy", re.I),
    "overweight": re.compile(r"over\s*weight|\bover\b", re.I),
    "obese": re.compile(r"\bobes(e|ity)\b", re.I),
}

DEFAULT_INPUT = (175, 70)  # matches the task prompt


def bmi(height_cm: float, weight_kg: float) -> Decimal:
    m = Decimal(str(height_cm)) / 100
    return (Decimal(str(weight_kg)) / (m * m)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def category(value: Decimal) -> str:
    if value < Decimal("18.5"):
        return "underweight"
    if value < 25:
        return "normal"
    if value < 30:
        return "overweight"
    return "obese"


# One case per category, none sitting on a .x5 rounding boundary.
TEST_CASES = [
    {"height": 160, "weight": 45},   # 17.578 -> 17.6 underweight
    {"height": 180, "weight": 75},   # 23.148 -> 23.1 normal
    {"height": 170, "weight": 80},   # 27.682 -> 27.7 overweight
    {"height": 165, "weight": 95},   # 34.894 -> 34.9 obese
]
for _c in TEST_CASES:
    _c["bmi"] = str(bmi(_c["height"], _c["weight"]))
    _c["category"] = category(Decimal(_c["bmi"]))


def contains_number(text: str, value: str) -> bool:
    return re.search(rf"(?<![\d.]){re.escape(value)}(?![\d])", text) is not None


def category_counts(text: str) -> dict[str, int]:
    # "Overweight"/"Underweight" contain "weight" but not "normal"; count each pattern independently.
    return {c: len(rx.findall(text)) for c, rx in CATEGORY_RE.items()}


def _names_category_most(text: str, cat: str) -> bool:
    counts = category_counts(text)
    return counts[cat] > 0 and counts[cat] >= max(counts.values())


def requirement_checklist(text: str) -> dict[str, bool]:
    """Checks on the text the UI shows (its text plus control values and labels). Word presence only:
    whether the inputs work is the interaction test's job, and the scale has its own geometry check."""
    default_bmi = str(bmi(*DEFAULT_INPUT))
    return {
        # \b keeps "Overweight"/"Underweight" from counting as a weight label.
        "mentions_height": bool(re.search(r"\bheight\b", text, re.I)),
        "mentions_weight": bool(re.search(r"\bweight\b", text, re.I)),
        # Units may touch the number ("175cm"); "kg/m²" is the BMI unit, not a weight unit.
        "units_cm_kg": bool(re.search(r"(?<![a-z])cm\b", text, re.I)) and bool(re.search(r"(?<![a-z])kg\b(?!\s*/)", text, re.I)),
        f"shows_default_bmi_{default_bmi}": contains_number(text, default_bmi),
        # The current category must be named, and no other category more often (a wrong badge next
        # to a legend makes that category outnumber it).
        "shows_default_category": _names_category_most(text, category(bmi(*DEFAULT_INPUT))),
        "names_all_four_categories": all(v > 0 for v in category_counts(text).values()),
    }
