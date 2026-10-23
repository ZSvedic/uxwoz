"""Fail / Partial / Pass grade with a list of named defects. Every input is a deterministic check.

  fail     nothing rendered, the model ran out of time, or the core result is wrong in every case
  partial  core right, but at least one defect below (incl. a BMI scale marker in the wrong
           category, from bench/scale.py)
  pass     core right and no defects
"""

from __future__ import annotations

from . import bmi, mortgage

# Checklist items that are defects (not failures) when missing, per task.
DEFECT_TEXT = {
    "bmi": {
        "mentions_height": "no height label",
        "mentions_weight": "no weight label",
        "units_cm_kg": "cm/kg units missing",
        "names_all_four_categories": "not all four categories named",
    },
    "todo": {
        "new_task_input": "no add-task field",
        "filters_all_active_done": "All/Active/Done filters not all shown",
    },
    "mortgage": {
        "labels_inputs": "an input label is missing",
        "labels_outputs": "an output label is missing",
        "mentions_amortization": "no amortization chart/table title",
        "chart_legend_principal_interest": "principal/interest not labelled",
    },
}


def _bmi(a: dict, checklist: dict) -> tuple[str | None, list[str]]:
    """(failure reason or None, defects)"""
    default_ok = checklist.get(f"shows_default_bmi_{bmi.bmi(*bmi.DEFAULT_INPUT)}") and checklist.get("shows_default_category")
    defects = []
    i = a.get("interactive") or {}
    passed, total = i.get("passed", 0), i.get("total", len(bmi.TEST_CASES))
    if not passed:
        return f"BMI value or category wrong in all {total} typed-in cases", []
    if passed < total:
        defects.append(f"{total - passed}/{total} typed-in BMI cases wrong")
    if i.get("immediate") is False:
        defects.append("recalculates only on blur or a button")
    if not default_ok:
        defects.append("default 175/70 not shown as 22.9 Normal")
    sc = i.get("scale") or {}
    if sc.get("status") == "wrong":
        wrong = [p["bmi"] for p in sc["positions"] if not p["ok"]]
        defects.append(f"scale marker in the wrong category at BMI {', '.join(wrong)}")
    elif sc.get("status") == "static":
        defects.append("scale marker does not move with the BMI")
    return None, defects


def _mortgage(a: dict, checklist: dict) -> tuple[str | None, list[str]]:
    wrong_default = [k.removeprefix("default_") for k in mortgage.DEFAULT_KEYS if not checklist.get(k)]
    defects = []
    i = a.get("interactive") or {}
    passed, total = i.get("passed", 0), i.get("total", len(mortgage.TEST_CASES))
    if not passed:
        return f"principal, payment or totals wrong in all {total} input cases", []
    cases = i.get("cases") or []
    if passed < total:
        bad = [f"{c['rate']}%/{c['years']}y" for c in cases if not c["pass"]]
        defects.append(f"{total - passed}/{total} input cases wrong ({', '.join(bad)})")
    if wrong_default:
        defects.append(f"default case shows wrong or no {', '.join(wrong_default)}")
    if i.get("immediate") is False:
        defects.append("recalculates only on blur or a button")
    if n := sum(not c["checks"]["table_year1"] for c in cases):
        defects.append(f"year-1 table row wrong in {n}/{total} cases")
    if n := sum(not c["table_rows_ok"] for c in cases):
        defects.append(f"table row count differs from the term in {n}/{total} cases")
    chart = i.get("chart") or {}
    if not chart.get("found"):
        defects.append("no amortization chart found")
    elif not chart.get("updates"):
        defects.append("chart does not change with the inputs")
    return None, defects


def _todo(a: dict, checklist: dict) -> tuple[str | None, list[str]]:
    i = a.get("interactive") or {}
    if not i.get("passed"):
        return f"no step of the todo test worked ({i.get('reason') or 'all ' + str(i.get('total', 6)) + ' failed'})", []
    return None, [f"step failed: {c['step']}" + (f" ({c['detail']})" if c.get("detail") else "")
                  for c in i.get("cases", []) if not c["ok"]]


def grade(a: dict) -> dict:
    task = a.get("task", "bmi")
    if any("TimeoutError" in e.get("message", "") for e in a.get("errors", []) if e.get("stage") == "provider"):
        return {"grade": "fail", "reason": "model did not finish within the time budget", "defects": []}
    if a.get("status") != "ok" or not (a.get("parse") or {}).get("rendered"):
        return {"grade": "fail", "reason": "did not complete and render", "defects": []}
    checklist = a.get("checklist") or {}
    reason, defects = {"bmi": _bmi, "mortgage": _mortgage, "todo": _todo}[task](a, checklist)
    if reason:
        return {"grade": "fail", "reason": reason, "defects": []}
    defects += [text for key, text in DEFECT_TEXT[task].items() if not checklist.get(key, False)]
    return {"grade": "partial" if defects else "pass", "reason": None, "defects": defects}
