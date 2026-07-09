"""Deterministic job-match scoring for job-search cards (J3).

Computes a match % between the user's account profile and a JSearch job —
pure text matching, NO LLM call. A search page can show up to 50 cards;
scoring them with the Haiku fit scorer would cost ~$0.10 per search and blow
the daily AI budget on browsing, so cards use this free scorer. The existing
LLM `fit_scoring_service` remains the deep-dive panel inside the builder.

Pure and deterministic → unit-tested in tests/test_job_match.py.
"""
from __future__ import annotations

import math
import re

# Blend: the STRONGER component dominates — a job whose title is exactly your
# target role is a great match even when its JD text is skills-light (and vice
# versa). A weighted average punished those cases (user feedback 2026-07-09).
_STRONG_WEIGHT = 0.7
_SUPPORT_WEIGHT = 0.3

# The user's self-declared primary skill counts double vs other key skills.
_PRIMARY_SKILL_WEIGHT = 2


async def get_match_synonyms() -> dict:
    """Title-token synonyms ("vp" → vice president …) from system_config —
    data, not code. Empty dict when unavailable."""
    from services.system_config_service import get_system_config
    try:
        cfg = await get_system_config()
        return cfg.get("match_token_synonyms") or {}
    except Exception:
        return {}


def _present(term: str, haystack: str) -> bool:
    """Whole-term presence check. Lookarounds instead of \\b so terms with
    non-word chars ("c++", ".net") still match on their real edges."""
    pattern = rf"(?<![a-z0-9]){re.escape(term.lower().strip())}(?![a-z0-9])"
    return re.search(pattern, haystack) is not None


def _tokens(text: str, synonyms: dict) -> set[str]:
    out: set[str] = set()
    for tok in re.findall(r"[a-z0-9+#.]+", text.lower()):
        out.update(synonyms.get(tok, (tok,)))
    return out


def _role_overlap(role: str, title: str, synonyms: dict) -> float:
    """Fraction of the target-role tokens present in the job title (0–1)."""
    role_tokens = _tokens(role, synonyms)
    if not role_tokens:
        return 0.0
    title_tokens = _tokens(title, synonyms)
    return len(role_tokens & title_tokens) / len(role_tokens)


def _label(pct: int) -> str:
    if pct >= 80:
        return "Excellent match"
    if pct >= 60:
        return "Strong match"
    if pct >= 40:
        return "Fair match"
    return "Low match"


def compute_match(profile: dict, job: dict, synonyms: dict | None = None) -> dict | None:
    """Score how well a job matches the profile. Pure — synonyms come in as
    data (see get_match_synonyms), never hardcoded here.

    Returns {"pct", "label", "matched_skills"} or None when there is nothing
    to compare (no profile signals, or the job carries no matchable text).
    """
    synonyms = synonyms or {}
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

    # ── Skills component (evidence ladder) ────────────────────────────────
    # Scores matched WEIGHT, not the fraction of the user's skill list: a JD
    # naming 3–4 of your skills is strong evidence of a match even when the
    # rest of your stack isn't mentioned — long skill lists must not drag the
    # score down (a real profile with 12 skills scored 10% on a good job).
    weighted: list[tuple[str, int]] = []
    if primary:
        weighted.append((primary, _PRIMARY_SKILL_WEIGHT))
    weighted.extend(
        (s, 1) for s in key_skills if s.lower() != primary.lower()
    )

    skills_score: float | None = None
    matched: list[str] = []
    if weighted:
        hit = 0
        for skill, w in weighted:
            if _present(skill, haystack):
                hit += w
                matched.append(skill)
        # Each matched weight point ≈ 25% — saturates at 4 points (e.g. the
        # primary skill + two more, or four ordinary skills).
        skills_score = min(100.0, hit * 25.0)

    # ── Role/title component (best target-role overlap) ───────────────────
    title = job.get("job_title") or ""
    role_score: float | None = None
    if roles and title.strip():
        role_score = 100.0 * max(_role_overlap(r, title, synonyms) for r in roles)

    if skills_score is None and role_score is None:
        return None
    if skills_score is None or role_score is None:
        raw = skills_score if role_score is None else role_score
    else:
        strong, support = max(skills_score, role_score), min(skills_score, role_score)
        raw = _STRONG_WEIGHT * strong + _SUPPORT_WEIGHT * support

    # sqrt curve lifts the mid-range (raw 50 → 71) so honest partial matches
    # read encouragingly, while 0 stays 0 and a full match stays 100.
    pct = round(100.0 * math.sqrt(raw / 100.0))

    return {"pct": pct, "label": _label(pct), "matched_skills": matched[:8]}


def annotate_jobs(profile: dict | None, jobs: list[dict], synonyms: dict | None = None) -> None:
    """Attach a per-user `match` field to each job dict, in place.

    Must run AFTER the shared search cache is read/written — match is
    user-specific and must never be persisted into the shared cache payload.
    """
    if not profile:
        return
    for job in jobs:
        match = compute_match(profile, job, synonyms)
        if match is not None:
            job["match"] = match
