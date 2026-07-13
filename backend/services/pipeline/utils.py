"""Shared utility helpers for the pipeline agents.

Kept intentionally small — only pure functions that are used by more than
one agent belong here. Business logic belongs in the agent files.
"""
import json
import re


def _extract_first_json(text: str) -> str | None:
    """Return the first balanced JSON value (object or array) in `text`, or None.

    String-aware bracket matching, so braces inside string values don't confuse
    the depth count. Used to recover a valid payload when the model wraps its
    JSON in stray prose despite being told to return JSON only.
    """
    open_map = {"{": "}", "[": "]"}
    start = next((i for i, ch in enumerate(text) if ch in open_map), None)
    if start is None:
        return None

    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in open_map:
            depth += 1
        elif ch in ("}", "]"):
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


def parse_json_response(text: str):
    """Parse a JSON object/array from an LLM response — used by every agent.

    Tolerant by design (validation gate, per CLAUDE.md — never trust raw LLM
    output): handles markdown fences, and if the model leaks a stray preamble or
    trailing sentence despite the "return only JSON" instruction, recovers the
    first balanced JSON value instead of failing an otherwise-valid result.
    Raises json.JSONDecodeError when nothing parseable is present (unchanged
    contract — callers that catch it keep working).
    """
    text = text.strip()
    # Whole-string markdown fence (```json ... ```).
    fenced = re.match(r"^```[a-z]*\n?(.*?)\n?```$", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        snippet = _extract_first_json(text)
        if snippet is not None:
            return json.loads(snippet)  # may still raise if the snippet is malformed
        raise
