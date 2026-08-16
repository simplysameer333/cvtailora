"""Unit tests for LoopController (services/graph/loop.py)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.graph.loop import LoopController


def test_stops_when_passed():
    lc = LoopController(pass_threshold=85, max_iterations=5)
    d = lc.decide(iteration=1, best_score=90, last_gain=90)
    assert d.continue_ is False
    assert d.stop_reason == "passed"


def test_continues_on_first_cycle_below_threshold_with_gain():
    lc = LoopController(pass_threshold=85, max_iterations=5)
    d = lc.decide(iteration=1, best_score=60, last_gain=60)
    assert d.continue_ is True
    assert d.stop_reason == ""


def test_plateau_only_fires_after_min_iterations():
    lc = LoopController(pass_threshold=85, max_iterations=5,
                        plateau_margin=4, min_iterations_before_plateau=2)
    # iteration 1 with tiny gain: too early to call plateau -> continue
    assert lc.decide(iteration=1, best_score=60, last_gain=1).continue_ is True
    # iteration 2 with tiny gain: plateau
    d = lc.decide(iteration=2, best_score=61, last_gain=1)
    assert d.continue_ is False
    assert d.stop_reason == "plateau"


def test_meaningful_gain_keeps_looping():
    lc = LoopController(pass_threshold=85, max_iterations=5, plateau_margin=4)
    d = lc.decide(iteration=3, best_score=70, last_gain=6)
    assert d.continue_ is True


def test_max_iterations_caps_the_loop():
    lc = LoopController(pass_threshold=85, max_iterations=3)
    d = lc.decide(iteration=3, best_score=70, last_gain=10)
    assert d.continue_ is False
    assert d.stop_reason == "max_iterations"


def test_passed_takes_priority_over_max_iterations():
    lc = LoopController(pass_threshold=85, max_iterations=3)
    d = lc.decide(iteration=3, best_score=88, last_gain=10)
    assert d.stop_reason == "passed"


def test_regression_gain_triggers_plateau():
    lc = LoopController(pass_threshold=85, max_iterations=5, plateau_margin=4)
    d = lc.decide(iteration=2, best_score=70, last_gain=-5)
    assert d.continue_ is False
    assert d.stop_reason == "plateau"


def test_cost_cap_stops_the_loop():
    lc = LoopController(pass_threshold=85, max_iterations=9, max_cost_usd=0.20)
    # iteration 1, still below quality + cycle cap, but spend hit the cap
    d = lc.decide(iteration=1, best_score=60, last_gain=60, spent_usd=0.25)
    assert d.continue_ is False
    assert d.stop_reason == "cost_cap"


def test_cost_cap_not_triggered_when_under_budget():
    lc = LoopController(pass_threshold=85, max_iterations=9, max_cost_usd=0.20)
    d = lc.decide(iteration=1, best_score=60, last_gain=60, spent_usd=0.05)
    assert d.continue_ is True


def test_passed_beats_cost_cap():
    lc = LoopController(pass_threshold=85, max_iterations=9, max_cost_usd=0.10)
    d = lc.decide(iteration=1, best_score=90, last_gain=90, spent_usd=5.0)
    assert d.stop_reason == "passed"


def test_no_cost_cap_when_zero():
    lc = LoopController(pass_threshold=85, max_iterations=9, max_cost_usd=0.0)
    d = lc.decide(iteration=1, best_score=60, last_gain=60, spent_usd=100.0)
    assert d.continue_ is True   # 0 = no cost cap


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    print("all loop_controller tests passed")
