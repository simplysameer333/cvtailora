import json
import re
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from anthropic import AsyncAnthropic
from database import get_db
from models.session import UserProfile
from config import settings

router = APIRouter()

_PREFILL_PROMPT = """Extract the following fields from the resume text and return as a single JSON object.
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


@router.get("/profile/prefill")
async def prefill_profile(session_id: str):
    db = get_db()
    session = await db.sessions.find_one(
        {"_id": ObjectId(session_id)}, {"resume_parsed": 1, "user_profile": 1}
    )
    if not session:
        raise HTTPException(404, "Session not found.")

    raw_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    if not raw_text:
        # Fall back to user_profile already in session (e.g. loaded from library resume)
        existing = session.get("user_profile") or {}
        if any(existing.values()):
            return {
                "full_name":   existing.get("full_name", ""),
                "email":       existing.get("email", ""),
                "phone":       existing.get("phone", ""),
                "linkedin":    existing.get("linkedin", ""),
                "location":    existing.get("location", ""),
                "target_role": existing.get("target_role", ""),
                "key_skills":  ", ".join(existing.get("key_skills") or []),
            }
        return {}

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model=settings.anthropic_evaluator_model,
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": f"{_PREFILL_PROMPT}\n\nResume:\n{raw_text[:4000]}",
        }],
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    try:
        return json.loads(raw)
    except Exception:
        return {}


@router.post("/profile")
async def save_profile(session_id: str, profile: UserProfile):
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"user_profile": profile.model_dump()}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"ok": True}
