"""Unit tests for the auto-fix faithfulness gate (services/autofix_validator.py).

The invariant under test: NEVER insert information absent from the user's own
sources. Fabricated numbers/URLs/items are rejected; facts genuinely present
in the original CV or profile are kept.
"""
import pytest

from services.autofix_validator import (
    build_source_corpus,
    normalize,
    parse_path,
    validate_and_apply,
)

RESUME = {
    "name": "Sameer Hameed",
    "contact": {"email": "s@example.com", "phone": "", "linkedin": "", "location": ""},
    "summary": "QA lead with broad testing experience.",
    "experience": [
        {"company": "Acme", "role": "QA Lead", "dates": "2015–2020",
         "bullets": ["Led testing for trading platform.", "Improved release quality."]},
    ],
    "education": [{"institution": "Ambala College", "degree": "BTech", "dates": ""}],
    "sections": [{"title": "Skills", "items": ["Manual Testing", "SQL"]}],
}

# Sources: the original CV + profile — the only permitted fact pool.
CV_TEXT = (
    "Sameer Hameed\n+44 7459 913604\nLed a team of 6 QA engineers at Acme.\n"
    "Reduced regression cycle from 4 days to 6 hours.\nGraduated Ambala College 2010.\n"
    "Tools: Jira, Selenium WebDriver, SQL."
)
PROFILE = {"linkedin": "https://linkedin.com/in/sameer-hameed", "key_skills": "Jira, Selenium"}
CORPUS = build_source_corpus(CV_TEXT, PROFILE)


def _one(change):
    return validate_and_apply(RESUME, [change], CORPUS)


# ── Fabrication is rejected ────────────────────────────────────────────────────

def test_fabricated_number_reverted():
    """A metric the sources never mention must be dropped."""
    out = _one({
        "path": "experience[0].bullets[1]",
        "new_value": "Improved release quality by 40% across 12 releases.",
        "source_quote": "Led a team of 6 QA engineers at Acme.",  # real quote, wrong facts
    })
    assert out["applied"] == []
    assert "unverified_number" in out["rejected"][0]["reason"]
    assert out["resume"]["experience"][0]["bullets"][1] == "Improved release quality."


def test_invented_url_dropped():
    out = _one({
        "path": "contact.linkedin",
        "new_value": "https://linkedin.com/in/sameer-fake",
        "source_quote": "Sameer Hameed",
    })
    assert out["applied"] == []
    assert "unverified_url" in out["rejected"][0]["reason"]


def test_quote_not_in_source_rejected():
    """A citation the sources don't contain proves nothing."""
    out = _one({
        "path": "contact.phone",
        "new_value": "+44 7459 913604",
        "source_quote": "Certified Scrum Master since 2018",
    })
    assert out["applied"] == []
    assert out["rejected"][0]["reason"] == "quote_not_in_source"


def test_missing_quote_rejected():
    out = _one({"path": "summary", "new_value": "New summary.", "source_quote": ""})
    assert out["rejected"][0]["reason"] == "missing_source_quote"


def test_unsourced_skill_item_rejected():
    """Adding a skill the user never claimed anywhere is fabrication."""
    out = _one({
        "path": "sections[0].items",
        "new_value": ["Manual Testing", "SQL", "Playwright"],
        "source_quote": "Tools: Jira, Selenium WebDriver, SQL.",
    })
    assert out["applied"] == []
    assert "unverified_item" in out["rejected"][0]["reason"]


# ── Real user data is kept ─────────────────────────────────────────────────────

def test_real_metric_from_cv_kept():
    out = _one({
        "path": "experience[0].bullets[0]",
        "new_value": "Led a team of 6 QA engineers testing the trading platform.",
        "source_quote": "Led a team of 6 QA engineers at Acme.",
    })
    assert len(out["applied"]) == 1
    assert "team of 6" in out["resume"]["experience"][0]["bullets"][0]


def test_url_from_profile_kept():
    out = _one({
        "path": "contact.linkedin",
        "new_value": "https://linkedin.com/in/sameer-hameed",
        "source_quote": "https://linkedin.com/in/sameer-hameed",
    })
    assert len(out["applied"]) == 1
    assert out["resume"]["contact"]["linkedin"] == "https://linkedin.com/in/sameer-hameed"


def test_sourced_skill_added_to_list():
    out = _one({
        "path": "sections[0].items",
        "new_value": ["Manual Testing", "SQL", "Jira", "Selenium WebDriver"],
        "source_quote": "Tools: Jira, Selenium WebDriver, SQL.",
    })
    assert len(out["applied"]) == 1
    assert "Jira" in out["resume"]["sections"][0]["items"]


def test_grad_year_from_cv_kept():
    out = _one({
        "path": "education[0].dates",
        "new_value": "2010",
        "source_quote": "Graduated Ambala College 2010.",
    })
    assert len(out["applied"]) == 1
    assert out["resume"]["education"][0]["dates"] == "2010"


# ── Mechanics ──────────────────────────────────────────────────────────────────

def test_bad_path_rejected_and_input_not_mutated():
    before = str(RESUME)
    out = _one({"path": "experience[9].bullets[0]", "new_value": "x",
                "source_quote": "Sameer Hameed"})
    assert out["rejected"][0]["reason"] == "bad_path"
    assert str(RESUME) == before  # deep-copied, never mutated


def test_mixed_batch_keeps_good_drops_bad():
    changes = [
        {"path": "contact.phone", "new_value": "+44 7459 913604",
         "source_quote": "+44 7459 913604"},
        {"path": "summary", "new_value": "QA lead who cut regression from 4 days to 99 hours.",
         "source_quote": "Reduced regression cycle from 4 days to 6 hours."},  # 99 is invented
    ]
    out = validate_and_apply(RESUME, changes, CORPUS)
    assert len(out["applied"]) == 1
    assert out["resume"]["contact"]["phone"] == "+44 7459 913604"
    assert len(out["rejected"]) == 1
    assert "unverified_number" in out["rejected"][0]["reason"]


def test_parse_path():
    assert parse_path("contact.linkedin") == ["contact", "linkedin"]
    assert parse_path("experience[0].bullets[2]") == ["experience", 0, "bullets", 2]
    assert parse_path("") is None
    assert parse_path("bad..path") is None


def test_normalize_collapses_whitespace_and_case():
    assert normalize("  Led a\n  TEAM of 6 ") == "led a team of 6"
