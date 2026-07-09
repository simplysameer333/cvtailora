"""Unit tests for the pure application-tracker status logic (J4)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.application_service import (
    STATUSES, is_valid_status, auto_advance, funnel_counts,
)


def test_valid_statuses():
    assert is_valid_status("saved")
    assert is_valid_status("rejected")
    assert not is_valid_status("ghosted")
    assert set(STATUSES) == {"saved", "applied", "interview", "offer", "rejected"}


def test_auto_advance_bumps_saved_to_applied():
    assert auto_advance("saved", "applied") == "applied"


def test_auto_advance_never_downgrades_later_stage():
    # An Apply click on a job already at interview/offer must not pull it back
    assert auto_advance("interview", "applied") == "interview"
    assert auto_advance("offer", "applied") == "offer"


def test_auto_advance_leaves_terminal_rejected():
    assert auto_advance("rejected", "applied") == "rejected"


def test_auto_advance_idempotent_at_same_stage():
    assert auto_advance("applied", "applied") == "applied"


def test_funnel_is_monotonic():
    statuses = ["saved", "saved", "applied", "interview", "offer", "rejected"]
    f = funnel_counts(statuses)
    assert f["total"] == 6
    assert f["saved"] == 6          # everyone was saved
    assert f["applied"] == 3        # applied + interview + offer
    assert f["interview"] == 2      # interview + offer
    assert f["offer"] == 1
    assert f["rejected"] == 1
    # Funnel must never increase down the stages
    assert f["saved"] >= f["applied"] >= f["interview"] >= f["offer"]


def test_funnel_empty():
    f = funnel_counts([])
    assert f == {"total": 0, "saved": 0, "applied": 0, "interview": 0, "offer": 0, "rejected": 0}
