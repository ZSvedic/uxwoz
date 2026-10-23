"""Mortgage reference math against independently known values, and number reading."""
from decimal import Decimal

from bench import mortgage as mg


def test_textbook_payment():
    # $200,000 at 6% for 30 years: the standard $1,199.10 payment.
    assert mg.money(mg.schedule(200_000, 0, 6.0, 30).monthly) == "1199.10"
    # $100,000 at 5% for 15 years: $790.79.
    assert mg.money(mg.schedule(100_000, 0, 5.0, 15).monthly) == "790.79"


def test_default_case():
    s = mg.schedule(**mg.DEFAULT_INPUT)
    assert s.principal == Decimal(320_000)
    assert mg.money(s.monthly) == "2022.62"
    assert abs(s.total_payment - s.monthly * 360) < Decimal("1e-20")
    assert s.years[-1]["balance"] < Decimal("0.0001")
    assert abs(sum(y["principal"] for y in s.years) - s.principal) < Decimal("0.0001")
    assert abs(sum(y["interest"] for y in s.years) - s.total_interest) < Decimal("0.0001")


def test_zero_rate():
    s = mg.schedule(250_000, 50_000, 0.0, 10)
    assert mg.money(s.monthly) == "1666.67" and s.total_interest == 0


def test_number_reading():
    assert mg.numbers("Monthly $2,022.62 · total $728K · 1.2M") == [(2022.62, 0.01), (728000.0, 1000.0), (1200000.0, 100000.0)]
    m = mg.schedule(**mg.DEFAULT_INPUT).monthly
    assert mg.shows("Payment: $2,023", m, mg.TOL_MONTHLY)
    assert not mg.shows("Payment: $2,025", m, mg.TOL_MONTHLY)
    assert mg.shows("Total $728K", mg.schedule(**mg.DEFAULT_INPUT).total_payment, 1.0)


def test_checklist_on_a_correct_page():
    s = mg.schedule(**mg.DEFAULT_INPUT)
    y1 = s.years[0]
    page = (f"Property price 400,000 Down payment 80,000 Interest rate 6.5% Term 30 years "
            f"Loan principal ${s.principal:,.2f} Monthly payment ${s.monthly:,.2f} "
            f"Total interest ${s.total_interest:,.2f} Total payment ${s.total_payment:,.2f} "
            f"Amortization chart: Principal Interest  Year 1 {y1['principal']:,.0f} {y1['interest']:,.0f} {y1['balance']:,.0f}")
    c = mg.requirement_checklist(page)
    assert all(c.values()), {k: v for k, v in c.items() if not v}


def test_loose_matches_rejected():
    total = mg.schedule(**mg.DEFAULT_INPUT).total_payment
    assert not mg.shows("Max price $1M", total, 1.0)
    assert mg.shows("Total $728K", total, 1.0)
    assert not mg.shows("Year 1 | $NaN | 0", Decimal(0), mg.TOL_YEAR)
    assert mg.shows("Total interest $0.00 · table: Year 1 $NaN", Decimal(0), 1.0)


def test_output_label_variants():
    assert mg.requirement_checklist("Loan amount Monthly payment Total interest Total loan payments")["labels_outputs"]
