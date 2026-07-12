"""Unit tests for async generation jobs: staleness, checkpoint carry-over,
retry classification (task #14 — connection-proof, checkpointed pipeline)."""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException

from services.generation_jobs import is_stale, carry_checkpoint, serialize, STALE_AFTER_S
from services.generation_service import is_recoverable_failure

NOW = datetime(2026, 7, 12, 12, 0, 0)


# ── staleness (duplicate-run guard vs crashed-run takeover) ───────────────────

def test_fresh_running_job_is_not_stale():
    job = {"status": "running", "updated_at": NOW - timedelta(seconds=30)}
    assert is_stale(job, NOW) is False


def test_running_job_without_heartbeat_goes_stale():
    job = {"status": "running", "updated_at": NOW - timedelta(seconds=STALE_AFTER_S + 1)}
    assert is_stale(job, NOW) is True


def test_finished_jobs_are_never_stale():
    for status in ("complete", "failed"):
        assert is_stale({"status": status, "updated_at": NOW - timedelta(hours=5)}, NOW) is False


# ── checkpoint carry-over (resume only on identical inputs) ───────────────────

def test_checkpoint_carries_when_inputs_match():
    prev = {"input_hash": "abc", "checkpoint": {"cycle": 2, "best_min_score": 78}}
    assert carry_checkpoint(prev, "abc") == {"cycle": 2, "best_min_score": 78}


def test_checkpoint_dropped_when_inputs_changed():
    prev = {"input_hash": "abc", "checkpoint": {"cycle": 2}}
    assert carry_checkpoint(prev, "different") == {}
    assert carry_checkpoint(None, "abc") == {}


# ── retry classification (silent server-side recovery) ────────────────────────

def test_client_errors_fail_fast():
    for code in (403, 404, 422, 429):
        assert is_recoverable_failure(HTTPException(code, "x")) is False


def test_server_errors_and_crashes_retry_from_checkpoint():
    assert is_recoverable_failure(HTTPException(500, "pipeline failed")) is True
    assert is_recoverable_failure(HTTPException(504, "timed out")) is True
    assert is_recoverable_failure(RuntimeError("anthropic overloaded")) is True
    assert is_recoverable_failure(ConnectionError("reset")) is True


# ── status serialization ──────────────────────────────────────────────────────

def test_serialize_hides_result_until_complete():
    job = {"status": "running", "stage": "cycle 2 complete", "attempt": 1,
           "checkpoint": {"cycle": 2, "best_min_score": 78, "best_resume_json": {"x": 1}},
           "result": None, "error": None, "updated_at": NOW}
    out = serialize(job)
    assert out["status"] == "running" and out["cycle"] == 2 and out["best_min_score"] == 78
    assert "result" not in out
    assert "best_resume_json" not in out  # checkpoint internals stay private


def test_serialize_includes_result_when_complete():
    job = {"status": "complete", "stage": "done", "attempt": 2, "checkpoint": {},
           "result": {"resume": {"name": "A"}}, "error": None, "updated_at": NOW}
    assert serialize(job)["result"] == {"resume": {"name": "A"}}
