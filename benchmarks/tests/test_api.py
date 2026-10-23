"""API smoke tests (no provider calls), on the baseline runs stored in data/runs."""
from fastapi.testclient import TestClient

from bench.main import app

client = TestClient(app)


def test_config_endpoint():
    body = client.get("/api/config").json()
    assert set(body["tasks"]) == {"bmi", "mortgage", "todo"}
    assert body["default_model"] == "claude-haiku-5.5"


def test_rejects_unknown_options():
    assert client.post("/api/runs", json={"models": ["nope"]}).status_code == 400
    assert client.post("/api/runs", json={"reps": 0}).status_code == 422


def test_pages_are_served():
    assert client.get("/index.html").status_code == 200
    assert client.get("/harness.html").status_code == 200
    assert client.get("/vendor/pico.classless.min.css").status_code == 200


def test_summary_reproduces_the_full_benchmark_scores():
    # Same attempts as the full benchmark's Summary page (ux-woz-full-benchmark, EXPERIMENTS.md round 6).
    rows = {r["model"]: round(r["score"]) for r in client.get("/api/summary").json()["rows"]}
    assert rows == {"gpt-6.1-sol-ultrafast": 76, "claude-haiku-5.5": 70, "gpt-6-luna-fast": 67}
