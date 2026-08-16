"""LoopController — loop engineering as a first-class, pure object.

The old codebase scattered the refine-loop decision across
`pipeline/nodes.should_continue` and `cv_check_flow`'s inline Ralph loop. Here it
is ONE deterministic policy object, so every graph (CV Score category loops, CV
Build section loops) shares the same, unit-tested stop logic.

The policy: keep refining while the best score is below the pass threshold, but
stop early once the loop plateaus (a cycle that fails to gain a meaningful
margin) or the iteration cap is hit. Because callers always keep the BEST
iteration, stopping early can only save spend, never lower quality.

Pure and side-effect free — `decide()` takes the loop's observed numbers and
returns a decision. No I/O, no LLM, no state mutation.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

StopReason = Literal["", "passed", "cost_cap", "max_iterations", "plateau"]


@dataclass(frozen=True)
class LoopDecision:
    """Result of one loop-control check."""
    continue_: bool
    stop_reason: StopReason


@dataclass(frozen=True)
class LoopController:
    """Immutable generator↔evaluator loop policy. Built per run from TIER config
    (services/graph/tier_rules.loop_controller_for) so all three exit rules are
    admin-manageable per tier. The three tier-based exit rules the user asked for:

    - EXIT QUALITY:  pass_threshold — score at/above which the loop is done.
    - CYCLE CAP:     max_iterations — hard cap on refine cycles.
    - COST CAP:      max_cost_usd  — stop once estimated run spend reaches this
                     (0 = no cost cap).

    plateau_margin / min_iterations_before_plateau add the cost-efficiency
    early-exit (stop a stalled loop) on top of the three hard caps.
    """
    pass_threshold: int
    max_iterations: int
    max_cost_usd: float = 0.0
    plateau_margin: int = 4
    min_iterations_before_plateau: int = 2

    def decide(self, *, iteration: int, best_score: float, last_gain: float,
               spent_usd: float = 0.0) -> LoopDecision:
        """Continue or stop after completing `iteration` cycles (1-indexed).

        best_score  — highest score seen so far across all iterations.
        last_gain   — score improvement of the most recent cycle over the prior
                      best (may be negative on a regression).
        spent_usd   — estimated total run cost so far (for the cost cap).
        """
        # Exit-quality reached → success, regardless of budget left.
        if best_score >= self.pass_threshold:
            return LoopDecision(False, "passed")
        # Hard caps: cost first (protect spend), then cycle count.
        if self.max_cost_usd > 0 and spent_usd >= self.max_cost_usd:
            return LoopDecision(False, "cost_cap")
        if iteration >= self.max_iterations:
            return LoopDecision(False, "max_iterations")
        # Plateau: after a real attempt or two, a cycle that didn't move the
        # needle means more cycles won't either — stop and keep the best.
        if iteration >= self.min_iterations_before_plateau and last_gain < self.plateau_margin:
            return LoopDecision(False, "plateau")
        return LoopDecision(True, "")
