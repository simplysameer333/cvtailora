"""Unit tests for the pure profile-completeness scorer."""
import pytest

from services.profile_completeness import compute_profile_completeness


def _full_profile() -> dict:
    return {
        "full_name": "Alex Johnson",
        "email": "alex@example.com",
        "phone": "+44 1234 567890",
        "location": "London, UK",
        "linkedin": "https://linkedin.com/in/alex",
        "summary": "Seasoned engineer.",
        "key_skills": ["Python", "FastAPI", "MongoDB", "React", "Docker"],
        "target_roles": ["Backend Engineer"],
        "experience": [{"title": "Engineer", "company": "Acme", "start": "2020", "end": "Present", "description": "Built things."}],
        "education": [{"degree": "BSc CS", "institution": "UCL", "year": "2016"}],
        "resume_text": "full resume text here",
    }


def test_empty_profile_scores_zero():
    result = compute_profile_completeness({})
    assert result["percent"] == 0
    assert all(not item["complete"] for item in result["checklist"])


def test_none_profile_scores_zero():
    assert compute_profile_completeness(None)["percent"] == 0


def test_full_profile_scores_100():
    result = compute_profile_completeness(_full_profile())
    assert result["percent"] == 100
    assert all(item["complete"] for item in result["checklist"])


def test_missing_linkedin_drops_5():
    p = _full_profile()
    p["linkedin"] = ""
    result = compute_profile_completeness(p)
    assert result["percent"] == 95
    linkedin = next(i for i in result["checklist"] if i["key"] == "linkedin")
    assert not linkedin["complete"]


def test_partial_basic_info_is_incomplete():
    p = _full_profile()
    p["phone"] = "  "  # whitespace only
    result = compute_profile_completeness(p)
    assert result["percent"] == 80
    basic = next(i for i in result["checklist"] if i["key"] == "basic_info")
    assert not basic["complete"]


def test_too_few_skills_incomplete():
    p = _full_profile()
    p["key_skills"] = ["Python", "React"]  # below the 5-skill minimum
    result = compute_profile_completeness(p)
    assert result["percent"] == 85


def test_projects_and_certifications_do_not_affect_score():
    p = _full_profile()
    base = compute_profile_completeness(p)["percent"]
    p["projects"] = [{"name": "Side project", "description": "", "url": ""}]
    p["certifications"] = [{"name": "AWS SA", "issuer": "AWS", "year": "2024"}]
    assert compute_profile_completeness(p)["percent"] == base


def test_checklist_order_and_shape():
    result = compute_profile_completeness({})
    keys = [i["key"] for i in result["checklist"]]
    assert keys == ["basic_info", "linkedin", "summary", "skills",
                    "target_roles", "experience", "education", "resume"]
    assert all(set(i) == {"key", "label", "complete"} for i in result["checklist"])
