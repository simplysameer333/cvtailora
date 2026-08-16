"""VerificationAgent — the single-model guardrail (a distinct-role second opinion).

Cross-*model* consensus used to be the guardrail (3 models catching each other's
errors). With one model, this agent recreates that safety with a DIFFERENT ROLE
and PROMPT: it audits the produced/refined resume against the ORIGINAL source for
fabrication (claims/metrics/employers/dates/skills the source doesn't support).
Its EvalResult is the guardrail signal surfaced on the run + in the UI.
"""
from __future__ import annotations

from ..prompts import verification_system, verification_task
from ..runner import NodeOutput, NodeRun
from ..state import NodeCost
from ..validators import validate_verification


def make_verifier(*, original_text: str, produced_text: str, llm=None,
                  max_tokens: int = 600, model: str | None = None) -> NodeRun:
    """Return the async NodeRun that faithfulness-audits produced vs original.

    Prompts resolve from MongoDB (admin override → code default). The original
    material is the cached shared prefix; the produced resume rides in the
    (short) uncached task suffix."""

    async def _run(_deps: dict[str, NodeOutput]) -> NodeOutput:
        client = llm
        if client is None:
            from services.llm import gateway as _gw  # _gw IS the gateway singleton
            client = _gw
        task = f"{await verification_task()}\n\n=== PRODUCED RESUME ===\n{produced_text}"
        res = await client.complete(
            system=await verification_system(),
            cached_context=f"=== ORIGINAL CANDIDATE MATERIAL ===\n{original_text}",
            task=task, max_tokens=max_tokens, model=model, force_json=True,
        )
        result, ev = validate_verification(res.text)
        cost = NodeCost(input_tokens=res.input_tokens, output_tokens=res.output_tokens,
                        cache_read_tokens=res.cache_read_tokens,
                        cache_write_tokens=res.cache_write_tokens,
                        usd=res.cost_usd, llm_calls=1)
        # score = confidence; the pass/fail is the faithfulness guardrail.
        return NodeOutput(content=result, score=float(result["confidence"]),
                          cost=cost, evals=[ev], detail=result, latency_ms=res.latency_ms)

    return _run
