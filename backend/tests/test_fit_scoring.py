"""Unit tests for the fit-scoring improvement-actions validation gate.

Raw LLM output is never trusted (CLAUDE.md): validate_improvement_actions
must drop malformed entries and out-of-vocabulary `where` values rather than
passing them through to the frontend, which only knows how to render/link
the fixed vocabulary (profile / summary / instructions).
"""
from services.fit_scoring_service import validate_improvement_actions


def test_valid_actions_pass_through():
    raw = [
        {"action": "Add Kotlin to your profile skills if you have it", "where": "profile"},
        {"action": "Reframe your VP role around hands-on delivery", "where": "summary"},
    ]
    out = validate_improvement_actions(raw)
    assert out == raw


def test_invalid_where_dropped():
    raw = [
        {"action": "Add a skill", "where": "profile"},
        {"action": "Do something vague", "where": "resume"},  # not in vocabulary
    ]
    out = validate_improvement_actions(raw)
    assert len(out) == 1
    assert out[0]["where"] == "profile"


def test_empty_action_dropped():
    raw = [{"action": "", "where": "profile"}, {"action": "   ", "where": "summary"}]
    assert validate_improvement_actions(raw) == []


def test_where_is_case_insensitive_and_trimmed():
    raw = [{"action": "Add it", "where": " Profile "}]
    out = validate_improvement_actions(raw)
    assert out[0]["where"] == "profile"


def test_non_list_input_returns_empty():
    assert validate_improvement_actions(None) == []
    assert validate_improvement_actions("not a list") == []
    assert validate_improvement_actions({"action": "x"}) == []


def test_non_dict_items_skipped():
    raw = ["just a string", {"action": "Real one", "where": "instructions"}]
    out = validate_improvement_actions(raw)
    assert len(out) == 1


def test_capped_at_five():
    raw = [{"action": f"Action {i}", "where": "profile"} for i in range(10)]
    out = validate_improvement_actions(raw)
    assert len(out) == 5
