"""Unit tests for the deterministic layout validator (validate_resume_layout)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.resume_checker_service import validate_resume_layout


def _bullet(words: int) -> str:
    return " ".join(["word"] * words)


def _resume(n_roles: int, bullets_per_role: int, bullet_words: int = 12,
            n_skills: int = 8, summary_sentences: int = 2) -> dict:
    return {
        "name": "Alex Johnson",
        "contact": {"email": "a@b.com", "phone": "123", "location": "London, UK"},
        "summary": " ".join(["This is a sentence with several words in it."] * summary_sentences),
        "experience": [
            {"company": f"Company {i}", "role": "Engineer", "dates": "2020 - 2024",
             "bullets": [_bullet(bullet_words) for _ in range(bullets_per_role)]}
            for i in range(n_roles)
        ],
        "education": [{"institution": "Uni", "degree": "BSc", "dates": "2015"}],
        "sections": [{"title": "Skills", "items": [f"Skill{i}" for i in range(n_skills)]}],
    }


def test_compact_resume_fits_one_page():
    result = validate_resume_layout(_resume(n_roles=3, bullets_per_role=3), page_count=1)
    assert result["truncated"] is False
    assert result["page_fit"] in ("good", "underfilled")
    assert result["page_breaks_clean"] is True
    assert result["missing_sections"] == []


def test_overstuffed_resume_overflows_one_page():
    result = validate_resume_layout(
        _resume(n_roles=7, bullets_per_role=6, bullet_words=20, n_skills=15, summary_sentences=6),
        page_count=1,
    )
    assert result["truncated"] is True
    assert result["page_fit"] == "overflow_risk"
    assert result["estimated_pages"] > 1
    # Suggestions must say what to cut
    assert any("cut" in s.lower() or "trim" in s.lower() or "reduce" in s.lower()
               for s in result["suggestions"])


def test_target_violations_flagged_but_not_truncated():
    # Fits 2 pages but breaks the per-role bullet caps and skills cap
    result = validate_resume_layout(
        _resume(n_roles=5, bullets_per_role=6, n_skills=14), page_count=2,
    )
    assert result["optimized"] is False
    assert any("bullets" in i for i in result["issues"])
    assert any("Skills list has 14" in i for i in result["issues"])


def test_optimized_when_within_targets():
    result = validate_resume_layout(_resume(n_roles=2, bullets_per_role=3), page_count=2)
    assert result["optimized"] is True
    assert result["issues"] == []


def test_oversized_role_block_breaks_pages():
    resume = _resume(n_roles=1, bullets_per_role=1)
    # One giant role: 20 long bullets → block far beyond the clean-break limit
    resume["experience"][0]["bullets"] = [_bullet(30) for _ in range(20)]
    result = validate_resume_layout(resume, page_count=2)
    assert result["page_breaks_clean"] is False
    assert any("Company 0" in s for s in result["suggestions"])


def test_missing_sections_detected_from_source():
    source_text = (
        "Alex Johnson\n"
        "Senior Engineer\n"
        "alex@example.com\n"
        "PROFESSIONAL SUMMARY\n"
        "Engineer with 10 years of experience.\n"
        "EXPERIENCE\n"
        "Engineer\nAcme\nJan 2020 - Present\n"
        "- Built things\n"
        "EDUCATION\n"
        "BSc Computer Science\nUni\n2015\n"
        "CERTIFICATIONS\n"
        "- AWS Solutions Architect\n"
        "LANGUAGES\n"
        "- English (native)\n"
    )
    resume = _resume(n_roles=1, bullets_per_role=2)  # has Skills but no Certifications/Languages
    result = validate_resume_layout(resume, page_count=2, source_resume_text=source_text)
    assert "CERTIFICATIONS" in result["missing_sections"]
    assert "LANGUAGES" in result["missing_sections"]
    assert "Skills" not in result["missing_sections"]


def test_long_bullets_flagged():
    result = validate_resume_layout(
        _resume(n_roles=1, bullets_per_role=2, bullet_words=30), page_count=2,
    )
    assert any("exceed" in i for i in result["issues"])
