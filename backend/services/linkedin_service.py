"""LinkedIn profile fetcher via RapidAPI (Real-Time LinkedIn Scraper — linkedin-api8)."""
from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger("tailormycv")

_RAPIDAPI_HOST = "linkedin-api8.p.rapidapi.com"
_LINKEDIN_URL_RE = re.compile(
    r"^https?://(www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%\.]+/?(\?.*)?$"
)


def is_valid_linkedin_url(url: str) -> bool:
    return bool(_LINKEDIN_URL_RE.match(url.strip()))


def _extract_username(linkedin_url: str) -> str:
    """Extract the profile slug from a linkedin.com/in/<username> URL."""
    clean = linkedin_url.strip().rstrip("/").split("?")[0]
    if "/in/" in clean:
        return clean.split("/in/")[-1].rstrip("/")
    return clean  # already a slug


def _parse_date_obj(d: dict | str | None) -> str:
    """Convert a date dict {year, month} or 'YYYY-MM' string to 'MM/YYYY'."""
    if not d:
        return ""
    if isinstance(d, dict):
        year  = d.get("year", "")
        month = d.get("month", "")
        return f"{month}/{year}" if year else str(year) if year else ""
    if isinstance(d, str):
        parts = d.split("-")
        return f"{parts[1]}/{parts[0]}" if len(parts) >= 2 else d
    return ""


def _build_raw_text(data: dict) -> str:
    """Convert linkedin-api8 response into structured text for the AI pipeline."""
    lines: list[str] = []

    first  = data.get("firstName", "")
    last   = data.get("lastName", "")
    full_name = data.get("fullName") or data.get("full_name") or f"{first} {last}".strip()
    headline  = data.get("headline") or data.get("occupation") or ""
    location  = data.get("location") or data.get("addressWithCountry") or data.get("city") or ""
    summary   = data.get("summary") or data.get("about") or ""
    email     = data.get("email") or data.get("personal_email") or ""

    if full_name:
        lines.append(f"Name: {full_name}")
    if headline:
        lines.append(f"Headline: {headline}")
    if location:
        lines.append(f"Location: {location}")
    if email:
        lines.append(f"Email: {email}")
    if summary:
        lines += ["", "Summary:", summary]

    # Experience — linkedin-api8 uses "position" or "experience"
    for exp in (data.get("position") or data.get("experiences") or data.get("experience") or []):
        lines.append("")
        title   = exp.get("title") or ""
        company = exp.get("companyName") or exp.get("company") or ""
        start   = exp.get("start") or exp.get("startDate") or exp.get("starts_at")
        end     = exp.get("end") or exp.get("endDate") or exp.get("ends_at")

        s_str = _parse_date_obj(start)
        e_str = _parse_date_obj(end) if end else "Present"
        date  = f"{s_str} – {e_str}" if s_str else ""

        role_line = title
        if company:
            role_line += f" at {company}"
        if date:
            role_line += f" ({date})"
        if role_line:
            lines.append(role_line)

        for dl in (exp.get("description") or "").strip().split("\n")[:6]:
            if dl.strip():
                lines.append(f"  {dl.strip()}")

    # Education — linkedin-api8 uses "education" array
    for edu in (data.get("education") or data.get("educations") or []):
        lines.append("")
        school = edu.get("schoolName") or edu.get("school") or ""
        degree = edu.get("degreeName") or edu.get("degree") or edu.get("degree_name") or ""
        field  = edu.get("fieldOfStudy") or edu.get("field_of_study") or ""
        start  = _parse_date_obj(edu.get("start") or edu.get("startDate")) or (edu.get("starts_at") or {}).get("year", "")
        end    = _parse_date_obj(edu.get("end")   or edu.get("endDate"))   or (edu.get("ends_at")   or {}).get("year", "")

        edu_line = degree
        if field:
            edu_line += f" in {field}"
        if school:
            edu_line += f" · {school}"
        if start or end:
            edu_line += f" ({start}–{end})"
        if edu_line:
            lines.append(f"Education: {edu_line}")

    # Skills — linkedin-api8 may use "skills_v2" (strings) or "skills" (objects/strings)
    raw_skills = data.get("skills_v2") or data.get("skills") or []
    skill_names = [
        (s.get("name") if isinstance(s, dict) else str(s))
        for s in raw_skills[:25]
    ]
    skill_names = [s for s in skill_names if s]
    if skill_names:
        lines += ["", f"Skills: {', '.join(skill_names)}"]

    return "\n".join(lines)


def _normalize(data: dict) -> dict:
    first = data.get("firstName", "")
    last  = data.get("lastName", "")
    full_name = (
        data.get("fullName") or data.get("full_name")
        or f"{first} {last}".strip()
    )
    raw_skills = data.get("skills_v2") or data.get("skills") or []
    skills = [
        (s.get("name") if isinstance(s, dict) else str(s))
        for s in raw_skills[:25]
    ]
    return {
        "full_name": full_name,
        "headline":  data.get("headline") or data.get("occupation") or "",
        "location":  (
            data.get("location") or data.get("addressWithCountry")
            or data.get("city") or data.get("location_name") or ""
        ),
        "email":     data.get("email") or data.get("personal_email") or "",
        "summary":   data.get("summary") or data.get("about") or "",
        "skills":    [s for s in skills if s],
        "raw_text":  _build_raw_text(data),
    }


async def fetch_profile(linkedin_url: str, rapidapi_key: str) -> dict:
    """Fetch and normalise a LinkedIn profile via the linkedin-api8 RapidAPI endpoint.

    The API takes a username slug (not the full URL), so we extract it first.

    Raises:
        ValueError: invalid URL format or API returned an error response
        httpx.HTTPStatusError: API-level HTTP error (caller maps to HTTPException)
    """
    if not is_valid_linkedin_url(linkedin_url):
        raise ValueError(
            "Invalid LinkedIn profile URL — expected linkedin.com/in/username."
        )

    username = _extract_username(linkedin_url)

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"https://{_RAPIDAPI_HOST}/",
            params={"username": username},
            headers={
                "x-rapidapi-host": _RAPIDAPI_HOST,
                "x-rapidapi-key": rapidapi_key,
            },
        )
        resp.raise_for_status()

    body = resp.json()

    # Detect API-level error responses (e.g. {"message": "There was an error..."})
    if isinstance(body, dict):
        msg = body.get("message") or body.get("error") or ""
        has_profile = body.get("firstName") or body.get("fullName") or body.get("full_name")
        if msg and not has_profile:
            raise ValueError(f"LinkedIn API error: {msg}")

    # linkedin-api8 returns data at root; some variants wrap in "data" key
    data = body.get("data") if isinstance(body.get("data"), dict) else body
    logger.info("[linkedin] Fetched profile for @%s", username)
    return _normalize(data)
