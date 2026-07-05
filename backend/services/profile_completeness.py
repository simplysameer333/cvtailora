"""Profile completeness score — pure, deterministic, unit-testable.

Drives the profile-page ring gauge and checklist. Weights sum to 100; the
structured sections (projects / certifications) are optional extras and do
not count against the score.
"""
from __future__ import annotations

# (key, label, weight) — order is the display order of the checklist
_CHECKS: list[tuple[str, str, int]] = [
    ("basic_info",   "Basic information", 20),
    ("linkedin",     "LinkedIn URL",       5),
    ("summary",      "Professional summary", 15),
    ("skills",       "Key skills",        15),
    ("target_roles", "Target roles",      10),
    ("experience",   "Work experience",   15),
    ("education",    "Education",         10),
    ("resume",       "Resume on file",    10),
]

# Minimum key_skills for the skills item to count as complete
_MIN_SKILLS = 5


def _is_complete(key: str, p: dict) -> bool:
    if key == "basic_info":
        return all(str(p.get(f) or "").strip() for f in ("full_name", "email", "phone", "location"))
    if key == "linkedin":
        return bool(str(p.get("linkedin") or "").strip())
    if key == "summary":
        return bool(str(p.get("summary") or "").strip())
    if key == "skills":
        return len(p.get("key_skills") or []) >= _MIN_SKILLS
    if key == "target_roles":
        return len(p.get("target_roles") or []) > 0
    if key == "experience":
        return len(p.get("experience") or []) > 0
    if key == "education":
        return len(p.get("education") or []) > 0
    if key == "resume":
        return bool(str(p.get("resume_text") or "").strip())
    return False


def compute_profile_completeness(profile: dict | None) -> dict:
    """Return {"percent": int, "checklist": [{key, label, complete}]} for a profile doc."""
    p = profile or {}
    checklist = []
    earned = 0
    for key, label, weight in _CHECKS:
        complete = _is_complete(key, p)
        if complete:
            earned += weight
        checklist.append({"key": key, "label": label, "complete": complete})
    return {"percent": earned, "checklist": checklist}
