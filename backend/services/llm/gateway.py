"""LLMGateway — the single egress point for every graph/loop LLM call.

Design (matches CLAUDE.md "one dedicated LLM call per purpose"):
- ONE provider (OpenRouter), ONE model (settings.primary_model). Swapping the
  model is a config edit; no model string is hardcoded by any caller.
- Prompt caching is the primary cost lever. A call is shaped as three parts:
    system         — the agent's stable system prompt          (cached)
    cached_context — the shared corpus (resume + JD + profile)  (cached)
    task           — the small per-agent instruction/suffix     (NOT cached)
  The stable parts carry Anthropic `cache_control: ephemeral` breakpoints, which
  OpenRouter forwards to Anthropic models. Because `cached_context` is
  byte-identical across every sub-agent in a fan-out, N sub-agents pay the input
  cost ~once and read the rest from cache. Cache minimum for Sonnet is ~2048
  tokens — the shared corpus clears that; smaller prefixes silently won't cache.
- Usage is read straight off OpenRouter's response so cost/telemetry are exact,
  not estimated from string lengths.

Pure helpers (`_pricing`, `_parse_usage`) are I/O-free so they unit-test without
a network. The single `complete()` coroutine is the only thing that does I/O and
is mocked in tests.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger("cvtailora.llm")

# USD per 1,000,000 tokens, matched by substring against the configured model
# slug so an .env model swap still prices correctly. Cached input is ~0.1x input;
# cache writes are ~1.25x input (5-minute ephemeral TTL). Update on price changes.
_PRICING: dict[str, dict[str, float]] = {
    "haiku":  {"in": 1.00,  "out": 5.00,  "cache_read": 0.10, "cache_write": 1.25},
    "sonnet": {"in": 3.00,  "out": 15.00, "cache_read": 0.30, "cache_write": 3.75},
    "opus":   {"in": 15.00, "out": 75.00, "cache_read": 1.50, "cache_write": 18.75},
}
# Default to Sonnet economics — the project's standard model — when no key matches.
_DEFAULT_RATE = _PRICING["sonnet"]


@dataclass
class LLMResult:
    """Everything a graph node needs from one LLM call: the text plus the exact
    usage/cost/latency to fold into its GraphNode. Provider-neutral shape."""
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    raw: dict = field(default_factory=dict)


def _pricing(model: str) -> dict[str, float]:
    m = (model or "").lower()
    for key, rate in _PRICING.items():
        if key in m:
            return rate
    return _DEFAULT_RATE


def estimate_cost(model: str, input_tokens: int, output_tokens: int,
                  cache_read: int = 0, cache_write: int = 0) -> float:
    """Exact-usage cost in USD. `input_tokens` is the fresh (uncached) remainder;
    cached reads/writes are billed at their own rates. Pure — unit-tested."""
    # OpenRouter ":free" models cost nothing — don't show an estimated charge.
    if (model or "").endswith(":free"):
        return 0.0
    r = _pricing(model)
    return (
        input_tokens * r["in"]
        + cache_read * r["cache_read"]
        + cache_write * r["cache_write"]
        + output_tokens * r["out"]
    ) / 1_000_000


def _parse_usage(usage: dict) -> tuple[int, int, int, int]:
    """Return (fresh_input, output, cache_read, cache_write) from an OpenRouter
    usage block. OpenRouter reports cache reads under
    prompt_tokens_details.cached_tokens; cache writes (Anthropic) surface as
    cache_creation_input_tokens when present. `prompt_tokens` is the INCLUSIVE
    input total, so the fresh (full-price) remainder is prompt - read - write."""
    usage = usage or {}
    prompt = int(usage.get("prompt_tokens", 0) or 0)
    output = int(usage.get("completion_tokens", 0) or 0)
    details = usage.get("prompt_tokens_details") or {}
    cache_read = int(details.get("cached_tokens", 0) or 0)
    # Cache-write token count is not always surfaced; default 0 when absent.
    cache_write = int(
        usage.get("cache_creation_input_tokens", 0)
        or details.get("cache_creation_tokens", 0)
        or 0
    )
    fresh_input = max(prompt - cache_read - cache_write, 0)
    return fresh_input, output, cache_read, cache_write


def active_model() -> str:
    """The model every graph call uses: the FREE dev model while developing
    (graph_dev_mode=true → no paid cost), else the paid production model. One
    place resolves dev-vs-prod so no caller hardcodes a model."""
    return settings.dev_model if settings.graph_dev_mode else settings.primary_model


def _cache_block(text: str) -> dict:
    """An OpenAI-format text content part carrying an Anthropic cache breakpoint.
    OpenRouter forwards `cache_control` to Anthropic models."""
    return {"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}


class LLMGateway:
    """Async client for OpenRouter chat completions. Stateless except for a
    lazily-created shared httpx client; safe to reuse as a module singleton."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=settings.openrouter_base_url,
                timeout=httpx.Timeout(120.0, connect=10.0),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def complete(
        self,
        *,
        system: str,
        task: str,
        cached_context: str = "",
        max_tokens: int = 2048,
        model: Optional[str] = None,
        force_json: bool = False,
    ) -> LLMResult:
        """Run one completion.

        `system` + `cached_context` form the cacheable prefix (byte-identical
        across a fan-out => read from cache after the first call). `task` is the
        per-agent suffix and is never cached. Returns an LLMResult with exact
        usage; raises httpx.HTTPStatusError on a non-2xx response so the caller
        can record the node as failed.
        """
        model = model or active_model()
        if not settings.openrouter_api_key:
            # Fail loudly rather than silently returning empty — a missing key is
            # a config error, not a runtime condition to paper over.
            raise RuntimeError("OPENROUTER_API_KEY is not set — cannot call the LLM gateway")

        # System is cached. The shared corpus rides as a cached user block; the
        # per-agent task rides as a plain user block after the last breakpoint.
        system_content = [_cache_block(system)]
        user_parts: list[dict] = []
        if cached_context:
            user_parts.append(_cache_block(cached_context))
        user_parts.append({"type": "text", "text": task})

        payload: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_parts},
            ],
            # OpenRouter returns usage (incl. cache details) inline when asked.
            "usage": {"include": True},
        }
        if force_json:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "HTTP-Referer": settings.openrouter_referer,
            "X-Title": settings.openrouter_title,
        }

        started = time.monotonic()
        resp = await self._http().post("/chat/completions", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        latency_ms = int((time.monotonic() - started) * 1000)

        text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        fresh_in, out, cread, cwrite = _parse_usage(data.get("usage") or {})
        cost = estimate_cost(model, fresh_in, out, cread, cwrite)
        if cread == 0 and cached_context:
            # Not fatal, but worth a breadcrumb: the shared prefix should be
            # reading from cache on the 2nd+ sub-agent of a fan-out.
            logger.debug("[llm] no cache read (model=%s, prompt=%d) — cold prefix or below cache min",
                         model, fresh_in + cread + cwrite)

        return LLMResult(
            text=text, model=model,
            input_tokens=fresh_in, output_tokens=out,
            cache_read_tokens=cread, cache_write_tokens=cwrite,
            cost_usd=cost, latency_ms=latency_ms, raw=data,
        )


# Module singleton — import `gateway` and call `await gateway.complete(...)`.
gateway = LLMGateway()
