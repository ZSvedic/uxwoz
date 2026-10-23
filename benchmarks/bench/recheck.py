"""Re-derive screenshots, checks and grades for a stored run from its stored outputs.

No model is called. Timings and usage stay as measured; what depends on the final render
(screenshot, checklist, the interaction test with its scale-marker check, grade) is recomputed
with the current code. Use it after changing a check:

    uv run python -m bench.recheck <run_id>      (the server must be running)
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone

from playwright.async_api import async_playwright

from . import grading, interaction, storage
from .config import HARNESS_ORIGIN
from .runner import TASK_CHECKS, VIEWPORT, code_version


async def recheck(run_id: str) -> None:
    version = code_version()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for a in storage.load_attempts(run_id):
            if not a.get("harness"):
                continue  # never rendered (provider/harness error): nothing to re-derive
            ctx = await browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
            page = await ctx.new_page()
            await page.goto(f"{HARNESS_ORIGIN}/harness.html?attempt={a['id']}&mode=static")
            await page.wait_for_function("window.__harness && window.__harness.done === true", timeout=30_000)
            ready = await interaction.watch_sandbox(page)
            a.setdefault("parse", {})["rendered"] = bool(ready)
            text = await interaction.ui_for(page).root.evaluate(interaction.VISIBLE_TEXT_JS) if ready else ""
            await page.locator("#stage").screenshot(path=str(storage.shot_path(run_id, a["id"])))
            if ready:
                a["interactive"] = await interaction.run(a["task"], page)  # after the screenshot: it types
                await interaction.capture_after(page, a, storage.shot_path(run_id, a["id"] + "-after"))
            await ctx.close()

            a["harness"]["visibleText"] = text
            a["checklist"] = TASK_CHECKS[a["task"]](text)
            a["grade"] = grading.grade(a)
            a["recheck"] = {"at": datetime.now(timezone.utc).isoformat(), "code_version": version}
            storage.save_attempt(a)
            print(a["model"], a["rep"], a["grade"]["grade"], a["grade"]["defects"] or a["grade"]["reason"] or "")
        await browser.close()
    run = storage.load_run(run_id)
    run["recheck"] = {"at": datetime.now(timezone.utc).isoformat(), "code_version": version}
    storage.save_run(run)


if __name__ == "__main__":
    asyncio.run(recheck(sys.argv[1]))
