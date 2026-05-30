"""LinkedIn profile fetcher via RapidAPI (Fresh LinkedIn Profile Data by Proxycurl)."""
from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger("tailormycv")

_RAPIDAPI_HOST = "fresh-linkedin-profile-data.p.rapidapi.com"
_LINKEDIN_URL_RE = re.compile(
    r"^https?://(www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%\.]+/?$"
)


def is_valid_linkedin_url(url: str) -> bool:
    return bool(_LINKEDIN_URL_RE.match(url.strip().split("?")[0]))


def _build_raw_text(data: dict) -> str:
    """Convert LinkedIn API response into a structured text block for the AI pipeline."""
    lines: list[str] = []

    name     = data.get("full_name") or ""
    headline = data.get("headline") or data.get("occupation") or ""
    location = data.get("city") or data.get("location_name") or ""
    summary  = data.get("summary") or ""

    if name:
        lines.append(f"Name: {name}")
    if headline:
        lines.append(f"Headline: {headline}")
    if location:
        lines.append(f"Location: {location}")

    email = data.get("personal_email") or ""
    if email:
        lines.append(f"Email: {email}")

    if summary:
        lines += ["", "Summary:", summary]

    # Experience
    for exp in (data.get("experiences") or []):
        if not lines or lines[-1] != "":
            lines.append("")
        title   = exp.get("title") or ""
        company = exp.get("company") or ""
        start   = exp.get("starts_at") or {}
        end     = exp.get("ends_at") or {}

        s_str = f"{start.get('month', '')}/{start.get('year', '')}" if start.get("year") else ""
        e_str = f"{end.get('month', '')}/{end.get('year', '')}" if end.get("year") else "Present"
        date  = f"{s_str} – {e_str}" if s_str else ""

        role_line = title
        if company:
            role_line += f" at {company}"
        if date:
            role_line += f" ({date})"
        lines.append(role_line)

        desc = (exp.get("description") or "").strip()
        for dl in desc.split("\n")[:6]:
            if dl.strip():
                lines.append(f"  {dl.strip()}")

    # Education
    if data.get("education"):
        lines.append("")
        lines.append("Education:")
        for edu in (data.get("education") or []):
            school = edu.get("school") or ""
            degree = edu.get("degree_name") or ""
            field  = edu.get("field_of_study") or ""
            start  = (edu.get("starts_at") or {}).get("year", "")
            end    = (edu.get("ends_at") or {}).get("year", "")

            edu_line = degree
            if field:
                edu_line += f" in {field}"
            if school:
                edu_line += f" · {school}"
            if start or end:
                edu_line += f" ({start}–{end})"
            lines.append(f"  {edu_line}")

    # Skills
    raw_skills = data.get("skills") or []
    skill_names = [
        (s.get("name") if isinstance(s, dict) else str(s))
        for s in raw_skills[:25]
    ]
    skill_names = [s for s in skill_names if s]
    if skill_names:
        lines += ["", f"Skills: {', '.join(skill_names)}"]

    return "\n".join(lines)


def _normalize(data: dict) -> dict:
    raw_skills = data.get("skills") or []
    skills = [
        (s.get("name") if isinstance(s, dict) else str(s))
        for s in raw_skills[:25]
    ]
    return {
        "full_name": data.get("full_name") or "",
        "headline":  data.get("headline") or data.get("occupation") or "",
        "location":  data.get("city") or data.get("location_name") or "",
        "email":     data.get("personal_email") or "",
        "summary":   data.get("summary") or "",
        "skills":    [s for s in skills if s],
        "raw_text":  _build_raw_text(data),
    }


async def fetch_profile(linkedin_url: str, rapidapi_key: str) -> dict:
    """Fetch and normalise a LinkedIn profile via RapidAPI.

    Raises:
        ValueError: invalid URL format
        httpx.HTTPStatusError: API-level error (caller maps to HTTPException)
    """
    if not is_valid_linkedin_url(linkedin_url):
        raise ValueError("Invalid LinkedIn profile URL — expected linkedin.com/in/username.")

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"https://{_RAPIDAPI_HOST}/get-linkedin-profile",
            params={"linkedin_url": linkedin_url.strip(), "include_skills": "true"},
            headers={
                "x-rapidapi-host": _RAPIDAPI_HOST,
                "x-rapidapi-key": rapidapi_key,
            },
        )
        resp.raise_for_status()

    body = resp.json()
    # Proxycurl wraps the payload in a "data" key; some versions return it at root
    data = body.get("data") or body
    logger.info("[linkedin] Fetched profile: %s (%s)", data.get("full_name", "?"), linkedin_url)
    return _normalize(data)
