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
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from bson import ObjectId
from datetime import datetime
from database import get_db
from services.resume_parser import parse_resume
from services.storage import get_storage

router = APIRouter()
logger = logging.getLogger("tailormycv")

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ACCEPTED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _content_type(filename: str) -> str:
    return "application/pdf" if filename.lower().endswith(".pdf") else \
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.post("/resume/upload")
async def upload_resume(
    file: UploadFile = File(...),
    instructions: str = Form(""),
):
    """Upload and parse the candidate's resume. Creates a new session.

    Accepts PDF or DOCX (max 5 MB). An optional *instructions* form field
    lets the user give the AI extra direction (e.g. "focus on leadership").

    The original file is stored via the configured storage backend and the
    key is recorded in the session for future retrieval.
    """
    if file.content_type not in ACCEPTED_TYPES:
        raise HTTPException(400, "Only PDF and DOCX files are accepted.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 5 MB limit.")

    try:
        parsed = parse_resume(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(422, f"Failed to parse resume: {exc}")

    # Create the session first so we have an ID for the storage key.
    db = get_db()
    result = await db.sessions.insert_one({
        "created_at": datetime.utcnow(),
        "resume_parsed": parsed,
        "resume_file_key": None,        # filled in below after upload
        "upload_instructions": instructions.strip(),
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

    # Persist the original file — key is scoped to this session.
    storage_key = f"resumes/{session_id}/{file.filename}"
    try:
        storage = get_storage()
        await storage.save(storage_key, file_bytes, _content_type(file.filename))
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"resume_file_key": storage_key}},
        )
    except Exception as exc:
        # Non-fatal: parsed text is already stored; log and continue.
        logger.warning("Failed to persist resume file to storage: %s", exc)

    return {"session_id": session_id, "parsed": parsed}


@router.post("/resume/sample-format")
async def upload_sample_cv(session_id: str, file: UploadFile = File(...)):
    """Upload a sample CV to use as a formatting reference.

    The AI generator will mirror the structure and section order of this CV
    when writing the tailored resume. Content is never copied — only layout
    and organisation are used as guidance.

    The original file is stored via the configured storage backend.
    """
    if file.content_type not in ACCEPTED_TYPES:
        raise HTTPException(400, "Only PDF and DOCX files are accepted.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 5 MB limit.")

    try:
        parsed = parse_resume(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(422, f"Failed to parse sample CV: {exc}")

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
