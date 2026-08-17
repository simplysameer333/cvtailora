"""CV Build as a graph+loop run.

Shape (dependency edges shown; every independent node runs concurrently):

    analyze ─fanout─> contact ───────────────┐
                      experience ─> skills ─┐ │
                          └────────> summary┤ ├─fanin─> merge ─fanout─> category:* ─fanin─> aggregate
                      education ─────────────┘                                         │
                                                                                       └─(loopback: refine weak sections)

- Section generators run in parallel; a section connects to another ONLY where it
  needs it (skills→experience, summary→experience+skills). Those are real edges.
- `merge` waits for all sections (fan-in) and assembles the resume JSON.
- The SAME CategoryCheckerNodes used by CV Score fan out over the merged resume.
- A refine LOOP regenerates only the weakest sections and re-scores, keeping the
  best result. Loop iterations accumulate cost onto the affected nodes, bump
  their loop_count, and add a loopback edge — so the loop is visible in the graph.
"""
from __future__ import annotations

import uuid
from typing import Awaitable, Callable, Optional

from config import settings
from services.llm.gateway import active_model

from . import store, tier_rules
from .agents import make_section_generator
from .guardrails import run_verification
from .loop import LoopController
from .review import run_review
from .prompts import SECTIONS, build_build_corpus
from .runner import NodeOutput, NodeSpec, run_graph
from .state import GraphEdge, LoopRun, GraphRun

# Which section(s) a weak CV-Score category maps to for targeted regeneration.
# design/grammar are not section-regeneratable here (layout is template-driven;
# grammar is fixed by rewriting the prose sections), so they map to prose.
_WEAK_CATEGORY_TO_SECTIONS: dict[str, list[str]] = {
    "contact": ["contact"],
    "summary": ["summary"],
    "experience": ["experience"],
    "skills": ["skills"],
    "education": ["education"],
    "ats": ["experience", "skills"],
    "grammar": ["summary", "experience"],
    "design": [],
}


def merge_sections(section_contents: dict[str, dict]) -> dict:
    """Pure: assemble validated section contents into the resume_json schema the
    renderer expects ({name, contact, summary, experience[], education[],
    sections[]}). Missing sections are simply absent — never fabricated."""
    resume: dict = {}
    contact = section_contents.get("contact") or {}
    if contact.get("name"):
        resume["name"] = contact["name"]
    if isinstance(contact.get("contact"), dict):
        resume["contact"] = contact["contact"]

    summary = section_contents.get("summary") or {}
    if summary.get("summary"):
        resume["summary"] = summary["summary"]

    experience = section_contents.get("experience") or {}
    if isinstance(experience.get("experience"), list):
        resume["experience"] = experience["experience"]

    education = section_contents.get("education") or {}
    if isinstance(education.get("education"), list):
        resume["education"] = education["education"]

    extra_sections = []
    skills = section_contents.get("skills") or {}
    if isinstance(skills.get("items"), list) and skills["items"]:
        extra_sections.append({"title": "Skills", "items": skills["items"]})
    if extra_sections:
        resume["sections"] = extra_sections
    return resume


async def _passthrough(content: dict) -> NodeOutput:
    """A no-LLM orchestrator node body: it plans + spawns workers; the spawned
    worker count is carried on the NodeSpec/GraphNode, not produced here."""
    return NodeOutput(content=content)


def _section_content(out: NodeOutput) -> dict:
    """Unwrap a SectionGenerator NodeOutput to its inner content dict."""
    c = out.content or {}
    inner = c.get("content") if isinstance(c, dict) else None
    return inner if isinstance(inner, dict) else {}


def weak_sections_from(aggregated: dict) -> list[str]:
    """Map the weakest categories to the section keys worth regenerating."""
    keys: list[str] = []
    for w in aggregated.get("weakest", []):
        for sk in _WEAK_CATEGORY_TO_SECTIONS.get(w.get("key", ""), []):
            if sk not in keys:
                keys.append(sk)
    return keys


def _resume_text_for_scoring(resume: dict) -> str:
    """Flatten a resume_json into plain text for the category checkers."""
    lines: list[str] = []
    if resume.get("name"):
        lines.append(str(resume["name"]))
    c = resume.get("contact") or {}
    if isinstance(c, dict):
        bits = [str(c.get(k, "")) for k in ("email", "phone", "location", "linkedin")]
        lines.append(" | ".join(b for b in bits if b))
    if resume.get("summary"):
        lines += ["", "SUMMARY", str(resume["summary"])]
    if resume.get("experience"):
        lines += ["", "EXPERIENCE"]
        for e in resume["experience"]:
            if isinstance(e, dict):
                lines.append(" - ".join(str(e.get(k, "")) for k in ("role", "company", "dates") if e.get(k)))
                for b in (e.get("bullets") or []):
                    lines.append(f"  • {b}")
    for s in (resume.get("sections") or []):
        if isinstance(s, dict):
            lines += ["", str(s.get("title", "")).upper()]
            for it in (s.get("items") or []):
                lines.append(f"  • {it}")
    if resume.get("education"):
        lines += ["", "EDUCATION"]
        for e in resume["education"]:
            if isinstance(e, dict):
                lines.append(" - ".join(str(e.get(k, "")) for k in ("degree", "institution", "dates") if e.get(k)))
    return "\n".join(lines).strip()


async def run_cv_build_graph(
    resume_text: str,
    job_description: str = "",
    *,
    tier: str = "free",
    profile_text: str = "",
    key_skills: Optional[list[str]] = None,
    template_pages: int = 2,
    pass_threshold: Optional[int] = None,
    max_iterations: Optional[int] = None,
    run_id: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    input_hash: str = "",
    persist: bool = True,
    db=None,
    llm=None,
    # Called at stage boundaries with (stage_label, snapshot) so the caller can
    # drive its own job/checkpoint UX (generation_jobs polling + crash resume).
    on_progress: Optional[Callable[[str, dict], Awaitable[None]]] = None,
) -> GraphRun:
    """Run the CV Build graph+loop and return the completed GraphRun.

    The generator↔evaluator loop's three exit rules come from the tier config
    (admin-managed): pass_threshold (quality), max_iterations (cycles), and the
    per-run cost cap. Explicit pass_threshold/max_iterations override the tier
    values (used by tests); the cost cap always comes from the tier.
    """
    run = GraphRun(
        run_id=run_id or uuid.uuid4().hex, kind="cv_build",
        model=active_model(), tier=tier, session_id=session_id,
        user_id=user_id, input_hash=input_hash, status="running",
    )
    corpus = build_build_corpus(resume_text, profile_text, job_description, key_skills)
    # Page budget is a stable per-run constraint — append to the cached corpus so
    # every section worker sees it without an uncached-prompt change.
    corpus += (f"\n\n=== OUTPUT CONSTRAINT ===\nThe finished resume must fit "
               f"{template_pages} A4 page(s). Keep every section tight enough for that budget.")
    loop = tier_rules.loop_controller_for(tier)

    async def _notify(stage: str, snapshot: dict) -> None:
        if on_progress is not None:
            try:
                await on_progress(stage, snapshot)
            except Exception:   # progress is best-effort — never fail the run
                pass
    if pass_threshold is not None or max_iterations is not None:
        loop = LoopController(
            pass_threshold=pass_threshold if pass_threshold is not None else loop.pass_threshold,
            max_iterations=max_iterations if max_iterations is not None else loop.max_iterations,
            max_cost_usd=loop.max_cost_usd,  # cost cap stays tier-driven
        )

    async def _analyze(_deps: dict[str, NodeOutput]) -> NodeOutput:
        # Passthrough root (skills already provided by the caller's job analyzer).
        return NodeOutput(content={"key_skills": key_skills or []})

    # ── Cycle 0: Section Orchestrator spawns section workers (parallel) ────────
    # The orchestrator dynamically decides which sections to write; its worker
    # count is recorded on the node and shown in the graph.
    specs: list[NodeSpec] = [
        NodeSpec(id="analyze", label="Analyze job", agent="Analyze",
                 role="analyze", run=_analyze),
        NodeSpec(id="orchestrate:sections", label="Section Orchestrator",
                 agent="SectionOrchestrator", role="orchestrate", depends_on=["analyze"],
                 spawned_count=len(SECTIONS),
                 run=lambda _d: _passthrough({"spawned": len(SECTIONS)})),
    ]
    for s in SECTIONS:
        # Independent sections spawn from the orchestrator; sections that need a
        # sibling's output depend on that sibling (skills→experience, etc.).
        deps = [f"section:{d}" for d in s["depends_on"]] or ["orchestrate:sections"]
        specs.append(NodeSpec(
            id=f"section:{s['key']}", label=s["label"], agent="SectionWorker",
            role="generate", depends_on=deps, spawned_by="orchestrate:sections",
            detail={"section": s["key"]},
            run=make_section_generator(section_key=s["key"], corpus=corpus, llm=llm),
        ))

    section_ids = [f"section:{s['key']}" for s in SECTIONS]

    async def _merge(deps: dict[str, NodeOutput]) -> NodeOutput:
        contents = {sid.split(":", 1)[1]: _section_content(out) for sid, out in deps.items()}
        resume = merge_sections(contents)
        return NodeOutput(content=resume, detail={"sections": list(contents.keys())})

    specs.append(NodeSpec(id="merge", label="Merge resume", agent="Merge",
                          role="merge", depends_on=section_ids, run=_merge))

    async def _save(r: GraphRun) -> None:
        await store.save(r, db)

    on_update = _save if persist else None
    results = await run_graph(specs, run, concurrency=settings.graph_concurrency, on_update=on_update)

    merge_out = results.get("merge")
    if merge_out is None:
        run.status = "failed"
        run.error = "section merge did not complete"
        run.finished_at = run.updated_at
        if persist:
            await store.save(run, db)
        return run

    best_resume = merge_out.content
    best_sections = {sid.split(":", 1)[1]: results[sid] for sid in section_ids if sid in results}
    await _notify("reviewing your resume across every category",
                  {"best_resume": best_resume, "best_score": 0, "iteration": 0})

    # REVIEW: the Evaluation Agent scores the merged resume (shared with CV Score).
    agg = await run_review(run, _resume_text_for_scoring(best_resume), job_description,
                           upstream="merge", llm=llm)
    best_score = agg["overall_score"]
    await _notify(f"reviewed — score {best_score}",
                  {"best_resume": best_resume, "best_score": best_score, "iteration": 1})

    # ── Refine loop: regenerate only weak sections, keep best ────────────────
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
        weak = weak_sections_from(agg)
        if not weak:
            stop_reason = "plateau"
            break

        # UPDATE: regenerate only the weak sections, re-merge, RE-REVIEW.
        await _notify(f"refining weak sections (pass {iteration})",
                      {"best_resume": best_resume, "best_score": best_score, "iteration": iteration})
        regen = await _regenerate_sections(run, weak, best_sections, corpus, llm)
        merged = merge_sections({k: _section_content(v) for k, v in {**best_sections, **regen}.items()})
        new_agg = await run_review(run, _resume_text_for_scoring(merged), job_description,
                                   upstream="merge", llm=llm)
        new_score = new_agg["overall_score"]
        gains.append(new_score - best_score)

        if new_score > best_score:   # keep-best: only accept an improvement
            best_score = new_score
            best_resume = merged
            best_sections.update(regen)
            agg = new_agg
        iteration += 1
        await _notify(f"reviewed — score {best_score}",
                      {"best_resume": best_resume, "best_score": best_score, "iteration": iteration})
        if persist:
            await store.save(run, db)

    # Record the loop as a first-class object + a visible loopback edge.
    if iteration > 1:
        run.add_loop(LoopRun(loop_id="cv_build:refine", over="sections",
                             iterations=iteration - 1, gain_per_iter=gains,
                             stop_reason=stop_reason or "max_iterations",
                             best_score=float(best_score)))
        run.add_edge(GraphEdge(source="aggregate", target="merge", kind="loopback",
                               loop_count=iteration - 1, label=f"×{iteration - 1} refine"))

    # ── GUARDRAIL: faithfulness verification of the built resume vs the source ─
    faithfulness = await run_verification(run, resume_text,
                                          _resume_text_for_scoring(best_resume),
                                          upstream="aggregate", llm=llm)

    run.result = {"resume": best_resume, "overall_score": best_score,
                  # cycles = the initial generate+review pass plus each refine pass
                  "cycles": iteration,
                  "loop_stop_reason": stop_reason or "passed",
                  "categories": agg.get("categories", []), "weakest": agg.get("weakest", []),
                  "faithfulness": faithfulness}
    run.recompute_totals()   # totals.total_loops depends on the LoopRun added above
    run.status = "completed"
    run.finished_at = run.updated_at
    if persist:
        await store.save(run, db)
    return run


# ── helpers that fold sub-run nodes/cost into the main GraphRun ──────────────

async def _regenerate_sections(run: GraphRun, weak: list[str],
                               best_sections: dict, corpus: str, llm) -> dict:
    """Re-run only the weak section generators (in parallel) and fold their
    cost/loop_count into the main run's existing section nodes."""
    sub = GraphRun(run_id="_regen", kind="cv_build")
    specs = [NodeSpec(id=f"section:{k}", label=k, agent="SectionGenerator",
                      role="refine",
                      run=make_section_generator(section_key=k, corpus=corpus, llm=llm))
             for k in weak]
    results = await run_graph(specs, sub, concurrency=settings.graph_concurrency)
    for sid, out in results.items():
        existing = run.get_node(sid)
        if existing is not None:
            existing.loop_count += 1
            existing.cost.usd += out.cost.usd
            existing.cost.input_tokens += out.cost.input_tokens
            existing.cost.output_tokens += out.cost.output_tokens
            existing.cost.cache_read_tokens += out.cost.cache_read_tokens
            existing.cost.cache_write_tokens += out.cost.cache_write_tokens
            existing.cost.llm_calls += out.cost.llm_calls
    run.recompute_totals()
    return {sid.split(":", 1)[1]: out for sid, out in results.items()}
