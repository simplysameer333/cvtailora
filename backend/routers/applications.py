"""Application-tracker router (J4) — status pipeline over saved jobs.

PATCH /api/applications/{job_id}/status   — manual status change (any stage)
POST  /api/applications/mark-applied      — auto-capture: Apply/Tailor → applied
GET   /api/applications/stats             — funnel counts for the Analytics page

Tracked applications live in the existing `saved_jobs` collection (a saved job
is a stage-"saved" application). Gated behind the same `save_jobs` feature as
saving, so the tracker is Plus+ exactly like saved jobs. Pure status rules
live in services/application_service.py.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from dependencies.auth import get_current_user
from services.audit import log_audit
from services.application_service import (
    STATUSES, is_valid_status, auto_advance, funnel_counts,
)

router = APIRouter()


class StatusBody(BaseModel):
    status: str


class MarkAppliedBody(BaseModel):
    job_id: str
    job_data: dict[str, Any] | None = None
    tailored: bool = False


def _status_patch(new_status: str, *, tailored: bool | None = None) -> dict:
    """Fields to $set when a tracked job's status changes."""
    now = datetime.utcnow()
    patch: dict = {"status": new_status, "status_updated_at": now}
    if new_status == "applied":
        # applied_at is stamped once, on first reaching applied
        patch["applied_at"] = now
    if tailored:
        patch["tailored"] = True
    return patch


@router.patch("/applications/{job_id}/status")
async def set_status(
    job_id: str,
    body: StatusBody,
    user: dict = Depends(get_current_user),
):
    if not is_valid_status(body.status):
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(STATUSES)}")

    db = get_db()
    existing = await db.saved_jobs.find_one({"user_id": user["_id"], "job_id": job_id})
    if not existing:
        raise HTTPException(404, "This job isn't in your tracker. Save it first.")

    # applied_at only set the first time it reaches applied — don't overwrite
    patch = _status_patch(body.status)
    if body.status == "applied" and existing.get("applied_at"):
        patch.pop("applied_at", None)

    await db.saved_jobs.update_one({"_id": existing["_id"]}, {"$set": patch})
    log_audit(user, "application.status_changed", {"job_id": job_id, "status": body.status})
    return {"job_id": job_id, "status": body.status}


@router.post("/applications/mark-applied", status_code=201)
async def mark_applied(
    body: MarkAppliedBody,
    user: dict = Depends(get_current_user),
):
    """Auto-capture from an Apply or Tailor click. Upserts a tracked record:
    creates one at "applied" if absent, else advances saved → applied (never
    downgrades a later/terminal stage)."""
    db = get_db()
    existing = await db.saved_jobs.find_one({"user_id": user["_id"], "job_id": body.job_id})

    if existing:
        new_status = auto_advance(existing.get("status", "saved"), "applied")
        patch = _status_patch(new_status, tailored=body.tailored)
        if existing.get("applied_at"):
            patch.pop("applied_at", None)
        await db.saved_jobs.update_one({"_id": existing["_id"]}, {"$set": patch})
    else:
        now = datetime.utcnow()
        await db.saved_jobs.insert_one({
            "user_id": user["_id"],
            "job_id": body.job_id,
            "job_data": body.job_data or {},
            "saved_at": now,
            "status": "applied",
            "status_updated_at": now,
            "applied_at": now,
            "tailored": body.tailored,
        })

    log_audit(user, "application.marked_applied", {"job_id": body.job_id, "tailored": body.tailored})
    return {"job_id": body.job_id, "status": "applied"}


@router.get("/applications/stats")
async def application_stats(user: dict = Depends(get_current_user)):
    """Funnel counts (saved → applied → interview → offer, plus rejected)."""
    db = get_db()
    statuses: list[str] = []
    async for doc in db.saved_jobs.find({"user_id": user["_id"]}, {"status": 1}):
        statuses.append(doc.get("status", "saved"))
    return funnel_counts(statuses)
