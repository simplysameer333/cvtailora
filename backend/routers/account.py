"""Account profile router — persistent user profile (separate from builder sessions).

GET  /api/account/profile            — get current user's profile
PUT  /api/account/profile            — save / update profile fields
POST /api/account/profile/resume     — upload resume → parse + AI prefill → store
POST /api/sessions/from-profile      — create a builder session pre-loaded from profile
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import List

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from config import settings
from database import get_db
from dependencies.auth import get_current_user
from services.resume_parser import parse_resume
from services.storage import get_storage
from services.audit import log_audit

router = APIRouter()


@router.get("/account/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the authenticated user's live profile data.

    Called by the NextAuth jwt callback every 5 minutes to keep
    session.user.tier in sync with DB without requiring re-login.
    """
    return {
        "id": str(user["_id"]),
        "email": user.get("email", ""),
        "name": user.get("name", ""),
        "tier": user.get("tier", "free"),
        "is_superadmin": bool(user.get("is_superadmin", False)),
        "is_active": bool(user.get("is_active", True)),
    }


MAX_FILE_SIZE = 5 * 1024 * 1024
ACCEPTED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_PREFILL_PROMPT = """Extract the following fields from the resume text and return a single JSON object.
Use empty string "" for any field you cannot find. Return key_skills as a JSON array of strings.

Fields:
- full_name
- email
- phone
- linkedin  (full URL preferred)
- location  (city + country/state)
- target_role  (most recent job title or stated objective)
- primary_skill  (the single most defining technical or professional skill, e.g. "Java", "Python", "Financial Modelling", "UX Design" — one short phrase, not a sentence)
- key_skills  (top 8-10 skills as a JSON array)
- summary  (2–3 sentence professional summary — write one if absent)
- experience  (JSON array, newest first; each item {"title", "company", "start", "end", "description"} — description is 1-2 sentences, dates as written in the resume, "" if missing)
- education  (JSON array; each item {"degree", "institution", "year"})
- projects  (JSON array; each item {"name", "description", "url"} — [] if none)
- certifications  (JSON array; each item {"name", "issuer", "year"} — [] if none)

Return only the JSON object, no markdown fences, no explanation."""


async def _ai_prefill(resume_text: str) -> dict:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.anthropic_evaluator_model,
        # 12k chars in / 3k tokens out — structured experience/education arrays
        # need the full resume body, not just the head
        max_tokens=3000,
        messages=[{"role": "user", "content": f"{_PREFILL_PROMPT}\n\nResume:\n{resume_text[:12000]}"}],
    )
    raw = msg.content[0].text.strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    try:
        return json.loads(raw)
    except Exception:
        return {}


# ── Models ────────────────────────────────────────────────────────────────────

class ExperienceItem(BaseModel):
    title: str = ""
    company: str = ""
    start: str = ""
    end: str = ""
    description: str = ""


class EducationItem(BaseModel):
    degree: str = ""
    institution: str = ""
    year: str = ""


class ProjectItem(BaseModel):
    name: str = ""
    description: str = ""
    url: str = ""


class CertificationItem(BaseModel):
    name: str = ""
    issuer: str = ""
    year: str = ""


class ProfileBody(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    location: str = ""
    target_roles: List[str] = []
    primary_skill: str = ""
    key_skills: List[str] = []
    summary: str = ""
    experience: List[ExperienceItem] = []
    education: List[EducationItem] = []
    projects: List[ProjectItem] = []
    certifications: List[CertificationItem] = []


class FromProfileBody(BaseModel):
    job_description: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_profile(user_id: ObjectId) -> dict | None:
    db = get_db()
    return await db.user_profiles.find_one({"user_id": user_id})


def _serialize_profile(doc: dict) -> dict:
    from services.profile_completeness import compute_profile_completeness
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc["user_id"] = str(doc["user_id"])
    doc["completeness"] = compute_profile_completeness(doc)
    return doc


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/account/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    profile = await _get_profile(user["_id"])
    if not profile:
        return None
    return _serialize_profile(profile)


@router.put("/account/profile")
async def save_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    db = get_db()
    now = datetime.utcnow()
    await db.user_profiles.update_one(
        {"user_id": user["_id"]},
        {"$set": {**body.model_dump(), "updated_at": now},
         "$setOnInsert": {"user_id": user["_id"], "resume_text": "", "resume_file_key": None, "created_at": now}},
        upsert=True,
    )
    profile = await _get_profile(user["_id"])
    log_audit(user, "profile.save", {"fields": list(body.model_dump().keys())})
    return _serialize_profile(profile)


@router.post("/account/profile/resume")
async def upload_profile_resume(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if file.content_type not in ACCEPTED_TYPES:
        raise HTTPException(400, "Only PDF and DOCX files are accepted.")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 5 MB limit.")

    try:
        parsed = parse_resume(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(422, f"Failed to parse resume: {exc}")

    resume_text = parsed.get("raw_text", "")
    try:
        prefilled = await _ai_prefill(resume_text)
    except Exception:
        prefilled = {}  # AI extraction is best-effort; proceed without it

    # Persist file
    storage_key = None
    try:
        storage = get_storage()
        key = f"profile-resumes/{user['_id']}/{file.filename}"
        content_type = (
            "application/pdf" if file.filename.lower().endswith(".pdf")
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        await storage.save(key, file_bytes, content_type)
        storage_key = key
    except Exception:
        pass

    # Upsert profile with resume text
    db = get_db()
    now = datetime.utcnow()
    await db.user_profiles.update_one(
        {"user_id": user["_id"]},
        {
            "$set": {"resume_text": resume_text, "resume_file_key": storage_key, "updated_at": now},
            "$setOnInsert": {
                "user_id": user["_id"],
                "full_name": "", "email": "", "phone": "", "linkedin": "",
                "location": "", "target_roles": [], "primary_skill": "", "key_skills": [], "summary": "",
                "experience": [], "education": [], "projects": [], "certifications": [],
                "created_at": now,
            },
        },
        upsert=True,
    )

    return {"prefilled": prefilled, "resume_text": resume_text[:500]}


@router.post("/sessions/from-profile", status_code=201)
async def session_from_profile(
    body: FromProfileBody,
    user: dict = Depends(get_current_user),
):
    """Create a builder session pre-loaded from the user's account profile.

    Skips upload + profile + job steps — returns a session_id that can be
    passed straight to /builder/template.
    """
    profile = await _get_profile(user["_id"])
    if not profile:
        raise HTTPException(400, "No profile found. Please set up your profile first.")
    if not profile.get("resume_text"):
        raise HTTPException(400, "No resume found in your profile. Please upload one first.")

    db = get_db()
    result = await db.sessions.insert_one({
        "user_id": user["_id"],
        "created_at": datetime.utcnow(),
        "resume_parsed": {"raw_text": profile["resume_text"], "filename": "profile-resume"},
        "resume_file_key": profile.get("resume_file_key"),
        "upload_instructions": "",
        "user_profile": {
            "full_name": profile.get("full_name", ""),
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "linkedin": profile.get("linkedin", ""),
            "location": profile.get("location", ""),
            "target_role": (profile.get("target_roles") or [""])[0],
            "preferred_tone": "Professional",
            "key_skills": profile.get("key_skills", []),
            "additional_notes": "",
        },
        "job_description": body.job_description,
        "selected_template_id": None,
        "sample_cv_text": None,
        "sample_cv_file_key": None,
        "locked_facts": [],
        "generated_resume": None,
        "output_files": {"docx_file_id": None, "pdf_file_id": None},
    })
    return {"session_id": str(result.inserted_id)}


def _quality_label(min_score: int, pass_threshold: int) -> str:
    if min_score >= pass_threshold + 30:
        return "Excellent"
    if min_score >= pass_threshold + 10:
        return "Strong"
    if min_score >= pass_threshold:
        return "Good"
    return "Reviewed"


@router.get("/account/analytics")
async def get_account_analytics(user: dict = Depends(get_current_user)):
    """Summary of automated actions for the user's Analytics page.

    Counts come from collections; the recent-activity feed comes from audit_log
    (which the alert scheduler and generate/export/score paths write to).
    """
    import asyncio as _asyncio
    db = get_db()
    uid = user["_id"]
    uid_str = str(uid)

    # Automated / AI actions surfaced in the feed
    _FEED_ACTIONS = [
        "job_alert.email_sent", "job_alert.email_no_results",
        "resume.generate.complete", "resume.export", "resume.cv_score",
        "cover_letter.generate", "interview_prep.generate", "interview_prep.email_sent",
    ]

    (alert_emails, resumes_generated, resumes_exported,
     cv_scores, cover_letters, interview_preps,
     jobs_saved, jobs_viewed, alerts_active) = await _asyncio.gather(
        db.audit_log.count_documents({"user_id": uid_str, "action": "job_alert.email_sent"}),
        # audit-based so it matches the activity feed exactly
        db.audit_log.count_documents({"user_id": uid_str, "action": "resume.generate.complete"}),
        db.audit_log.count_documents({"user_id": uid_str, "action": "resume.export"}),
        db.audit_log.count_documents({"user_id": uid_str, "action": "resume.cv_score"}),
        db.audit_log.count_documents({"user_id": uid_str, "action": "cover_letter.generate"}),
        db.audit_log.count_documents({"user_id": uid_str, "action": "interview_prep.generate"}),
        # saved_jobs keys user_id as ObjectId (jobs.py stores user["_id"]) — the
        # previous str(uid) query always counted 0. Match the write key.
        db.saved_jobs.count_documents({"user_id": uid}),
        db.seen_jobs.count_documents({"user_id": uid}),
        db.job_alerts.count_documents({"user_id": uid, "is_active": True}),
    )

    # Total jobs delivered by alert emails
    jobs_delivered = 0
    async for doc in db.audit_log.find(
        {"user_id": uid_str, "action": "job_alert.email_sent"}, {"metadata.job_count": 1}
    ):
        jobs_delivered += int((doc.get("metadata") or {}).get("job_count", 0))

    recent = []
    cursor = db.audit_log.find(
        {"user_id": uid_str, "action": {"$in": _FEED_ACTIONS}},
        {"action": 1, "metadata": 1, "created_at": 1},
    ).sort("created_at", -1).limit(25)
    async for doc in cursor:
        recent.append({
            "action": doc["action"],
            "metadata": doc.get("metadata") or {},
            "created_at": doc["created_at"].isoformat(),
        })

    # Daily activity counts for the last 30 days — drives the histogram
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=30)
    daily_rows = await db.audit_log.aggregate([
        {"$match": {"user_id": uid_str, "action": {"$in": _FEED_ACTIONS}, "created_at": {"$gte": since}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]).to_list(31)
    daily = [{"date": r["_id"], "count": r["count"]} for r in daily_rows]

    # Application-tracker funnel (J4) — saved → applied → interview → offer
    from services.application_service import funnel_counts
    statuses: list[str] = []
    async for doc in db.saved_jobs.find({"user_id": uid}, {"status": 1}):
        statuses.append(doc.get("status", "saved"))
    application_funnel = funnel_counts(statuses)

    return {
        "daily": daily,
        "application_funnel": application_funnel,
        "alert_emails_sent": alert_emails,
        "alert_jobs_delivered": jobs_delivered,
        "alerts_active": alerts_active,
        "resumes_generated": resumes_generated,
        "resumes_exported": resumes_exported,
        "cv_scores_run": cv_scores,
        "cover_letters": cover_letters,
        "interview_preps": interview_preps,
        "jobs_saved": jobs_saved,
        "jobs_viewed": jobs_viewed,
        "recent": recent,
    }


@router.get("/account/usage")
async def get_account_usage(user: dict = Depends(get_current_user)):
    """Today's + this month's AI spend vs the tier budget caps.

    Drives the sidebar quota widget. Caps are cents (None = unlimited),
    mirroring tier config keys daily_cost_cents / monthly_cost_cents.
    """
    from services import usage_service
    from services.tier_config_service import get_limit

    db = get_db()
    tier = user.get("tier", "free")
    u = await usage_service.get_usage(db, str(user["_id"]))
    return {
        "daily_used_cents": round(u["daily_cost_usd"] * 100),
        "daily_cap_cents": get_limit(tier, "daily_cost_cents"),
        "monthly_used_cents": round(u["monthly_cost_usd"] * 100),
        "monthly_cap_cents": get_limit(tier, "monthly_cost_cents"),
        "tier": tier,
    }


@router.get("/account/stats")
async def get_account_stats(user: dict = Depends(get_current_user)):
    """Return the current user's usage counts and recent resume history."""
    import asyncio as _asyncio
    from config import settings as _settings
    db = get_db()
    uid = user["_id"]

    (session_count, generated_count, resume_count,
     alert_count, active_alert_count, saved_job_count) = await _asyncio.gather(
        db.sessions.count_documents({"user_id": uid}),
        db.sessions.count_documents({"user_id": uid, "generated_resume": {"$ne": None}}),
        db.saved_resumes.count_documents({"user_id": uid}),
        db.job_alerts.count_documents({"user_id": uid}),
        db.job_alerts.count_documents({"user_id": uid, "is_active": True}),
        db.saved_jobs.count_documents({"user_id": str(uid)}),
    )

    recent_sessions = []
    cursor = db.sessions.find(
        {"user_id": uid, "generated_resume": {"$ne": None}},
        {"created_at": 1, "user_profile": 1, "final_min_score": 1, "eval_history": 1},
    ).sort("created_at", -1).limit(20)
    async for doc in cursor:
        min_score = doc.get("final_min_score")
        if min_score is None and doc.get("eval_history"):
            min_score = doc["eval_history"][-1].get("min_score", 0)
        min_score = min_score or 0
        target_role = (doc.get("user_profile") or {}).get("target_role", "")
        recent_sessions.append({
            "id": str(doc["_id"]),
            "created_at": doc["created_at"].isoformat(),
            "target_role": target_role,
            "quality_label": _quality_label(min_score, _settings.pass_threshold),
            "min_score": min_score,
        })

    return {
        "session_count": session_count,
        "generated_count": generated_count,
        "resume_count": resume_count,
        "alert_count": alert_count,
        "active_alert_count": active_alert_count,
        "saved_job_count": saved_job_count,
        "tier": user.get("tier", "free"),
        "recent_sessions": recent_sessions,
    }
