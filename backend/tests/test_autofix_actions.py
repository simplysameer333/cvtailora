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
    marked = [a for a in out if a.get("needs_user")]
    assert len(marked) == 1
    assert "genuinely have" in marked[0]["action"]
    assert "sources" in marked[0]["why_ai_cannot"]


def test_untagged_outcomes_change_nothing():
    _, tags = build_gaps_text(SUMMARY)
    out = apply_gap_outcomes(list(ACTIONS), tags, [{"gap": "misc reword", "gap_id": ""}], [])
    assert len(out) == 3 and not any(a.get("needs_user") for a in out)


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
