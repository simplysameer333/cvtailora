"""Pre-generation fit scoring — evaluates candidate-job match before running the expensive pipeline.

Returns a structured fit assessment across 5 dimensions:
  1. Skills match (0–100)
  2. Experience match (0–100)
  3. Career alignment (0–100)
  4. Skill gaps: matched skills, missing required skills, missing nice-to-have skills
  5. Overall score (weighted average: skills 30%, experience 35%, career 35%)

Verdict thresholds:
  Strong Fit (75+): apply, all signals positive
  Good Fit  (60–74): apply, address gaps in cover letter
  Moderate  (45–59): consider carefully
  Weak Fit  (<45): likely not worth the pipeline cost

This runs a SINGLE Haiku call (cheap) and finishes in ~3–5 s.
Used in the builder Step 3 (job description page) to show a fit panel BEFORE committing to generation.
"""
from __future__ import annotations
import json
import logging
from config import settings

logger = logging.getLogger("cvtailora")

_SYSTEM = """You are a senior technical recruiter evaluating a candidate's fit for a job. Your job is to assess the match honestly and helpfully.

## YOUR TASK
Score the candidate's fit for this specific job across three dimensions:
1. skills_match (0-100): How well do the candidate's skills match what the job requires? (required skills weighted 2× vs nice-to-have)
2. experience_match (0-100): How well does the candidate's work history, seniority level, and domain match what the role needs?
3. career_alignment (0-100): Does this role make sense as a career step for this candidate? (not too junior, not too senior, relevant domain)

Also identify:
- matched_skills: skills the JD requires/prefers that the candidate clearly has (list, max 8)
- missing_required: skills listed as "required"/"must have" in the JD that the candidate lacks (list, max 5)
- missing_nice_to_have: skills listed as preferred/nice-to-have the candidate lacks (list, max 5)
- summary: 1–2 sentences on the overall fit, honest and specific

## SCORING GUIDANCE
- 80–100: Direct match, strong evidence
- 60–79: Good match with minor gaps
- 40–59: Partial match, material gaps
- 0–39: Significant mismatch

## ABSOLUTE RULE — NO HALLUCINATION
Only reference skills and experience explicitly present in the inputs. Never invent gaps or strengths.

## OUTPUT
Return ONLY valid JSON — no preamble, no markdown fences:
{
  "skills_match": 0,
  "experience_match": 0,
  "career_alignment": 0,
  "matched_skills": [],
  "missing_required": [],
  "missing_nice_to_have": [],
  "summary": "string"
}"""


def _verdict(score: int) -> str:
    if score >= 75: return "Strong Fit"
    if score >= 60: return "Good Fit"
    if score >= 45: return "Moderate Fit"
    return "Weak Fit"


async def score_fit(
    resume_text: str,
    job_description: str,
    user_profile: dict,
) -> dict:
    """Score candidate-job fit. Returns fit dict or raises on failure."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=settings.anthropic_api_key,
        max_tokens=800,
        # Scoring must be repeatable — same resume+JD, same fit score.
        temperature=0,
        timeout=30,
        max_retries=2,
    )

    target_role = user_profile.get("target_role", "")
    key_skills = ", ".join(user_profile.get("key_skills") or [])
    profile_block = f"Target role: {target_role}" + (f"\nSelf-identified key skills: {key_skills}" if key_skills else "")

    # Inject work-style preferences so the career_alignment dimension can factor
    # in environment fit (remote vs office), pace, and collaboration style.
    work_style = user_profile.get("work_style") or {}
    if isinstance(work_style, dict):
        ws_parts = [
            f"Work pace: {work_style.get('work_pace')}" if work_style.get("work_pace") else "",
            f"Problem solving: {work_style.get('problem_solving')}" if work_style.get("problem_solving") else "",
            f"Communication: {work_style.get('communication')}" if work_style.get("communication") else "",
            f"Environment preference: {work_style.get('environment')}" if work_style.get("environment") else "",
        ]
        ws_text = "; ".join(p for p in ws_parts if p)
        if ws_text:
            profile_block += f"\nWork style preferences: {ws_text}"

    content = (
        f"## CANDIDATE PROFILE\n{profile_block}\n\n"
        f"## CANDIDATE RESUME (first 4000 chars)\n{resume_text[:4000]}\n\n"
        f"## JOB DESCRIPTION\n{job_description[:3000]}\n\n"
        "Score the fit and identify skill gaps. Return only JSON."
    )

    try:
        response = await llm.ainvoke([SystemMessage(content=_SYSTEM), HumanMessage(content=content)])
        raw = response.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
    except Exception as exc:
        logger.warning("[fit_scoring] LLM call failed: %s", exc)
        raise

    skills = int(data.get("skills_match", 0))
    experience = int(data.get("experience_match", 0))
    career = int(data.get("career_alignment", 0))
    overall = round(skills * 0.30 + experience * 0.35 + career * 0.35)

    return {
        "overall": overall,
        "verdict": _verdict(overall),
        "skills_match": skills,
        "experience_match": experience,
        "career_alignment": career,
        "matched_skills": data.get("matched_skills") or [],
        "missing_required": data.get("missing_required") or [],
        "missing_nice_to_have": data.get("missing_nice_to_have") or [],
        "summary": data.get("summary", ""),
    }
