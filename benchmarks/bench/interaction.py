"""Deterministic interaction tests: type reference inputs into a live UI and read what it shows."""

from __future__ import annotations

import re
import time

from dataclasses import dataclass

from playwright.async_api import Locator, Page

from . import bmi, mortgage, scale, todo


@dataclass
class UI:
    """The generated UI: the body of the harness's cross-origin sandbox iframe, which Playwright can
    still drive."""
    page: Page
    root: Locator


# Frame-agnostic: runs inside whichever document holds the UI.
CHART_SIGNATURE_JS = """root => {
  const els = [...root.querySelectorAll('svg, canvas')].filter(e => {
    const r = e.getBoundingClientRect(); return r.width >= 150 && r.height >= 80;
  });
  if (!els.length) return null;
  const el = els.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  let sig;
  if (el.tagName.toLowerCase() === 'canvas') {
    try { sig = el.toDataURL(); } catch { sig = String(el.width) + 'x' + el.height; }
  } else {
    const shapes = el.querySelectorAll('rect, path, line, polyline, polygon, circle');
    if (shapes.length < 4) return null;
    sig = [...shapes].map(s => ['d', 'x', 'y', 'width', 'height', 'points', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy']
      .map(k => s.getAttribute(k) || '').join(',')).join('|');
  }
  let h = 0; for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  return { kind: el.tagName.toLowerCase(), sig: String(h) };
}"""

VISIBLE_TEXT_JS = """root => [root.innerText, ...[...root.querySelectorAll('input, textarea, select')]
  .flatMap(e => [e.type === 'range' ? '' : e.value, e.placeholder || '', e.getAttribute('aria-label') || ''])]
  .filter(Boolean).join('\\n')"""

TABLE_ROWS_JS = """root => Math.max(0, ...[...root.querySelectorAll('table')]
  .map(t => t.tBodies.length ? [...t.tBodies].reduce((n, b) => n + b.rows.length, 0) : Math.max(0, t.rows.length - 1)))"""


def ui_for(page: Page) -> UI:
    return UI(page, page.frame_locator("#stage iframe >> nth=-1").locator("body"))


FORM_CONTROL_JS = "e => e.matches('input,textarea,select')"
MARK_JS = "(e, k) => { const used = e.dataset.benchField; if (!used) e.dataset.benchField = k; return !used || used === k }"


async def _find_input(ui: UI, pattern: str, key: str = ""):
    """A labelled form control (charts and other elements carry aria-labels too), preferring a
    typed field over a slider; an element already taken by another field is skipped."""
    stage = ui.root
    for how, matches in (("label", stage.get_by_label(re.compile(pattern, re.I))),
                         ("placeholder", stage.get_by_placeholder(re.compile(pattern, re.I)))):
        controls = [m for m in await matches.all() if await m.evaluate(FORM_CONTROL_JS)]
        typed = [c for c in controls if await c.evaluate("e => e.type !== 'range'")]
        for el in typed + [c for c in controls if c not in typed]:
            if await el.evaluate(MARK_JS, key or pattern):
                kind = "text" if el in typed else "range"
                return el, f"{how}:{kind}"
    return None, None


INPUT_SELECTOR = "input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([disabled]), textarea"


async def _poll_value(ui: UI, value: str, timeout_ms: int) -> tuple[str, bool]:
    """Read the stage text until the expected value shows up (tolerates debounced UIs)."""
    page, stage = ui.page, ui.root
    deadline = time.perf_counter() + timeout_ms / 1000
    while True:
        text = await stage.inner_text()
        if bmi.contains_number(text, value):
            await page.wait_for_timeout(100)  # let sibling bindings (badge, scale) settle
            return await stage.inner_text(), True
        if time.perf_counter() > deadline:
            return text, False
        await page.wait_for_timeout(100)


# Element boxes keyed by child-index path, for the scale-marker check (bench/scale.py). Runs inside
# the sandbox frame.
GEOMETRY_JS = """root => {
  const out = [];
  const clear = c => !c || c === 'none' || c === 'transparent' || /rgba\\(.*,\\s*0\\)$/.test(c);
  const walk = (el, key) => {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    const svgShape = el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg';
    const fill = svgShape ? st.fill : st.backgroundColor;
    if (r.width > 0 && r.height > 0 && st.visibility !== 'hidden')
      out.push({ key, tag: el.tagName.toLowerCase(), x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10,
        w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, fill: clear(fill) ? null : fill,
        opacity: Number(st.opacity),
        text: [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim().slice(0, 40) });
    [...el.children].forEach((c, i) => walk(c, key + '/' + i));
  };
  [...root.children].forEach((c, i) => walk(c, String(i)));
  return out;
}"""


async def _geometry(ui: UI) -> list[dict]:
    """Geometry once nothing has moved for two consecutive 80 ms samples (waits out transitions)."""
    sig = lambda g: [(i["key"], i["x"], i["y"], i["w"], i["h"]) for i in g]
    prev = await ui.root.evaluate(GEOMETRY_JS)
    deadline = time.perf_counter() + 1.5
    while time.perf_counter() < deadline:
        await ui.page.wait_for_timeout(80)
        nxt = await ui.root.evaluate(GEOMETRY_JS)
        if sig(nxt) == sig(prev):
            return nxt
        prev = nxt
    return prev


async def bmi_interaction_test(ui: UI) -> dict:
    """Type each reference case into the live UI and read what it shows.

    Value: the exact one-decimal BMI must appear. Category: because a scale legend shows
    every label at once, the expected label must occur more often for its own case than for
    any other case (a differential check that ignores static legend text).
    Trigger: what made the value appear - typing alone ("input"), leaving the field ("blur"),
    or a Calculate-style button ("button")."""
    h, h_how = await _find_input(ui, r"height|\bcm\b", "height")
    w, w_how = await _find_input(ui, r"weight|\bkg\b", "weight")
    total = len(bmi.TEST_CASES)
    if not h or not w:
        inputs = ui.root.locator(INPUT_SELECTOR)
        n = await inputs.count()
        if n >= 2 and not h and not w:
            h, w, h_how, w_how = inputs.nth(0), inputs.nth(1), "dom-order", "dom-order"
        else:
            return {"status": "fail", "reason": f"height/weight inputs not found ({n} inputs)", "passed": 0, "total": total}

    calc_button = ui.root.get_by_role("button", name=re.compile(r"calc|compute|update|check", re.I))
    has_button = await calc_button.count() > 0
    # Geometry at every BMI the UI shows correctly, for the scale-marker check.
    default_bmi = str(bmi.bmi(*bmi.DEFAULT_INPUT))
    snaps, snap_bmis = [], []
    if bmi.contains_number(await ui.root.inner_text(), default_bmi) and (g := await _geometry(ui)):
        snaps.append(g)
        snap_bmis.append(default_bmi)
    cases, texts = [], []
    for case in bmi.TEST_CASES:
        await h.fill(str(case["height"]))
        await w.fill(str(case["weight"]))
        text, found = await _poll_value(ui, case["bmi"], 1500)
        trigger = "input" if found else None
        if not found and await w.evaluate("e => e.type !== 'range'"):
            await w.press("Tab")
            text, found = await _poll_value(ui, case["bmi"], 1000)
            trigger = "blur" if found else None
        if not found and has_button:
            await calc_button.first.click()
            text, found = await _poll_value(ui, case["bmi"], 1000)
            trigger = "button" if found else None
        texts.append(text)
        cases.append({**case, "value_ok": found, "trigger": trigger})
        if found and (g := await _geometry(ui)):
            snaps.append(g)
            snap_bmis.append(case["bmi"])

    counts = [bmi.category_counts(t) for t in texts]
    for i, case in enumerate(cases):
        c = case["category"]
        others = [counts[j][c] for j in range(total) if j != i]
        case["category_ok"] = counts[i][c] > max(others)
        case["category_counts"] = counts[i]
        case["pass"] = case["value_ok"] and case["category_ok"]
    passed = sum(c["pass"] for c in cases)
    triggers = {c["trigger"] for c in cases if c["trigger"]}
    return {
        "status": "pass" if passed == total else ("partial" if passed else "fail"),
        "passed": passed,
        "total": total,
        # True only if every value that updated did so while typing; None if nothing ever updated.
        "immediate": (triggers == {"input"}) if triggers else None,
        "input_lookup": {"height": h_how, "weight": w_how},
        "cases": cases,
        "scale": scale.check(snaps, snap_bmis),
    }


# ---- mortgage ------------------------------------------------------------------------------------

MORTGAGE_FIELDS = {  # order = DOM-order fallback
    "price": r"price|home value|property|purchase",
    "down": r"down",
    "rate": r"rate|interest",
    "years": r"term|years?|length|duration",
}


async def _set_value(el: Locator, value: float) -> bool:
    """Set a field the way a user would: type into text/number fields, drag-equivalent fill on
    sliders, pick the matching option in a select."""
    kind = await el.evaluate("e => e.tagName.toLowerCase() === 'select' ? 'select' : (e.type || 'text')")
    text = f"{value:g}"
    if kind == "select":
        options = await el.evaluate("e => [...e.options].map(o => [o.value, o.textContent])")
        for val, label in options:
            if re.search(rf"(?<![\d.]){re.escape(text)}(?![\d])", f"{val} {label}"):
                await el.select_option(value=val)
                return True
        return False
    await el.fill(text)
    return True


async def _set_years_by_button(ui: UI, years: int) -> bool:
    """Terms are often a segmented control or radio group rather than a field."""
    stage = ui.root
    for role in ("radio", "button", "tab"):
        btn = stage.get_by_role(role, name=re.compile(rf"^\s*{years}(\s*(y|yr|yrs|years?))?\s*$", re.I))
        if await btn.count():
            await btn.first.click()
            return True
    return False


async def _poll_money(ui: UI, expected, tol: float, timeout_ms: int) -> tuple[str, bool]:
    page, stage = ui.page, ui.root
    deadline = time.perf_counter() + timeout_ms / 1000
    while True:
        text = await stage.inner_text()
        if mortgage.shows(text, expected, tol):
            await page.wait_for_timeout(150)  # let the chart and table catch up
            return await stage.inner_text(), True
        if time.perf_counter() > deadline:
            return text, False
        await page.wait_for_timeout(100)


async def mortgage_interaction_test(ui: UI) -> dict:
    """Set each reference case and check principal, monthly payment, totals, the year-1 table row
    (interest, principal, balance), the table's row count, and that the chart redraws."""
    total = len(mortgage.TEST_CASES)
    found: dict[str, tuple] = {}
    for name, pattern in MORTGAGE_FIELDS.items():
        el, how = await _find_input(ui, pattern, name)
        if el:
            found[name] = (el, how)
    if len(found) < 4:
        inputs = ui.root.locator(INPUT_SELECTOR + ", select")
        n = await inputs.count()
        if not found and n >= 4:
            found = {k: (inputs.nth(i), "dom-order") for i, k in enumerate(MORTGAGE_FIELDS)}
    missing = [k for k in MORTGAGE_FIELDS if k not in found]
    if missing and missing != ["years"]:
        return {"status": "fail", "reason": f"inputs not found: {', '.join(missing)}", "passed": 0, "total": total}

    calc_button = ui.root.get_by_role("button", name=re.compile(r"calc|compute|update", re.I))
    has_button = await calc_button.count() > 0
    chart_sigs, cases = [], []
    for case in mortgage.TEST_CASES:
        set_ok = True
        for name in ("price", "down", "rate"):
            set_ok &= await _set_value(found[name][0], case[name])
        if "years" in found:
            set_ok &= await _set_value(found["years"][0], case["years"])
        else:
            set_ok &= await _set_years_by_button(ui, case["years"])
        sched = mortgage.schedule(**case)
        text, ok = await _poll_money(ui, sched.monthly, mortgage.TOL_MONTHLY, 1500)
        trigger = "input" if ok else None
        if not ok:
            await ui.page.keyboard.press("Tab")
            text, ok = await _poll_money(ui, sched.monthly, mortgage.TOL_MONTHLY, 1000)
            trigger = "blur" if ok else None
        if not ok and has_button:
            await calc_button.first.click()
            text, ok = await _poll_money(ui, sched.monthly, mortgage.TOL_MONTHLY, 1000)
            trigger = "button" if ok else None
        checks = mortgage.output_checks(text, case)
        rows = await ui.root.evaluate(TABLE_ROWS_JS)
        chart = await ui.root.evaluate(CHART_SIGNATURE_JS)
        chart_sigs.append(chart and chart.get("sig"))
        cases.append({
            **case,
            "inputs_set": set_ok,
            "expected": {"principal": mortgage.money(sched.principal), "monthly": mortgage.money(sched.monthly),
                         "total_interest": mortgage.money(sched.total_interest),
                         "total_payment": mortgage.money(sched.total_payment)},
            "checks": checks,
            "table_rows": rows,
            "table_rows_ok": rows == case["years"],
            "trigger": trigger,
            "pass": all(checks[k] for k in mortgage.CORE_OUTPUTS),
        })
    chart_found = any(chart_sigs)
    passed = sum(c["pass"] for c in cases)
    triggers = {c["trigger"] for c in cases if c["trigger"]}
    return {
        "status": "pass" if passed == total else ("partial" if passed else "fail"),
        "passed": passed,
        "total": total,
        "immediate": (triggers == {"input"}) if triggers else None,
        "input_lookup": {k: v[1] for k, v in found.items()},
        "cases": cases,
        "chart": {"found": chart_found, "updates": chart_found and len({s for s in chart_sigs if s}) > 1},
    }


# ---- todo ----------------------------------------------------------------------------------------

async def _visible(ui: UI) -> str:
    await ui.page.wait_for_timeout(250)
    return await ui.root.inner_text()


def _row(ui: UI, name: str, control: str) -> Locator:
    """The innermost element holding the task's text and the given control (its checkbox or its
    delete button): the task's row, or the part of it that owns that control."""
    rows = ui.root.locator("li, tr, article, section, div, label, p").filter(has_text=name)
    return rows.filter(has=ui.page.locator(control)).last


async def _click_filter(ui: UI, name: str) -> bool:
    exact = re.compile(rf"^\W*{name}\W*(\(\d+\))?\W*$", re.I)
    for role in ("radio", "tab", "button", "link"):
        el = ui.root.get_by_role(role, name=exact)
        if await el.count():
            await el.first.click()
            return True
    for sel in await ui.root.locator("select").all():
        labels = await sel.evaluate("e => [...e.options].map(o => o.textContent.trim())")
        match = next((l for l in labels if exact.match(l)), None)
        if match:
            await sel.select_option(label=match)
            return True
    return False


async def todo_interaction_test(ui: UI) -> dict:
    """Six ordered steps on the live list; each passes when the visible text matches the expected
    state. Hidden (filtered-out) tasks are absent from innerText, so filters are checked directly."""
    names = [n for n, _ in todo.START]
    steps: list[dict] = []

    async def step(name: str, ok: bool, detail: str = "") -> None:
        steps.append({"step": name, "ok": bool(ok), "detail": detail})

    text = await _visible(ui)
    await step("initial: 3 tasks, 2 left", all(n in text for n in names) and todo.shows_count_left(text, 2))

    # Add: a labelled field (else the first text field), then an Add button (else Enter).
    field, _ = await _find_input(ui, r"new|task|todo|add", "new-task")
    if not field:
        field = ui.root.locator("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea").first
    try:
        await field.fill(todo.NEW_TASK)
        add = ui.root.get_by_role("button", name=re.compile(r"^\W*(\+\s*)?add\b", re.I))
        if await add.count():
            await add.first.click()
        else:
            await field.press("Enter")
        text = await _visible(ui)
        await step("add 'Pay rent': shown, 3 left", todo.NEW_TASK in text and todo.shows_count_left(text, 3))
    except Exception as e:
        await step("add 'Pay rent': shown, 3 left", False, f"{type(e).__name__}")

    # Toggle: the checkbox in Buy milk's row.
    try:
        box = _row(ui, "Buy milk", "input[type=checkbox], [role=checkbox]").locator("input[type=checkbox], [role=checkbox]").first
        await box.click()
        text = await _visible(ui)
        await step("mark 'Buy milk' done: 2 left", todo.shows_count_left(text, 2))
    except Exception as e:
        await step("mark 'Buy milk' done: 2 left", False, f"{type(e).__name__}")

    # Filters. Expected: Active = Call Alice, Pay rent; Done = Buy milk, Write report.
    for filt, show, hide in (("Active", ["Call Alice", todo.NEW_TASK], ["Buy milk", "Write report"]),
                             ("Done", ["Buy milk", "Write report"], ["Call Alice", todo.NEW_TASK])):
        try:
            clicked = await _click_filter(ui, filt)
            text = await _visible(ui)
            await step(f"filter {filt}", clicked and all(n in text for n in show) and not any(n in text for n in hide),
                       "" if clicked else "filter control not found")
        except Exception as e:
            await step(f"filter {filt}", False, f"{type(e).__name__}")

    # Delete Call Alice (from the All view): gone, 1 left (Pay rent).
    try:
        await _click_filter(ui, "All")
        row = _row(ui, "Call Alice", "button, [role=button]")
        btn = row.get_by_role("button", name=re.compile(r"delete|remove|×|✕|✖|🗑|\bx\b", re.I))
        await (btn.first if await btn.count() else row.get_by_role("button").last).click()
        text = await _visible(ui)
        await step("delete 'Call Alice': gone, 1 left", "Call Alice" not in text and todo.shows_count_left(text, 1))
    except Exception as e:
        await step("delete 'Call Alice': gone, 1 left", False, f"{type(e).__name__}")

    passed = sum(s["ok"] for s in steps)
    return {"status": "pass" if passed == len(steps) else ("partial" if passed else "fail"),
            "passed": passed, "total": len(steps), "cases": steps}


TESTS = {"bmi": bmi_interaction_test, "mortgage": mortgage_interaction_test, "todo": todo_interaction_test}
CASE_COUNT = {"bmi": len(bmi.TEST_CASES), "mortgage": len(mortgage.TEST_CASES), "todo": 6}


async def run(task: str, page: Page) -> dict:
    try:
        return await TESTS[task](ui_for(page))
    except Exception as e:  # e.g. a control that cannot be filled: the UI failed the test, the run did not
        return {"status": "fail", "reason": f"test could not drive the UI: {type(e).__name__}: {str(e)[:200]}",
                "passed": 0, "total": CASE_COUNT[task]}


async def capture_after(page: Page, a: dict, shot_path) -> None:
    """Screenshot the live UI as the interaction test left it (its last case)."""
    cases = (a.get("interactive") or {}).get("cases") or []
    if not cases:
        return
    await page.locator("#stage").screenshot(path=str(shot_path))
    last = cases[-1]
    a["after_inputs"] = {k: last[k] for k in ("height", "weight", "price", "down", "rate", "years") if k in last}
    a["screenshot_after"] = f"/api/shots/{a['run_id']}/{a['id']}-after.png"


async def watch_sandbox(page: Page, timeout_ms: int = 10_000) -> float | None:
    """Started when the content is complete. Returns the epoch ms of the last change to the sandbox
    frame's text before it stayed unchanged for 150 ms, i.e. when the UI finished rendering (the
    harness page cannot look inside a cross-origin frame). None if it never shows text."""
    body = page.frame_locator("#stage iframe >> nth=-1").locator("body")
    deadline = time.perf_counter() + timeout_ms / 1000
    last_text, last_change = None, None
    while time.perf_counter() < deadline:
        try:
            text = (await body.inner_text(timeout=200)).strip()
        except Exception:
            text = ""
        now = time.time() * 1000
        if text != last_text:
            last_text, last_change = text, now
        elif text and now - last_change >= 150:
            return last_change
        await page.wait_for_timeout(25)
    return last_change if last_text else None
