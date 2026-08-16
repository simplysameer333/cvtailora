"""End-to-end tests for both graphs with a FAKE gateway (no network/key).

Exercises the full concurrency + dependency + merge + score + refine-loop paths
and asserts the resulting GraphRun structure the visualization will render.
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.llm.gateway import LLMResult
from services.graph.prompts import CATEGORIES, SECTIONS
from services.graph.cv_score_graph import run_cv_score_graph
from services.graph.cv_build_graph import run_cv_build_graph

_CAT_LABEL_TO_KEY = {c["label"]: c["key"] for c in CATEGORIES}
_SEC_LABEL_TO_KEY = {s["label"]: s["key"] for s in SECTIONS}

# Section content the fake generator returns, keyed by section.
_SECTION_REPLY = {
    "contact": {"name": "Alex Morgan", "contact": {"email": "alex@x.com", "phone": "123"}},
    "experience": {"experience": [{"company": "Acme", "role": "Engineer",
                                   "dates": "2020-2024", "bullets": ["Shipped X"]}]},
    "education": {"education": [{"institution": "Uni", "degree": "BSc", "dates": "2015"}]},
    "skills": {"items": ["Python", "SQL", "AWS"]},
    "summary": {"summary": "Senior engineer with a track record."},
}


_IMPROVED = "IMPROVED_RESUME_MARKER"


def _fake_reply(task: str, cached_context: str = "") -> str:
    if "Category to score:" in task:
        label = task.split("Category to score:", 1)[1].split(".", 1)[0].strip()
        key = _CAT_LABEL_TO_KEY.get(label, "")
        # experience is weak (40) UNTIL the resume has been refined (then 90), so a
        # refine cycle actually improves the score and is kept. Others strong (85).
        if key == "experience":
            score = 90 if _IMPROVED in cached_context else 40
        else:
            score = 85
        return json.dumps({"score": score, "status": "weak" if score < 50 else "strong",
                           "checks": [], "improvements": ["Quantify impact."]})
    if "Section to write:" in task:
        label = task.split("Section to write:", 1)[1].split(".", 1)[0].strip()
        key = _SEC_LABEL_TO_KEY.get(label, "")
        return json.dumps({"content": _SECTION_REPLY.get(key, {})})
    if "Improve the resume" in task:                       # Update / refine agent
        return json.dumps({"resume_text": f"{_IMPROVED}\nExperienced engineer, quantified impact."})
    if "Audit the PRODUCED RESUME" in task:                # Verification guardrail
        return json.dumps({"faithful": True, "confidence": 96, "issues": []})
    return "{}"


class FakeGateway:
    def __init__(self):
        self.calls = 0

    async def complete(self, *, system, task, cached_context="", max_tokens=2048,
                       model=None, force_json=False):
        self.calls += 1
        return LLMResult(text=_fake_reply(task, cached_context), model="fake",
                         input_tokens=100, output_tokens=40,
                         cache_read_tokens=0, cache_write_tokens=0,
                         cost_usd=0.001, latency_ms=3)


def test_cv_score_graph_fans_out_and_aggregates():
    fake = FakeGateway()
    run = asyncio.run(run_cv_score_graph("Alex Morgan resume text", "Python job",
                                         persist=False, llm=fake))
    assert run.status == "completed"
    # Evaluation Agent + 8 category workers + aggregate
    workers = [n for n in run.nodes if n.agent == "CategoryWorker"]
    assert len(workers) == len(CATEGORIES)
    assert all(n.spawned_by == "evaluate:orchestrator" for n in workers)
    evaluator = run.get_node("evaluate:orchestrator")
    assert evaluator.spawned_count == len(CATEGORIES)   # "spawned N workers" is recorded
    assert run.get_node("aggregate").status == "completed"
    # workers fan out from the Evaluation Agent, aggregate back in, and the
    # spawn (hierarchy) edges are present too
    edge_kinds = {(e.source, e.target, e.kind) for e in run.edges}
    assert ("evaluate:orchestrator", "category:ats", "fanout") in edge_kinds
    assert ("evaluate:orchestrator", "category:ats", "spawn") in edge_kinds
    assert ("category:ats", "aggregate", "fanin") in edge_kinds
    assert 0 <= run.result["overall_score"] <= 100
    assert run.totals.llm_calls == len(CATEGORIES)   # 8 LLM calls; orchestrator/aggregate are free


def test_default_gateway_fallback_path(monkeypatch):
    # Regression: when no llm is injected, agents must resolve the gateway
    # SINGLETON (from services.llm import gateway) — not `gateway.gateway`.
    # The mocked tests always inject a fake, so this exercises the real fallback.
    from services.llm import gateway as gw   # the singleton (package shadows the submodule)
    fake = FakeGateway()
    monkeypatch.setattr(gw, "complete", fake.complete)
    run = asyncio.run(run_cv_score_graph("Alex resume", "Python job", persist=False))  # llm=None
    assert run.status == "completed"
    assert 0 <= run.result["overall_score"] <= 100


def test_cv_score_generate_review_update_loop_verify():
    # Force the loop by demanding a very high bar the first review can't meet.
    fake = FakeGateway()
    run = asyncio.run(run_cv_score_graph(
        "Alex Morgan resume text", "Python job",
        pass_threshold=95, max_iterations=3, persist=False, llm=fake,
    ))
    assert run.status == "completed"
    # UPDATE (refine) ran, and the loop is a first-class LoopRun + loopback edge
    assert run.get_node("update:refiner") is not None
    assert run.loops and run.loops[0].loop_id == "cv_score:refine"
    assert any(e.kind == "loopback" for e in run.edges)
    # refining lifted experience 40→90, so the kept version improved and is returned
    assert run.result["improved_resume"] is not None
    assert run.result["overall_score"] > 75
    # the Verification guardrail ran and recorded a faithfulness eval on the run
    assert run.get_node("verify:faithfulness") is not None
    assert any(ev.name == "faithfulness" for ev in run.evals)
    assert run.result["faithfulness"]["faithful"] is True


def test_cv_build_graph_sections_merge_and_refine():
    fake = FakeGateway()
    run = asyncio.run(run_cv_build_graph(
        "Alex Morgan resume", "Python engineer job",
        pass_threshold=80, max_iterations=3, persist=False, llm=fake,
    ))
    assert run.status == "completed"
    resume = run.result["resume"]
    # merge assembled the schema from the parallel section agents
    assert resume["name"] == "Alex Morgan"
    assert resume["experience"][0]["role"] == "Engineer"
    assert resume["sections"][0]["title"] == "Skills"
    # dependency edges are present: skills depends on experience, summary on both
    edge_pairs = {(e.source, e.target) for e in run.edges}
    assert ("section:experience", "section:skills") in edge_pairs
    assert ("section:experience", "section:summary") in edge_pairs
    assert ("section:skills", "section:summary") in edge_pairs
    # agent hierarchy: the Section Orchestrator spawned the section workers, and
    # the Evaluation Agent spawned the category workers (dynamic counts recorded)
    assert run.get_node("orchestrate:sections").spawned_count == len(SECTIONS)
    assert run.get_node("evaluate:orchestrator").spawned_count == len(CATEGORIES)
    spawn_pairs = {(e.source, e.target) for e in run.edges if e.kind == "spawn"}
    assert ("orchestrate:sections", "section:experience") in spawn_pairs
    assert ("evaluate:orchestrator", "category:ats") in spawn_pairs
    # the refine loop ran and is visible as a first-class LoopRun + loopback edge
    assert run.loops and run.loops[0].loop_id == "cv_build:refine"
    assert run.loops[0].iterations >= 1
    assert any(e.kind == "loopback" for e in run.edges)
    # experience was regenerated -> its node ran more than once
    assert run.get_node("section:experience").loop_count >= 2
    assert run.totals.total_loops >= 1


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
