"""Unit tests for auto-fix gap outcomes (services/autofix_service.py pure parts)
and the validator's no-op rejection."""
from services.autofix_service import build_gaps_text, apply_gap_outcomes
from services.autofix_validator import validate_and_apply, build_source_corpus

ACTIONS = [
    {"action": "Add your LinkedIn profile URL to your CV", "score_impact": 6,
     "priority": "critical", "category": "Contact", "example": ""},
    {"action": "Replace or label legacy tools with modern equivalents where possible",
     "score_impact": 4, "priority": "high", "category": "Skills", "example": ""},
    {"action": "Add any key skills from the job description that you genuinely have but omitted",
     "score_impact": 6, "priority": "high", "category": "Skills", "example": ""},
]
SUMMARY = {"user_actions_needed": {"actions": ACTIONS}, "evaluator_results": []}


def test_gaps_text_tags_actions():
    text, tags = build_gaps_text(SUMMARY)
    assert "[A1]" in text and "[A2]" in text and "[A3]" in text
    assert tags["A2"].startswith("Replace or label legacy tools")


def test_addressed_action_removed():
    _, tags = build_gaps_text(SUMMARY)
    applied = [{"path": "sections[0].items", "gap": "relabelled legacy tools", "gap_id": "A2"}]
    out = apply_gap_outcomes(list(ACTIONS), tags, applied, [])
    assert len(out) == 2
    assert all("legacy tools" not in a["action"] for a in out)


def test_unfillable_action_marked_needs_user():
    _, tags = build_gaps_text(SUMMARY)
    unfillable = [{"action": "JD skills", "reason": "No JD-listed skill absent from the resume exists in the sources", "gap_id": "A3"}]
    out = apply_gap_outcomes(list(ACTIONS), tags, [], unfillable)
    # A3 gets its real reason; A1/A2 (never mentioned) get the generic backstop.
    real = next(a for a in out if a["action"].startswith("Add any key skills"))
    assert "sources" in real["why_ai_cannot"]
    assert all(a.get("needs_user") for a in out)


def test_untagged_change_does_not_address_any_gap():
    """A change with no gap_id (e.g. a pure reword) leaves every tagged gap
    unaccounted -> each falls to the generic backstop label."""
    _, tags = build_gaps_text(SUMMARY)
    out = apply_gap_outcomes(list(ACTIONS), tags, [{"gap": "misc reword", "gap_id": ""}], [])
    assert len(out) == 3
    assert all(a.get("needs_user") and "again" in a["why_ai_cannot"] for a in out)


def test_ignored_gap_gets_generic_backstop_label():
    """A tagged gap the filler never mentions (neither applied nor unfillable)
    must not look silently frozen — observed in prod 2026-07-20: one card item
    got a real reason, the sibling item got none at all."""
    _, tags = build_gaps_text(SUMMARY)
    applied = [{"path": "sections[0].items", "gap": "relabelled legacy tools", "gap_id": "A2"}]
    out = apply_gap_outcomes(list(ACTIONS), tags, applied, [])  # A1, A3 never mentioned
    assert len(out) == 2  # A2 addressed -> removed
    assert all(a.get("needs_user") for a in out)
    assert all("again" in a["why_ai_cannot"] for a in out)


def test_mixed_outcomes_get_distinct_labels():
    """Addressed -> gone; explicit unfillable -> its real reason; ignored ->
    the generic backstop. All three must be distinguishable."""
    _, tags = build_gaps_text(SUMMARY)
    applied = [{"path": "contact.linkedin", "gap": "added linkedin", "gap_id": "A1"}]
    unfillable = [{"action": "legacy tools", "reason": "no legacy tools present", "gap_id": "A2"}]
    out = apply_gap_outcomes(list(ACTIONS), tags, applied, unfillable)  # A3 ignored
    assert len(out) == 2
    by_text = {a["action"]: a for a in out}
    assert by_text[tags["A2"]]["why_ai_cannot"] == "no legacy tools present"
    assert "again" in by_text[tags["A3"]]["why_ai_cannot"]


def test_validator_rejects_no_op_change():
    resume = {"summary": "QA lead with testing experience.", "contact": {}}
    corpus = build_source_corpus("QA lead with testing experience.")
    out = validate_and_apply(resume, [{
        "path": "summary",
        "new_value": "QA lead with testing experience.",  # identical
        "source_quote": "QA lead with testing experience.",
    }], corpus)
    assert out["applied"] == []
    assert out["rejected"][0]["reason"] == "no_op"
