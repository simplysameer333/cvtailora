"""Pure validation gates for graph agent output.

CLAUDE.md: never trust raw LLM output — validate before use. These functions are
pure and deterministic (no I/O, no LLM), so they unit-test directly and can be
reused as guardrails wherever an agent produces structured output.

Each validator returns (repaired_value, EvalResult). The EvalResult records
whether the output was well-formed for the run's `evals` list / the viz.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from .state import EvalResult

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def parse_json_lenient(text: str) -> Optional[dict]:
    """Best-effort parse of a model's JSON reply: try strict, then the first
    balanced-looking {...} block (handles code fences / stray prose)."""
    if not text:
        return None
    try:
        val = json.loads(text)
        return val if isinstance(val, dict) else None
    except (ValueError, TypeError):
        pass
    m = _JSON_BLOCK.search(text)
    if m:
        try:
            val = json.loads(m.group(0))
            return val if isinstance(val, dict) else None
        except (ValueError, TypeError):
            return None
    return None


def _clamp_score(value: Any) -> int:
    """Coerce anything to an int score in [0, 100]; unparseable → 0."""
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


def validate_category_result(text: str, key: str, label: str) -> tuple[dict, EvalResult]:
    """Validate one CategoryChecker reply. Guarantees a category-shaped dict with
    a clamped score, a string status, and list-typed checks/improvements — even
    when the model returned garbage (then score 0 + a failed eval)."""
    data = parse_json_lenient(text)
    if not isinstance(data, dict):
        safe = {"key": key, "name": label, "score": 0, "status": "error",
                "checks": [], "improvements": ["Could not analyse this category — please retry."]}
        return safe, EvalResult(name=f"schema:{key}", passed=False,
                                message="unparseable category output", severity="warning")

    score = _clamp_score(data.get("score"))
    checks = data.get("checks") if isinstance(data.get("checks"), list) else []
    improvements = data.get("improvements") if isinstance(data.get("improvements"), list) else []
    status = data.get("status")
    if not isinstance(status, str) or not status:
        status = "strong" if score >= 75 else "needs_work" if score >= 50 else "weak"

    result = {
        "key": key,
        "name": label,
        "score": score,
        "status": status,
        # Keep only well-typed check items {label, passed}.
        "checks": [
            {"label": str(c.get("label", "")), "passed": bool(c.get("passed", False))}
            for c in checks if isinstance(c, dict)
        ],
        "improvements": [str(i) for i in improvements if i][:5],
    }
    return result, EvalResult(name=f"schema:{key}", passed=True, score=float(score))


def validate_section_output(text: str, section_key: str) -> tuple[dict, EvalResult]:
    """Validate one SectionGenerator reply. Sections may be a string or a
    structured object (e.g. experience = list of entries); we accept either and
    wrap under a stable {section, content} shape."""
    data = parse_json_lenient(text)
    if isinstance(data, dict) and "content" in data:
        content = data["content"]
    elif isinstance(data, dict):
        # The model may have returned the section object directly.
        content = data
    else:
        # Plain-text section (summary, etc.) — accept the raw text.
        content = (text or "").strip()

    ok = bool(content) if not isinstance(content, (list, dict)) else len(content) > 0
    return (
        {"section": section_key, "content": content},
        EvalResult(name=f"section:{section_key}", passed=ok,
                   message="" if ok else "empty section output",
                   severity="info" if ok else "warning"),
    )


def validate_refine_output(text: str, fallback: str) -> tuple[str, EvalResult]:
    """Validate an Update/refine agent reply. Returns the improved resume text,
    or the fallback (prior text) if the model didn't return usable text."""
    data = parse_json_lenient(text)
    improved = ""
    if isinstance(data, dict):
        improved = str(data.get("resume_text") or "").strip()
    if not improved:
        # A refine that produced no text is a no-op — keep the prior version.
        return fallback, EvalResult(name="refine", passed=False,
                                    message="refine produced no text", severity="info")
    return improved, EvalResult(name="refine", passed=True)


def validate_verification(text: str) -> tuple[dict, EvalResult]:
    """Validate the Verification (faithfulness) agent reply. The EvalResult IS the
    guardrail signal: passed=faithful; a fabrication makes it a warning that
    surfaces on the run's evals list and in the UI."""
    data = parse_json_lenient(text) or {}
    faithful = bool(data.get("faithful", True))
    issues = [str(i) for i in (data.get("issues") or []) if i][:8]
    confidence = _clamp_score(data.get("confidence", 100))
    result = {"faithful": faithful, "confidence": confidence, "issues": issues}
    msg = "" if faithful else "; ".join(issues) or "possible fabrication vs source"
    return result, EvalResult(name="faithfulness", passed=faithful, score=float(confidence),
                              message=msg, severity="info" if faithful else "warning")
