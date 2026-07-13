"""Unit tests for the profile-prefill validation gate (pure JSON extraction)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.profile_prefill_service import extract_json_object


def test_plain_json_object():
    assert extract_json_object('{"full_name": "Ada"}') == {"full_name": "Ada"}


def test_fenced_json_object():
    raw = '```json\n{"email": "a@b.com"}\n```'
    assert extract_json_object(raw) == {"email": "a@b.com"}


def test_fence_without_language_tag():
    assert extract_json_object('```\n{"phone": "123"}\n```') == {"phone": "123"}


def test_non_json_returns_empty():
    assert extract_json_object("Sorry, I cannot extract that.") == {}
    assert extract_json_object("") == {}
    assert extract_json_object(None) == {}


def test_non_dict_json_returns_empty():
    # A JSON array or string is not a valid prefill payload — gate rejects it.
    assert extract_json_object('["a", "b"]') == {}
    assert extract_json_object('"just a string"') == {}
