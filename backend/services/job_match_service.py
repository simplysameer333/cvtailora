"""Deterministic job-match scoring for job-search cards (J3).

Computes a match % between the user's account profile and a JSearch job —
pure text matching, NO LLM call. A search page can show up to 50 cards;
scoring them with the Haiku fit scorer would cost ~$0.10 per search and blow
the daily AI budget on browsing, so cards use this free scorer. The existing
LLM `fit_scoring_service` remains the deep-dive panel inside the builder.

Pure and deterministic → unit-tested in tests/test_job_match.py.
"""
from __future__ import annotations

import re

# Blend weights: skills evidence is the stronger signal (JD text names hard
# requirements); title alignment is secondary. When one component is missing
# the other is used alone.
_SKILLS_WEIGHT = 0.6
_ROLE_WEIGHT = 0.4

# The user's self-declared primary skill counts double vs other key skills.
_PRIMARY_SKILL_WEIGHT = 2


def _present(term: str, haystack: str) -> bool:
    """Whole-term presence check. Lookarounds instead of \\b so terms with
    non-word chars ("c++", ".net") still match on their real edges."""
    pattern = rf"(?<![a-z0-9]){re.escape(term.lower().strip())}(?![a-z0-9])"
    return re.search(pattern, haystack) is not None


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.]+", text.lower()))


def _role_overlap(role: str, title: str) -> float:
    """Fraction of the target-role tokens present in the job title (0–1)."""
    role_tokens = _tokens(role)
    if not role_tokens:
        return 0.0
    title_tokens = _tokens(title)
    return len(role_tokens & title_tokens) / len(role_tokens)


def _label(pct: int) -> str:
    if pct >= 80:
        return "Excellent match"
    if pct >= 60:
        return "Strong match"
    if pct >= 40:
        return "Fair match"
    return "Low match"


def compute_match(profile: dict, job: dict) -> dict | None:
    """Score how well a job matches the profile.

    Returns {"pct", "label", "matched_skills"} or None when there is nothing
    to compare (no profile signals, or the job carries no matchable text).
    """
    key_skills = [s.strip() for s in (profile.get("key_skills") or []) if s and s.strip()]
    primary = (profile.get("primary_skill") or "").strip()
    roles = [r.strip() for r in (profile.get("target_roles") or []) if r and r.strip()]

    highlights = job.get("job_highlights") or {}
    haystack = " ".join(filter(None, [
        job.get("job_title") or "",
        job.get("job_description") or "",
        " ".join(highlights.get("Qualifications") or []),
        " ".join(highlights.get("Responsibilities") or []),
        " ".join(job.get("job_required_skills") or []),
    ])).lower()

    if not haystack.strip():
        return None

    # ── Skills component (weighted hit rate) ──────────────────────────────
    weighted: list[tuple[str, int]] = []
    if primary:
        weighted.append((primary, _PRIMARY_SKILL_WEIGHT))
    weighted.extend(
        (s, 1) for s in key_skills if s.lower() != primary.lower()
    )

    skills_score: float | None = None
    matched: list[str] = []
    if weighted:
        total = sum(w for _, w in weighted)
        hit = 0
        for skill, w in weighted:
            if _present(skill, haystack):
                hit += w
                matched.append(skill)
        skills_score = 100.0 * hit / total

    # ── Role/title component (best target-role overlap) ───────────────────
    title = job.get("job_title") or ""
    role_score: float | None = None
    if roles and title.strip():
        role_score = 100.0 * max(_role_overlap(r, title) for r in roles)

    if skills_score is None and role_score is None:
        return None
    if skills_score is None:
        pct = round(role_score)  # type: ignore[arg-type]
    elif role_score is None:
        pct = round(skills_score)
    else:
        pct = round(_SKILLS_WEIGHT * skills_score + _ROLE_WEIGHT * role_score)

    return {"pct": pct, "label": _label(pct), "matched_skills": matched[:8]}


def annotate_jobs(profile: dict | None, jobs: list[dict]) -> None:
    """Attach a per-user `match` field to each job dict, in place.

    Must run AFTER the shared search cache is read/written — match is
    user-specific and must never be persisted into the shared cache payload.
    """
    if not profile:
        return
    for job in jobs:
        match = compute_match(profile, job)
        if match is not None:
            job["match"] = match
