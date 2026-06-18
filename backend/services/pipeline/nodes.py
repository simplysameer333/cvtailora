"""LangGraph node functions — thin orchestration wrappers only.

Each function delegates all logic to the corresponding agent.
Nodes are kept minimal intentionally: routing, state shaping, and
timing belong here; business logic belongs in the agent files.

Cost note: MAX_CYCLES and the evaluator enabled flags are read from
settings so they can be changed in .env without touching code.
"""

from __future__ import annotations
import asyncio
import logging
import re
from datetime import datetime

logger = logging.getLogger("tailormycv.pipeline")

from config import settings
from .state import PipelineState
from .agents.generator import GeneratorAgent
from .agents.aggregator import AggregatorAgent
from .agents.evaluators import EVALUATOR_REGISTRY

_generator = GeneratorAgent()
_aggregator = AggregatorAgent()

# Minimum score gain a cycle must deliver to justify running another one. Below
# this, the refine loop is treated as plateaued and exits early (see should_continue).
_PLATEAU_MARGIN = 4

# Global fallback evaluator flags — used only when no per-request tier is set.
# In practice every authenticated request now passes enabled_evaluators via state.
_EVALUATOR_ENABLED_FALLBACK: dict[str, bool] = {
    "anthropic": settings.anthropic_evaluator_enabled,
    "openai": settings.openai_evaluator_enabled,
    "google": settings.google_evaluator_enabled,
}

# Maps keywords found in evaluator feedback to the resume JSON keys they affect.
# Used by _weak_patch_keys() to target the smallest useful patch set.
_SUGGESTION_PATTERNS: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r"\bcontact\b|email|phone|linkedin|github|website|location", re.I), ["contact"]),
    (re.compile(r"\bsummary\b|\bprofile\b|\bobjective\b|\bheadline\b|\bopening\b", re.I), ["summary"]),
    (re.compile(r"\bexperience\b|\bwork\b|\bbullet\b|\bachievement\b|\bquantif|\bmetric\b|\baction verb\b|\bemployer\b", re.I), ["experience"]),
    (re.compile(r"\beducation\b|\bdegree\b|\bqualification\b|\bcertif", re.I), ["education"]),
    (re.compile(r"\bskill|\btechnical\b|\btechnolog|\bframework\b|\btool\b", re.I), ["sections"]),
    (re.compile(r"\bats\b|\bkeyword\b|\bterminolog|\bsection heading\b", re.I), ["experience", "summary"]),
]


def _weak_patch_keys(feedback: str | None, eval_results: list[dict]) -> list[str] | None:
    """Return the top-2 resume JSON keys to patch, ranked by how often each is
    mentioned in the evaluator feedback.

    Capping at 2 keeps patch output tight (~200–500 tokens). When all sections
    need work (common on first-pass CVs), patching the worst 2 per cycle and
    iterating converges faster than trying to fix 5 sections at once.

    Returns None → design/layout issue, fall back to full regeneration.
    Returns list  → patch only these keys and merge into current resume.
    """
    text = (feedback or "") + " " + " ".join(
        s for r in eval_results for s in (r.get("suggestions") or [])
    )
    if not text.strip():
        return None
    if re.search(r"\bdesign\b|\blayout\b|\bpage length\b|\boverflow\b|\btoo long\b|\btoo short\b", text, re.I):
        return None

    # Score each resume key by how many pattern hits appear in the feedback text.
    # More mentions = more severe / more suggestions = fix first.
    key_hits: dict[str, int] = {}
    for pattern, section_keys in _SUGGESTION_PATTERNS:
        hits = len(pattern.findall(text))
        if hits > 0:
            for k in section_keys:
                key_hits[k] = key_hits.get(k, 0) + hits

    if not key_hits:
        # Default when no pattern fires: summary and experience cover the most
        # common first-draft weaknesses (narrative quality + bullet quantification).
        return ["summary", "experience"]

    # Return only the top 2 most-mentioned keys — keeps patches fast and focused
    top2 = sorted(key_hits.items(), key=lambda kv: -kv[1])[:2]
    return sorted(k for k, _ in top2)


async def generate_node(state: PipelineState) -> dict:
    """Call the GeneratorAgent and return the produced resume JSON.

    Cycles 0 and 1 always do a full regeneration (the model hasn't had enough
    feedback iterations to target a specific section yet). Cycles 2+ use
    targeted patching when specific failing sections can be identified —
    ~200–600 output tokens vs 2000–3000, cutting per-cycle time from ~30s to ~8s.
    """
    cycle = state.get("cycle", 0)
    feedback = state.get("feedback")
    # Use the best resume seen so far as the base for patching (non-monotonic loop).
    current_resume = state.get("best_resume_json") or state.get("resume_json")

    if cycle >= 2 and feedback and current_resume:
        patch_keys = _weak_patch_keys(feedback, state.get("eval_results") or [])
        if patch_keys:
            logger.info("[pipeline] cycle=%d PATCH keys=%s", cycle, patch_keys)
            resume_json = await _generator.run_patch(
                resume_text=state["resume_text"],
                user_profile=state["user_profile"],
                job_description=state["job_description"],
                tone=state["tone"],
                feedback=feedback,
                current_resume=current_resume,
                patch_keys=patch_keys,
                profession_config=state["profession_config"],
                locked_facts=state.get("locked_facts") or [],
                key_skills=state.get("key_skills") or [],
                template_pages=state.get("template_pages", 2),
            )
            return {"resume_json": resume_json}

    logger.info("[pipeline] cycle=%d FULL generation", cycle)
    resume_json = await _generator.run(
        resume_text=state["resume_text"],
        user_profile=state["user_profile"],
        job_description=state["job_description"],
        tone=state["tone"],
        profession_config=state["profession_config"],
        locked_facts=state.get("locked_facts") or [],
        key_skills=state.get("key_skills") or [],
        sample_cv_text=state.get("sample_cv_text"),
        feedback=feedback,
        template_pages=state.get("template_pages", 2),
    )
    return {"resume_json": resume_json}


async def evaluate_node(state: PipelineState) -> dict:
    """Run all active evaluators concurrently with profession-aware scoring.

    An evaluator is active when:
      1. Its API key is present (is_configured).
      2. Its feature flag is True in settings (*_evaluator_enabled).
      3. The profession config's evaluator_names list includes it (or is empty).

    Throughput note: asyncio.gather dispatches all active evaluator calls in
    parallel, so total latency ≈ slowest single evaluator, not the sum.
    Evaluators that raise an exception return score=0 rather than crashing
    the pipeline.
    """
    # Per-request enabled map (set by generate router from user tier) or global fallback
    tier_enabled: dict[str, bool] = state.get("enabled_evaluators") or _EVALUATOR_ENABLED_FALLBACK
    profession_allowed = state["profession_config"].get("evaluator_names") or []
    active = [
        e for e in EVALUATOR_REGISTRY
        if e.is_configured
        and tier_enabled.get(e.name, False)
        and (not profession_allowed or e.name in profession_allowed)
    ]
    # Paid tiers score the headline (cv_score) fairly, not via the free-tier
    # conservative ladder. Only cv_score is calibrated; the cross-provider
    # evaluators are unaffected.
    conservative = state.get("conservative_scoring", True)

    def _kwargs(e):
        kw = {"source_resume_text": state.get("resume_text", "")}
        if e.name == "cv_score":
            kw["conservative"] = conservative
        return kw

    eval_results = list(
        await asyncio.gather(*[
            e.run(
                state["resume_json"], state["job_description"], state["profession_config"],
                **_kwargs(e),
            )
            for e in active
        ])
    )
    return {"eval_results": eval_results}


async def aggregate_node(state: PipelineState) -> dict:
    """Consolidate evaluator results and decide pass/fail for this cycle."""
    aggregated = _aggregator.run(
        state["eval_results"],
        state["profession_config"],
        pass_threshold=state.get("pass_threshold"),
        prior_seen_suggestions=state.get("seen_suggestions") or [],
    )
    cycle_record = {
        "cycle": state["cycle"] + 1,
        "profession": state["profession_config"].get("slug", "generic"),
        "evaluator_results": aggregated["evaluator_results"],
        "min_score": aggregated["min_score"],
        "all_passed": aggregated["all_passed"],
        "timestamp": datetime.utcnow().isoformat(),
    }
    min_score = aggregated["min_score"]
    prev_best = state.get("best_min_score", 0)
    update = {
        "cycle": state["cycle"] + 1,
        "all_passed": aggregated["all_passed"],
        "min_score": min_score,
        "faithfulness_warning": aggregated.get("faithfulness_warning"),
        # How much this cycle improved on the best so far (can be negative on a
        # regression). should_continue uses it for plateau early-exit.
        "last_gain": min_score - prev_best,
        "feedback": aggregated["feedback_prompt"] if not aggregated["all_passed"] else None,
        "eval_history": [cycle_record],
        # Accumulate new suggestions seen this cycle (operator.add in state appends).
        "seen_suggestions": aggregated.get("new_seen_suggestions") or [],
    }
    # Keep the highest-scoring cycle — the loop is non-monotonic, so the LAST
    # cycle is not always the best. We return best_resume_json at the end.
    if min_score > prev_best:
        update["best_min_score"] = min_score
        update["best_resume_json"] = state["resume_json"]
    return update


def should_continue(state: PipelineState) -> str:
    """Routing function: loop back to generator or exit the graph.

    Exits when all evaluators pass OR the per-request max cycles is reached.
    max_cycles is tier-aware (set by the generate router); falls back to
    settings.max_eval_cycles so it can also be tuned in .env.
    """
    max_cycles = state.get("max_cycles") or settings.max_eval_cycles
    if state["all_passed"] or state["cycle"] >= max_cycles:
        return "end"
    # Plateau early-exit (cost lever): after at least 2 cycles, if the latest
    # cycle failed to improve the best score by a meaningful margin, stop. The
    # refine loop has stalled — more Sonnet cycles aren't paying off, and we
    # already return the BEST cycle, so quitting here can only save spend, not
    # lower quality. Gives the feedback loop one real attempt before triggering.
    if state["cycle"] >= 2 and state.get("last_gain", 99) < _PLATEAU_MARGIN:
        return "end"
    return "generate"
