"""Profile prefill — LLM extraction of profile fields from raw resume text.

Two focused calls (one per output contract, per CLAUDE.md "one call per
purpose"), previously duplicated inline in routers/profile.py and
routers/account.py with no telemetry and no service isolation:

- prefill_contact_fields: the 7 flat contact/identity fields the builder's
  profile step needs (short input, small output — cheap).
- prefill_full_profile: the full structured account profile including
  experience/education/project arrays (needs the whole resume body).

Both are best-effort: any failure returns {} and the caller falls back
(regex parser / empty form). extract_json_object is pure and unit-tested.
"""
from __future__ import annotations

import json
import logging
import re

from anthropic import AsyncAnthropic

from config import settings
from services.pipeline import telemetry

logger = logging.getLogger("cvtailora")

_CONTACT_PROMPT = """Extract the following fields from the resume text and return as a single JSON object.
Use empty string "" for any field you cannot find.

Fields:
- full_name: candidate's full name
- email: email address
- phone: phone number
- linkedin: LinkedIn URL or username (full URL preferred)
- location: city and country/state
- target_role: current or most recent job title, or stated objective/target role
- key_skills: top 8-10 skills as a comma-separated string

Return only the JSON object, no markdown fences, no explanation."""

_FULL_PROFILE_PROMPT = """Extract the following fields from the resume text and return a single JSON object.
Use empty string "" for any field you cannot find. Return key_skills as a JSON array of strings.

Fields:
- full_name
- email
- phone
- linkedin  (full URL preferred)
- location  (city + country/state)
- target_role  (most recent job title or stated objective)
- primary_skill  (the single most defining technical or professional skill, e.g. "Java", "Python", "Financial Modelling", "UX Design" — one short phrase, not a sentence)
- key_skills  (top 8-10 skills as a JSON array)
- summary  (2–3 sentence professional summary — write one if absent)
- experience  (JSON array, newest first; each item {"title", "company", "start", "end", "description"} — description is 1-2 sentences, dates as written in the resume, "" if missing)
- education  (JSON array; each item {"degree", "institution", "year"})
- projects  (JSON array; each item {"name", "description", "url"} — [] if none)
- certifications  (JSON array; each item {"name", "issuer", "year"} — [] if none)

Return only the JSON object, no markdown fences, no explanation."""


def extract_json_object(raw: str) -> dict:
    """Pure: strip optional markdown fences and parse one JSON object.
    Returns {} for anything that isn't a JSON dict (validation gate — callers
    never see non-dict LLM output)."""
    raw = (raw or "").strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def _extract(prompt: str, resume_text: str, text_cap: int,
                   max_tokens: int, agent: str) -> dict:
    """One prefill call: LLM → telemetry → validated JSON dict ({} on failure)."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.anthropic_evaluator_model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": f"{prompt}\n\nResume:\n{resume_text[:text_cap]}"}],
    )
    telemetry.record_anthropic(settings.anthropic_evaluator_model, agent, msg)
    usage = getattr(msg, "usage", None)
    logger.info("[prefill] %s in_tok=%s out_tok=%s", agent,
                getattr(usage, "input_tokens", "?"), getattr(usage, "output_tokens", "?"))
    return extract_json_object(msg.content[0].text)


async def prefill_contact_fields(resume_text: str) -> dict:
    """Flat contact/identity fields for the builder profile step.
    4k chars in / 1k tokens out — the fields live at the top of the resume."""
    return await _extract(_CONTACT_PROMPT, resume_text, 4000, 1024, "prefill_contact")


async def prefill_full_profile(resume_text: str) -> dict:
    """Full structured account profile (experience/education/... arrays).
    12k chars in / 3k tokens out — arrays need the whole resume body."""
    return await _extract(_FULL_PROFILE_PROMPT, resume_text, 12000, 3000, "prefill_full_profile")
