"""Cover letter generation service.

Generates a tailored, professional cover letter from a candidate's resume,
user profile, and job description. Single focused Sonnet call (separate from
resume generation — per the one-call-per-purpose principle).

Output structure:
  {
    "subject_line": "Application for [Role] at [Company]",
    "recipient": "Hiring Manager" | "Dear [Name]",
    "opening": "paragraph",
    "body_paragraphs": ["paragraph1", "paragraph2"],
    "closing": "paragraph",
    "sign_off": "Yours sincerely,\n[Name]",
    "full_text": "complete plain-text version"
  }

Each paragraph is plain text — no markdown, no HTML. The frontend renders them.
"""
from __future__ import annotations
import json
import logging
import re
from config import settings
from services.prompt_store import get_override
from services.engagement_context import (
    build_engagement_context,
    context_to_prompt_block,
    detected_role as _detected_role,
)

logger = logging.getLogger("cvtailora")

_SYSTEM = """You are an expert cover letter writer. Your sole purpose is to produce the most compelling, targeted cover letter for this specific candidate applying to this specific role.

## ABSOLUTE CONSTRAINT — NO HALLUCINATION
Every claim must be grounded in the candidate's resume or profile. Never invent metrics, companies, titles, qualifications, or achievements. If data is absent, omit it — never guess.

## COVER LETTER PRINCIPLES
1. **Opening paragraph** — Hook immediately: name the specific role and company, state the single strongest match between the candidate's background and the role's top requirement. No "I am writing to apply for…" openers.
2. **Body paragraphs (2 max)** — Each proves one key value proposition with a concrete, specific example from the candidate's real experience. Reference at least one specific JD requirement per paragraph. Keep each under 80 words.
3. **Closing paragraph** — Express genuine, specific interest in THIS company (not generic enthusiasm). State availability and call to action.
4. **Tone** — Match the specified tone (Professional/Conversational/Executive). Always confident, never apologetic.
5. **Length** — Maximum 280 words total. Every sentence earns its place.

## LANGUAGE RULES
- No em-dashes (—). Use commas, colons, or rewrite.
- No hedging: "was responsible for", "helped with", "assisted in". Use ownership verbs.
- No clichés: "passionate about", "results-driven", "team player", "proven track record".
- Active voice only.
- First person, present/past tense as appropriate.

## COMPANY NAME EXTRACTION
Extract the company name from the job description. If not present, use "your organisation".

## USING THE PROVIDED ANALYSIS
A pre-analysed CANDIDATE PROFILE and TARGET ROLE PROFILE may precede the resume and JD. When present, match the candidate's standout achievements to the role's key responsibilities and screening focus. Still ground every claim in the resume.

## OUTPUT FORMAT
Return ONLY valid JSON — no preamble, no markdown fences:
{
  "company_name": "string",
  "subject_line": "Application for [Role] at [Company]",
  "recipient": "Dear Hiring Manager",
  "opening": "string — opening paragraph text",
  "body_paragraphs": ["string — paragraph 1", "string — paragraph 2"],
  "closing": "string — closing paragraph text",
  "sign_off": "Yours sincerely,"
}"""


async def generate_cover_letter(
    resume_text: str,
    job_description: str,
    user_profile: dict,
    context: dict | None = None,
    role_override: str = "",
) -> dict:
    """Generate a tailored cover letter. Returns structured dict or raises on failure.

    ``context`` is the shared engagement context ({candidate_profile, jd_profile}); when
    omitted it is built here. ``role_override`` re-targets the letter at a corrected role.
    The returned dict includes ``detected_role`` for display in the UI.
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    if context is None:
        context = await build_engagement_context(resume_text, job_description, user_profile, role_override)

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model=settings.generator_model,
        api_key=settings.anthropic_api_key,
        max_tokens=1200,
        timeout=60,
        max_retries=2,
    )

    name = user_profile.get("full_name") or ""
    target_role = user_profile.get("target_role") or ""
    tone = user_profile.get("preferred_tone") or "Professional"
    additional_notes = user_profile.get("additional_notes") or ""

    profile_block = "\n".join(filter(None, [
        f"Name: {name}" if name else "",
        f"Target role: {target_role}" if target_role else "",
        f"Tone: {tone}",
        f"Additional notes: {additional_notes}" if additional_notes else "",
    ]))

    ctx_block = context_to_prompt_block(context)
    content = (
        (f"{ctx_block}\n\n" if ctx_block else "")
        + f"## CANDIDATE PROFILE\n{profile_block}\n\n"
        + f"## CANDIDATE RESUME (source of truth — all facts must come from here)\n{resume_text[:5000]}\n\n"
        + f"## JOB DESCRIPTION\n{job_description[:3000]}\n\n"
        + "Write a targeted cover letter. Return only JSON."
    )

    system = (await get_override("cover_letter_system")) or _SYSTEM
    response = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=content)])
    raw = response.content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

    data = json.loads(raw)

    # Build full plain text version
    paragraphs = [
        data.get("opening", ""),
        *[p for p in (data.get("body_paragraphs") or []) if p],
        data.get("closing", ""),
    ]
    full_text = "\n\n".join(p for p in paragraphs if p)
    full_text = (
        f"{data.get('recipient', 'Dear Hiring Manager')},\n\n"
        + full_text
        + f"\n\n{data.get('sign_off', 'Yours sincerely,')}\n{name}"
    )

    return {
        "company_name": data.get("company_name", ""),
        "subject_line": data.get("subject_line", f"Application for {target_role}"),
        "recipient": data.get("recipient", "Dear Hiring Manager"),
        "opening": data.get("opening", ""),
        "body_paragraphs": data.get("body_paragraphs") or [],
        "closing": data.get("closing", ""),
        "sign_off": data.get("sign_off", "Yours sincerely,"),
        "candidate_name": name,
        "full_text": full_text,
        "detected_role": role_override or _detected_role(context),
    }
