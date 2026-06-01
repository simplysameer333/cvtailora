"""CV Score — AI-powered analysis across 7 quality categories."""
from __future__ import annotations

import json
import logging
import re

from anthropic import AsyncAnthropic

logger = logging.getLogger("tailormycv")

_SYSTEM = (
    "You are an expert CV reviewer and ATS specialist with 10+ years of experience "
    "evaluating CVs for top-tier companies. Analyse CVs rigorously but fairly — "
    "most strong professional CVs score 65–85. Always return valid JSON only."
)

_PROMPT = """\
Analyse this CV and return a JSON evaluation. Respond with ONLY the JSON object, no extra text.

CV:
{resume_text}

Return this exact JSON structure:
{{
  "overall_score": <integer 0-100>,
  "summary": "<2-sentence overall assessment>",
  "categories": [
    {{
      "key": "contact",
      "name": "Contact Information",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Full name present", "passed": <bool>}},
        {{"label": "Email address", "passed": <bool>}},
        {{"label": "Phone number", "passed": <bool>}},
        {{"label": "LinkedIn URL", "passed": <bool>}},
        {{"label": "Location / city", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>"]
    }},
    {{
      "key": "summary",
      "name": "Professional Summary",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Summary section present", "passed": <bool>}},
        {{"label": "Appropriate length (3–6 sentences)", "passed": <bool>}},
        {{"label": "Mentions years of experience", "passed": <bool>}},
        {{"label": "Highlights core expertise", "passed": <bool>}},
        {{"label": "Avoids generic phrases (e.g. 'hard-working')", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "experience",
      "name": "Work Experience",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "At least 2 roles listed", "passed": <bool>}},
        {{"label": "Company names and dates present", "passed": <bool>}},
        {{"label": "Quantified achievements (numbers, %, $)", "passed": <bool>}},
        {{"label": "Strong action verbs used", "passed": <bool>}},
        {{"label": "Reverse chronological order", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "skills",
      "name": "Skills",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Dedicated skills section present", "passed": <bool>}},
        {{"label": "Technical / hard skills listed", "passed": <bool>}},
        {{"label": "Skills organised by category", "passed": <bool>}},
        {{"label": "Relevant to apparent target role", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>"]
    }},
    {{
      "key": "education",
      "name": "Education & Certifications",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Degree(s) listed", "passed": <bool>}},
        {{"label": "Institution names present", "passed": <bool>}},
        {{"label": "Graduation years included", "passed": <bool>}},
        {{"label": "Certifications listed", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>"]
    }},
    {{
      "key": "ats",
      "name": "ATS Compatibility",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Standard section headings used", "passed": <bool>}},
        {{"label": "Consistent date formatting", "passed": <bool>}},
        {{"label": "Industry keywords present", "passed": <bool>}},
        {{"label": "No excessive jargon or filler phrases", "passed": <bool>}},
        {{"label": "Clean, parseable structure", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "design",
      "name": "Design & Format",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Appropriate CV length (1–2 pages)", "passed": <bool>}},
        {{"label": "Consistent structure and section order", "passed": <bool>}},
        {{"label": "Clear visual hierarchy (headers, bullets)", "passed": <bool>}},
        {{"label": "No excessive special characters or symbols", "passed": <bool>}},
        {{"label": "Dates and locations consistently formatted", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }}
  ]
}}

Scoring rules:
- overall_score = weighted average: experience 25%, skills 20%, ats 15%, summary 15%, design 10%, contact 10%, education 5%
- status thresholds: 80-100 = excellent, 60-79 = good, 40-59 = needs_work, 0-39 = missing
- improvements: 1-3 specific, actionable suggestions (even for high-scoring categories)
- Be concrete, not generic (e.g. "Add GitHub profile URL" not "Add more contact info")
- For design: infer from text structure — consistent indentation, date formats, bullet style, section naming, approximate length
"""


async def check_resume(resume_text: str, anthropic_key: str) -> dict:
    """Analyse CV text and return structured quality check results."""
    client = AsyncAnthropic(api_key=anthropic_key)

    prompt = _PROMPT.format(resume_text=resume_text[:8000])

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("[cv_score] Failed to parse AI response: %s", exc)
        raise ValueError("CV analysis failed — please try again.") from exc

    return result
