"""Shared engagement context — the candidate profile + job profile pair.

Runs the candidate profiler and the job profiler in parallel (one focused Haiku call
each) and returns the combined understanding consumed by Interview Prep and Cover Letter.
Built once per session and cached so both features reuse it.

Graceful by design: if either profiler fails it returns {} for that half, and the
downstream generators fall back to the raw resume/JD text.
"""
from __future__ import annotations
import asyncio
import logging
from bson import ObjectId

from services.candidate_profile_service import build_candidate_profile
from services.job_profile_service import build_job_profile

logger = logging.getLogger("tailormycv")


async def build_engagement_context(
    resume_text: str,
    job_description: str,
    user_profile: dict | None = None,
    role_override: str = "",
) -> dict:
    """Build {candidate_profile, jd_profile} from raw resume + JD, in parallel.

    ``role_override`` (a user-corrected role) is authoritative for the JD profile.
    """
    user_profile = user_profile or {}
    target_role = role_override or user_profile.get("target_role", "")
    candidate, job = await asyncio.gather(
        build_candidate_profile(resume_text, user_profile),
        build_job_profile(job_description, target_role),
    )
    return {"candidate_profile": candidate, "jd_profile": job}


async def get_or_build_session_context(db, session_id: str, session: dict) -> dict:
    """Return the session's cached engagement context, building + persisting it once."""
    ctx = session.get("engagement_context")
    if ctx and (ctx.get("candidate_profile") or ctx.get("jd_profile")):
        return ctx

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    job_description = session.get("job_description") or ""
    user_profile = session.get("user_profile") or {}
    ctx = await build_engagement_context(resume_text, job_description, user_profile)
    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"engagement_context": ctx}},
    )
    return ctx


def detected_role(context: dict | None) -> str:
    """The role the questions/letter were generated for (from the JD profile)."""
    if not context:
        return ""
    return ((context.get("jd_profile") or {}).get("role_title") or "").strip()


def context_to_prompt_block(context: dict | None) -> str:
    """Render the engagement context as a compact text block for a generation prompt.

    Returns "" when no useful context is available so prompts degrade cleanly.
    """
    if not context:
        return ""
    cp = context.get("candidate_profile") or {}
    jp = context.get("jd_profile") or {}
    lines: list[str] = []

    if cp:
        lines.append("### CANDIDATE PROFILE (pre-analysed)")
        if cp.get("current_title"):       lines.append(f"- Current title: {cp['current_title']}")
        if cp.get("seniority"):           lines.append(f"- Seniority: {cp['seniority']}")
        if cp.get("years_experience"):    lines.append(f"- Years experience: {cp['years_experience']}")
        if cp.get("domains"):             lines.append(f"- Domains: {', '.join(cp['domains'])}")
        if cp.get("core_skills"):         lines.append(f"- Core skills: {', '.join(cp['core_skills'])}")
        if cp.get("standout_achievements"):
            lines.append("- Standout achievements:")
            lines += [f"  - {a}" for a in cp["standout_achievements"]]
        if cp.get("summary"):             lines.append(f"- Summary: {cp['summary']}")

    if jp:
        lines.append("\n### TARGET ROLE PROFILE (pre-analysed)")
        if jp.get("role_title"):          lines.append(f"- Role: {jp['role_title']}")
        if jp.get("seniority"):           lines.append(f"- Seniority: {jp['seniority']}")
        if jp.get("domain"):              lines.append(f"- Domain: {jp['domain']}")
        if jp.get("must_have_skills"):    lines.append(f"- Must-have skills: {', '.join(jp['must_have_skills'])}")
        if jp.get("nice_to_have_skills"): lines.append(f"- Nice-to-have skills: {', '.join(jp['nice_to_have_skills'])}")
        if jp.get("key_responsibilities"):
            lines.append("- Key responsibilities:")
            lines += [f"  - {r}" for r in jp["key_responsibilities"]]
        if jp.get("screening_focus"):
            lines.append("- What the interviewer is really screening for:")
            lines += [f"  - {s}" for s in jp["screening_focus"]]

    return "\n".join(lines).strip()
