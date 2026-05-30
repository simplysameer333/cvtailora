"""LinkedIn profile import endpoint.

POST /api/linkedin/parse — validate URL, fetch profile via RapidAPI, return
normalised data + raw_text so the frontend can confirm and pass to the upload
session.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

from config import settings
from services.linkedin_service import fetch_profile, is_valid_linkedin_url

router = APIRouter()


class LinkedInParseBody(BaseModel):
    url: str


@router.post("/linkedin/parse")
async def parse_linkedin_profile(body: LinkedInParseBody):
    """Validate a LinkedIn URL and return the normalised profile data.

    Returns: full_name, headline, location, email, summary, skills[], raw_text
    """
    url = body.url.strip()

    if not is_valid_linkedin_url(url):
        raise HTTPException(
            400, "Please enter a valid LinkedIn profile URL (linkedin.com/in/username)."
        )

    if not settings.rapidapi_key:
        raise HTTPException(
            503, "LinkedIn import is not configured on this server (RAPIDAPI_KEY missing)."
        )

    try:
        profile = await fetch_profile(url, settings.rapidapi_key)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (402, 403):
            raise HTTPException(
                503,
                "LinkedIn Profile API is not activated for this server. "
                "Please upload your resume instead.",
            )
        if status == 404:
            raise HTTPException(
                404, "LinkedIn profile not found or is set to private."
            )
        if status == 429:
            raise HTTPException(429, "Too many requests — please try again in a moment.")
        raise HTTPException(502, f"LinkedIn API error ({status}). Please try again.")
    except Exception as exc:
        raise HTTPException(502, f"Failed to fetch LinkedIn profile: {exc}")

    return profile
