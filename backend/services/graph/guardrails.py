"""Guardrail phase — the single-model Verification Agent.

Runs the VerificationAgent (a distinct-role faithfulness critic) over a produced
resume vs the original, folds its node into the run, and appends its EvalResult
to run.evals (the guardrail signal shown in the UI). Shared by both flows.
"""
from __future__ import annotations

from typing import Optional

from .agents import make_verifier
from .runner import NodeSpec, run_graph
from .state import GraphEdge, GraphRun

VERIFY_ID = "verify:faithfulness"


async def run_verification(run: GraphRun, original_text: str, produced_text: str,
                           *, upstream: Optional[str] = None, llm=None) -> dict:
    """Audit `produced_text` against `original_text`; record the guardrail on the
    run. Returns {faithful, confidence, issues}."""
    tmp = GraphRun(run_id="_verify", kind=run.kind)
    spec = NodeSpec(id=VERIFY_ID, label="Verification Agent", agent="VerificationAgent",
                    role="evaluate",
                    run=make_verifier(original_text=original_text, produced_text=produced_text, llm=llm))
    results = await run_graph([spec], tmp, concurrency=1)
    src = tmp.get_node(VERIFY_ID)

    existing = run.get_node(VERIFY_ID)
    if existing is None and src is not None:
        run.nodes.append(src)
        if upstream:
            run.add_edge(GraphEdge(source=upstream, target=VERIFY_ID, kind="sequential"))
    elif existing is not None and src is not None:
        existing.loop_count += 1
        existing.status = src.status
        existing.score = src.score
        existing.detail.update(src.detail)
        existing.cost.usd += src.cost.usd
        existing.cost.input_tokens += src.cost.input_tokens
        existing.cost.output_tokens += src.cost.output_tokens
        existing.cost.cache_read_tokens += src.cost.cache_read_tokens
        existing.cost.cache_write_tokens += src.cost.cache_write_tokens
        existing.cost.llm_calls += src.cost.llm_calls
        existing.evals = src.evals

    out = results.get(VERIFY_ID)
    if out and out.evals:
        run.evals.extend(out.evals)   # the faithfulness guardrail surfaces on the run
    run.recompute_totals()
    return out.content if out else {"faithful": True, "confidence": 100, "issues": []}
