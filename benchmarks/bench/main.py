"""FastAPI app: benchmark API, the live relay for the harness, screenshots and the two web pages."""

from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from . import score, storage
from .config import DEFAULT_MODEL, FORMAT_LABEL, MODELS, TASKS, WEB_DIR, count_tokens, system_prompt
from .live import bus
from .runner import create_run, execute_run, run_lock, summarize, task_info

app = FastAPI(title="UX Woz UI generation benchmark (lite)")
_tasks: set[asyncio.Task] = set()


class RunRequest(BaseModel):
    models: list[str] = Field(default_factory=lambda: list(MODELS))
    reps: int = Field(3, ge=1, le=20)
    task: str = "bmi"
    seed: int | None = None


@app.get("/api/config")
def get_config():
    return {
        "format": FORMAT_LABEL,
        "default_model": DEFAULT_MODEL,
        "models": MODELS,
        "tasks": {k: task_info(k) for k in TASKS},
        "system_prompt": system_prompt(),
        "system_prompt_tokens": count_tokens(system_prompt()),
        "busy": run_lock.locked(),
    }


@app.post("/api/runs")
async def start_run(req: RunRequest):
    bad = [m for m in req.models if m not in MODELS]
    if bad or not req.models or req.task not in TASKS:
        raise HTTPException(400, f"unknown option(s): {bad or [req.task]}")
    if run_lock.locked():
        raise HTTPException(409, "a run is already in progress; one run at a time keeps latency measurements clean")
    run = create_run(req.models, req.reps, req.task, req.seed)
    t = asyncio.create_task(execute_run(run))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return run


@app.get("/api/runs")
def runs():
    return storage.list_runs()


@app.get("/api/runs/{run_id}")
def run_detail(run_id: str):
    run = storage.load_run(run_id)
    if not run:
        raise HTTPException(404)
    return {**run, "attempts": [summarize(a) for a in storage.load_attempts(run_id)]}


@app.get("/api/summary")
def summary():
    return score.summary()


@app.get("/api/attempts/{attempt_id}")
def attempt(attempt_id: str):
    a = storage.find_attempt(attempt_id)
    if not a:
        raise HTTPException(404)
    return a


@app.get("/api/live/{attempt_id}")
async def live(attempt_id: str):
    """Stream an attempt's chunks as they arrive (with replay from the start for late subscribers)."""

    async def gen():
        yield {"event": "ready", "data": "{}"}
        async for ev in bus.get(attempt_id).subscribe():
            yield {"data": json.dumps(ev)}

    return EventSourceResponse(gen(), ping=5)


@app.get("/api/shots/{run_id}/{name}")
def shot(run_id: str, name: str):
    path = storage.shot_path(run_id, name.removesuffix(".png"))
    if not path.exists() or path.parent.parent != storage.run_dir(run_id):
        raise HTTPException(404)
    return FileResponse(path)


@app.get("/")
def index():
    return RedirectResponse("/index.html")


app.mount("/", StaticFiles(directory=WEB_DIR), name="web")
