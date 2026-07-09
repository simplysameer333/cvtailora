"""Salary benchmark service — extracts salary signals from JD and estimates market range.

Single focused Haiku call. Returns a salary estimate drawn from the JD text:
min/max range, currency, period, location context, confidence level, and a
one-line rationale. Never fabricates compensation data not present in the JD.
When the JD is silent, returns confidence=low and says so explicitly.

Fast and cheap (~$0.001, ~3 s). Result cached on session.
"""
from __future__ import annotations
import json
import logging
import re
from config import settings

logger = logging.getLogger("cvtailora")

_SYSTEM = """You are a compensation specialist. Extract salary information from a job description.

## TASK
Read the job description and extract / estimate the compensation range.

Provide:
1. min_salary: lower bound of estimated annual salary (integer, in the job's primary currency, or null if truly unknowable)
2. max_salary: upper bound (integer, or null)
3. currency: ISO 4217 code (e.g. "USD", "GBP", "EUR") — infer from location/company if not stated
4. period: "annual" | "monthly" | "hourly" (convert to annual when possible)
5. location_note: one short sentence on how the location/remote status affects typical pay for this role (or "" if irrelevant)
6. confidence: "high" | "medium" | "low"
   - high: explicit salary range stated in the JD
   - medium: strong signals (seniority, company size, city, role type) allow a reasonable estimate
   - low: too little context to estimate reliably
7. rationale: one sentence explaining the estimate source (direct quote from JD, industry benchmarks used, or why it is low-confidence)
8. display_range: formatted string like "$90,000 – $120,000 / year" or "£45,000 – £55,000 / year" or "Not disclosed"

## ABSOLUTE RULES
- Never invent specific numbers when the JD has no salary signals and no location/seniority cues.
- When confidence is low and no range can be estimated, set min_salary/max_salary to null and display_range to "Not disclosed".
- Do not reference any external data source — base the estimate entirely on signals within the JD text.

## OUTPUT
Return ONLY valid JSON — no markdown fences, no preamble:
{
  "min_salary": 90000,
  "max_salary": 120000,
  "currency": "USD",
  "period": "annual",
  "location_note": "",
  "confidence": "medium",
  "rationale": "...",
  "display_range": "$90,000 – $120,000 / year"
}"""


def _validate(data: dict) -> dict:
    """Validate and normalise the LLM response. Raises ValueError on bad output."""
    required = {"display_range", "confidence", "rationale", "currency", "period"}
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing fields: {missing}")
    if data.get("confidence") not in {"high", "medium", "low"}:
        raise ValueError(f"Invalid confidence value: {data.get('confidence')}")
    if data.get("period") not in {"annual", "monthly", "hourly"}:
        raise ValueError(f"Invalid period value: {data.get('period')}")
    return {
        "min_salary": data.get("min_salary"),
        "max_salary": data.get("max_salary"),
        "currency": str(data.get("currency", "USD"))[:10],
        "period": data["period"],
        "location_note": str(data.get("location_note", ""))[:300],
        "confidence": data["confidence"],
        "rationale": str(data.get("rationale", ""))[:400],
        "display_range": str(data.get("display_range", "Not disclosed"))[:100],
    }


async def estimate_salary(job_description: str) -> dict:
    """Estimate salary range from a job description. Returns validated benchmark dict."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=settings.anthropic_api_key,
        max_tokens=600,
        timeout=25,
        max_retries=2,
    )

    content = (
        f"## JOB DESCRIPTION\n{job_description[:4000]}\n\n"
        "Extract salary signals and return the benchmark JSON."
    )

    try:
        response = await llm.ainvoke([SystemMessage(content=_SYSTEM), HumanMessage(content=content)])
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("[salary_benchmark] JSON parse error: %s", exc)
        raise
    except Exception as exc:
        logger.warning("[salary_benchmark] LLM call failed: %s", exc)
        raise

    result = _validate(data)
    logger.info(
        "[salary_benchmark] confidence=%s range=%s currency=%s",
        result["confidence"], result["display_range"], result["currency"],
    )
    return result
