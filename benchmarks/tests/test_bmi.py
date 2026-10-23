"""Deterministic BMI reference math and checks."""
from decimal import Decimal

from bench import bmi


def test_reference_values():
    assert str(bmi.bmi(175, 70)) == "22.9"
    assert [(c["bmi"], c["category"]) for c in bmi.TEST_CASES] == [
        ("17.6", "underweight"), ("23.1", "normal"), ("27.7", "overweight"), ("34.9", "obese")]


def test_category_boundaries():
    assert bmi.category(Decimal("18.4")) == "underweight"
    assert bmi.category(Decimal("18.5")) == "normal"
    assert bmi.category(Decimal("24.9")) == "normal"
    assert bmi.category(Decimal("25.0")) == "overweight"
    assert bmi.category(Decimal("30.0")) == "obese"


def test_contains_number_is_exact():
    assert bmi.contains_number("BMI 23.1 Normal", "23.1")
    assert not bmi.contains_number("BMI 123.1", "23.1")
    assert not bmi.contains_number("BMI 23.15", "23.1")


def test_category_counts_do_not_overlap():
    c = bmi.category_counts("Underweight · Normal · Overweight · Obese — you are Normal weight")
    assert c == {"underweight": 1, "normal": 2, "overweight": 1, "obese": 1}
    assert bmi.category_counts("Under | Normal | Over | Obesity")["overweight"] == 1


def test_checklist():
    ok = bmi.requirement_checklist("Height (cm) Weight (kg) BMI 22.9 Normal | Underweight Normal Overweight Obese")
    assert all(ok.values())
    assert not bmi.requirement_checklist("Height Weight")["names_all_four_categories"]


def test_checklist_has_no_trivial_passes():
    c = bmi.requirement_checklist("BMI Calculator: Underweight Overweight, 22.9 kg/m²")
    assert not c["mentions_weight"]
    assert not c["units_cm_kg"]
    assert bmi.requirement_checklist("175cm 70kg")["units_cm_kg"]


def test_default_category_must_outnumber_the_legend():
    shown = lambda text: bmi.requirement_checklist(text)["shows_default_category"]
    c = bmi.requirement_checklist("Height (cm) Weight (kg) Your BMI 22.9 Normal")
    assert c["shows_default_category"] and not c["names_all_four_categories"]
    assert not shown("Height (cm) Weight (kg) 22.9 Obese")
    legend = "Height (cm) Weight (kg) 22.9 | Underweight Normal Overweight Obese"
    assert shown(legend + ": you are Normal")
    assert not shown(legend + ": you are Obese")
    # Result says Normal, legend lists only the other three.
    assert shown("Height (cm) Weight (kg) BMI 22.9 Category Normal | Under Over Obese")
