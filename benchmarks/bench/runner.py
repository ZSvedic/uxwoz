"""Benchmark orchestration: shuffled attempts, provider streaming, headless rendering, checks."""

from __future__ import annotations

import asyncio
import hashlib
import random
import time
import traceback
import uuid
from datetime import datetime, timezone

import httpx
from playwright.async_api import Browser, async_playwright

from . import bmi, grading, interaction, mortgage, storage, todo
from .config import (CONCURRENCY, FORMAT, HARNESS_ORIGIN, MODELS, PROMPTS, REQUEST_TIMEOUT_S, TASKS, WARMUP_MAX_TOKENS,
                     WEB_DIR, count_tokens, system_prompt, task_prompt)
from .live import bus
from .providers import now_ms, stream

run_lock = asyncio.Lock()
TASK_CHECKS = {"bmi": bmi.requirement_checklist, "mortgage": mortgage.requirement_checklist,
               "todo": todo.requirement_checklist}
VIEWPORT = {"width": 960, "height": 900}


def new_id(prefix: str) -> str:
    return f"{prefix}{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"


def code_version() -> str:
    """Hash of the benchmark code, prompts and harness page, so runs measured by different code can be told apart."""
    h = hashlib.sha1()
    files = sorted(PROMPTS.parent.glob("*.py")) + sorted(PROMPTS.glob("*.txt")) + [WEB_DIR / "harness.html"]
    for p in files:
        if p.exists():
            h.update(p.name.encode())
            h.update(p.read_bytes())
    return h.hexdigest()[:12]


def create_run(models: list[str], reps: int, task: str, seed: int | None) -> dict:
    seed = seed if seed is not None else random.randrange(1_000_000)
    plan = [(m, r) for r in range(1, reps + 1) for m in models]
    random.Random(seed).shuffle(plan)
    run = {
        "id": new_id("run-"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "code_version": code_version(),
        "status": "queued",
        "task": task,
        "concurrency": CONCURRENCY,
        "request_budget_s": REQUEST_TIMEOUT_S,
        "formats": [FORMAT],
        "models": models,
        "reps": reps,
        "seed": seed,
        "order": [{"format": FORMAT, "model": m, "rep": r} for m, r in plan],
        "attempt_ids": [],
        "settings": {m: {k: MODELS[m].get(k) for k in ("model", "provider", "provider_order", "service_tier",
                                                       "reasoning_request", "reasoning_note", "cost_source")}
                     for m in models},
        "prompt_tokens": {FORMAT: count_tokens(system_prompt())},
        "task_tokens": count_tokens(task_prompt(task)),
    }
    storage.save_run(run)
    return run


async def execute_run(run: dict) -> None:
    async with run_lock:
        run["status"] = "running"
        run["started_at"] = datetime.now(timezone.utc).isoformat()
        storage.save_run(run)
        chan = bus.get(f"run:{run['id']}")
        await chan.publish({"type": "status", "status": "running"})
        try:
            async with async_playwright() as pw, httpx.AsyncClient(http2=False) as client:
                run["warmups"] = list(await asyncio.gather(*(warm_up(client, run, m) for m in run["models"])))
                storage.save_run(run)
                browser = await pw.chromium.launch()
                slots = asyncio.Semaphore(CONCURRENCY)

                async def one(i: int, item: dict) -> None:
                    async with slots:  # attempts start in the shuffled order, CONCURRENCY at a time
                        attempt = await run_attempt(browser, client, run, item)
                    run["attempt_ids"].append(attempt["id"])
                    storage.save_run(run)
                    await chan.publish({"type": "attempt", "index": i})

                await asyncio.gather(*(one(i, item) for i, item in enumerate(run["order"])))
                await browser.close()
            run["status"] = "done"
        except Exception as e:  # keep partial results; surface the orchestration failure
            run["status"] = "failed"
            run["error"] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        run["finished_at"] = datetime.now(timezone.utc).isoformat()
        storage.save_run(run)
        await chan.publish({"type": "status", "status": run["status"]}, close=True)


async def warm_up(client: httpx.AsyncClient, run: dict, model_key: str) -> dict:
    """One unmeasured, short request with the exact measured prompts, to populate prefix caches."""
    out: dict = {"model": model_key}
    t0 = now_ms()
    try:
        # Overall deadline: keep-alive comments reset httpx's per-read timeout, so a stalled
        # upstream would otherwise hang forever.
        async with asyncio.timeout(60):
            async for ev in stream(client, model_key, system_prompt(), task_prompt(run["task"]), max_tokens=WARMUP_MAX_TOKENS):
                if ev["type"] == "final":
                    out.update({k: ev.get(k) for k in ("input_tokens", "cached_input_tokens", "output_tokens", "cost_usd")})
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {e}"
    out["ms"] = round(now_ms() - t0)
    return out


def summarize(a: dict) -> dict:
    """The attempt without the bulky chunk log and source."""
    return {k: v for k, v in a.items() if k not in ("chunks", "reasoning_text", "source")}


async def run_attempt(browser: Browser, client: httpx.AsyncClient, run: dict, item: dict) -> dict:
    model_key = item["model"]
    a: dict = {
        "id": new_id("att-"),
        "run_id": run["id"],
        "format": FORMAT,
        "model": model_key,
        "rep": item["rep"],
        "task": run["task"],
        "status": "running",
        "requested": {
            "model": MODELS[model_key]["model"],
            "provider_order": MODELS[model_key].get("provider_order"),
            "service_tier": MODELS[model_key].get("service_tier"),
            "reasoning": MODELS[model_key]["reasoning_request"],
        },
        "timings": {},
        "errors": [],
    }
    sys_prompt, user_prompt = system_prompt(), task_prompt(run["task"])
    a["system_prompt_tokens"] = count_tokens(sys_prompt)

    chan = bus.get(a["id"])
    ctx = await browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
    page = await ctx.new_page()
    page.on("console", lambda m: m.type == "error" and a["errors"].append({"stage": "browser-console", "message": m.text[:500]}))
    page.on("pageerror", lambda e: a["errors"].append({"stage": "browser-pageerror", "message": str(e)[:500]}))
    source, reasoning, chunks = [], [], []
    try:
        await page.goto(f"{HARNESS_ORIGIN}/harness.html?attempt={a['id']}&mode=live")
        await page.wait_for_function("window.__harness && window.__harness.ready === true", timeout=20_000)

        final: dict = {}
        ended = False
        sandbox_watch = None  # watches the sandbox frame from content complete
        t0 = now_ms()
        a["timings"]["request_start_epoch_ms"] = t0
        await chan.publish({"type": "start", "t": t0})
        try:
            async with asyncio.timeout(REQUEST_TIMEOUT_S):  # overall deadline (see warm_up)
                async for ev in stream(client, model_key, sys_prompt, user_prompt):
                    kind = ev["type"]
                    if kind == "first_byte":
                        a["timings"]["first_byte_ms"] = ev["t"] - t0
                    elif kind == "reasoning":
                        a["timings"].setdefault("first_reasoning_ms", ev["t"] - t0)
                        reasoning.append(ev["text"])
                    elif kind == "content":
                        a["timings"].setdefault("first_token_ms", ev["t"] - t0)
                        source.append(ev["text"])
                        chunks.append([round(ev["t"] - t0, 1), ev["text"]])
                        await chan.publish({"type": "chunk", "t": ev["t"], "text": ev["text"]})
                    elif kind == "content_done" and not ended:
                        # The UI is complete now; don't make the renderer wait for the usage trailer.
                        a["timings"]["content_complete_ms"] = ev["t"] - t0
                        await chan.publish({"type": "end", "t": ev["t"]}, close=True)
                        ended = True
                        sandbox_watch = asyncio.create_task(interaction.watch_sandbox(page))
                    elif kind == "final":
                        final = ev
            a["timings"]["generation_complete_ms"] = final.get("t", now_ms()) - t0
            if not ended:
                a["timings"]["content_complete_ms"] = a["timings"]["generation_complete_ms"]
                await chan.publish({"type": "end", "t": now_ms()}, close=True)
                sandbox_watch = asyncio.create_task(interaction.watch_sandbox(page))
        except Exception as e:  # provider HTTP/stream errors and malformed events; keep what streamed
            a["timings"]["generation_complete_ms"] = now_ms() - t0
            a["timings"].setdefault("content_complete_ms", a["timings"]["generation_complete_ms"])
            a["errors"].append({"stage": "provider", "message": f"{type(e).__name__}: {e}",
                                "detail": getattr(e, "detail", None)})
            await chan.publish({"type": "error", "t": now_ms(), "message": str(e)}, close=True)

        a["actual"] = {
            "model": final.get("served_model"),
            "provider": final.get("served_provider"),
            "service_tier": final.get("served_service_tier"),
            # OpenAI echoes its reasoning config; OpenRouter does not report one.
            "reasoning": final.get("served_reasoning"),
            "finish_reason": final.get("finish_reason"),
        }
        a["model_substituted"] = bool(a["actual"]["model"]) and not _same_model(a["requested"]["model"], a["actual"]["model"])
        a["tier_substituted"] = bool(a["requested"]["service_tier"]) and a["actual"]["service_tier"] != a["requested"]["service_tier"]
        a["usage"] = {k: final.get(k) for k in ("input_tokens", "cached_input_tokens", "cache_write_tokens",
                                                "output_tokens", "reasoning_tokens")}
        a["usage_raw"] = final.get("usage_raw")
        a["cost_usd"] = final.get("cost_usd")
        a["cost_source"] = MODELS[model_key]["cost_source"]
        gen_ms = a["timings"]["content_complete_ms"] - a["timings"].get("first_token_ms", 0)
        if a["usage"]["output_tokens"] and gen_ms > 0:
            visible = a["usage"]["output_tokens"] - (a["usage"]["reasoning_tokens"] or 0)
            a["output_tokens_per_s"] = round(visible / (gen_ms / 1000), 1)

        await page.wait_for_function("window.__harness.done === true", timeout=60_000)
        m = await page.evaluate("window.__harness.metrics")
        # The UI lives in a cross-origin sandbox frame: fully rendered is when its text settled.
        ready = await sandbox_watch if sandbox_watch else None
        m["rendered"] = bool(ready) and bool(m.get("rendered"))
        if ready:
            m["fullyRenderedAt"] = ready
            m["visibleText"] = await interaction.ui_for(page).root.evaluate(interaction.VISIBLE_TEXT_JS)
        a["harness"] = m
        for key, name in (("firstVisibleAt", "first_visible_ui_ms"), ("fullyRenderedAt", "fully_rendered_ms"),
                          ("firstChunkAt", "harness_first_chunk_ms")):
            if m.get(key):
                a["timings"][name] = m[key] - t0
        if "harness_first_chunk_ms" in a["timings"] and "first_token_ms" in a["timings"]:
            a["timings"]["relay_latency_ms"] = a["timings"]["harness_first_chunk_ms"] - a["timings"]["first_token_ms"]

        shot = storage.shot_path(run["id"], a["id"])
        shot.parent.mkdir(parents=True, exist_ok=True)
        await page.locator("#stage").screenshot(path=str(shot))
        a["screenshot"] = f"/api/shots/{run['id']}/{a['id']}.png"

        a["parse"] = {"rendered": bool(m.get("rendered")), "fenced": m.get("fenced", False)}
        # Text the user can see: the sandbox frame's text plus control values, placeholders and labels.
        a["checklist"] = TASK_CHECKS[run["task"]](m.get("visibleText") or "")

        t_test = time.perf_counter()
        a["interactive"] = await interaction.run(run["task"], page) if a["parse"]["rendered"] else {
            "status": "fail", "reason": "nothing rendered", "passed": 0, "total": interaction.CASE_COUNT[run["task"]]}
        a["interactive"]["duration_ms"] = round((time.perf_counter() - t_test) * 1000)
        await interaction.capture_after(page, a, storage.shot_path(run["id"], a["id"] + "-after"))

        a["status"] = "error" if any(e["stage"] == "provider" for e in a["errors"]) else "ok"
    except Exception as e:
        a["status"] = "error"
        a["errors"].append({"stage": "harness", "message": f"{type(e).__name__}: {e}"})
        await chan.publish({"type": "error", "t": now_ms(), "message": str(e)}, close=True)
    finally:
        await ctx.close()
    a.setdefault("source", "".join(source))
    a.setdefault("reasoning_text", "".join(reasoning))
    a.setdefault("chunks", chunks)
    a["grade"] = grading.grade(a)
    storage.save_attempt(a)
    return a


def _same_model(requested: str, served: str) -> bool:
    # Providers append date/version suffixes (e.g. "gpt-6.1-sol-2026-09-29"); anything else is a substitution.
    return served == requested or served.startswith(requested + "-")


def task_info(task: str) -> dict:
    return {"id": task, **TASKS[task], "prompt": task_prompt(task), "tokens": count_tokens(task_prompt(task))}
