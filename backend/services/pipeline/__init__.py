"""Legacy pipeline package — now trimmed to the pieces the graph engine still uses.

The LangGraph evaluator-optimizer graph (graph.py / nodes.py / state.py /
aggregator.py / reviewer.py) was removed when both CV Score and CV Build moved
onto services/graph. What remains here is still live:
  - GeneratorAgent — section-level regeneration (routers/generate.py)
  - telemetry — usage capture for the CV-Score family + auto-fix
  - agents/job_analyzer, agents/gap_filler, agents/evaluators/cv_score, toon,
    prompts/* — used by generation, auto-fix, and the CV-Score service.
"""
from .agents.generator import GeneratorAgent

# Shared generator instance for section-level regeneration (used by the router
# directly, bypassing the graph engine for single-section edits).
generator = GeneratorAgent()

__all__ = ["generator"]
