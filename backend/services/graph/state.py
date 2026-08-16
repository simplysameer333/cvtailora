"""GraphRun — the single persisted shape for BOTH AI features.

This Pydantic object is the spine of the graph+loop engine. One schema is used
for CV Score and CV Build so that persistence, evals/guardrails, cost accounting,
and the step-by-step graph visualization all plug in uniformly (the user's
"same look and feel" requirement).

The object models a GRAPH (nodes + edges) whose refinement is driven by LOOPS
(LoopRun records + loopback edges). It is the exact thing the frontend renders:
  - GraphNode  -> a box (agent, status, score, time, cost)
  - GraphEdge  -> an arrow (sequential / fanout / fanin / loopback)
  - LoopRun    -> annotates a loopback with "xN iterations, Ys, $Z"

Everything is JSON-serialisable (timestamps are ISO strings) so `.model_dump()`
drops straight into Mongo and back out again. Pure data + a few pure roll-up
helpers — no I/O here, so it unit-tests directly.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ── enumerated vocabularies (kept as Literals so bad values fail validation) ──
RunKind = Literal["cv_score", "cv_build"]
RunStatus = Literal["pending", "running", "completed", "failed"]
NodeStatus = Literal["pending", "running", "completed", "failed", "skipped"]
NodeRole = Literal["analyze", "generate", "evaluate", "merge", "refine", "orchestrate"]
# spawn = a hierarchy edge (an orchestrator agent → a worker it spawned), drawn
# distinctly from the runtime dependency edges (fanout/fanin/sequential/loopback).
EdgeKind = Literal["sequential", "fanout", "fanin", "loopback", "spawn"]
Severity = Literal["info", "warning", "error"]


def _now_iso() -> str:
    """UTC ISO-8601 timestamp. One helper so every timestamp in a run matches."""
    return datetime.now(timezone.utc).isoformat()


class NodeCost(BaseModel):
    """Per-node token/cost accounting, summed from that node's LLM call(s)."""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    usd: float = 0.0
    llm_calls: int = 0


class CostRollup(BaseModel):
    """Run-level totals — the numbers shown on the graph header and in telemetry."""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    usd: float = 0.0
    llm_calls: int = 0
    latency_ms: int = 0
    total_loops: int = 0


class EvalResult(BaseModel):
    """One guardrail/eval outcome. Attaches to a node OR the whole run, so evals
    and guardrails plug into the same place everywhere (the user's requirement)."""
    name: str
    passed: bool
    score: Optional[float] = None
    message: str = ""
    severity: Severity = "info"


class GraphNode(BaseModel):
    """One agent-node in the run graph — a box in the visualization."""
    id: str                       # stable, unique, e.g. "category:ats" / "section:experience"
    label: str                    # human label for the box
    agent: str                    # agent/class name that ran it
    role: NodeRole
    status: NodeStatus = "pending"
    # Agent hierarchy: which orchestrator agent spawned this node (worker), and —
    # on an orchestrator — how many workers it spawned this run (dynamic per
    # resume). Together these answer "which agent spawned how many workers".
    spawned_by: Optional[str] = None
    spawned_count: int = 0
    loop_count: int = 1           # how many times this node ran (refine loops)
    score: Optional[float] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    latency_ms: int = 0
    cost: NodeCost = Field(default_factory=NodeCost)
    evals: list[EvalResult] = Field(default_factory=list)
    # Node-specific payload (suggestions, section text ref, category key, …).
    detail: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    """A directed edge between nodes — an arrow in the visualization.

    kind carries the graph-engineering semantics: fanout (one → many parallel
    sub-agents), fanin (many → merge), sequential, or loopback (refinement).
    loop_count annotates a loopback arrow with how many times it fired.
    """
    source: str
    target: str
    kind: EdgeKind = "sequential"
    loop_count: int = 0
    label: Optional[str] = None


class LoopRun(BaseModel):
    """One refinement LOOP's record — makes loop engineering first-class and
    visible. `gain_per_iter` and `stop_reason` come straight from LoopController."""
    loop_id: str                  # e.g. "refine:experience" or "cv_score:refine"
    over: str = ""                # node/subgraph the loop refined
    iterations: int = 0
    gain_per_iter: list[float] = Field(default_factory=list)
    stop_reason: str = ""         # "passed" | "plateau" | "max_iterations"
    best_score: Optional[float] = None
    cost_usd: float = 0.0
    latency_ms: int = 0


class GraphRun(BaseModel):
    """The whole run — persisted to `graph_runs`, rendered by the graph view."""
    run_id: str
    kind: RunKind
    status: RunStatus = "pending"
    model: str = ""               # the single config-driven model used
    tier: str = "free"            # subscription tier — drives the loop exit rules
    input_hash: str = ""          # dedupe / cache key for the run's inputs
    session_id: Optional[str] = None
    user_id: Optional[str] = None

    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    finished_at: Optional[str] = None

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    loops: list[LoopRun] = Field(default_factory=list)
    totals: CostRollup = Field(default_factory=CostRollup)
    evals: list[EvalResult] = Field(default_factory=list)

    result: Optional[dict[str, Any]] = None   # final merged output (resume json / score)
    error: Optional[str] = None

    # ── mutation helpers (keep call sites terse; each stamps updated_at) ──────
    def touch(self) -> None:
        self.updated_at = _now_iso()

    def add_node(self, node: GraphNode) -> GraphNode:
        self.nodes.append(node)
        self.touch()
        return node

    def get_node(self, node_id: str) -> Optional[GraphNode]:
        return next((n for n in self.nodes if n.id == node_id), None)

    def add_edge(self, edge: GraphEdge) -> GraphEdge:
        self.edges.append(edge)
        self.touch()
        return edge

    def add_loop(self, loop: LoopRun) -> LoopRun:
        self.loops.append(loop)
        self.touch()
        return loop

    def recompute_totals(self) -> CostRollup:
        """Roll node costs + loop counts up into run totals. Pure over self."""
        t = CostRollup()
        for n in self.nodes:
            t.input_tokens += n.cost.input_tokens
            t.output_tokens += n.cost.output_tokens
            t.cache_read_tokens += n.cost.cache_read_tokens
            t.cache_write_tokens += n.cost.cache_write_tokens
            t.usd += n.cost.usd
            t.llm_calls += n.cost.llm_calls
            t.latency_ms += n.latency_ms
        t.total_loops = sum(lr.iterations for lr in self.loops)
        t.usd = round(t.usd, 6)
        self.totals = t
        self.touch()
        return t

    def to_doc(self) -> dict:
        """Mongo document form — plain JSON-compatible dict keyed by run_id."""
        doc = self.model_dump(mode="json")
        doc["_id"] = self.run_id
        return doc

    @classmethod
    def from_doc(cls, doc: dict) -> "GraphRun":
        """Rebuild from a Mongo document (drops the _id mirror of run_id)."""
        data = {k: v for k, v in doc.items() if k != "_id"}
        return cls.model_validate(data)
