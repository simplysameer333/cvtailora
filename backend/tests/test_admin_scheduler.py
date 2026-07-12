"""Unit tests for the admin scheduler-audit grouping (task #13)."""
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.admin_scheduler import group_deliveries

RUNS = [
    {"date": "2026-07-11", "started_at": datetime(2026, 7, 11, 14, 59, 7)},
    {"date": "2026-07-12", "started_at": datetime(2026, 7, 12, 8, 0, 0)},
]

ENTRIES = [
    {
        "action": "job_alert.email_sent",
        "user_email": "user@example.com",
        "created_at": datetime(2026, 7, 12, 8, 0, 5),
        "metadata": {
            "alert_name": "VP Java",
            "job_count": 2,
            "jobs": [{"title": "Lead Java Dev", "employer": "Acme"},
                     {"title": "VP Engineering", "employer": "Beta"}],
        },
    },
    {
        "action": "job_alert.email_no_results",
        "user_email": "other@example.com",
        "created_at": datetime(2026, 7, 12, 8, 0, 9),
        "metadata": {"alert_name": "Rust jobs"},
    },
]


def test_runs_sorted_newest_first_with_deliveries_attached():
    out = group_deliveries(RUNS, ENTRIES)
    assert [r["date"] for r in out] == ["2026-07-12", "2026-07-11"]
    today = out[0]
    assert len(today["deliveries"]) == 2
    sent = today["deliveries"][0]
    assert sent["type"] == "sent"
    assert sent["recipient"] == "user@example.com"
    assert sent["job_count"] == 2
    assert sent["jobs"][0]["title"] == "Lead Java Dev"
    assert today["deliveries"][1]["type"] == "no_results"


def test_run_with_no_deliveries_has_empty_list():
    out = group_deliveries(RUNS, ENTRIES)
    assert out[1]["date"] == "2026-07-11"
    assert out[1]["deliveries"] == []


def test_delivery_outside_runs_window_is_dropped():
    stray = [{
        "action": "job_alert.email_sent", "user_email": "x@y.z",
        "created_at": datetime(2026, 7, 9, 8, 0, 0), "metadata": {},
    }]
    out = group_deliveries(RUNS, stray)
    assert all(r["deliveries"] == [] for r in out)


def test_started_at_serialised_iso():
    out = group_deliveries(RUNS, [])
    assert out[0]["started_at"] == "2026-07-12T08:00:00"
