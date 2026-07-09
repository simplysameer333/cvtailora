"""Public CV sharing — revocable read-only links for Resume Library resumes.

POST   /api/account/resumes/{id}/share   — create (or return existing) share link (auth)
DELETE /api/account/resumes/{id}/share   — revoke the link (auth)
GET    /api/account/resumes/shares       — all active shares for the user (auth)
GET    /api/share/{token}                — public resume metadata + text (NO auth)
GET    /api/share/{token}/file           — public inline file stream (NO auth)

Share docs live in `shared_resumes`: {token, user_id, resume_id, created_at}.
Revoking deletes the doc — the token dies instantly. Tokens are 24-byte
urlsafe secrets (unguessable); a resume has at most one active share.
"""
from __future__ import annotations

import io
import secrets
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from database import get_db
from dependencies.auth import get_current_user
from services.audit import log_audit
from services.storage import get_storage

router = APIRouter()


async def _owned_resume(db, resume_id: str, user: dict) -> dict:
    try:
        doc = await db.saved_resumes.find_one(
            {"_id": ObjectId(resume_id), "user_id": user["_id"]}
        )
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(404, "Resume not found.")
    return doc


# ── Owner endpoints ───────────────────────────────────────────────────────────

@router.post("/account/resumes/{resume_id}/share", status_code=201)
async def create_share(resume_id: str, user: dict = Depends(get_current_user)):
    """Create a public share link for a library resume. Idempotent — repeat
    calls return the existing token instead of rotating it."""
    db = get_db()
    await _owned_resume(db, resume_id, user)

    existing = await db.shared_resumes.find_one(
        {"resume_id": ObjectId(resume_id), "user_id": user["_id"]}
    )
    if existing:
        return {"token": existing["token"]}

    token = secrets.token_urlsafe(24)
    await db.shared_resumes.insert_one({
        "token": token,
        "user_id": user["_id"],
        "resume_id": ObjectId(resume_id),
        "created_at": datetime.utcnow(),
    })
    log_audit(user, "resume_share.created", {"resume_id": resume_id})
    return {"token": token}


@router.delete("/account/resumes/{resume_id}/share", status_code=204)
async def revoke_share(resume_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    result = await db.shared_resumes.delete_many(
        {"resume_id": ObjectId(resume_id), "user_id": user["_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(404, "No active share link for this resume.")
    log_audit(user, "resume_share.revoked", {"resume_id": resume_id})


@router.get("/account/resumes/shares")
async def list_shares(user: dict = Depends(get_current_user)):
    """Map of resume_id → token for the user's active shares (powers the
    share-state icons in the Resume Library)."""
    db = get_db()
    docs = await db.shared_resumes.find({"user_id": user["_id"]}).to_list(200)
    return {str(d["resume_id"]): d["token"] for d in docs}


# ── Public endpoints (no auth) ────────────────────────────────────────────────

async def _resolve_token(db, token: str) -> dict:
    share = await db.shared_resumes.find_one({"token": token})
    if not share:
        raise HTTPException(404, "This share link does not exist or was revoked.")
    doc = await db.saved_resumes.find_one({"_id": share["resume_id"]})
    if not doc:
        raise HTTPException(404, "The shared resume no longer exists.")
    return doc


@router.get("/share/{token}")
async def get_shared_resume(token: str):
    """Public read-only view data. Exposes only the resume itself — never the
    owner's account details."""
    db = get_db()
    doc = await _resolve_token(db, token)
    return {
        "name": doc.get("name", "Resume"),
        "type": doc.get("type"),
        "content_type": doc.get("content_type"),
        "has_file": bool(doc.get("file_key")),
        "resume_text": doc.get("resume_text") or "",
        "shared_at": doc.get("updated_at", doc.get("created_at")),
    }


@router.get("/share/{token}/file")
async def get_shared_file(token: str):
    """Stream the original file inline (PDF renders in-browser)."""
    db = get_db()
    doc = await _resolve_token(db, token)
    if not doc.get("file_key"):
        raise HTTPException(404, "This shared resume has no file attached.")
    try:
        storage = get_storage()
        file_bytes = await storage.load(doc["file_key"])
    except Exception:
        raise HTTPException(500, "File could not be retrieved from storage.")
    filename = doc.get("file_name") or "resume.pdf"
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
