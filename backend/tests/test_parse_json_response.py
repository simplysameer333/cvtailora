"""Unit tests for the tolerant JSON parser shared by every pipeline agent.

Covers the failure modes the 'return only JSON' prompt instruction tries to
prevent but can't guarantee: markdown fences, leaked preamble/trailing prose,
and nested structures. Clean output must parse identically to before.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.pipeline.utils import parse_json_response


def test_clean_object():
    assert parse_json_response('{"score": 82, "ok": true}') == {"score": 82, "ok": True}


def test_clean_array_job_analyzer():
    # The job analyzer returns a JSON array, not an object.
    assert parse_json_response('["Python", "FastAPI"]') == ["Python", "FastAPI"]


def test_markdown_fenced_object():
    assert parse_json_response('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_response('```\n{"a": 1}\n```') == {"a": 1}


def test_leading_preamble_recovered():
    raw = 'Here is the tailored resume JSON:\n{"name": "Ada", "score": 90}'
    assert parse_json_response(raw) == {"name": "Ada", "score": 90}


def test_trailing_prose_recovered():
    raw = '{"name": "Ada"}\n\nLet me know if you want changes!'
    assert parse_json_response(raw) == {"name": "Ada"}


def test_nested_braces_and_brackets():
    raw = '{"experience": [{"bullets": ["Led {team}", "Cut cost 30%"]}], "n": 1}'
    assert parse_json_response(raw) == {
        "experience": [{"bullets": ["Led {team}", "Cut cost 30%"]}], "n": 1
    }


def test_braces_inside_strings_do_not_break_matching():
    raw = 'noise {"note": "use } and { carefully"} trailing'
    assert parse_json_response(raw) == {"note": "use } and { carefully"}


def test_unparseable_still_raises():
    with pytest.raises(json.JSONDecodeError):
        parse_json_response("this is not json at all")
