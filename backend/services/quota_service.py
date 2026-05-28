"""Monthly quota tracking for external API providers.

Usage is stored in the `api_quota` MongoDB collection, keyed by provider + month.
The counter increments after each successful external call.
"""
from __future__ import annotations

from datetime import datetime

from config import settings
from database import get_db


def _month() -> str:
    return datetime.utcnow().strftime("%Y-%m")


async def get_quota(provider: str = "jsearch") -> dict:
    """Return current usage stats without modifying the counter."""
    db = get_db()
    doc = await db.api_quota.find_one({"provider": provider, "month": _month()})
    calls = doc["calls"] if doc else 0
    limit = settings.jsearch_monthly_limit
    return {
        "provider": provider,
        "month": _month(),
        "calls": calls,
        "limit": limit,
        "pct": round(calls / limit * 100) if limit else 0,
        "remaining": max(0, limit - calls),
    }


async def increment(provider: str = "jsearch") -> dict:
    """Increment the call counter and return updated stats."""
    db = get_db()
    now = datetime.utcnow()
    doc = await db.api_quota.find_one_and_update(
        {"provider": provider, "month": _month()},
        {
            "$inc": {"calls": 1},
            "$set": {"last_call_at": now},
            "$setOnInsert": {
                "provider": provider,
                "month": _month(),
                "limit": settings.jsearch_monthly_limit,
                "created_at": now,
            },
        },
        upsert=True,
        return_document=True,  # returns the doc AFTER the update
    )
    calls = doc["calls"]
    limit = settings.jsearch_monthly_limit
    pct = round(calls / limit * 100) if limit else 0
    return {"calls": calls, "limit": limit, "pct": pct, "remaining": max(0, limit - calls)}


def quota_warning(pct: int) -> str | None:
    """Return a warning message if pct has crossed a warn threshold, else None."""
    warn_start = settings.jsearch_quota_warn_pct
    if pct < warn_start:
        return None
    # Round down to nearest 10% boundary at or above warn_start
    bracket = (pct // 10) * 10
    bracket = max(bracket, warn_start)
    if pct >= 100:
        return "Job search quota exhausted for this month. Resets on the 1st."
    return f"Job search is {bracket}% of your monthly quota ({settings.jsearch_monthly_limit} calls). Resets on the 1st."
