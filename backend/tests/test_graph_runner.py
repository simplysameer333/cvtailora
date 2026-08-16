"""Unit tests for the async DAG runner (services/graph/runner.py).

Proves the properties the user asked for: independent nodes run in PARALLEL, a
dependent node awaits ONLY its declared predecessors, concurrency is bounded, a
failed dependency skips its dependents, and dependencies surface as graph edges.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.graph.runner import NodeOutput, NodeSpec, build_edges, run_graph
from services.graph.state import GraphRun


def _mk(concurrency_counter):
    """A node factory that tracks peak concurrency across nodes."""
    async def run(_deps):
        concurrency_counter["cur"] += 1
        concurrency_counter["max"] = max(concurrency_counter["max"], concurrency_counter["cur"])
        await asyncio.sleep(0.02)  # hold the slot so overlap is observable
        concurrency_counter["cur"] -= 1
        return NodeOutput(content="ok")
    return run


def test_independent_nodes_run_in_parallel():
    ctr = {"cur": 0, "max": 0}
    specs = [NodeSpec(id=f"n{i}", label=f"N{i}", agent="T", role="evaluate", run=_mk(ctr))
             for i in range(3)]
    run = GraphRun(run_id="r", kind="cv_score")
    asyncio.run(run_graph(specs, run, concurrency=5))
    assert ctr["max"] == 3   # all three overlapped


def test_concurrency_is_bounded_by_semaphore():
    ctr = {"cur": 0, "max": 0}
    specs = [NodeSpec(id=f"n{i}", label=f"N{i}", agent="T", role="evaluate", run=_mk(ctr))
             for i in range(4)]
    run = GraphRun(run_id="r", kind="cv_score")
    asyncio.run(run_graph(specs, run, concurrency=2))
    assert ctr["max"] == 2   # never more than 2 in flight


def test_dependent_node_sees_dep_output_and_runs_after():
    order = []

    async def a(_deps):
        order.append("a")
        return NodeOutput(content="A_RESULT")

    async def b(deps):
        # b must observe a's output and run strictly after a completed
        assert deps["a"].content == "A_RESULT"
        order.append("b")
        return NodeOutput(content="B")

    specs = [
        NodeSpec(id="a", label="A", agent="T", role="generate", run=a),
        NodeSpec(id="b", label="B", agent="T", role="generate", run=b, depends_on=["a"]),
    ]
    run = GraphRun(run_id="r", kind="cv_build")
    asyncio.run(run_graph(specs, run, concurrency=5))
    assert order == ["a", "b"]


def test_failed_dependency_skips_dependents():
    async def boom(_deps):
        raise RuntimeError("nope")

    async def child(_deps):
        return NodeOutput(content="ran")

    specs = [
        NodeSpec(id="p", label="P", agent="T", role="generate", run=boom),
        NodeSpec(id="c", label="C", agent="T", role="generate", run=child, depends_on=["p"]),
    ]
    run = GraphRun(run_id="r", kind="cv_build")
    results = asyncio.run(run_graph(specs, run, concurrency=5))
    assert "c" not in results               # child never ran
    assert run.get_node("p").status == "failed"
    assert run.get_node("c").status == "skipped"


def test_edges_classified_fanout_fanin_sequential():
    specs = [
        NodeSpec(id="root", label="R", agent="T", role="analyze", run=None),
        NodeSpec(id="x", label="X", agent="T", role="evaluate", run=None, depends_on=["root"]),
        NodeSpec(id="y", label="Y", agent="T", role="evaluate", run=None, depends_on=["root"]),
        NodeSpec(id="m", label="M", agent="T", role="merge", run=None, depends_on=["x", "y"]),
    ]
    edges = build_edges(specs)
    kinds = {(e.source, e.target): e.kind for e in edges}
    assert kinds[("root", "x")] == "fanout"   # root has 2 children
    assert kinds[("root", "y")] == "fanout"
    assert kinds[("x", "m")] == "fanin"        # m has 2 parents
    assert kinds[("y", "m")] == "fanin"


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
