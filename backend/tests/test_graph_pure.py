"""Unit tests for the graph engine's pure functions: validators, aggregation,
merge, and weak-category mapping. No LLM, no I/O."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.graph.aggregate import aggregate_categories
from services.graph.cv_build_graph import merge_sections, weak_sections_from
from services.graph.validators import (
    parse_json_lenient,
    validate_category_result,
    validate_section_output,
)


def test_parse_json_lenient_recovers_fenced_block():
    assert parse_json_lenient('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_lenient("prose {\"x\": 2} more") == {"x": 2}
    assert parse_json_lenient("not json at all") is None


def test_validate_category_repairs_and_clamps():
    good, ev = validate_category_result('{"score": 210, "improvements": ["fix x"]}',
                                        "ats", "ATS Compatibility")
    assert good["score"] == 100          # clamped
    assert good["key"] == "ats"
    assert ev.passed is True
    bad, ev2 = validate_category_result("garbage", "ats", "ATS")
    assert bad["score"] == 0
    assert ev2.passed is False


def test_validate_section_accepts_object_and_text():
    obj, ev = validate_section_output('{"content": {"summary": "hi"}}', "summary")
    assert obj["content"] == {"summary": "hi"}
    assert ev.passed is True
    txt, ev2 = validate_section_output("", "summary")
    assert ev2.passed is False           # empty flagged


def test_aggregate_weights_and_renormalises():
    cats = [
        {"key": "experience", "name": "Experience", "score": 40, "improvements": ["quantify"]},
        {"key": "skills", "name": "Skills", "score": 90},
        {"key": "summary", "name": "Summary", "score": 80},
    ]
    agg = aggregate_categories(cats)
    # weighted by 25/20/15 over present categories only
    expected = round((25 * 40 + 20 * 90 + 15 * 80) / (25 + 20 + 15))
    assert agg["overall_score"] == expected
    assert agg["weakest"][0]["key"] == "experience"   # worst first


def test_aggregate_empty_is_zero():
    assert aggregate_categories([])["overall_score"] == 0


def test_merge_sections_builds_resume_schema():
    contents = {
        "contact": {"name": "Alex", "contact": {"email": "a@b.com"}},
        "summary": {"summary": "Senior engineer."},
        "experience": {"experience": [{"company": "C", "role": "Eng", "dates": "2020", "bullets": ["x"]}]},
        "education": {"education": [{"institution": "U", "degree": "BSc", "dates": "2015"}]},
        "skills": {"items": ["Python", "SQL"]},
    }
    resume = merge_sections(contents)
    assert resume["name"] == "Alex"
    assert resume["summary"] == "Senior engineer."
    assert resume["experience"][0]["role"] == "Eng"
    assert resume["sections"][0] == {"title": "Skills", "items": ["Python", "SQL"]}


def test_merge_never_fabricates_missing_sections():
    resume = merge_sections({"contact": {"name": "Alex"}})
    assert resume == {"name": "Alex"}   # nothing invented


def test_weak_sections_mapping():
    agg = {"weakest": [{"key": "ats"}, {"key": "experience"}, {"key": "design"}]}
    weak = weak_sections_from(agg)
    assert "experience" in weak and "skills" in weak   # ats -> experience + skills
    assert "design" not in weak_sections_from({"weakest": [{"key": "design"}]})


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
