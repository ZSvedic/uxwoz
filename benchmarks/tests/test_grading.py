"""Fail / Partial / Pass rules."""
from bench import bmi, grading, mortgage as mg, todo

GOOD_TEXT = "Height (cm) Weight (kg) BMI 22.9 Normal | Underweight Normal Overweight Obese"


def attempt(text=GOOD_TEXT, **kw):
    a = {"task": "bmi", "status": "ok", "parse": {"rendered": True}, "checklist": bmi.requirement_checklist(text),
         "interactive": {"passed": 4, "total": 4, "immediate": True}}
    a.update(kw)
    return a


def test_clean_output_passes():
    assert grading.grade(attempt())["grade"] == "pass"


def test_core_failures():
    assert grading.grade(attempt(parse={"rendered": False}))["grade"] == "fail"
    assert grading.grade(attempt(interactive={"passed": 0, "total": 4}))["grade"] == "fail"
    timeout = attempt(errors=[{"stage": "provider", "message": "TimeoutError: "}])
    assert grading.grade(timeout)["reason"] == "model did not finish within the time budget"


def test_defects_make_partial():
    g = grading.grade(attempt(interactive={"passed": 3, "total": 4, "immediate": True}))
    assert g["grade"] == "partial" and g["defects"] == ["1/4 typed-in BMI cases wrong"]
    g = grading.grade(attempt(interactive={"passed": 4, "total": 4, "immediate": True,
                                           "scale": {"status": "wrong", "positions": [{"bmi": "27.7", "ok": False}]}}))
    assert g["defects"] == ["scale marker in the wrong category at BMI 27.7"]


def test_mortgage():
    s = mg.schedule(**mg.DEFAULT_INPUT)
    y1 = s.years[0]
    text = (f"Property price Down payment Interest rate Term years Loan principal {s.principal:.2f} "
            f"Monthly payment {s.monthly:.2f} Total interest {s.total_interest:.2f} Total payment {s.total_payment:.2f} "
            f"Amortization Principal Interest {y1['interest']:.0f} {y1['principal']:.0f} {y1['balance']:.0f}")
    case = {"rate": 5.0, "years": 30, "pass": True, "table_rows_ok": True, "checks": {"table_year1": True}}
    live = {"task": "mortgage", "status": "ok", "parse": {"rendered": True}, "checklist": mg.requirement_checklist(text),
            "interactive": {"passed": 4, "total": 4, "immediate": True, "cases": [case] * 4, "chart": {"found": True, "updates": True}}}
    assert grading.grade(live)["grade"] == "pass"
    g = grading.grade({**live, "interactive": {**live["interactive"], "chart": {"found": True, "updates": False}}})
    assert g["grade"] == "partial" and g["defects"] == ["chart does not change with the inputs"]


def test_todo():
    live = {"task": "todo", "status": "ok", "parse": {"rendered": True},
            "checklist": todo.requirement_checklist("Buy milk Write report Call Alice New task All Active Done 2 items left"),
            "interactive": {"passed": 5, "total": 6, "cases": [{"step": "filter Done", "ok": False, "detail": ""}]}}
    g = grading.grade(live)
    assert g["grade"] == "partial" and g["defects"] == ["step failed: filter Done"]
    assert grading.grade({**live, "interactive": {"passed": 0, "total": 6, "cases": []}})["grade"] == "fail"
    assert todo.shows_count_left("Active (2)", 2) and todo.shows_count_left("2 items left", 2) and not todo.shows_count_left("12 items left", 2)
