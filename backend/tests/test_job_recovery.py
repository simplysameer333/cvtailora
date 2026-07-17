"""Orphaned-job recovery sweep: resume-from-checkpoint vs clean-fail decisions.

A restart mid-run leaves a job "running" with a dead heartbeat and (without a
polling browser) nothing to recover it. The sweep must resume what it can with
tier-correct inputs, and cleanly fail what it can't — never hang forever.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bson import ObjectId

import services.job_recovery as recovery
import services.generation_jobs as gen_jobs
from services.job_recovery import classify_job

SID = "6a577bf492609d3e25b51ea6"  # valid ObjectId string
UID = ObjectId()


def test_classify_job_by_key_shape():
    assert classify_job("cvcheck:abc123") == "cvcheck"
    assert classify_job(SID) == "generation"


# ── Fakes ─────────────────────────────────────────────────────────────────────

class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=None):
        return self._docs


class _Coll:
    def __init__(self, find_docs=None, find_one_doc=None):
        self._find_docs = find_docs or []
        self._find_one_doc = find_one_doc

    def find(self, *a, **k):
        return _Cursor(self._find_docs)

    async def find_one(self, *a, **k):
        return self._find_one_doc


class _DB:
    def __init__(self, jobs, session=None, user=None):
        self.generation_jobs = _Coll(find_docs=jobs)
        self.sessions = _Coll(find_one_doc=session)
        self.users = _Coll(find_one_doc=user)


def _run(db, monkeypatch, claimed_map):
    """Run one sweep with claim_stale returning claimed_map[session_id]."""
    calls = {"generation": [], "cvcheck": [], "failed": []}

    monkeypatch.setattr(recovery, "get_db", lambda: db)

    async def fake_claim(_db, sid, now=None):
        return claimed_map.get(sid)
    monkeypatch.setattr(gen_jobs, "claim_stale", fake_claim)

    async def fake_fail(_db, sid, msg):
        calls["failed"].append((sid, msg))
    monkeypatch.setattr(gen_jobs, "fail", fake_fail)

    async def fake_generation(sid, extra, user, ih):
        calls["generation"].append({"sid": sid, "user": user, "input_hash": ih})
    import services.generation_service as gs
    monkeypatch.setattr(gs, "run_full_generation", fake_generation)

    async def fake_cvcheck(text_hash, raw_text, file_ext, user):
        calls["cvcheck"].append({"hash": text_hash, "raw_text": raw_text, "user": user})
    import services.cv_check_flow as cf
    monkeypatch.setattr(cf, "run_cv_check_job", fake_cvcheck)

    async def go():
        n = await recovery.resume_orphans()
        await asyncio.sleep(0)  # let spawned tasks run
        return n

    return asyncio.run(go()), calls


def _stale_job(sid, **extra):
    return {"session_id": sid, "status": "running", **extra}


def test_generation_orphan_resumes_with_session_user(monkeypatch):
    user = {"_id": UID, "tier": "plus"}
    db = _DB([_stale_job(SID)], session={"_id": ObjectId(SID), "user_id": UID}, user=user)
    claimed = {SID: _stale_job(SID, attempt=2, extra_instr="notes", input_hash="h1")}

    n, calls = _run(db, monkeypatch, claimed)

    assert n == 1
    assert calls["generation"] == [{"sid": SID, "user": user, "input_hash": "h1"}]
    assert calls["failed"] == []


def test_generation_orphan_with_expired_session_fails_cleanly(monkeypatch):
    db = _DB([_stale_job(SID)], session=None)
    n, calls = _run(db, monkeypatch, {SID: _stale_job(SID)})

    assert n == 1
    assert calls["generation"] == []
    assert len(calls["failed"]) == 1 and "expired" in calls["failed"][0][1]


def test_cvcheck_orphan_resumes_from_checkpointed_inputs(monkeypatch):
    key = "cvcheck:abc123"
    claimed = {key: _stale_job(key, checkpoint={"raw_text": "CV TEXT", "file_ext": "pdf"})}
    n, calls = _run(_DB([_stale_job(key)]), monkeypatch, claimed)

    assert n == 1
    assert calls["cvcheck"] == [{"hash": "abc123", "raw_text": "CV TEXT", "user": None}]


def test_cvcheck_orphan_without_inputs_fails_cleanly(monkeypatch):
    key = "cvcheck:abc123"
    n, calls = _run(_DB([_stale_job(key)]), monkeypatch, {key: _stale_job(key, checkpoint={})})

    assert n == 1
    assert calls["cvcheck"] == []
    assert len(calls["failed"]) == 1 and "upload" in calls["failed"][0][1]


def test_lost_claim_race_is_skipped(monkeypatch):
    # Another resumer (e.g. a polling browser's self-heal) won the claim.
    n, calls = _run(_DB([_stale_job(SID)]), monkeypatch, {SID: None})

    assert n == 0
    assert calls["generation"] == [] and calls["failed"] == []
