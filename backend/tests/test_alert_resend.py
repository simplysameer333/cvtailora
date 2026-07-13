"""Alert scheduler: never send an empty day.

When a query still matches jobs but they're all ones we've already emailed,
the scheduler must RESEND the current top matches (flagged resent=True) instead
of skipping — a silent day reads as a broken alert (user directive 2026-07-13).
Genuinely-new jobs still go out normally (resent=False).
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import services.alert_scheduler as sched


class _Coll:
    def __init__(self, doc=None):
        self._doc = doc
        self.updates = []

    async def find_one(self, *a, **k):
        return self._doc

    async def update_one(self, filt, update, **k):
        self.updates.append((filt, update))


class _DB:
    def __init__(self, user):
        self.users = _Coll(user)
        self.job_alerts = _Coll()


_USER = {"_id": "u1", "email": "a@b.com", "name": "A", "is_active": True, "tier": "pro"}


def _alert(seen):
    return {
        "_id": "al1", "user_id": "u1", "name": "My Alert",
        "query_tags": ["engineer"], "location_tags": ["London"],
        "company": None, "seen_job_ids": list(seen),
    }


def _wire(monkeypatch, pool, captured):
    monkeypatch.setattr("services.tier_config_service.has_feature", lambda *a, **k: True)
    monkeypatch.setattr(sched, "log_audit", lambda *a, **k: None)

    async def _fake_search(query, location, date_posted="month"):
        return pool
    monkeypatch.setattr(sched, "_search_jobs", _fake_search)

    async def _fake_send(**kwargs):
        captured.update(kwargs)
        return True
    monkeypatch.setattr(sched, "send_job_alert_email", _fake_send)


def test_resends_current_matches_when_no_new_jobs(monkeypatch):
    pool = [
        {"job_id": "j1", "job_title": "Eng", "employer_name": "X"},
        {"job_id": "j2", "job_title": "Dev", "employer_name": "Y"},
    ]
    captured: dict = {}
    _wire(monkeypatch, pool, captured)

    # Both pool jobs already emailed → zero NEW jobs → must resend, not skip.
    result = asyncio.run(sched._process_alert(_DB(_USER), _alert({"j1", "j2"})))

    assert result is None
    assert captured, "email must be sent, not skipped, when all matches are already seen"
    assert captured["resent"] is True
    assert {j["job_id"] for j in captured["jobs"]} == {"j1", "j2"}


def test_sends_new_jobs_normally(monkeypatch):
    pool = [
        {"job_id": "j1", "job_title": "Eng", "employer_name": "X"},   # seen
        {"job_id": "j3", "job_title": "New Role", "employer_name": "Z"},  # new
    ]
    captured: dict = {}
    _wire(monkeypatch, pool, captured)

    result = asyncio.run(sched._process_alert(_DB(_USER), _alert({"j1"})))

    assert result is None
    assert captured["resent"] is False
    assert [j["job_id"] for j in captured["jobs"]] == ["j3"]
