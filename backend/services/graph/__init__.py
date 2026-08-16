"""Graph + loop engine.

The app's two AI features (CV Score, CV Build) run as a GRAPH of agent-nodes
plus refinement LOOPS — not a workflow engine. This package holds the shared
spine every feature is built on:

- state.py  — GraphRun, the one Pydantic shape persisted to Mongo AND rendered
              by the graph visualization (nodes, edges, loops, cost, evals).
- loop.py   — LoopController, the loop-engineering policy (continue/stop) as a
              first-class, pure, testable object.
- store.py  — persist/load a GraphRun to the `graph_runs` collection.
- builder.py, agents/, nodes/  — added in later phases (the graphs themselves).
"""
from .state import (
    CostRollup,
    EvalResult,
    GraphEdge,
    GraphNode,
    GraphRun,
    LoopRun,
)
from .loop import LoopController, LoopDecision

__all__ = [
    "GraphRun",
    "GraphNode",
    "GraphEdge",
    "LoopRun",
    "CostRollup",
    "EvalResult",
    "LoopController",
    "LoopDecision",
]
