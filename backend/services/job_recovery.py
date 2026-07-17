"""Orphaned-job recovery — resumes interrupted background LLM runs.

Generation and CV-check jobs run as in-process asyncio tasks; a server
restart/crash mid-run loses the task while the job doc stays "running" with a
dead heartbeat. The status-poll self-heal recovers that ONLY when a browser is
still polling. This module closes the no-poller gap: a sweep at startup and
every few minutes claims any stale running job and resumes it from its Mongo
checkpoint — so every accepted job eventually completes (or fails cleanly),
whether or not anyone is watching.

Processes are disposable; the job doc is the source of truth. This is the
Option-1 durability design (2026-07-17) — a dedicated worker service stays
deferred until scale demands it.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from bson import ObjectId

from database import get_db
from services import generation_jobs as gen_jobs

logger = logging.getLogger("cvtailora")

# How often the background sweep re-checks for orphans. Jobs only go stale
# after gen_jobs.STALE_AFTER_S (180 s) without a heartbeat, so 5 min bounds
# the worst-case unwatched recovery delay at ~8 min while costing one indexed
# query per interval.
SWEEP_INTERVAL_S = 300

_CVCHECK_PREFIX = "cvcheck:"


def classify_job(session_id: str) -> str:
    """Pure: which pipeline a generation_jobs doc belongs to, by key shape."""
    return "cvcheck" if session_id.startswith(_CVCHECK_PREFIX) else "generation"


async def _resume_generation(db, claimed: dict) -> None:
    """Re-spawn a claimed generation job with tier-correct inputs.

    The original HTTP request is long gone, so the user is recovered from the
    session doc (tier drives thresholds/evaluators — resuming a paid user's
    job as anonymous would silently change its quality bar).
    """
    session_id = claimed["session_id"]
    try:
        session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    except Exception:
        session = None
    if not session:
        # Sessions TTL-expire after 24h — a job outliving its session can only 404.
        await gen_jobs.fail(db, session_id, "Your builder session expired. Please start a new resume.")
        logger.info("[job-recovery] %s: session gone — job failed cleanly", session_id)
        return

    user = None
    if session.get("user_id"):
        user = await db.users.find_one({"_id": session["user_id"]})

    from services.generation_service import run_full_generation
    logger.warning(
        "[job-recovery] resuming orphaned generation %s from checkpoint (attempt %s, tier=%s)",
        session_id, claimed.get("attempt"), (user or {}).get("tier", "anon"),
    )
    asyncio.create_task(run_full_generation(
        session_id, claimed.get("extra_instr", ""), user, claimed.get("input_hash", ""),
    ))


async def _resume_cvcheck(db, claimed: dict) -> None:
    """Re-spawn a claimed CV-check job from its checkpointed inputs."""
    key = claimed["session_id"]
    cp = claimed.get("checkpoint") or {}
    raw_text = cp.get("raw_text")
    if not raw_text:
        # Jobs started before inputs were checkpointed (or a lost write) cannot
        # be resumed — fail cleanly so the poller stops instead of hanging.
        await gen_jobs.fail(db, key, "CV analysis was interrupted. Please upload your CV again.")
        logger.info("[job-recovery] %s: no checkpointed inputs — job failed cleanly", key)
        return

    user = None
    if cp.get("user_id"):
        try:
            user = await db.users.find_one({"_id": ObjectId(cp["user_id"])})
        except Exception:
            user = None

    from services.cv_check_flow import run_cv_check_job
    text_hash = key[len(_CVCHECK_PREFIX):]
    logger.warning("[job-recovery] resuming orphaned CV check %s (attempt %s)", key, claimed.get("attempt"))
    asyncio.create_task(run_cv_check_job(text_hash, raw_text, cp.get("file_ext", "unknown"), user))


async def resume_orphans() -> int:
    """One sweep: claim every stale running job and resume (or cleanly fail) it.

    Best-effort by design — any error is logged and swallowed so recovery can
    never break startup or the sweep loop. Returns the number of jobs claimed.
    """
    resumed = 0
    try:
        db = get_db()
        cutoff = datetime.utcnow() - timedelta(seconds=gen_jobs.STALE_AFTER_S)
        stale = await db.generation_jobs.find(
            {"status": "running", "updated_at": {"$lt": cutoff}}
        ).to_list(length=100)

        for job in stale:
            sid = job.get("session_id", "")
            # Atomic claim — a concurrently-polling browser's self-heal may win
            # instead; exactly one resumer proceeds either way.
            claimed = await gen_jobs.claim_stale(db, sid)
            if not claimed:
                continue
            resumed += 1
            if classify_job(sid) == "cvcheck":
                await _resume_cvcheck(db, claimed)
            else:
                await _resume_generation(db, claimed)

        if stale:
            logger.info("[job-recovery] sweep: %d stale job(s) found, %d claimed", len(stale), resumed)
    except Exception as exc:
        logger.warning("[job-recovery] sweep failed (non-fatal): %s", exc)
    return resumed


async def _sweep_loop() -> None:
    while True:
        await asyncio.sleep(SWEEP_INTERVAL_S)
        await resume_orphans()


def start_recovery(loop_forever: bool = True) -> None:
    """Kick off the boot sweep + periodic loop (called from app startup)."""
    asyncio.get_running_loop().create_task(resume_orphans())
    if loop_forever:
        asyncio.get_running_loop().create_task(_sweep_loop())
