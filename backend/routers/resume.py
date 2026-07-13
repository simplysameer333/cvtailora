"""Resume upload router.

Handles two upload endpoints:
  POST /api/resume/upload         — candidate's own resume (creates the session)
  POST /api/resume/sample-format  — a sample CV used only as a formatting reference

Both endpoints:
  1. Validate file type and size
  2. Parse raw text via resume_parser (pdfplumber / python-docx)
  3. Persist the original file bytes via the configured storage backend
     (local filesystem or S3 — controlled by STORAGE_BACKEND in .env)
  4. Record the storage key in the session document so the file can be
     retrieved or deleted later

Storage keys follow the convention:
    resumes/<session_id>/<original_filename>
    samples/<session_id>/<original_filename>
"""
import asyncio
import hashlib
import logging
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from bson import ObjectId
from datetime import datetime, timedelta
from database import get_db
from dependencies.auth import get_optional_user
from services.resume_parser import parse_resume
from services.storage import get_storage
from services.resume_checker_service import extract_contact_regex
from services import cv_check_flow
from services import generation_jobs as gen_jobs

router = APIRouter()
logger = logging.getLogger("cvtailora")

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ACCEPTED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _content_type(filename: str) -> str:
    return "application/pdf" if filename.lower().endswith(".pdf") else \
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


async def _validate_and_parse(
    file: UploadFile, *, label: str = "resume", require_text: bool = False
) -> tuple[dict, bytes]:
    """Validate content-type and size, parse the file. Raises HTTPException on failure."""
    if file.content_type not in ACCEPTED_TYPES:
        raise HTTPException(400, "Only PDF and DOCX files are accepted.")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 5 MB limit.")
    try:
        parsed = parse_resume(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(422, f"Failed to parse {label}: {exc}")
    if require_text and not parsed.get("raw_text", "").strip():
        raise HTTPException(422, "Could not extract text from this file. Try a plain PDF or DOCX.")
    return parsed, file_bytes


@router.post("/resume/upload")
async def upload_resume(
    file: UploadFile = File(None),
    instructions: str = Form(""),
    linkedin_text: str = Form(""),
    user: dict | None = Depends(get_optional_user),
):
    """Upload a resume and/or provide LinkedIn profile text. Creates a new session.

    At least one of *file* (PDF/DOCX) or *linkedin_text* must be supplied.
    When both are provided the resume content is used as the primary source and
    the LinkedIn text is appended as supplementary context.

    Optional *instructions* lets the user give the AI extra direction.
    """
    has_file = file is not None and file.filename
    has_linkedin = bool(linkedin_text.strip())

    if not has_file and not has_linkedin:
        raise HTTPException(
            400, "Please upload a resume file or provide a LinkedIn profile."
        )

    parsed: dict = {"raw_text": "", "filename": ""}
    storage_key: str | None = None
    file_bytes: bytes | None = None

    # ── Parse resume file ──────────────────────────────────────────────────────
    if has_file:
        parsed, file_bytes = await _validate_and_parse(file)

    # ── Merge LinkedIn text ────────────────────────────────────────────────────
    # Resume takes precedence; LinkedIn is appended as supplementary context.
    if has_linkedin:
        linkedin_clean = linkedin_text.strip()
        if parsed["raw_text"]:
            parsed["raw_text"] = (
                parsed["raw_text"]
                + "\n\n---\n[Additional context from LinkedIn profile]\n"
                + linkedin_clean
            )
        else:
            parsed = {"raw_text": linkedin_clean, "filename": "linkedin_profile.txt"}

    # ── Create session ─────────────────────────────────────────────────────────
    db = get_db()
    result = await db.sessions.insert_one({
        "user_id": user["_id"] if user else None,
        "created_at": datetime.utcnow(),
        "resume_parsed": parsed,
        "resume_file_key": None,
        "upload_instructions": instructions.strip(),
        "linkedin_imported": has_linkedin,
        "user_profile": None,
        "job_description": None,
        "selected_template_id": None,
        "sample_cv_text": None,
        "sample_cv_file_key": None,
        "locked_facts": [],
        "generated_resume": None,
        "output_files": {"docx_file_id": None, "pdf_file_id": None},
    })
    session_id = str(result.inserted_id)

    # ── Persist original file (non-fatal) ──────────────────────────────────────
    if has_file and file_bytes:
        storage_key = f"resumes/{session_id}/{file.filename}"
        try:
            storage = get_storage()
            await storage.save(storage_key, file_bytes, _content_type(file.filename))
            await db.sessions.update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {"resume_file_key": storage_key}},
            )
        except Exception as exc:
            logger.warning("Failed to persist resume file to storage: %s", exc)

    return {"session_id": session_id, "parsed": parsed}


@router.post("/resume/sample-format")
async def upload_sample_cv(
    session_id: str,
    file: UploadFile = File(...),
    user: dict | None = Depends(get_optional_user),
):
    """Upload a sample CV to use as a formatting reference. Pro only.

    The AI generator will mirror the structure and section order of this CV
    when writing the tailored resume. Content is never copied — only layout
    and organisation are used as guidance.

    The original file is stored via the configured storage backend.
    """
    from services.tier_config_service import has_feature as _hf
    if not _hf((user or {}).get("tier", "free"), "sample_cv"):
        raise HTTPException(403, "Sample CV reference is not available on your plan. Visit /settings/plan to upgrade.")

    parsed, file_bytes = await _validate_and_parse(file, label="sample CV")

    db = get_db()
    result = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"_id": 1})
    if not result:
        raise HTTPException(404, "Session not found.")

    # Persist original file.
    storage_key = f"samples/{session_id}/{file.filename}"
    try:
        storage = get_storage()
        await storage.save(storage_key, file_bytes, _content_type(file.filename))
    except Exception as exc:
        logger.warning("Failed to persist sample CV to storage: %s", exc)
        storage_key = None

    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "sample_cv_text": parsed["raw_text"],
            "sample_cv_file_key": storage_key,
        }},
    )

    return {"filename": file.filename, "characters": len(parsed["raw_text"])}


@router.post("/resume/check")
async def check_resume_quality(
    file: UploadFile = File(...),
    user: dict | None = Depends(get_optional_user),
):
    """Analyse a CV and return a structured quality report.

    No authentication required — available to all users including anonymous.
    Returns 7-category breakdown with scores and improvement suggestions.
    Usage is tracked in the cv_checks MongoDB collection.
    """
    parsed, _ = await _validate_and_parse(file, label="CV", require_text=True)

    text_hash = hashlib.sha256(parsed["raw_text"][:8000].encode()).hexdigest()
    db = get_db()
    cached = await db.cv_check_results.find_one(
        {"text_hash": text_hash, "created_at": {"$gt": datetime.utcnow() - timedelta(days=7)}},
        sort=[("created_at", -1)],
    )
    if cached and cached.get("result"):
        logger.info("[cv_score] Cache hit for hash %s…", text_hash[:8])
        # Issue a new permalink UUID so the user gets a fresh shareable link
        new_id = str(uuid.uuid4())
        full_profile_c = extract_contact_regex(parsed["raw_text"])
        try:
            await db.cv_check_results.insert_one({
                "_id": new_id, "user_id": user["_id"] if user else None,
                "created_at": datetime.utcnow(), "text_hash": text_hash,
                "overall_score": cached["overall_score"], "file_ext": cached.get("file_ext", ""),
                "result": cached["result"],
                "raw_text": parsed["raw_text"],
                "extracted_profile": full_profile_c,
                "categories": cached.get("categories", []),
            })
        except Exception:
            new_id = cached["_id"]
        return {**cached["result"], "result_id": new_id, "extracted_profile": full_profile_c, "cached": True}

    # ── Cache miss: run the multi-call analysis as an async checkpointed job ──
    # Quality check + refine cycles + extraction + grammar can exceed a minute;
    # holding one silent HTTP connection that long gets killed by middleboxes
    # (same failure mode as the /generate boom.tds incident). The endpoint
    # returns immediately and the browser polls /resume/check-status. Jobs are
    # keyed by text hash, so two uploads of the same CV share one run.
    file_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else "unknown"
    key = cv_check_flow.job_key(text_hash)
    job, started = await gen_jobs.acquire(db, key, text_hash)
    if started:
        asyncio.create_task(cv_check_flow.run_cv_check_job(text_hash, parsed["raw_text"], file_ext, user))
    else:
        logger.info("[cv_score] attached to in-flight check for hash %s…", text_hash[:8])
    return {"async": True, "key": text_hash, "job": gen_jobs.serialize(job, include_result=False)}


@router.get("/resume/check-status")
async def check_resume_status(key: str):
    """Progress/result polling for an async CV-Score job (key = text hash)."""
    db = get_db()
    job = await gen_jobs.get(db, cv_check_flow.job_key(key))
    if not job:
        raise HTTPException(404, "No CV check job for this key.")
    return gen_jobs.serialize(job)


@router.get("/resume/check/{result_id}")
async def get_check_result(result_id: str):
    """Load a previously saved CV Score result by its unique ID."""
    db = get_db()
    doc = await db.cv_check_results.find_one({"_id": result_id})
    if not doc:
        raise HTTPException(404, "Result not found or has expired.")

    # Always return a fully structured extracted_profile.
    # Old results lack experience/skills/education — re-extract from raw_text when available.
    extracted = doc.get("extracted_profile") or {}
    raw_text  = doc.get("raw_text", "")
    if raw_text and not extracted.get("experience"):
        extracted = extract_contact_regex(raw_text)  # extract_full_profile alias

    return doc["result"] | {"result_id": result_id, "extracted_profile": extracted}
