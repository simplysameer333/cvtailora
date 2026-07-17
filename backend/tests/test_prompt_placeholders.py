"""Placeholder-integrity gate for admin prompt overrides.

An override that drops a required placeholder ({resume_text}, {scoring_criteria},
{tone}, …) would silently break the call or omit the candidate's own data, so
such writes are rejected. This tests the pure detector.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.prompt_store import missing_placeholders, REQUIRED_PLACEHOLDERS


def test_valid_body_keeps_required_placeholders():
    body = "Score this CV.\n\n{resume_text}\n\nReturn JSON."
    assert missing_placeholders("cv_score_quality_prompt", body) == []


def test_dropping_resume_text_is_flagged():
    assert missing_placeholders("cv_score_quality_prompt", "Score this CV. Return JSON.") == ["{resume_text}"]


def test_evaluator_needs_both_placeholders():
    body = "You are an evaluator.\n{scoring_criteria}\nReturn JSON."
    assert missing_placeholders("anthropic_evaluator_base", body) == ["{evaluator_context}"]


def test_generator_needs_tone_and_page_rules():
    assert set(missing_placeholders("generator_system", "You are a writer.")) == {"{tone}", "{page_rules}"}


def test_key_with_no_required_placeholders_is_always_valid():
    # e.g. the page-rules and the tools' system prompts substitute nothing.
    assert missing_placeholders("generator_page_rules_1page", "anything at all") == []
    assert missing_placeholders("cover_letter_system", "anything at all") == []


def test_every_required_placeholder_entry_is_a_real_prompt_key():
    # Guard against typos: every key we validate must be an overridable prompt.
    from services.prompt_store import PROMPT_KEYS
    for key in REQUIRED_PLACEHOLDERS:
        assert key in PROMPT_KEYS, f"{key} is not a known PROMPT_KEYS entry"
