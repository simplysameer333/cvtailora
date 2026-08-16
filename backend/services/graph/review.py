"""Shared REVIEW phase for both flows (Generate → Review → Update → Loop/Exit).

The Evaluation Agent orchestrator spawns one category worker per quality category
(dynamic count), scores them in parallel, folds them into the run under the
agent, and returns the aggregate. On a repeat review (a refine cycle) it
accumulates cost onto the existing worker nodes and bumps their loop_count, so
run totals stay honest and the graph shows the workers ran again.

Used by cv_score_graph and cv_build_graph so the "Review" is identical in both.
"""
from __future__ import annotations

from typing import Optional

from config import settings

from .aggregate import aggregate_categories
from .agents import make_category_checker
from .prompts import CATEGORIES, build_corpus
from .runner import NodeSpec, run_graph
from .state import GraphEdge, GraphNode, GraphRun

EVALUATOR_ID = "evaluate:orchestrator"


def _ensure_evaluation_agent(run: GraphRun, upstream: Optional[str]) -> None:
    """Ensure the Evaluation Agent node (and its upstream edge, if any) exists."""
    if run.get_node(EVALUATOR_ID) is None:
        run.add_node(GraphNode(id=EVALUATOR_ID, label="Evaluation Agent",
                               agent="EvaluationAgent", role="orchestrate",
                               status="completed", spawned_count=len(CATEGORIES)))
        if upstream:
            run.add_edge(GraphEdge(source=upstream, target=EVALUATOR_ID, kind="sequential"))


def _fold(run: GraphRun, sub: GraphRun) -> None:
    """Fold category-worker nodes from a scoring pass into the main run under the
    Evaluation Agent; accumulate cost + loop_count on a repeat pass."""
    for node in sub.nodes:
        existing = run.get_node(node.id)
        if existing is None:
            node.spawned_by = EVALUATOR_ID
            run.nodes.append(node)
            run.add_edge(GraphEdge(source=EVALUATOR_ID, target=node.id, kind="spawn"))
            run.add_edge(GraphEdge(source=EVALUATOR_ID, target=node.id, kind="fanout"))
        else:
            existing.loop_count += 1
            existing.status = node.status
            existing.score = node.score
            existing.latency_ms = node.latency_ms
            existing.detail.update(node.detail)
            existing.cost.input_tokens += node.cost.input_tokens
            existing.cost.output_tokens += node.cost.output_tokens
            existing.cost.cache_read_tokens += node.cost.cache_read_tokens
            existing.cost.cache_write_tokens += node.cost.cache_write_tokens
            existing.cost.usd += node.cost.usd
            existing.cost.llm_calls += node.cost.llm_calls
            existing.evals = node.evals
    run.recompute_totals()


def _apply_aggregate(run: GraphRun, agg: dict) -> None:
    """Ensure the aggregate node exists (fan-in from the workers) and carries the
    latest overall score + weakest categories."""
    if run.get_node("aggregate") is None:
        run.add_node(GraphNode(id="aggregate", label="Overall score",
                               agent="Aggregate", role="merge", status="completed"))
        for c in CATEGORIES:
            run.add_edge(GraphEdge(source=f"category:{c['key']}", target="aggregate", kind="fanin"))
    node = run.get_node("aggregate")
    node.status = "completed"
    node.score = float(agg["overall_score"])
    node.detail["weakest"] = agg.get("weakest", [])
    run.touch()


async def run_review(run: GraphRun, resume_text: str, job_description: str = "",
                     *, upstream: Optional[str] = None, llm=None) -> dict:
    """Run the Review phase over `resume_text`, fold it into `run`, return the
    aggregate ({overall_score, categories, weakest})."""
    _ensure_evaluation_agent(run, upstream)
    corpus = build_corpus(resume_text, job_description)
    tmp = GraphRun(run_id="_review", kind=run.kind)
    specs = [NodeSpec(id=f"category:{c['key']}", label=c["label"], agent="CategoryWorker",
                      role="evaluate",
                      run=make_category_checker(category_key=c["key"], corpus=corpus, llm=llm))
             for c in CATEGORIES]
    results = await run_graph(specs, tmp, concurrency=settings.graph_concurrency)
    cats = [r.content for r in results.values() if isinstance(r.content, dict) and "key" in r.content]
    agg = aggregate_categories(cats)
    _fold(run, tmp)
    _apply_aggregate(run, agg)
    return agg
