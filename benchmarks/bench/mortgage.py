"""Reference mortgage math (exact Decimal arithmetic) and checks on what a UI shows.

Conventions, stated in the task prompt: monthly compounding (rate / 12), level payments, rate 0 means
payment = P / n. The reference keeps full precision; a UI may round the payment to cents before
building totals and the table, so comparisons allow for both conventions (see TOL_*). The annual
table sums the 12 monthly rows of each year.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 40

DEFAULT_INPUT = {"price": 400_000, "down": 80_000, "rate": 6.5, "years": 30}

# Different principals, rates (on a 0.25 grid so sliders can reach them), terms, and a 0% edge case.
TEST_CASES = [
    {"price": 500_000, "down": 100_000, "rate": 5.0, "years": 30},
    {"price": 300_000, "down": 60_000, "rate": 7.25, "years": 15},
    {"price": 650_000, "down": 130_000, "rate": 6.75, "years": 20},
    {"price": 250_000, "down": 50_000, "rate": 0.0, "years": 10},  # 0%: payment = principal / n
]


@dataclass
class Schedule:
    principal: Decimal
    monthly: Decimal
    total_payment: Decimal
    total_interest: Decimal
    years: list[dict]  # per year: interest, principal, balance (end of year)


def schedule(price: float, down: float, rate: float, years: int) -> Schedule:
    p = Decimal(str(price)) - Decimal(str(down))
    n = years * 12
    r = Decimal(str(rate)) / 100 / 12
    m = p / n if r == 0 else p * r / (1 - (1 + r) ** -n)
    balance = p
    rows: list[dict] = []
    for y in range(years):
        yi = yp = Decimal(0)
        for _ in range(12):
            interest = balance * r
            principal = m - interest
            balance -= principal
            yi += interest
            yp += principal
        rows.append({"year": y + 1, "interest": yi, "principal": yp, "balance": max(balance, Decimal(0))})
    total = m * n
    return Schedule(p, m, total, total - p, rows)


def money(d: Decimal) -> str:
    return str(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# ---- reading numbers from rendered text ---------------------------------------------------------

_NUM = re.compile(r"(?<![\w.])\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?([kKmM])?(?![\w])")


def numbers(text: str) -> list[tuple[float, float]]:
    """Every number in the text as (value, display precision): "$2,022.62" -> (2022.62, 0.01),
    "$728K" -> (728000, 1000), "1.2M" -> (1200000, 100000)."""
    out = []
    for whole, frac, suffix in _NUM.findall(text):
        v = float(whole.replace(",", "") + (frac or ""))
        prec = 10 ** -(len(frac) - 1) if frac else 1.0
        mult = {"k": 1e3, "m": 1e6}.get((suffix or "").lower(), 1.0)
        out.append((v * mult, prec * mult))
    return out


def shows(text: str, expected: Decimal, tol: float) -> bool:
    """The text shows `expected`, allowing `tol` for rounding conventions and the display's own
    precision ("$728K" only has to be right to the nearest thousand). Abbreviated values need three
    significant digits, so an axis tick like "$1M" cannot stand in for $728,142. An expected 0 (the
    0% case) must appear as a money-formatted zero; a broken table elsewhere is caught by its own check."""
    e = float(expected)
    if e == 0:  # the 0% case: only a money-formatted zero counts ("$0", "$0.00", "0.00"), not any bare 0
        return re.search(r"(?<![\d.,])(\$\s?0(\.0+)?|0\.00)(?![\d.,])", text) is not None
    for v, prec in numbers(text):
        if prec > 1 and v / prec < 100:  # e.g. "$1M" (1 digit), "$12K" (2 digits)
            continue
        if abs(v - e) <= max(tol, prec / 2 + 1e-9):
            return True
    return False


# Monthly payment shown to the cent or the dollar; totals may be built from the rounded payment
# (n x 0.005 drift); yearly table sums drift by at most 12 x 0.005 plus display rounding.
TOL_MONTHLY = 0.51
TOL_PRINCIPAL = 0.51
TOL_YEAR = 1.5


def tol_total(years: int) -> float:
    return years * 12 * 0.005 + 0.51


def output_checks(text: str, case: dict) -> dict[str, bool]:
    s = schedule(**case)
    y1 = s.years[0]
    return {
        "principal": shows(text, s.principal, TOL_PRINCIPAL),
        "monthly_payment": shows(text, s.monthly, TOL_MONTHLY),
        "total_interest": shows(text, s.total_interest, tol_total(case["years"])),
        "total_payment": shows(text, s.total_payment, tol_total(case["years"])),
        "table_year1": all(shows(text, y1[k], TOL_YEAR) for k in ("interest", "principal", "balance")),
    }


CORE_OUTPUTS = ("principal", "monthly_payment", "total_interest", "total_payment")


def requirement_checklist(text: str) -> dict[str, bool]:
    """Labels and the default case's values, on the text the user can see."""
    t = text.lower()
    out = {
        "labels_inputs": all(re.search(p, t) for p in (r"price|home value|property", r"down", r"rate|interest", r"term|years?")),
        "labels_outputs": all(re.search(p, t) for p in (r"principal|loan amount", r"monthly", r"total interest", r"total[\w ]{0,15}(payment|cost|paid)")),
        "mentions_amortization": "amortization" in t or "amortisation" in t,
        "chart_legend_principal_interest": "principal" in t and "interest" in t,
    }
    checks = output_checks(text, DEFAULT_INPUT)
    out.update({f"default_{k}": v for k, v in checks.items()})
    return out


DEFAULT_KEYS = tuple(f"default_{k}" for k in CORE_OUTPUTS)
