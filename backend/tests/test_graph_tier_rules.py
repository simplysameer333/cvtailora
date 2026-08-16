"""Unit tests for tier → loop-exit-rule resolution (services/graph/tier_rules).

The three exit rules (quality / cycles / cost) come from the admin-managed tier
config, so higher tiers get a higher quality bar, more cycles, and a bigger
per-run cost budget."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.graph.tier_rules import loop_controller_for


def test_free_tier_rules_from_defaults():
    lc = loop_controller_for("free")
    assert lc.pass_threshold == 70       # DEFAULT_LIMITS pass_threshold.free
    assert lc.max_iterations == 3        # max_eval_cycles.free
    assert lc.max_cost_usd == 0.15       # max_run_cost_cents.free (15¢)


def test_pro_tier_gets_higher_bar_and_budget():
    free = loop_controller_for("free")
    pro = loop_controller_for("pro")
    assert pro.pass_threshold > free.pass_threshold
    assert pro.max_iterations > free.max_iterations
    assert pro.max_cost_usd > free.max_cost_usd


def test_unknown_tier_falls_back_safely():
    lc = loop_controller_for("nonexistent")
    # get_limit returns 0 for an unknown tier -> resolver uses safe defaults / no cap
    assert lc.pass_threshold == 75
    assert lc.max_iterations == 3
    assert lc.max_cost_usd == 0.0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
