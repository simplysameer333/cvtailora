"""Phase 0 spike — prove OpenRouter forwards Anthropic prompt-cache breakpoints.

The entire cost thesis of the graph+loop redesign rests on one assumption: a
large shared prefix (resume + JD + profile), cached once, is read cheaply by
every fan-out sub-agent. This script verifies that end-to-end BEFORE any feature
depends on it.

It sends the SAME cached prefix twice through the real LLMGateway:
  - call 1 writes the cache (cache_read_tokens == 0, some cache_write)
  - call 2 must READ it (cache_read_tokens > 0)

Run once your OPENROUTER_API_KEY is set in backend/.env:
    cd backend && python scripts/spike_openrouter_cache.py

PASS  => caching works through OpenRouter; proceed to Phase 1.
FAIL  => the prefix didn't cache (below the model's cache minimum, or OpenRouter
         isn't forwarding cache_control for this slug) — revisit the gateway
         before building on it.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from services.llm import gateway

# A prefix comfortably above Sonnet's ~2048-token cache minimum. Repeated filler
# stands in for the real resume+JD+profile corpus; only its SIZE and byte-identity
# across calls matter for the cache test.
_SHARED = ("You are analysing the following candidate material.\n\n" +
           ("Experienced professional with a track record of delivering measurable "
            "results across cross-functional teams, owning projects end to end, and "
            "mentoring peers while shipping reliably under deadline pressure. ") * 200)


async def main() -> int:
    if not settings.openrouter_api_key:
        print("SKIP — OPENROUTER_API_KEY not set in backend/.env")
        return 2

    print(f"model = {settings.primary_model}")
    common = dict(system="You are a concise resume analyst. Reply in one short sentence.",
                  cached_context=_SHARED, max_tokens=60)

    first = await gateway.complete(task="Name one strength.", **common)
    print(f"call 1: in={first.input_tokens} cache_read={first.cache_read_tokens} "
          f"cache_write={first.cache_write_tokens} out={first.output_tokens} "
          f"${first.cost_usd:.5f}")

    # Small delay: a cache entry becomes readable only after the first response
    # begins streaming — give it a moment before the second call.
    await asyncio.sleep(2)

    second = await gateway.complete(task="Name one area to improve.", **common)
    print(f"call 2: in={second.input_tokens} cache_read={second.cache_read_tokens} "
          f"cache_write={second.cache_write_tokens} out={second.output_tokens} "
          f"${second.cost_usd:.5f}")

    await gateway.aclose()

    if second.cache_read_tokens > 0:
        saved = first.cost_usd - second.cost_usd
        print(f"\nPASS — cache read on call 2 ({second.cache_read_tokens} tokens); "
              f"~${saved:.5f} cheaper than the cold call. Caching works through OpenRouter.")
        return 0
    print("\nFAIL — no cache read on call 2. Check: prefix above the cache minimum, "
          "OpenRouter forwarding cache_control for this model slug, and usage.include.")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
