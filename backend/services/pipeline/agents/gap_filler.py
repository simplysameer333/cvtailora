"""Gap-filler agent — closes score gaps using ONLY facts from the user's own data.

One dedicated LLM call (CLAUDE.md: one call per purpose). Given the score gaps
(the "Add these to raise your score" items + weak-category suggestions) and the
user's own sources (original CV text, session profile, account profile), it
proposes minimal edits that re-insert real facts the tailoring loop dropped or
never surfaced — a LinkedIn URL sitting in the profile, a metric present in the
original CV, a skill the user genuinely lists.

It must NEVER invent anything: gaps with no supporting source go to
`unfillable` and stay on the user's to-do list. Its raw output is additionally
enforced by the pure validation gate in services/autofix_validator.py — an
edit whose facts don't trace to the sources is dropped there regardless of
what the model claims.

temperature=0: this is factual insertion, not creative writing — the same
determinism rule applied to scoring (2026-07-17), so a given resume + gaps +
sources always produces the same fixes.
"""
from __future__ import annotations

import json
import logging

from config import settings

logger = logging.getLogger("cvtailora")

_SYSTEM = """You are the CVTailora gap-filler. A tailored resume scored below its quality target, and you receive the specific gaps blocking the score. Your sole task: close the gaps you can support with the candidate's OWN data, and honestly report the rest as unfillable.

## ABSOLUTE CONSTRAINT — NO FABRICATION
You may only insert information that is EXPLICITLY present in the SOURCES (original resume text or candidate profile). Never invent, estimate, or extrapolate: no metrics, team sizes, years, URLs, email addresses, tools, skills, certifications, or any other fact that you cannot quote verbatim from the sources. A gap you cannot support from the sources goes in `unfillable` — that is a CORRECT answer, not a failure. Every change you return is machine-verified against the sources; an unsupported change is discarded.

## WHAT YOU RECEIVE
- SOURCES: the candidate's original resume text and profile data — the only permitted fact pool.
- CURRENT RESUME JSON: the tailored resume being fixed.
- GAPS: the specific score-blocking issues, each describing what is missing or weak.

## WHAT TO DO
For each gap, in order:
1. Search the SOURCES for real data that closes it (a URL, a metric, a skill, a year, a location).
2. If found: produce the SMALLEST edit that inserts it — restore a dropped metric into an existing bullet, add a missing contact field, add a genuinely-held skill to the skills list, relabel a legacy tool ONLY when the sources show the candidate has the modern equivalent.
3. If not found anywhere in the sources: add the gap to `unfillable` with a short reason.

Rewording existing resume content (stronger verbs, ATS keyword phrasing of facts already present) is allowed and needs no new facts — but still cite the existing text you reworked as the source_quote.

NEVER return a change whose new_value equals the current value ("confirming it is correct" is NOT a change — such entries are discarded). If the resume already satisfies a gap, put it in `unfillable` with reason "already satisfied".

Some gaps carry an ID like [A1], [A2] — echo that ID in the `gap_id` field of the change or unfillable entry that addresses it (empty string when a gap has no ID). This is how the user's to-do list gets updated, so be accurate.

## EDIT PATHS
`path` addresses the CURRENT RESUME JSON: dot keys with [n] list indices.
Examples: "contact.linkedin", "summary", "experience[0].bullets[2]", "sections[1].items".
To add an item to a list, return the FULL new list at the list's path (e.g. all items of "sections[1].items"). Only reference paths that exist in the resume.

## OUTPUT — JSON ONLY, no markdown fences, no commentary
{
  "changes": [
    {
      "path": "contact.linkedin",
      "new_value": "https://linkedin.com/in/example",
      "source_quote": "the verbatim source text (resume or profile) proving this fact",
      "gap": "which gap this closes, in a few words",
      "gap_id": "A1"
    }
  ],
  "unfillable": [
    {"action": "the gap that needs the candidate", "reason": "not present in resume or profile", "gap_id": "A2"}
  ]
}
Return at most 12 changes. `source_quote` must be copied VERBATIM from the sources — it is checked mechanically."""


class GapFillerAgent:
    """One focused, deterministic call that fills score gaps from real user data."""

    name = "gap_filler"

    async def run(
        self,
        resume_json: dict,
        gaps_text: str,
        source_resume_text: str,
        profile_text: str,
    ) -> dict:
        """Return {"changes": [...], "unfillable": [...]}; empty dict on failure."""
        if not settings.anthropic_api_key or not isinstance(resume_json, dict):
            return {}
        try:
            from langchain_anthropic import ChatAnthropic
            from langchain_core.messages import SystemMessage, HumanMessage
            from ..utils import parse_json_response
            from ..telemetry import record as record_usage
            from services.prompt_store import get_override

            # Admin-overridable system prompt (Admin → Prompts & Templates).
            system_text = await get_override("gap_filler_system") or _SYSTEM

            llm = ChatAnthropic(
                model=settings.generator_model,
                api_key=settings.anthropic_api_key,
                max_tokens=3000,
                temperature=0,
                timeout=90,
                max_retries=2,
            )

            content = (
                f"## SOURCES — ORIGINAL RESUME TEXT\n{source_resume_text[:12000]}\n\n"
                f"## SOURCES — CANDIDATE PROFILE\n{profile_text[:6000]}\n\n"
                f"## CURRENT RESUME JSON\n{json.dumps(resume_json, ensure_ascii=False)}\n\n"
                f"## GAPS TO CLOSE\n{gaps_text[:4000]}\n\n"
                "Return the JSON output now."
            )

            response = await llm.ainvoke([
                # Static across all users/sessions — cache the prefix.
                SystemMessage(content=[{"type": "text", "text": system_text,
                                        "cache_control": {"type": "ephemeral"}}]),
                HumanMessage(content=content),
            ])
            record_usage(settings.generator_model, self.name, response)

            parsed = parse_json_response(response.content)
            if isinstance(parsed, dict):
                return {
                    "changes": [c for c in (parsed.get("changes") or []) if isinstance(c, dict)][:12],
                    "unfillable": [u for u in (parsed.get("unfillable") or []) if isinstance(u, dict)],
                }
        except Exception as exc:
            logger.warning("[gap_filler] Fill call failed (non-fatal): %s", exc)
        return {}
