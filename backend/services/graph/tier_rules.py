"""Tier → loop exit rules resolver.

Builds a LoopController for a run from the ADMIN-MANAGED tier config (Mongo
`tier_config`, editable in the admin dashboard). Keeps loop.py free of any
tier/config import (SOLID): loop.py is the pure policy, this is the wiring.

The three tier-based exit rules the user asked for, all admin-editable:
  - pass_threshold      → exit quality
  - max_eval_cycles     → cycle cap
  - max_run_cost_cents  → cost cap (per run)
"""
from __future__ import annotations

from services.tier_config_service import get_limit
from .loop import LoopController

# Fallbacks if a tier limit is missing/None (unlimited) so the loop always has a
# concrete, safe bound rather than running unbounded.
_DEFAULT_THRESHOLD = 75
_DEFAULT_MAX_CYCLES = 3


def loop_controller_for(tier: str) -> LoopController:
    """Resolve the generator↔evaluator loop policy for `tier` from tier config."""
    threshold = get_limit(tier, "pass_threshold")
    cycles = get_limit(tier, "max_eval_cycles")
    cost_cents = get_limit(tier, "max_run_cost_cents")
    return LoopController(
        pass_threshold=int(threshold) if threshold else _DEFAULT_THRESHOLD,
        max_iterations=int(cycles) if cycles else _DEFAULT_MAX_CYCLES,
        # None (unlimited) or 0 → no cost cap.
        max_cost_usd=(int(cost_cents) / 100.0) if cost_cents else 0.0,
    )
