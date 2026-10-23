"""JSON-file storage: data/runs/<run_id>/run.json, attempts/<id>.json, shots/<id>.png."""

from __future__ import annotations

import json
from pathlib import Path

from .config import DATA_DIR

RUNS = DATA_DIR / "runs"


def run_dir(run_id: str) -> Path:
    return RUNS / run_id


def shot_path(run_id: str, attempt_id: str) -> Path:
    return run_dir(run_id) / "shots" / f"{attempt_id}.png"


def _write(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, indent=1, default=str))
    tmp.replace(path)


def save_run(run: dict) -> None:
    _write(run_dir(run["id"]) / "run.json", run)


def save_attempt(attempt: dict) -> None:
    _write(run_dir(attempt["run_id"]) / "attempts" / f"{attempt['id']}.json", attempt)


def load_run(run_id: str) -> dict | None:
    p = run_dir(run_id) / "run.json"
    return json.loads(p.read_text()) if p.exists() else None


def load_attempts(run_id: str) -> list[dict]:
    d = run_dir(run_id) / "attempts"
    if not d.exists():
        return []
    return [json.loads(p.read_text()) for p in sorted(d.glob("*.json"))]


def find_attempt(attempt_id: str) -> dict | None:
    for p in RUNS.glob(f"*/attempts/{attempt_id}.json"):
        return json.loads(p.read_text())
    return None


def list_runs() -> list[dict]:
    runs = [json.loads(p.read_text()) for p in RUNS.glob("*/run.json")]
    return sorted(runs, key=lambda r: r["created_at"], reverse=True)
