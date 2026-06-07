"""Salary benchmarking router.

POST /api/sessions/{session_id}/salary-benchmark  — session-bound, cached on session
GET  /api/sessions/{session_id}/salary-benchmark  — retrieve cached result
POST /api/salary/estimate                          — standalone (resume + JD)
"""
from __future__ import annotations
import logging
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from dependencies.auth import get_current_user

router = APIRouter()
logger = logging.getLogger("tailormycv")


@router.post("/sessions/{session_id}/salary-benchmark")
async def session_salary_benchmark(session_id: str, _user: dict = Depends(get_current_user)):
    """Generate (or return cached) salary benchmark for this session's job description."""
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    cached = session.get("salary_benchmark")
    if cached:
        return cached

    job_description = session.get("job_description") or ""
    if not job_description.strip():
        raise HTTPException(422, "No job description in session. Please paste a job description first.")

    try:
        from services.salary_benchmark_service import estimate_salary
        result = await estimate_salary(job_description)
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"salary_benchmark": result}},
        )
        return result
    except Exception as exc:
        logger.warning("[salary] Failed for session %s: %s", session_id, exc)
        raise HTTPException(500, f"Salary benchmark failed: {exc}")


@router.get("/sessions/{session_id}/salary-benchmark")
async def get_session_salary_benchmark(session_id: str, _user: dict = Depends(get_current_user)):
    """Return the cached salary benchmark for this session, or 404 if not yet generated."""
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"salary_benchmark": 1})
    if not session:
        raise HTTPException(404, "Session not found.")
    cached = session.get("salary_benchmark")
    if not cached:
        raise HTTPException(404, "No salary benchmark yet for this session.")
    return cached


class StandaloneSalaryRequest(BaseModel):
    job_description: str


@router.post("/salary/estimate")
async def standalone_salary_estimate(
    body: StandaloneSalaryRequest,
    _user: dict = Depends(get_current_user),
):
    """Standalone salary benchmark — takes a raw job description, no session required."""
    if not body.job_description.strip():
        raise HTTPException(422, "job_description is required.")
    try:
        from services.salary_benchmark_service import estimate_salary
        return await estimate_salary(body.job_description)
    except Exception as exc:
        logger.warning("[salary] Standalone estimate failed: %s", exc)
        raise HTTPException(500, f"Salary benchmark failed: {exc}")
