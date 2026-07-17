"""Async generation jobs — Mongo-backed state for the resume pipeline.

Why this exists (2026-07-12, boom.tds incident): /generate used to hold one
silent HTTP connection for ~150s; middleboxes kill those, the user sees
"failed", retries, and stacks duplicate full-price pipeline runs while the
backend actually succeeds every time. Now the pipeline runs as a background
task with its state in the `generation_jobs` collection:

  - the browser POSTs (instant) then POLLS — no long-lived connection to lose;
  - every stage checkpoints here (analyzer output, per-cycle best resume), so
    a retry after a crash RESUMES from the checkpoint instead of restarting;
  - an in-flight job with a fresh heartbeat is attached to, never duplicated.

One job doc per session (unique index). TTL mirrors the 24h session lifetime.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from pymongo import ReturnDocument

logger = logging.getLogger("cvtailora")

# A running job whose last heartbeat is older than this is presumed crashed
# (deploy restart, process kill) — a new attempt may take over from its
# checkpoint. Cycles checkpoint every ~20-70s, so 180s is comfortably safe.
STALE_AFTER_S = 180


def is_stale(job: dict | None, now: datetime) -> bool:
    """Pure: a running job is stale when its heartbeat stopped (crashed run)."""
    if not job or job.get("status") != "running":
        return False
    updated = job.get("updated_at")
    if not isinstance(updated, datetime):
        return True
    return (now - updated).total_seconds() > STALE_AFTER_S


def carry_checkpoint(prev: dict | None, input_hash: str) -> dict:
    """Pure: checkpoint data a new attempt may resume from — only when the
    previous job ran the SAME inputs (hash match) and actually got somewhere."""
    if not prev or prev.get("input_hash") != input_hash:
        return {}
    return prev.get("checkpoint") or {}


async def acquire(db, session_id: str, input_hash: str, extra_instr: str = "") -> tuple[dict, bool]:
    """Start (or attach to) the session's generation job.

    Returns (job_doc, started): started=False means a live run is already in
    flight for this session — the caller must NOT spawn a second pipeline.

    `extra_instr` (the request's additional instructions) is persisted so a
    later auto-resume of an orphaned run can rebuild the exact same inputs
    without the original HTTP body.
    """
    now = datetime.utcnow()
    prev = await db.generation_jobs.find_one({"session_id": session_id})

    if prev and prev.get("status") == "running" and not is_stale(prev, now):
        return prev, False

    doc = {
        "session_id": session_id,
        "input_hash": input_hash,
        "extra_instr": extra_instr,
        "status": "running",
        "stage": "starting",
        "attempt": (prev or {}).get("attempt", 0) + 1,
        "checkpoint": carry_checkpoint(prev, input_hash),
        "error": None,
        "result": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.generation_jobs.replace_one({"session_id": session_id}, doc, upsert=True)
    if doc["checkpoint"]:
        logger.info(
            "[gen-jobs] session %s attempt %d resumes from checkpoint (cycle %s, best %s)",
            session_id, doc["attempt"],
            doc["checkpoint"].get("cycle"), doc["checkpoint"].get("best_min_score"),
        )
    return doc, True


async def claim_stale(db, session_id: str, now: datetime | None = None) -> dict | None:
    """Atomically take over a stale (crashed) running job so a poller can resume it.

    A running job whose heartbeat stopped means its in-process background task
    was lost (server restart/crash mid-run). This flips it to a fresh running
    state (bumped attempt) ONLY if it is still stale at write time, so exactly
    one concurrent caller wins the claim and re-spawns the pipeline. Returns the
    claimed job on success, else None (fresh heartbeat, already claimed, or the
    job finished in the meantime).
    """
    now = now or datetime.utcnow()
    threshold = now - timedelta(seconds=STALE_AFTER_S)
    return await db.generation_jobs.find_one_and_update(
        {"session_id": session_id, "status": "running", "updated_at": {"$lt": threshold}},
        {"$set": {"stage": "resuming after interruption", "updated_at": now},
         "$inc": {"attempt": 1}},
        return_document=ReturnDocument.AFTER,
    )


async def checkpoint(db, session_id: str, stage: str, data: dict | None = None) -> None:
    """Record progress + heartbeat. `data` keys merge into job.checkpoint."""
    update: dict = {"stage": stage, "updated_at": datetime.utcnow()}
    for k, v in (data or {}).items():
        update[f"checkpoint.{k}"] = v
    try:
        await db.generation_jobs.update_one({"session_id": session_id}, {"$set": update})
    except Exception as exc:  # progress tracking must never kill the pipeline
        logger.warning("[gen-jobs] checkpoint write failed for %s: %s", session_id, exc)


async def complete(db, session_id: str, result: dict) -> None:
    await db.generation_jobs.update_one(
        {"session_id": session_id},
        {"$set": {"status": "complete", "stage": "done", "result": result,
                  "error": None, "updated_at": datetime.utcnow()}},
    )


async def fail(db, session_id: str, message: str) -> None:
    await db.generation_jobs.update_one(
        {"session_id": session_id},
        {"$set": {"status": "failed", "error": message, "updated_at": datetime.utcnow()}},
    )


async def get(db, session_id: str) -> dict | None:
    return await db.generation_jobs.find_one({"session_id": session_id})


def serialize(job: dict, include_result: bool = True) -> dict:
    """Shape a job doc for the status endpoint (checkpoint internals stay private
    apart from progress numbers)."""
    cp = job.get("checkpoint") or {}
    out = {
        "status": job.get("status"),
        "stage": job.get("stage"),
        "attempt": job.get("attempt", 1),
        "cycle": cp.get("cycle", 0),
        "best_min_score": cp.get("best_min_score", 0),
        "error": job.get("error"),
        "updated_at": job["updated_at"].isoformat() if isinstance(job.get("updated_at"), datetime) else None,
    }
    if include_result and job.get("status") == "complete":
        out["result"] = job.get("result")
    return out
