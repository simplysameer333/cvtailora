"""Async DAG runner — the concurrency core of the graph+loop engine.

Nodes declare their dependencies (`depends_on`). The runner then:
  - runs every node whose dependencies are satisfied CONCURRENTLY (asyncio),
  - makes a dependent node await ONLY its specific predecessors (so a section
    agent connects to another node exactly when it needs that node's output —
    never blocking on unrelated work),
  - bounds the number of in-flight LLM calls with a semaphore (many blocking
    LLM calls → cap parallelism so we don't trip the provider rate limit),
  - records the dependency edges into the GraphRun so the visualization shows
    the real fan-out / fan-in / sequential structure.

Design note on no-deadlock: a node awaits its dependencies BEFORE acquiring the
concurrency semaphore, and only holds the semaphore for the actual work. A deep
node therefore never occupies a concurrency slot while merely waiting upstream.

Pure-ish: the runner does no LLM I/O itself — each NodeSpec.run is an async
callable the caller supplies (real gateway calls in production, trivial coros in
tests), so the scheduler unit-tests without a network.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from .state import EvalResult, GraphEdge, GraphNode, GraphRun, NodeCost

logger = logging.getLogger("cvtailora.graph")


@dataclass
class NodeOutput:
    """What a node's `run` returns. The runner folds these onto the GraphNode."""
    content: Any = None
    score: Optional[float] = None
    cost: NodeCost = field(default_factory=NodeCost)
    evals: list[EvalResult] = field(default_factory=list)
    detail: dict = field(default_factory=dict)
    latency_ms: int = 0


# A node's work: receives {dep_id: NodeOutput} for its declared dependencies.
NodeRun = Callable[[dict[str, NodeOutput]], Awaitable[NodeOutput]]


@dataclass
class NodeSpec:
    """One node to schedule. `depends_on` drives BOTH concurrency and the edges."""
    id: str
    label: str
    agent: str
    role: str                       # analyze | generate | evaluate | merge | refine | orchestrate
    run: NodeRun
    depends_on: list[str] = field(default_factory=list)
    detail: dict = field(default_factory=dict)
    # Agent hierarchy (annotation, NOT a runtime dependency): the orchestrator
    # that spawned this worker, and — on an orchestrator — its worker count.
    spawned_by: Optional[str] = None
    spawned_count: int = 0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_edges(specs: list[NodeSpec]) -> list[GraphEdge]:
    """Turn declared dependencies into GraphEdges, classifying each for the viz.

    - a source with multiple outgoing edges → those edges are `fanout`
    - a target with multiple incoming edges → those edges are `fanin`
    - otherwise `sequential`
    (fan-in wins when a node is both, since the merge is the salient shape.)
    """
    out_degree: dict[str, int] = {}
    in_degree: dict[str, int] = {}
    for spec in specs:
        for dep in spec.depends_on:
            out_degree[dep] = out_degree.get(dep, 0) + 1
            in_degree[spec.id] = in_degree.get(spec.id, 0) + 1

    edges: list[GraphEdge] = []
    for spec in specs:
        for dep in spec.depends_on:
            if in_degree.get(spec.id, 0) > 1:
                kind = "fanin"
            elif out_degree.get(dep, 0) > 1:
                kind = "fanout"
            else:
                kind = "sequential"
            edges.append(GraphEdge(source=dep, target=spec.id, kind=kind))
    return edges


def _spawn_edges(specs: list[NodeSpec]) -> list[GraphEdge]:
    """Hierarchy edges from each orchestrator to the workers it spawned. These are
    annotations (who created whom), not scheduling dependencies — so the graph
    shows the agent → agent-worker structure alongside the data-flow edges."""
    ids = {s.id for s in specs}
    return [GraphEdge(source=s.spawned_by, target=s.id, kind="spawn")
            for s in specs if s.spawned_by and s.spawned_by in ids]


async def run_graph(
    specs: list[NodeSpec],
    run: GraphRun,
    *,
    concurrency: int = 5,
    on_update: Optional[Callable[[GraphRun], Awaitable[None]]] = None,
) -> dict[str, NodeOutput]:
    """Execute the DAG. Populates `run` with nodes/edges/status/costs as it goes.

    Returns {node_id: NodeOutput} for every node that completed. Nodes whose
    dependencies failed are marked `skipped` and omitted from the results.
    `on_update` (if given) is awaited after each node state change so a poller /
    the live visualization sees progress mid-run.
    """
    # Seed the graph with pending nodes + the dependency edges up front, so the
    # visualization can render the planned DAG before any node has run.
    for spec in specs:
        if run.get_node(spec.id) is None:
            run.add_node(GraphNode(id=spec.id, label=spec.label, agent=spec.agent,
                                   role=spec.role, status="pending", detail=dict(spec.detail),
                                   spawned_by=spec.spawned_by, spawned_count=spec.spawned_count))
    # Dependency edges (scheduling) + hierarchy spawn edges (orchestrator→worker).
    run.edges = build_edges(specs) + _spawn_edges(specs)
    if on_update:
        await on_update(run)

    sem = asyncio.Semaphore(max(1, concurrency))
    tasks: dict[str, asyncio.Task] = {}
    results: dict[str, NodeOutput] = {}

    async def _execute(spec: NodeSpec) -> NodeOutput:
        node = run.get_node(spec.id)
        # Await ONLY this node's declared dependencies. Independent nodes await
        # nothing and start immediately (bounded by the semaphore).
        dep_results: dict[str, NodeOutput] = {}
        for dep in spec.depends_on:
            try:
                dep_results[dep] = await tasks[dep]
            except Exception:
                # A dependency failed → this node cannot run meaningfully.
                node.status = "skipped"
                node.detail["skipped_reason"] = f"dependency {dep} failed"
                if on_update:
                    await on_update(run)
                raise

        async with sem:
            node.status = "running"
            node.started_at = _now_iso()
            if on_update:
                await on_update(run)
            try:
                out = await spec.run(dep_results)
            except Exception as exc:
                node.status = "failed"
                node.finished_at = _now_iso()
                node.detail["error"] = str(exc)
                logger.warning("[graph] node %s failed: %s", spec.id, exc)
                if on_update:
                    await on_update(run)
                raise

        # Fold the node's output onto its GraphNode.
        node.status = "completed"
        node.finished_at = _now_iso()
        node.latency_ms = out.latency_ms
        node.score = out.score
        node.cost = out.cost
        node.evals = out.evals
        node.detail.update(out.detail or {})
        results[spec.id] = out
        run.recompute_totals()
        if on_update:
            await on_update(run)
        return out

    for spec in specs:
        tasks[spec.id] = asyncio.create_task(_execute(spec))

    # Gather with return_exceptions so one failed node doesn't cancel siblings;
    # failures are already recorded on their GraphNodes above.
    await asyncio.gather(*tasks.values(), return_exceptions=True)
    run.recompute_totals()
    return results
