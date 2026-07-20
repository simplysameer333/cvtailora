"""Unit tests: confirmation-only action items are labelled needs_user
IMMEDIATELY (no autofix run required) so the card is honest from the first
generation, not just after a wasted Auto-fix click (user report 2026-07-20)."""
from services.user_actions_service import build_user_actions

RESULTS_LEGACY_AND_JD_SKILLS = [{
    "suggestions": [
        "[Skills] Replace outdated legacy tools with modern equivalents",
        "[ATS] Add missing skills from the job description keyword list",
    ],
}]

RESULTS_AUTOMATION_ONLY = [{
    "suggestions": ["[Skills] Confirm whether you have test automation framework experience"],
}]


def test_legacy_and_jd_skill_gaps_are_always_needs_user():
    ua = build_user_actions(RESULTS_LEGACY_AND_JD_SKILLS, pass_threshold=90, final_score=82)
    actions = {a["action"]: a for a in ua["actions"]}
    legacy = next(a for t, a in actions.items() if "legacy tools" in t)
    jd = next(a for t, a in actions.items() if "job description" in t)
    assert legacy["needs_user"] is True and legacy["why_ai_cannot"]
    assert jd["needs_user"] is True and jd["why_ai_cannot"]


def test_confirmable_gap_is_not_pre_labelled():
    """The automation-experience rule DOES check resume content — it's not
    structurally unfixable, so it must not carry the static needs_user flag
    (auto-fix should still get a chance to resolve it from real data)."""
    ua = build_user_actions(RESULTS_AUTOMATION_ONLY, pass_threshold=90, final_score=82,
                             resume_json={"experience": []})
    assert len(ua["actions"]) == 1
    assert "needs_user" not in ua["actions"][0]


def test_estimated_points_still_counts_always_needs_user_items():
    ua = build_user_actions(RESULTS_LEGACY_AND_JD_SKILLS, pass_threshold=90, final_score=82)
    assert ua["estimated_points_available"] == 4 + 6  # legacy(4) + jd-skills(6)
