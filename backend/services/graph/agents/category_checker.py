"""CategoryCheckerNode — scores ONE resume category with one focused LLM call.

Shared by BOTH features: CV Score fans out one checker per category over the
uploaded resume; CV Build fans out the SAME checkers over the freshly-merged
resume. One focused prompt per category (CLAUDE.md: one call, one job) — replaces
the old single 7-category mega-prompt.

Caching: the shared base system prompt + the resume/JD corpus are byte-identical
across all category checkers in a run, so the corpus caches once and every
checker reads it (see gateway.complete + prompts.build_corpus).
"""
from __future__ import annotations

from ..prompts import CATEGORY_BY_KEY, category_system, category_task
from ..runner import NodeOutput, NodeRun
from ..state import EvalResult, NodeCost
from ..validators import validate_category_result


def make_category_checker(*, category_key: str, corpus: str, llm=None,
                          max_tokens: int = 700, model: str | None = None) -> NodeRun:
    """Return the async NodeRun that scores `category_key` against `corpus`.

    Prompts are resolved from MongoDB (admin override → code default) at run time.
    `llm` defaults to the module gateway singleton; tests inject a fake with the
    same `complete(...)` coroutine so the node runs without a network.
    """
    label = CATEGORY_BY_KEY.get(category_key, {}).get("label", category_key)

    async def _run(deps: dict[str, NodeOutput]) -> NodeOutput:
        client = llm
        if client is None:
            from services.llm import gateway as _gw  # _gw IS the gateway singleton
            client = _gw
        res = await client.complete(
            system=await category_system(),
            cached_context=corpus,
            task=await category_task(category_key),
            max_tokens=max_tokens,
            model=model,
            force_json=True,
        )
        result, ev = validate_category_result(res.text, category_key, label)
        cost = NodeCost(
            input_tokens=res.input_tokens, output_tokens=res.output_tokens,
            cache_read_tokens=res.cache_read_tokens, cache_write_tokens=res.cache_write_tokens,
            usd=res.cost_usd, llm_calls=1,
        )
        return NodeOutput(
            content=result,
            score=float(result["score"]),
            cost=cost,
            evals=[ev],
            detail={"category": category_key, "status": result["status"],
                    "improvements": result["improvements"]},
            latency_ms=res.latency_ms,
        )

    return _run
