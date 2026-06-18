"""Unit tests for the aggregator's headline-score semantics.

Pins the 2026-06 fix: the builder headline = the cv_score evaluator's score
(the same number the CV Score page shows), NOT min() across the panel. The
cross-provider evaluators (openai/google) drive feedback + a faithfulness flag
only — a harsh/divergent one must never hijack the headline.
"""
from services.pipeline.agents.aggregator import AggregatorAgent

A = AggregatorAgent()


def _run(results, threshold=80):
    return A.run(results, profession_config={}, pass_threshold=threshold)


def test_headline_is_cv_score_not_min():
    # cv_score 75, openai capped at 40 — headline must be 75, not 40.
    res = _run([
        {"model": "cv_score", "score": 75, "suggestions": ["[ATS] add keyword"]},
        {"model": "openai", "score": 40, "suggestions": ["add metrics"]},
    ])
    assert res["min_score"] == 75
    assert res["all_passed"] is False  # 75 < 80


def test_passes_when_cv_score_clears_bar():
    # A divergent low openai score must not block a passing cv_score.
    res = _run([
        {"model": "cv_score", "score": 82, "suggestions": []},
        {"model": "openai", "score": 55, "suggestions": ["x"]},
    ])
    assert res["min_score"] == 82
    assert res["all_passed"] is True


def test_faithfulness_warning_surfaced_from_fabrication_cap():
    res = _run([
        {"model": "cv_score", "score": 75, "suggestions": []},
        {"model": "openai", "score": 40,
         "suggestions": ['The cert "Training, 2026" is not supported by the original resume']},
    ])
    assert res["faithfulness_warning"] is not None
    assert "2026" in res["faithfulness_warning"]


def test_low_openai_without_fabrication_marker_is_not_a_warning():
    # A low score that is NOT about fabrication must not raise a false flag.
    res = _run([
        {"model": "cv_score", "score": 75, "suggestions": []},
        {"model": "openai", "score": 38, "suggestions": ["Weak quantification density"]},
    ])
    assert res["faithfulness_warning"] is None


def test_falls_back_to_min_when_cv_score_absent():
    # Defensive: if cv_score somehow didn't run, fall back to min() of what's there.
    res = _run([
        {"model": "openai", "score": 60, "suggestions": []},
        {"model": "google", "score": 70, "suggestions": []},
    ])
    assert res["min_score"] == 60


def test_none_scores_are_ignored():
    res = _run([
        {"model": "cv_score", "score": 78, "suggestions": []},
        {"model": "openai", "score": None, "suggestions": ["Evaluator error: timeout"]},
    ])
    assert res["min_score"] == 78
    assert res["faithfulness_warning"] is None
