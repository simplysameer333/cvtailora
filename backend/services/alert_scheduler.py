"""Daily job alert scheduler.

Runs once at ALERT_SEND_HOUR UTC every day.
For each active alert it:
  1. Calls JSearch with the alert's query/location criteria.
  2. Filters out job IDs already emailed (seen_job_ids).
  3. Sends a digest email via Resend if there are new results.
  4. Updates last_sent_at and appends new job IDs to seen_job_ids (capped at 1000).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings
from database import get_db
from services.audit import log_audit
from services.email_service import send_job_alert_email, send_no_results_email, send_scheduler_failure_alert
from services.quota_service import get_quota, increment as _increment_quota

logger = logging.getLogger("cvtailora")

_scheduler: AsyncIOScheduler | None = None
_JSEARCH_BASE = "https://jsearch.p.rapidapi.com"
_SEEN_IDS_CAP = 1000


def _jsearch_headers() -> dict:
    return {
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
        "x-rapidapi-key": settings.rapidapi_key,
    }


def _digest_search_params(q: str, date_posted: str = "month") -> dict:
    """JSearch params for the daily digest — pure, unit-tested.

    Without a date filter JSearch returns the same relevance-ranked top-10 every
    day, so after seen_job_ids dedup almost nothing new remains in the email.
    A rolling one-month window keeps the candidate pool fresh while still wide
    enough for niche queries (measured on a real exec-level alert: 3days and
    week returned 0 jobs; month returned results). Dedup suppresses repeats.
    `date_posted="all"` omits the filter entirely — the widened fallback pass
    used when the month pool is exhausted (all results already sent).
    """
    params = {"query": q, "page": "1"}
    if date_posted != "all":
        params["date_posted"] = date_posted
    return params


async def _search_jobs(query: str, location: str, date_posted: str = "month") -> list[dict] | None:
    """Return job list (empty = no results), or None if the call failed / quota exhausted.

    Returning None tells the caller to skip the alert rather than send a
    misleading "no results" notification — the jobs may well exist, JSearch
    just couldn't be reached right now.
    """
    if not settings.rapidapi_key:
        return None

    quota = await get_quota()
    if quota["remaining"] == 0:
        logger.warning("[alert-scheduler] Monthly JSearch quota exhausted — skipping alert run")
        return None

    q = f"{query.strip()} {location.strip()}".strip()
    last_exc: Exception | None = None
    for attempt in range(1, 4):  # 3 attempts with 1 s delay between retries
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{_JSEARCH_BASE}/search",
                    params=_digest_search_params(q, date_posted),
                    headers=_jsearch_headers(),
                )
                res.raise_for_status()
            await _increment_quota()
            return res.json().get("data", [])
        except Exception as exc:
            last_exc = exc
            if attempt < 3:
                logger.warning(
                    "[alert-scheduler] JSearch attempt %d/3 failed for %r: %s — retrying in 1 s",
                    attempt, q, exc,
                )
                await asyncio.sleep(1)
    logger.warning("[alert-scheduler] JSearch failed after 3 attempts for %r: %s", q, last_exc)
    return None


async def _stamp_alert(db, alert_id, result: str) -> None:
    """Record each run's outcome on the alert doc — powers the "Last checked"
    status in the My Alerts UI so a healthy-but-quiet alert is distinguishable
    from a broken scheduler (recurring user confusion 2026-07-10..12)."""
    await db.job_alerts.update_one(
        {"_id": alert_id},
        {"$set": {"last_checked_at": datetime.utcnow(), "last_result": result}},
    )


async def _process_alert(db, alert: dict) -> str | None:
    """Process one alert.  Returns an error string if JSearch failed, else None."""
    user = await db.users.find_one({"_id": alert["user_id"]})
    if not user or not user.get("is_active"):
        return None

    # Skip if user's tier no longer qualifies — reads live MongoDB tier config
    from services.tier_config_service import has_feature as _has_feature
    if not _has_feature(user.get("tier", "free"), "job_alerts"):
        logger.info(
            "[alert-scheduler] Alert %s skipped — user %s (tier=%s) not entitled",
            alert["_id"], user.get("email"), user.get("tier", "free"),
        )
        return None

    query_parts = list(alert.get("query_tags", []))
    company = alert.get("company")
    if company:
        query_parts.append(company)
    query = " ".join(query_parts).strip()
    if not query:
        return None

    location = " OR ".join(alert.get("location_tags", []))
    jobs = await _search_jobs(query, location)

    if jobs is None:
        # JSearch errored or quota exhausted — report to caller for summary email
        msg = f"Alert '{alert.get('name')}' (query={query!r}): JSearch unavailable after 3 retries"
        logger.warning("[alert-scheduler] %s", msg)
        await _stamp_alert(db, alert["_id"], "Search failed — will retry tomorrow")
        return msg

    seen_ids: set[str] = set(alert.get("seen_job_ids", []))

    def _unseen(js: list[dict]) -> list[dict]:
        return [j for j in js if j.get("job_id") and j["job_id"] not in seen_ids]

    new_jobs = _unseen(jobs)

    # Widened fallback: a niche query can exhaust the month window (every
    # result already sent). Retry once with NO date filter so older-but-
    # never-sent jobs still surface. Costs 1 extra JSearch call, only when
    # the strict pass came up empty of new jobs.
    if not new_jobs:
        wider = await _search_jobs(query, location, date_posted="all")
        if wider:
            jobs = wider
            new_jobs = _unseen(wider)

    if not jobs:
        # Zero listings from BOTH passes — genuinely nothing matches
        await send_no_results_email(
            user_email=user["email"],
            user_name=user.get("name", "there"),
            alert_name=alert["name"],
        )
        log_audit(user, "job_alert.email_no_results", {
            "alert_name": alert["name"], "query": query, "location": location,
        })
        await _stamp_alert(db, alert["_id"], "No matching jobs found")
        return

    new_jobs = new_jobs[: settings.alert_max_jobs_per_email]

    # Never send an empty day: if the query still matches jobs but they're all
    # ones we've already emailed, RESEND the current top matches rather than
    # staying silent. A silent day reads to users as a broken alert (recurring
    # confusion 2026-07-10..13; user directive: "just send them, don't skip").
    # `resent` flags the email + audit so it's clear these aren't new postings.
    resent = False
    if not new_jobs:
        resent = True
        new_jobs = jobs[: settings.alert_max_jobs_per_email]

    sent = await send_job_alert_email(
        user_email=user["email"],
        user_name=user.get("name", "there"),
        alert_name=alert["name"],
        jobs=new_jobs,
        resent=resent,
    )

    if sent:
        updated_seen = list(seen_ids | {j["job_id"] for j in new_jobs})
        if len(updated_seen) > _SEEN_IDS_CAP:
            updated_seen = updated_seen[-_SEEN_IDS_CAP:]

        await db.job_alerts.update_one(
            {"_id": alert["_id"]},
            {"$set": {"last_sent_at": datetime.utcnow(), "seen_job_ids": updated_seen}},
        )
        # Audit what was sent to whom — powers the admin audit view + user analytics
        log_audit(user, "job_alert.email_sent", {
            "alert_name": alert["name"],
            "query": query,
            "location": location,
            "job_count": len(new_jobs),
            "resent": resent,
            "jobs": [
                {"title": j.get("job_title", ""), "employer": j.get("employer_name", "")}
                for j in new_jobs
            ],
        })
        logger.info(
            "[alert-scheduler] Alert %s → %d %s jobs emailed to %s",
            alert["_id"], len(new_jobs), "resent" if resent else "new", user["email"],
        )
        n = len(new_jobs)
        await _stamp_alert(
            db, alert["_id"],
            (f"Resent {n} current match{'es' if n != 1 else ''} — no new postings since last time"
             if resent else
             f"Sent {n} new job{'s' if n != 1 else ''}"),
        )


def should_catch_up(now_utc: datetime, send_hour: int, ran_today: bool) -> bool:
    """Pure rule for the startup catch-up: today's run was missed if we're at
    or past the send hour and no run has been recorded today. Happens when a
    backend redeploy straddles the cron trigger (in-process scheduler — a
    restart at 07:59→08:05 silently skips the whole day). Unit-tested."""
    return now_utc.hour >= send_hour and not ran_today


async def _claim_todays_run(db) -> bool:
    """Record today's run in `scheduler_runs`; returns False when a run for
    today is already claimed — makes cron + catch-up mutually idempotent."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    res = await db.scheduler_runs.update_one(
        {"job": "daily_alerts", "date": today},
        {"$setOnInsert": {"job": "daily_alerts", "date": today, "started_at": datetime.utcnow()}},
        upsert=True,
    )
    return res.upserted_id is not None


async def _catch_up_missed_run() -> None:
    """Run once at startup: fire today's digest if the cron was missed."""
    db = get_db()
    now = datetime.utcnow()
    ran = await db.scheduler_runs.find_one(
        {"job": "daily_alerts", "date": now.strftime("%Y-%m-%d")}
    ) is not None
    if should_catch_up(now, settings.alert_send_hour, ran):
        logger.info(
            "[alert-scheduler] Today's %02d:00 UTC run was missed (deploy window?) — catching up now",
            settings.alert_send_hour,
        )
        await run_daily_alerts()


async def run_daily_alerts() -> None:
    logger.info("[alert-scheduler] Daily alert run starting")
    db = get_db()

    # Master switch — admins can pause ALL alert emails app-wide from the dashboard.
    from services.system_config_service import alerts_enabled
    if not await alerts_enabled(db):
        logger.info("[alert-scheduler] Daily run skipped — alerts disabled by admin master switch")
        return

    # Claim today's slot — prevents a double send when the cron fires and a
    # restart's catch-up overlaps (or two rapid restarts both try to catch up).
    if not await _claim_todays_run(db):
        logger.info("[alert-scheduler] Daily run already recorded for today — skipping duplicate")
        return

    alerts = await db.job_alerts.find({"is_active": True}).to_list(length=2000)
    total = len(alerts)
    logger.info("[alert-scheduler] Processing %d active alerts", total)

    failures: list[str] = []
    for alert in alerts:
        try:
            error = await _process_alert(db, alert)
            if error:
                failures.append(error)
        except Exception as exc:
            msg = f"Alert '{alert.get('name')}' ({alert['_id']}): unhandled error — {exc}"
            logger.error("[alert-scheduler] %s", msg)
            failures.append(msg)

    logger.info(
        "[alert-scheduler] Daily run complete — %d processed, %d JSearch failures",
        total, len(failures),
    )

    if failures:
        await send_scheduler_failure_alert(
            failed=len(failures),
            total=total,
            sample_errors=failures,
        )


def start_scheduler() -> None:
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        run_daily_alerts,
        trigger="cron",
        hour=settings.alert_send_hour,
        minute=0,
        id="daily_job_alerts",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "[alert-scheduler] Started — daily alerts fire at %02d:00 UTC",
        settings.alert_send_hour,
    )
    # Startup catch-up: if a redeploy straddled today's send hour, the cron
    # trigger was lost with the old process — fire the missed run now.
    try:
        asyncio.get_running_loop().create_task(_catch_up_missed_run())
    except RuntimeError:
        # No running loop (e.g. imported in a sync test context) — skip.
        logger.debug("[alert-scheduler] No event loop at startup — catch-up skipped")


def stop_scheduler() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[alert-scheduler] Stopped")
