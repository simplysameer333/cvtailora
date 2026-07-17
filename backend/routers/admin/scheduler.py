"""Admin scheduler audit — when the daily alert job ran and what it delivered.

GET /api/admin/scheduler/runs — last N daily-alert runs (`scheduler_runs`),
each joined with that day's `job_alert.*` audit entries: recipient, alert,
and the exact jobs emailed. Timestamps are UTC ISO; the admin UI localises.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query

from database import get_db
from dependencies.auth import require_superadmin

router = APIRouter()

_DELIVERY_ACTIONS = ("job_alert.email_sent", "job_alert.email_no_results")


def group_deliveries(runs: list[dict], entries: list[dict]) -> list[dict]:
    """Pure + unit-tested: attach each delivery audit entry to its run by
    UTC calendar date (one scheduler run per day by design — the
    `scheduler_runs` per-day claim guarantees it)."""
    by_date: dict[str, dict] = {
        r["date"]: {
            "date": r["date"],
            "started_at": r["started_at"].isoformat() if isinstance(r.get("started_at"), datetime) else r.get("started_at"),
            "deliveries": [],
        }
        for r in runs
    }
    for e in entries:
        created = e.get("created_at")
        day = created.strftime("%Y-%m-%d") if isinstance(created, datetime) else str(created)[:10]
        run = by_date.get(day)
        if run is None:
            continue  # delivery outside the fetched runs window
        meta = e.get("metadata") or {}
        run["deliveries"].append({
            "at": created.isoformat() if isinstance(created, datetime) else created,
            "type": "sent" if e.get("action") == "job_alert.email_sent" else "no_results",
            "recipient": e.get("user_email", ""),
            "alert_name": meta.get("alert_name", ""),
            "job_count": meta.get("job_count", 0),
            "jobs": meta.get("jobs") or [],
        })
    return sorted(by_date.values(), key=lambda r: r["date"], reverse=True)


@router.get("/admin/scheduler/runs")
async def scheduler_runs(
    limit: int = Query(default=30, ge=1, le=90),
    _: dict = Depends(require_superadmin),
):
    db = get_db()
    runs = await (
        db.scheduler_runs.find({"job": "daily_alerts"})
        .sort("date", -1)
        .to_list(length=limit)
    )
    if not runs:
        return []

    # Fetch delivery audit entries covering the fetched runs' date span
    oldest = min(r["date"] for r in runs)
    since = datetime.strptime(oldest, "%Y-%m-%d")
    entries = await (
        db.audit_log.find({
            "action": {"$in": list(_DELIVERY_ACTIONS)},
            "created_at": {"$gte": since, "$lt": datetime.utcnow() + timedelta(days=1)},
        })
        .sort("created_at", 1)
        .to_list(length=2000)
    )
    return group_deliveries(runs, entries)
