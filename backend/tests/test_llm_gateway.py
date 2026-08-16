"""Unit tests for the LLM gateway (services/llm/gateway.py).

Pure helpers are tested directly. `complete()` is tested against an httpx
MockTransport so no network or API key is exercised — it verifies the request
shape (cache breakpoints on system + shared context, plain task suffix) and the
usage/cost parsing.
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx

from config import settings
from services.llm import gateway as gw
from services.llm.gateway import LLMGateway, _parse_usage, _pricing, estimate_cost


def test_pricing_matches_by_substring():
    assert _pricing("anthropic/claude-sonnet-4.5")["in"] == 3.00
    assert _pricing("anthropic/claude-3.5-haiku")["in"] == 1.00
    assert _pricing("anthropic/claude-opus-4.1")["in"] == 15.00
    # unknown slug -> sonnet default economics
    assert _pricing("some/unknown-model")["in"] == 3.00


def test_estimate_cost_bills_cached_tokens_cheaply():
    # 1000 fresh input @ $3/M, 500 output @ $15/M
    base = estimate_cost("sonnet", 1000, 500)
    assert round(base, 6) == round((1000 * 3 + 500 * 15) / 1_000_000, 6)
    # cached reads are ~0.1x input, so a cached call costs less than a fresh one
    cached = estimate_cost("sonnet", 0, 500, cache_read=1000)
    assert cached < base


def test_parse_usage_splits_fresh_from_cached():
    usage = {
        "prompt_tokens": 1000,
        "completion_tokens": 200,
        "prompt_tokens_details": {"cached_tokens": 600},
        "cache_creation_input_tokens": 100,
    }
    fresh, out, cread, cwrite = _parse_usage(usage)
    assert fresh == 300          # 1000 - 600 read - 100 write
    assert out == 200
    assert cread == 600
    assert cwrite == 100


def test_parse_usage_handles_missing_details():
    fresh, out, cread, cwrite = _parse_usage({"prompt_tokens": 50, "completion_tokens": 10})
    assert (fresh, out, cread, cwrite) == (50, 10, 0, 0)


def test_complete_builds_cached_prefix_and_parses_usage(monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "hello world"}}],
            "usage": {
                "prompt_tokens": 500, "completion_tokens": 40,
                "prompt_tokens_details": {"cached_tokens": 400},
            },
        })

    monkeypatch.setattr(settings, "openrouter_api_key", "test-key")
    monkeypatch.setattr(settings, "primary_model", "anthropic/claude-sonnet-4.5")
    monkeypatch.setattr(settings, "graph_dev_mode", False)  # use primary_model, not dev

    g = LLMGateway()
    g._client = httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                  base_url=settings.openrouter_base_url)

    async def _run():
        r = await g.complete(system="SYS", cached_context="SHARED CORPUS",
                             task="do X", max_tokens=256)
        await g.aclose()
        return r

    result = asyncio.run(_run())

    # Request shape: system carries a cache breakpoint; user has a cached shared
    # block followed by a plain (uncached) task block.
    body = captured["body"]
    assert captured["auth"] == "Bearer test-key"
    assert body["model"] == "anthropic/claude-sonnet-4.5"
    assert body["messages"][0]["content"][0]["cache_control"] == {"type": "ephemeral"}
    user_parts = body["messages"][1]["content"]
    assert user_parts[0]["cache_control"] == {"type": "ephemeral"}   # shared corpus cached
    assert user_parts[0]["text"] == "SHARED CORPUS"
    assert "cache_control" not in user_parts[1]                       # task NOT cached
    assert user_parts[1]["text"] == "do X"

    # Usage parsing: 500 prompt - 400 cached = 100 fresh input.
    assert result.text == "hello world"
    assert result.input_tokens == 100
    assert result.cache_read_tokens == 400
    assert result.output_tokens == 40
    assert result.cost_usd > 0


def test_complete_requires_api_key(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "")
    g = LLMGateway()
    try:
        asyncio.run(g.complete(system="s", task="t"))
        assert False, "expected RuntimeError for missing key"
    except RuntimeError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
