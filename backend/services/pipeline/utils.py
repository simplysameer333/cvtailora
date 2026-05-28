"""Shared utility helpers for the pipeline agents.

Kept intentionally small — only pure functions that are used by more than
one agent belong here. Business logic belongs in the agent files.
"""
import json
import re


def parse_json_response(text: str) -> dict:
    """Strip markdown fences then parse JSON. Used by every agent that calls an LLM."""
    text = text.strip()
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    return json.loads(text)
