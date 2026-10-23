"""Streaming clients for OpenRouter (Chat Completions) and OpenAI (Responses API).

Both yield the same event shapes so the runner can time them identically:
  {"type": "first_byte", "t": ms}
  {"type": "reasoning", "text": str, "t": ms}
  {"type": "content", "text": str, "t": ms}
  {"type": "content_done", "t": ms}      the visible output is complete (usage may still follow)
  {"type": "final", "t": ms, ...usage and served-model metadata}
Timestamps are wall-clock epoch milliseconds (time.time() * 1000).
"""

from __future__ import annotations

import json
import time
from typing import AsyncIterator

import httpx

from .config import MAX_OUTPUT_TOKENS, MODELS, REQUEST_TIMEOUT_S, api_key


def now_ms() -> float:
    return time.time() * 1000


class ProviderError(Exception):
    def __init__(self, message: str, detail: object = None):
        super().__init__(message)
        self.detail = detail


async def _sse_data(resp: httpx.Response) -> AsyncIterator[str]:
    """Yield the payload of each `data:` line; comments and event names are skipped."""
    async for line in resp.aiter_lines():
        if line.startswith("data:"):
            yield line[5:].strip()


async def stream_openrouter(client: httpx.AsyncClient, model_key: str, system: str, user: str,
                            max_tokens: int = MAX_OUTPUT_TOKENS) -> AsyncIterator[dict]:
    cfg = MODELS[model_key]
    body = {
        "model": cfg["model"],
        "stream": True,
        "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "reasoning": cfg["reasoning_request"],
        "usage": {"include": True},
        # One pinned upstream, no fallbacks, and fail rather than ignore the reasoning setting.
        "provider": {"order": cfg["provider_order"], "allow_fallbacks": False, "require_parameters": True},
    }
    headers = {
        "Authorization": f"Bearer {api_key('openrouter')}",
        "HTTP-Referer": "http://localhost/uxwoz-bench",
        "X-Title": "uxwoz-bench",
    }
    final: dict = {"type": "final", "request_body": {k: v for k, v in body.items() if k != "messages"}}
    async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", json=body, headers=headers,
                             timeout=REQUEST_TIMEOUT_S) as resp:
        if resp.status_code != 200:
            text = (await resp.aread()).decode(errors="replace")
            raise ProviderError(f"OpenRouter HTTP {resp.status_code}", text)
        first = True
        async for data in _sse_data(resp):
            if first:
                first = False
                yield {"type": "first_byte", "t": now_ms()}
            if data == "[DONE]":
                break
            chunk = json.loads(data)
            if "error" in chunk:
                raise ProviderError("OpenRouter stream error", chunk["error"])
            final["served_model"] = chunk.get("model", final.get("served_model"))
            final["served_provider"] = chunk.get("provider", final.get("served_provider"))
            for choice in chunk.get("choices") or []:
                delta = choice.get("delta") or {}
                if delta.get("reasoning"):
                    yield {"type": "reasoning", "text": delta["reasoning"], "t": now_ms()}
                if delta.get("content"):
                    yield {"type": "content", "text": delta["content"], "t": now_ms()}
                if choice.get("finish_reason") and "finish_reason" not in final:
                    final["finish_reason"] = choice["finish_reason"]
                    yield {"type": "content_done", "t": now_ms()}
            if chunk.get("usage"):
                u = chunk["usage"]
                final["usage_raw"] = u
                final["input_tokens"] = u.get("prompt_tokens")
                final["cached_input_tokens"] = (u.get("prompt_tokens_details") or {}).get("cached_tokens")
                final["cache_write_tokens"] = (u.get("prompt_tokens_details") or {}).get("cache_write_tokens")
                final["output_tokens"] = u.get("completion_tokens")
                final["reasoning_tokens"] = (u.get("completion_tokens_details") or {}).get("reasoning_tokens")
                final["cost_usd"] = u.get("cost")
    final["t"] = now_ms()
    final["served_service_tier"] = None
    yield final


async def stream_openai(client: httpx.AsyncClient, model_key: str, system: str, user: str,
                        max_tokens: int = MAX_OUTPUT_TOKENS) -> AsyncIterator[dict]:
    cfg = MODELS[model_key]
    body = {
        "model": cfg["model"],
        "stream": True,
        "service_tier": cfg["service_tier"],
        "reasoning": cfg["reasoning_request"],
        "max_output_tokens": max_tokens,
        "instructions": system,
        "input": user,
        "store": False,
    }
    headers = {"Authorization": f"Bearer {api_key('openai')}"}
    final: dict = {"type": "final", "request_body": {k: v for k, v in body.items() if k not in ("instructions", "input")}}
    async with client.stream("POST", "https://api.openai.com/v1/responses", json=body, headers=headers,
                             timeout=REQUEST_TIMEOUT_S) as resp:
        if resp.status_code != 200:
            text = (await resp.aread()).decode(errors="replace")
            raise ProviderError(f"OpenAI HTTP {resp.status_code}", text)
        first = True
        async for data in _sse_data(resp):
            if first:
                first = False
                yield {"type": "first_byte", "t": now_ms()}
            if data == "[DONE]":
                break
            ev = json.loads(data)
            kind = ev.get("type", "")
            if kind == "response.output_text.delta":
                yield {"type": "content", "text": ev.get("delta", ""), "t": now_ms()}
            elif kind == "response.output_text.done":
                yield {"type": "content_done", "t": now_ms()}
            elif kind in ("response.reasoning_summary_text.delta", "response.reasoning_text.delta"):
                yield {"type": "reasoning", "text": ev.get("delta", ""), "t": now_ms()}
            elif kind in ("response.completed", "response.incomplete"):
                r = ev["response"]
                u = r.get("usage") or {}
                final.update(
                    served_model=r.get("model"),
                    served_provider="OpenAI",
                    served_service_tier=r.get("service_tier"),
                    served_reasoning=r.get("reasoning"),
                    finish_reason="stop" if kind == "response.completed" else (r.get("incomplete_details") or {}).get("reason"),
                    usage_raw=u,
                    input_tokens=u.get("input_tokens"),
                    cached_input_tokens=(u.get("input_tokens_details") or {}).get("cached_tokens"),
                    cache_write_tokens=(u.get("input_tokens_details") or {}).get("cache_write_tokens"),
                    output_tokens=u.get("output_tokens"),
                    reasoning_tokens=(u.get("output_tokens_details") or {}).get("reasoning_tokens"),
                )
                final["cost_usd"] = openai_cost(model_key, final)
            elif kind in ("response.failed", "error"):
                raise ProviderError("OpenAI stream error", ev)
    final["t"] = now_ms()
    yield final


def openai_cost(model_key: str, f: dict) -> float | None:
    price = MODELS[model_key].get("price_per_mtok")
    if not price or f.get("input_tokens") is None or f.get("output_tokens") is None:
        return None
    cached = f.get("cached_input_tokens") or 0
    return (
        (f["input_tokens"] - cached) * price["input"]
        + cached * price["cached_input"]
        + f["output_tokens"] * price["output"]
    ) / 1_000_000


def stream(client: httpx.AsyncClient, model_key: str, system: str, user: str,
           max_tokens: int = MAX_OUTPUT_TOKENS) -> AsyncIterator[dict]:
    provider = MODELS[model_key]["provider"]
    fn = {"openrouter": stream_openrouter, "openai": stream_openai}[provider]
    return fn(client, model_key, system, user, max_tokens)
