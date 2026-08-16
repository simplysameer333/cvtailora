"""Unit tests for the GraphRun spine (services/graph/state.py)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.graph.state import (
    CostRollup,
    EvalResult,
    GraphEdge,
    GraphNode,
    GraphRun,
    LoopRun,
    NodeCost,
)


def _run() -> GraphRun:
    return GraphRun(run_id="r1", kind="cv_score", model="anthropic/claude-sonnet-4.5")


def test_roundtrip_through_mongo_doc_is_lossless():
    run = _run()
    run.add_node(GraphNode(
        id="category:ats", label="ATS", agent="CategoryChecker", role="evaluate",
        status="completed", score=80.0,
        cost=NodeCost(input_tokens=100, output_tokens=50, usd=0.001, llm_calls=1),
        evals=[EvalResult(name="schema", passed=True)],
    ))
    run.add_edge(GraphEdge(source="parse", target="category:ats", kind="fanout"))
    run.add_loop(LoopRun(loop_id="cv_score:refine", iterations=2, stop_reason="plateau"))
    run.recompute_totals()

    doc = run.to_doc()
    assert doc["_id"] == "r1"
    rebuilt = GraphRun.from_doc(doc)

    assert rebuilt.run_id == run.run_id
    assert rebuilt.nodes[0].score == 80.0
    assert rebuilt.nodes[0].evals[0].passed is True
    assert rebuilt.edges[0].kind == "fanout"
    assert rebuilt.loops[0].iterations == 2
    assert rebuilt.to_doc() == doc  # byte-for-byte stable round trip


def test_recompute_totals_sums_nodes_and_loops():
    run = _run()
    run.add_node(GraphNode(id="a", label="A", agent="X", role="generate",
                           latency_ms=100,
                           cost=NodeCost(input_tokens=10, output_tokens=5, usd=0.002, llm_calls=1)))
    run.add_node(GraphNode(id="b", label="B", agent="X", role="evaluate",
                           latency_ms=200,
                           cost=NodeCost(input_tokens=20, cache_read_tokens=30,
                                         output_tokens=5, usd=0.003, llm_calls=1)))
    run.add_loop(LoopRun(loop_id="l1", iterations=3))
    t = run.recompute_totals()

    assert isinstance(t, CostRollup)
    assert t.input_tokens == 30
    assert t.cache_read_tokens == 30
    assert t.output_tokens == 10
    assert t.llm_calls == 2
    assert t.latency_ms == 300
    assert t.total_loops == 3
    assert round(t.usd, 6) == 0.005


def test_get_node_and_touch_updates_timestamp():
    run = _run()
    before = run.updated_at
    run.add_node(GraphNode(id="n", label="N", agent="X", role="merge"))
    assert run.get_node("n") is not None
    assert run.get_node("missing") is None
    assert run.updated_at >= before


def test_evals_attach_at_run_and_node_level():
    run = _run()
    run.evals.append(EvalResult(name="faithfulness", passed=False,
                                message="fabrication", severity="warning"))
    run.add_node(GraphNode(id="n", label="N", agent="X", role="evaluate",
                           evals=[EvalResult(name="in_vocab", passed=True)]))
    doc = GraphRun.from_doc(run.to_doc())
    assert doc.evals[0].severity == "warning"
    assert doc.nodes[0].evals[0].name == "in_vocab"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    print("all graph_state tests passed")
