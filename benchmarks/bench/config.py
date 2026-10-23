"""Benchmark settings: the three models, the HTML + Pico system prompt, the three tasks.

Every model setting was verified against the live APIs on 2026-10-22 (see ../spec/ui-generation.md).
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import tiktoken
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]  # benchmarks/
PROMPTS = Path(__file__).resolve().parent / "prompts"
DATA_DIR = Path(os.environ.get("BENCH_DATA", ROOT / "data"))
WEB_DIR = ROOT / "web"

load_dotenv(ROOT.parent / ".env")  # the uxwoz repo's .env

# The headless browser loads the harness page from this server.
HARNESS_ORIGIN = os.environ.get("BENCH_HARNESS_ORIGIN", "http://127.0.0.1:8100")
MAX_OUTPUT_TOKENS = int(os.environ.get("BENCH_MAX_OUTPUT_TOKENS", "8000"))
# A screen that takes longer than this is useless for screen-by-screen generation: stopped, graded Fail.
REQUEST_TIMEOUT_S = float(os.environ.get("BENCH_REQUEST_TIMEOUT_S", "20"))
# Attempts at once. Requests are network-bound; 6 headless pages render without contention on a laptop.
CONCURRENCY = int(os.environ.get("BENCH_CONCURRENCY", "6"))
# Before the measured attempts, one short unmeasured request per model populates the provider's
# prompt cache, as a screen-by-screen generator reusing its system prompt would.
WARMUP_MAX_TOKENS = 32

FORMAT = "html_pico"  # the only format; stored on every attempt for compatibility with the full benchmark
FORMAT_LABEL = "HTML + vanilla JS + Pico.css"
DEFAULT_MODEL = "claude-haiku-5.5"

MODELS: dict[str, dict] = {
    "claude-haiku-5.5": {
        "label": "Claude Haiku 5.5",
        "provider": "openrouter",
        "model": "anthropic/claude-haiku-5.5",
        "provider_order": ["anthropic"],
        "reasoning_request": {"enabled": False},
        "reasoning_label": "disabled",
        "reasoning_note": "OpenRouter pinned to Anthropic, no fallbacks; extended thinking off (reasoning.enabled=false).",
        "cost_source": "OpenRouter usage.cost (billed)",
    },
    "gpt-6-luna-fast": {
        "label": "GPT-6 Luna (fast tier)",
        "provider": "openai",
        "model": "gpt-6-luna",
        "service_tier": "fast",
        "reasoning_request": {"effort": "none"},
        "reasoning_label": "none",
        "reasoning_note": "Responses API, service_tier='fast' (Luna rejects 'ultrafast'); reasoning effort 'none'.",
        # USD per 1M tokens: standard $0.10/$0.01/$0.50; the fast tier is reported as 2x by third-party
        # guides (not confirmed on OpenAI's pricing page), so costs are estimates.
        "price_per_mtok": {"input": 0.20, "cached_input": 0.02, "output": 1.00},
        "cost_source": "Estimated: tokens x fast-tier price (2x standard, unconfirmed)",
    },
    "gpt-6.1-sol-ultrafast": {
        "label": "GPT-6.1 Sol Ultrafast",
        "provider": "openai",
        "model": "gpt-6.1-sol",
        "service_tier": "ultrafast",
        "reasoning_request": {"effort": "low"},
        "reasoning_label": "low",
        "reasoning_note": "Responses API only ('ultrafast' is rejected by Chat Completions); 'none' and 'minimal' rejected, so 'low'.",
        # USD per 1M tokens. Not returned by the API: Ultrafast = 6x the $2/$0.10/$10 standard rate per public reports.
        "price_per_mtok": {"input": 12.0, "cached_input": 0.60, "output": 60.0},
        "cost_source": "Estimated: tokens x Ultrafast price table (6x standard)",
    },
}

TASKS: dict[str, dict] = {
    "bmi": {"label": "BMI calculator", "prompt_file": "task_bmi.txt"},
    "mortgage": {"label": "Mortgage calculator", "prompt_file": "task_mortgage.txt"},
    "todo": {"label": "Todo list", "prompt_file": "task_todo.txt"},
}


@lru_cache
def _enc():
    return tiktoken.get_encoding("o200k_base")


def count_tokens(text: str) -> int:
    """o200k_base token count: a provider-neutral yardstick for prompt size."""
    return len(_enc().encode(text))


@lru_cache
def system_prompt() -> str:
    return (PROMPTS / "system.txt").read_text()


@lru_cache
def task_prompt(task: str) -> str:
    return (PROMPTS / TASKS[task]["prompt_file"]).read_text()


def api_key(provider: str) -> str:
    name = {"openrouter": "OPENROUTER_API_KEY", "openai": "OPENAI_API_KEY"}[provider]
    key = os.environ.get(name)
    if not key:
        raise RuntimeError(f"{name} is not set in .env")
    return key
