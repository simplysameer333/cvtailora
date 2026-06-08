"""Cover letter router — generate and retrieve cover letters for a session."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from database import get_db
from config import settings
from dependencies.auth import get_optional_user
from services.usage_service import check_budget, increment_usage

router = APIRouter()
logger = logging.getLogger("tailormycv")


class StandaloneCoverLetterRequest(BaseModel):
    resume_text: str
    job_description: str
    role_override: str = ""  # user-corrected target role; re-targets the letter


@router.post("/cover-letter/generate")
async def generate_cover_letter_standalone(
    body: StandaloneCoverLetterRequest,
    user: dict | None = Depends(get_optional_user),
):
    """Generate a cover letter from raw resume text + job description.

    Standalone endpoint — no session required. Suitable for the dedicated
    Cover Letter page where users paste their resume and JD directly.
    """
    if not body.resume_text.strip():
        raise HTTPException(422, "Resume text is required.")
    if not body.job_description.strip():
        raise HTTPException(422, "Job description is required.")

    db = get_db()
    user_tier = (user or {}).get("tier", "free")
    if user:
        await check_budget(db, user, user_tier)

    try:
        from services.cover_letter_service import generate_cover_letter as _generate
        result = await _generate(body.resume_text, body.job_description, {}, role_override=body.role_override)
    except Exception as exc:
        logger.exception("[cover_letter_standalone] Generation failed: %s", exc)
        raise HTTPException(500, f"Cover letter generation failed: {exc}")

    if user:
        await increment_usage(db, str(user.get("_id", "")), 1, 0.012)

    return result


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
        from services.engagement_context import get_or_build_session_context
        context = await get_or_build_session_context(db, session_id, session)
        result = await _generate(resume_text, job_description, user_profile, context=context)
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
