"""Candidate profiler — distils a resume into a concise professional profile.

One focused Haiku call. Produces the structured "who is this person" understanding
shared by Interview Prep and Cover Letter so those generators don't each re-parse the
raw resume (per the one-call-per-purpose principle). Lean by design — a summary, not a
full resume dump.

Returns {} on any failure so callers degrade gracefully to raw resume text.
"""
from __future__ import annotations
import json
import logging
import re
from config import settings
from services.prompt_store import get_override

logger = logging.getLogger("cvtailora")

_SYSTEM = """You are an expert career analyst. Read a candidate's resume and distil it into a concise professional profile that another AI will use to write a cover letter and predict interview questions.

## EXTRACT (ground everything in the resume — never invent)
- name: the candidate's full name (empty string if absent)
- current_title: their most recent or current job title
- seniority: exactly one of "Junior", "Mid", "Senior", "Lead", "Executive" — inferred from scope and years
- years_experience: approximate total years of relevant experience (integer; 0 if unclear)
- domains: 1-3 industries or domains they have worked in
- core_skills: the 5-10 strongest, best-evidenced skills (technical and professional)
- standout_achievements: 3-5 concrete, ideally quantified accomplishments lifted from the resume
- summary: 2 sentences capturing their professional identity and strongest selling point

## ABSOLUTE RULE
Only use facts present in the resume. If something is absent, use an empty value — never guess.

## OUTPUT
Return ONLY valid JSON — no markdown, no explanation:
{
  "name": "",
  "current_title": "",
  "seniority": "",
  "years_experience": 0,
  "domains": [],
  "core_skills": [],
  "standout_achievements": [],
  "summary": ""
}"""


async def build_candidate_profile(resume_text: str, user_profile: dict | None = None) -> dict:
    """Distil a resume into a concise candidate profile. Returns {} on failure."""
    if not settings.anthropic_api_key or not (resume_text or "").strip():
        return {}

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=settings.anthropic_api_key,
        max_tokens=700,
        timeout=30,
        max_retries=2,
    )

    # The persisted profile's target role helps the model frame seniority/domains.
    hint = ""
    if user_profile and user_profile.get("target_role"):
        hint = f"\n\n(Candidate's stated target role: {user_profile['target_role']})"

    content = f"## CANDIDATE RESUME\n{resume_text[:5000]}{hint}\n\nDistil the profile. Return only JSON."

    system = (await get_override("candidate_profile_system")) or _SYSTEM
    try:
        response = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=content)])
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
    except Exception as exc:
        logger.warning("[candidate_profile] build failed: %s", exc)
        return {}

    return {
        "name": data.get("name", ""),
        "current_title": data.get("current_title", ""),
        "seniority": data.get("seniority", ""),
        "years_experience": data.get("years_experience", 0),
        "domains": data.get("domains") or [],
        "core_skills": data.get("core_skills") or [],
        "standout_achievements": data.get("standout_achievements") or [],
        "summary": data.get("summary", ""),
    }
