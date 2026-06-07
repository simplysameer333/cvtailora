"""Cover letter router — generate and retrieve cover letters for a session."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from database import get_db
from config import settings
from dependencies.auth import get_optional_user
from services.usage_service import check_budget, increment_usage

router = APIRouter()
logger = logging.getLogger("tailormycv")


@router.post("/sessions/{session_id}/cover-letter")
async def generate_cover_letter(
    session_id: str,
    user: dict | None = Depends(get_optional_user),
):
    """Generate a tailored cover letter for this session.

    Requires a session with a parsed resume + job description.
    Uses the same generator model as the resume pipeline (Sonnet).
    Result is persisted on the session and returned.
    """
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    job_description = session.get("job_description") or ""
    user_profile = session.get("user_profile") or {}

    if not resume_text:
        raise HTTPException(422, "No resume found in session.")
    if not job_description.strip():
        raise HTTPException(422, "No job description in session. Paste a job description first (Step 3).")

    # Cost budget check
    user_tier = (user or {}).get("tier", "free")
    if user:
        await check_budget(db, user, user_tier)

    try:
        from services.cover_letter_service import generate_cover_letter as _generate
        result = await _generate(resume_text, job_description, user_profile)
    except Exception as exc:
        logger.exception("[cover_letter] Generation failed for session %s: %s", session_id, exc)
        raise HTTPException(500, f"Cover letter generation failed: {exc}")

    # Persist on session
    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"cover_letter": result}},
    )

    # Charge usage (1 Sonnet call)
    if user:
        await increment_usage(db, str(user.get("_id", "")), 1, 0.012)

    return result


@router.get("/sessions/{session_id}/cover-letter")
async def get_cover_letter(session_id: str):
    """Retrieve a previously generated cover letter for this session."""
    db = get_db()
    session = await db.sessions.find_one(
        {"_id": ObjectId(session_id)},
        {"cover_letter": 1},
    )
    if not session:
        raise HTTPException(404, "Session not found.")
    cover_letter = session.get("cover_letter")
    if not cover_letter:
        raise HTTPException(404, "No cover letter generated yet. POST to this endpoint first.")
    return cover_letter
