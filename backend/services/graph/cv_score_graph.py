"""CV Score as a graph+loop run — Generate → Review → Update → Loop/Exit.

The uploaded resume IS the initial content (no generation step), then:
  REVIEW  — the Evaluation Agent spawns one category worker per quality category
            (parallel) and aggregates → overall score + weakest categories.
  UPDATE  — if below the tier's quality bar and within the cost/cycle caps, a
            Refine agent rewrites ONLY the weak areas (no fabrication).
  LOOP    — re-review the refined resume; keep the best-scoring version.
  EXIT    — the tier-based rules (quality / cycles / cost cap) stop the loop.
Finally a Verification Agent (guardrail) audits the best version vs the original
for fabrication and records the faithfulness result on the run.
"""
from __future__ import annotations

import uuid
from typing import Optional

from services.llm.gateway import active_model

from . import store, tier_rules
from .agents import make_refiner
from .guardrails import run_verification
from .loop import LoopController
from .prompts import build_corpus
from .review import run_review
from .runner import NodeSpec, run_graph
from .state import GraphEdge, GraphNode, GraphRun, LoopRun


def _fold_refine_node(run: GraphRun, tmp: GraphRun, results: dict) -> str:
    """Fold the single Refine node into the main run (create once, then bump
    loop_count + accumulate cost on repeats). Returns the refined resume text.

    The refined text is on the NodeOutput (`results`), while cost/status live on
    the folded GraphNode (the runner already set those)."""
    node_id = "update:refiner"
    src = tmp.get_node(node_id)
    existing = run.get_node(node_id)
    if existing is None and src is not None:
        run.nodes.append(src)
        run.add_edge(GraphEdge(source="aggregate", target=node_id, kind="sequential"))
    elif existing is not None and src is not None:
        existing.loop_count += 1
        existing.status = src.status
        existing.latency_ms = src.latency_ms
        existing.evals = src.evals
        existing.cost.usd += src.cost.usd
        existing.cost.input_tokens += src.cost.input_tokens
        existing.cost.output_tokens += src.cost.output_tokens
        existing.cost.cache_read_tokens += src.cost.cache_read_tokens
        existing.cost.cache_write_tokens += src.cost.cache_write_tokens
        existing.cost.llm_calls += src.cost.llm_calls
    run.recompute_totals()
    out = results.get(node_id)
    content = (out.content or {}) if out else {}
    return content.get("resume_text", "")


async def run_cv_score_graph(
    resume_text: str,
    job_description: str = "",
    *,
    tier: str = "free",
    pass_threshold: Optional[int] = None,
    max_iterations: Optional[int] = None,
    run_id: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    input_hash: str = "",
    persist: bool = True,
    db=None,
    llm=None,
) -> GraphRun:
    """Run the CV Score graph+loop and return the completed GraphRun."""
    run = GraphRun(run_id=run_id or uuid.uuid4().hex, kind="cv_score",
                   model=active_model(), tier=tier, session_id=session_id,
                   user_id=user_id, input_hash=input_hash, status="running")
    loop = tier_rules.loop_controller_for(tier)
    if pass_threshold is not None or max_iterations is not None:
        loop = LoopController(
            pass_threshold=pass_threshold if pass_threshold is not None else loop.pass_threshold,
            max_iterations=max_iterations if max_iterations is not None else loop.max_iterations,
            max_cost_usd=loop.max_cost_usd,
        )

    async def _save(r: GraphRun) -> None:
        await store.save(r, db)
    on_update = _save if persist else None

    original_text = resume_text
    best_text = resume_text

    # ── REVIEW (first pass) ───────────────────────────────────────────────────
    agg = await run_review(run, best_text, job_description, upstream=None, llm=llm)
    best_score = agg["overall_score"]
    best_agg = agg
    if on_update:
        await on_update(run)

    # ── UPDATE → REVIEW loop (Loop/Exit by the tier rules) ────────────────────
    gains: list[float] = []
    iteration = 1
    stop_reason = ""
    while True:
        decision = loop.decide(iteration=iteration, best_score=best_score,
                               last_gain=gains[-1] if gains else best_score,
                               spent_usd=run.totals.usd)
        if not decision.continue_:
            stop_reason = decision.stop_reason
            break
        weak = best_agg.get("weakest", [])
        if not weak:
            stop_reason = "plateau"
            break

        # UPDATE: refine only the weak areas of the current best resume.
        corpus = build_corpus(best_text, job_description)
        tmp = GraphRun(run_id="_refine", kind="cv_score")
        spec = NodeSpec(id="update:refiner", label="Update (refine)", agent="RefineAgent",
                        role="refine",
                        run=make_refiner(resume_text=best_text, weak=weak, corpus=corpus, llm=llm))
        refine_results = await run_graph([spec], tmp, concurrency=1)
        refined_text = _fold_refine_node(run, tmp, refine_results) or best_text

        # RE-REVIEW the refined resume.
        new_agg = await run_review(run, refined_text, job_description, upstream="update:refiner", llm=llm)
        new_score = new_agg["overall_score"]
        gains.append(new_score - best_score)
        if new_score > best_score:   # keep-best
            best_score = new_score
            best_text = refined_text
            best_agg = new_agg
        iteration += 1
        if on_update:
            await on_update(run)

    if iteration > 1:
        run.add_loop(LoopRun(loop_id="cv_score:refine", over="resume",
                             iterations=iteration - 1, gain_per_iter=gains,
                             stop_reason=stop_reason or "max_iterations",
                             best_score=float(best_score)))
        run.add_edge(GraphEdge(source="aggregate", target="update:refiner", kind="loopback",
                               loop_count=iteration - 1, label=f"×{iteration - 1} refine"))

    # ── GUARDRAIL: faithfulness verification of the best version vs original ──
    # Only meaningful once we've changed the resume; a pure score (no refine) is
    # already the user's own text, so nothing to audit.
    faithfulness = {"faithful": True, "confidence": 100, "issues": []}
    if best_text != original_text:
        faithfulness = await run_verification(run, original_text, best_text,
                                              upstream="aggregate", llm=llm)

    run.result = {
        "overall_score": best_score,
        "categories": best_agg.get("categories", []),
        "weakest": best_agg.get("weakest", []),
        "improved_resume": best_text if best_text != original_text else None,
        "faithfulness": faithfulness,
    }
    run.recompute_totals()
    run.status = "completed"
    run.finished_at = run.updated_at
    if persist:
        await store.save(run, db)
    return run
