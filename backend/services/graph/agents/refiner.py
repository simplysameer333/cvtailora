"""RefineAgent — the "Update" phase of Generate → Review → Update → Loop/Exit.

Given the current resume text + the weak categories from the Review phase, it
rewrites ONLY the weak areas using facts already present (never fabricates), and
returns improved resume text. Used by the CV Score loop; the CV Build loop uses
the section generators for its Update phase.
"""
from __future__ import annotations

from ..prompts import refine_system, resolve_refine_prompt
from ..runner import NodeOutput, NodeRun
from ..state import NodeCost
from ..validators import validate_refine_output


def make_refiner(*, resume_text: str, weak: list[dict], corpus: str,
                 llm=None, max_tokens: int = 2000, model: str | None = None) -> NodeRun:
    """Return the async NodeRun that produces an improved resume text.

    The system prompt resolves from MongoDB (admin override → code default); the
    task lists the specific weak areas to fix (dynamic, built in code)."""
    task = resolve_refine_prompt(weak)

    async def _run(_deps: dict[str, NodeOutput]) -> NodeOutput:
        client = llm
        if client is None:
            from services.llm import gateway as _gw  # _gw IS the gateway singleton
            client = _gw
        res = await client.complete(system=await refine_system(), cached_context=corpus,
                                    task=task, max_tokens=max_tokens, model=model,
                                    force_json=True)
        improved, ev = validate_refine_output(res.text, resume_text)
        cost = NodeCost(input_tokens=res.input_tokens, output_tokens=res.output_tokens,
                        cache_read_tokens=res.cache_read_tokens,
                        cache_write_tokens=res.cache_write_tokens,
                        usd=res.cost_usd, llm_calls=1)
        return NodeOutput(content={"resume_text": improved}, cost=cost, evals=[ev],
                          detail={"weak": [w.get("key") for w in weak]},
                          latency_ms=res.latency_ms)

    return _run
