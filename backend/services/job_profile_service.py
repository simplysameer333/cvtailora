"""Job profiler — distils a job description into the role profile it targets.

One focused Haiku call. Produces the structured "what role is this JD looking for, and
what is it really screening for" understanding shared by Interview Prep and Cover Letter.
Complements JobAnalyzerAgent (which only extracts a skill list).

System prompt is admin-overridable via prompt_store key "job_profile_system".
Returns {} on any failure so callers degrade gracefully to raw JD text.
"""
from __future__ import annotations
import json
import logging
import re
from config import settings
from services.prompt_store import get_override

logger = logging.getLogger("tailormycv")

_SYSTEM = """You are an expert technical recruiter. Read a job description and distil the PROFILE of the ideal candidate it targets, so another AI can write a tailored cover letter and predict the interview questions.

## EXTRACT (ground everything in the JD — never invent)
- role_title: the role's title as the employer would name it
- seniority: exactly one of "Junior", "Mid", "Senior", "Lead", "Executive"
- domain: the industry/domain and kind of work, in one short phrase
- must_have_skills: skills/qualifications marked required/essential, or implied by the title (max 8)
- nice_to_have_skills: preferred/bonus/desirable skills (max 6)
- key_responsibilities: 3-5 core things the person will actually do
- screening_focus: 3-5 underlying competencies or signals the interviewer will probe for, read between the lines (e.g. "ability to own systems end-to-end", "stakeholder communication under ambiguity") — not just the literal skills

## ABSOLUTE RULE
Only use information present or clearly implied in the JD. If the JD is thin, return fewer items — never pad.

## OUTPUT
Return ONLY valid JSON — no markdown, no explanation:
{
  "role_title": "",
  "seniority": "",
  "domain": "",
  "must_have_skills": [],
  "nice_to_have_skills": [],
  "key_responsibilities": [],
  "screening_focus": []
}"""


async def build_job_profile(job_description: str, target_role: str = "") -> dict:
    """Distil a JD into a role profile. ``target_role`` (a user-supplied role) biases the
    analysis when the JD is ambiguous. Returns {} on failure."""
    if not settings.anthropic_api_key or not (job_description or "").strip():
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

    system = (await get_override("job_profile_system")) or _SYSTEM
    # A user-specified role overrides ambiguity — tell the model to treat it as the target.
    hint = f"\n\n(The candidate is targeting this role specifically: {target_role}. Profile the JD for that role.)" if target_role else ""
    content = f"## JOB DESCRIPTION\n{job_description[:3500]}{hint}\n\nDistil the role profile. Return only JSON."

    try:
        response = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=content)])
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
    except Exception as exc:
        logger.warning("[job_profile] build failed: %s", exc)
        return {}

    profile = {
        "role_title": data.get("role_title", ""),
        "seniority": data.get("seniority", ""),
        "domain": data.get("domain", ""),
        "must_have_skills": data.get("must_have_skills") or [],
        "nice_to_have_skills": data.get("nice_to_have_skills") or [],
        "key_responsibilities": data.get("key_responsibilities") or [],
        "screening_focus": data.get("screening_focus") or [],
    }
    # A user-supplied role is authoritative for the displayed/targeted role title.
    if target_role:
        profile["role_title"] = target_role
    return profile
