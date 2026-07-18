"""Auto-fix jobs — minimal Mongo-backed state for the async auto-fix run.

Auto-fix makes 2 LLM calls (~20–45 s), so per the CLAUDE.md async rule it runs
as a background job the client POSTs-then-POLLs — never inside one held HTTP
connection. Unlike generation_jobs there is no mid-run checkpointing: a run is
two cheap calls, so a lost run is simply started fresh. One doc per session in
its own `autofix_jobs` collection (generation_jobs is one-doc-per-session too —
sharing it would clobber the generation result the frontend still reads).
"""
from __future__ import annotations

import logging
from datetime import datetime

logger = logging.getLogger("cvtailora")

# A running job with no update for this long is presumed crashed — a new POST
# may replace it. Runs are 2 calls (~20-45s), so 120s is comfortably past done.
STALE_AFTER_S = 120


def is_stale(job: dict | None, now: datetime) -> bool:
    if not job or job.get("status") != "running":
        return False
    updated = job.get("updated_at")
    if not isinstance(updated, datetime):
        return True
    return (now - updated).total_seconds() > STALE_AFTER_S


async def acquire(db, session_id: str) -> tuple[dict, bool]:
    """Start (or attach to) the session's auto-fix job.

    started=False means a live run is in flight — the caller must not spawn a
    second one (double LLM spend for the same result).
    """
    now = datetime.utcnow()
    prev = await db.autofix_jobs.find_one({"session_id": session_id})
    if prev and prev.get("status") == "running" and not is_stale(prev, now):
        return prev, False

    doc = {
        "session_id": session_id,
        "status": "running",
        "stage": "starting",
        "error": None,
        "result": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.autofix_jobs.replace_one({"session_id": session_id}, doc, upsert=True)
    return doc, True


async def stage(db, session_id: str, stage_name: str) -> None:
    try:
        await db.autofix_jobs.update_one(
            {"session_id": session_id},
            {"$set": {"stage": stage_name, "updated_at": datetime.utcnow()}},
        )
    except Exception as exc:  # progress tracking must never kill the run
        logger.warning("[autofix-jobs] stage write failed for %s: %s", session_id, exc)


async def complete(db, session_id: str, result: dict) -> None:
    await db.autofix_jobs.update_one(
        {"session_id": session_id},
        {"$set": {"status": "complete", "stage": "done", "result": result,
                  "error": None, "updated_at": datetime.utcnow()}},
    )


async def fail(db, session_id: str, message: str) -> None:
    await db.autofix_jobs.update_one(
        {"session_id": session_id},
        {"$set": {"status": "failed", "error": message, "updated_at": datetime.utcnow()}},
    )


async def get(db, session_id: str) -> dict | None:
    return await db.autofix_jobs.find_one({"session_id": session_id})


def serialize(job: dict, include_result: bool = True) -> dict:
    out = {
        "status": job.get("status"),
        "stage": job.get("stage"),
        "error": job.get("error"),
        "updated_at": job["updated_at"].isoformat() if isinstance(job.get("updated_at"), datetime) else None,
    }
    if include_result and job.get("status") == "complete":
        out["result"] = job.get("result")
    return out
