"""Generate router — thin HTTP layer for resume generation + session tweaks.

All pipeline orchestration (evaluator-optimizer loop, checkpoint resume, retry,
cost accounting, quality gating) lives in services/generation_service.py; job
state persistence lives in services/generation_jobs.py. This module only:
  - validates the request and runs fast-fail checks (404/422/429 budget),
  - runs the short synchronous section-regeneration path,
  - spawns/attaches the async full-generation job and serves its status,
  - hosts the small session-mutation endpoints (template, locked facts, …).
"""
import asyncio
import hashlib
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from pydantic import BaseModel
from typing import Optional
from database import get_db
from dependencies.auth import get_optional_user
from services.audit import log_audit
from services.pipeline import generator, telemetry
from services import generation_jobs as gen_jobs
from services.usage_service import check_budget, increment_usage
from services.generation_service import (
    run_full_generation,
    run_job_analysis,
    resolve_profession,
    check_cost_limit,
    increment_call_count,
)

router = APIRouter()
logger = logging.getLogger("cvtailora")


class GenerateBody(BaseModel):
    section: Optional[str] = None
    additional_instructions: Optional[str] = None


@router.post("/generate")
async def generate(
    session_id: str,
    body: GenerateBody = GenerateBody(),
    user: dict | None = Depends(get_optional_user),
):
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    if user:
        log_audit(user, "resume.generate", {
            "session_id": session_id,
            "template": session.get("selected_template_id"),
            "section": body.section,
        })

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    user_profile = session.get("user_profile") or {}
    job_description = session.get("job_description") or ""
    tone = user_profile.get("preferred_tone", "Professional")
    existing = session.get("generated_resume")
    target_role = user_profile.get("target_role", "")
    locked_facts = session.get("locked_facts") or []
    sample_cv_text: str | None = session.get("sample_cv_text") or None

    from services.tier_config_service import has_feature as _has_feature
    _early_tier = (user or {}).get("tier", "free")
    if not _has_feature(_early_tier, "locked_facts"):
        locked_facts = []
    if not _has_feature(_early_tier, "sample_cv"):
        sample_cv_text = None

    extra_parts = []
    upload_instructions = (session.get("upload_instructions") or "").strip()
    if upload_instructions:
        extra_parts.append(f"[User instructions]: {upload_instructions}")
    request_instructions = (body.additional_instructions or "").strip()
    if request_instructions:
        extra_parts.append(f"[User instructions]: {request_instructions}")
    if extra_parts:
        existing_notes = user_profile.get("additional_notes", "")
        merged = "\n\n".join(filter(None, [existing_notes] + extra_parts))
        user_profile = {**user_profile, "additional_notes": merged}

    if not resume_text:
        raise HTTPException(422, "No parsed resume found in session.")

    has_jd = bool(job_description.strip())
    user_tier = (user or {}).get("tier", "free")

    # Fast-fail checks stay in the HTTP request (clear 4xx to the user);
    # everything slow moves into the background job below.
    if user:
        await check_budget(db, user, user_tier)

    if body.section:
        # ── Section regeneration — one short call, stays synchronous ─────────
        from services.tier_config_service import has_feature as _hf
        if not _hf(user_tier, "section_regen"):
            raise HTTPException(
                403,
                "Section-level regeneration is not available on your plan. Visit /settings/plan to upgrade.",
            )
        await check_cost_limit(db, session_id)
        telemetry.start_capture()
        profession_config = await resolve_profession(db, target_role)
        key_skills, user_profile = await run_job_analysis(
            db, session_id, resume_text, user_profile, job_description, user_tier, has_jd,
        )
        try:
            result = await generator.run_section(
                resume_text=resume_text,
                user_profile=user_profile,
                job_description=job_description,
                tone=tone,
                section=body.section,
                existing_resume=existing,
                profession_config=profession_config,
                locked_facts=locked_facts,
                key_skills=key_skills,
                sample_cv_text=sample_cv_text,
            )
        except Exception as exc:
            raise HTTPException(500, f"Section regeneration failed: {exc}")
        await increment_call_count(db, session_id, 1)
        if user:
            await increment_usage(db, str(user.get("_id", "")), 1, telemetry.summary()["est_cost_usd"])
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"generated_resume": result}},
        )
        return result

    # ── Full generation — ASYNC job with Mongo checkpoints ───────────────────
    # The pipeline takes 1–4 minutes; holding one silent HTTP connection that
    # long gets killed by real-world middleboxes (boom.tds incident 2026-07-12:
    # 4 backend successes, 4 client-side "failures", 4× cost). The endpoint now
    # returns immediately and the browser POLLS /generate/status; progress and
    # per-cycle best results checkpoint to Mongo so a crashed/retried run
    # RESUMES instead of restarting.
    template_id  = session.get("selected_template_id") or ""
    sample_fp    = hashlib.sha256((sample_cv_text or "").encode()).hexdigest()[:16]
    extra_instr  = body.additional_instructions or ""
    input_hash = hashlib.sha256(
        f"{resume_text[:8000]}|{job_description[:4000]}|{target_role}|{tone}|{template_id}|{sample_fp}|{extra_instr[:500]}".encode()
    ).hexdigest()

    job, started = await gen_jobs.acquire(db, session_id, input_hash, extra_instr)
    if started:
        asyncio.create_task(run_full_generation(session_id, extra_instr, user, input_hash))
    else:
        logger.info("[generate] session %s attached to in-flight job (no duplicate run)", session_id)
    return {"async": True, "job": gen_jobs.serialize(job, include_result=False)}


@router.get("/generate/status")
async def generation_status(session_id: str, user: dict | None = Depends(get_optional_user)):
    """Progress/result polling for the async generation job. Each poll is a
    short request — immune to the idle-connection kills that broke the old
    single long-lived /generate call.

    Self-healing: if the job is still "running" but its heartbeat died (the
    background task was lost to a server restart/crash mid-run), the poll
    atomically takes it over and resumes it from the last checkpoint — so the
    page recovers on its own instead of spinning until the client's timeout.
    """
    db = get_db()
    job = await gen_jobs.get(db, session_id)
    if not job:
        raise HTTPException(404, "No generation job for this session.")

    if gen_jobs.is_stale(job, datetime.utcnow()):
        claimed = await gen_jobs.claim_stale(db, session_id)
        if claimed:
            logger.warning(
                "[generate] session %s: orphaned run detected (heartbeat dead) — "
                "resuming from checkpoint as attempt %s",
                session_id, claimed.get("attempt"),
            )
            asyncio.create_task(run_full_generation(
                session_id, claimed.get("extra_instr", ""), user, claimed.get("input_hash", ""),
            ))
            job = claimed
    return gen_jobs.serialize(job)


@router.put("/sessions/{session_id}/resume")
async def save_resume(session_id: str, body: dict):
    """Sync a client-side resume back into the session (used when preview loads from localStorage)."""
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"generated_resume": body}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"ok": True}


@router.patch("/sessions/{session_id}/template")
async def set_session_template(session_id: str, body: dict):
    """Attach a template (and optional accent-colour variant) to the session.

    Body: {"template_id": "<template key>", "accent": "#1d4ed8" (optional)}
    An empty/absent accent clears any previous variant (back to the template's
    own accent). Preview and DOCX export both honour the stored accent.
    """
    import re as _re
    template_id = body.get("template_id", "")
    accent = (body.get("accent") or "").strip()
    if accent and not _re.fullmatch(r"#?[0-9a-fA-F]{6}", accent):
        raise HTTPException(400, "accent must be a 6-digit hex colour.")
    accent = f"#{accent.lstrip('#').lower()}" if accent else None

    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"selected_template_id": template_id, "selected_accent": accent}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"selected_template_id": template_id, "selected_accent": accent}


@router.put("/sessions/{session_id}/locked-facts")
async def set_locked_facts(
    session_id: str,
    body: dict,
    user: dict | None = Depends(get_optional_user),
):
    """Replace the session's locked_facts list. Pro only.

    Body: {"locked_facts": ["Company: Google", "Degree: BSc Computer Science"]}
    Locked facts are injected into the generator system prompt on the next
    generate call. The generator is instructed never to modify or remove them.
    """
    user_tier = (user or {}).get("tier", "free")
    from services.tier_config_service import has_feature as _hf
    if not _hf(user_tier, "locked_facts"):
        raise HTTPException(403, "Locked Facts is not available on your plan. Visit /settings/plan to upgrade.")

    locked = body.get("locked_facts", [])
    if not isinstance(locked, list):
        raise HTTPException(422, "locked_facts must be a list of strings.")
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"locked_facts": locked}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"locked_facts": locked}


@router.get("/sessions/{session_id}/skill-gaps")
async def skill_gaps(session_id: str):
    """Skill gap analysis — matched vs missing JD skills for this session.

    Requires a session with a parsed resume + job description.
    Single Haiku call (~$0.001). Result cached on session.
    """
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    # Return cached result if present
    cached = session.get("skill_gaps")
    if cached:
        return cached

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    job_description = session.get("job_description") or ""

    if not resume_text:
        raise HTTPException(422, "No resume found in session.")
    if not job_description.strip():
        raise HTTPException(422, "No job description in session.")

    try:
        from services.skill_gap_service import analyze_skill_gaps
        result = await analyze_skill_gaps(resume_text, job_description)
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"skill_gaps": result}},
        )
        return result
    except Exception as exc:
        logger.warning("[skill_gaps] Failed for session %s: %s", session_id, exc)
        raise HTTPException(500, f"Skill gap analysis failed: {exc}")


@router.post("/sessions/{session_id}/fit-score")
async def fit_score(session_id: str):
    """Pre-generation fit assessment — scores candidate-job match before running the pipeline.

    Requires a session with both a parsed resume and a job description.
    Returns fit scores across 3 dimensions + skill gap analysis.
    Runs a single Haiku call (~3–5 s, ~$0.001).
    """
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    job_description = session.get("job_description") or ""
    user_profile = session.get("user_profile") or {}

    if not resume_text:
        raise HTTPException(422, "No resume found in session. Please upload a CV first.")
    if not job_description.strip():
        raise HTTPException(422, "No job description in session. Please paste a job description first.")

    try:
        from services.fit_scoring_service import score_fit
        result = await score_fit(resume_text, job_description, user_profile)
        # Cache on session so frontend can access it without re-calling
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"fit_score": result}},
        )
        return result
    except Exception as exc:
        logger.warning("[fit_score] Failed for session %s: %s", session_id, exc)
        raise HTTPException(500, f"Fit scoring failed: {exc}")
