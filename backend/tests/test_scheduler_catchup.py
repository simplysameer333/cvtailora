"""Unit tests for the alert-scheduler startup catch-up rule.

Context: the daily digest is an in-process APScheduler cron (08:00 UTC). A
backend redeploy straddling that hour loses the trigger and the whole day's
alerts silently skip (observed 2026-07-10/11). `should_catch_up` decides at
startup whether the missed run must fire.
"""
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.alert_scheduler import should_catch_up

SEND_HOUR = 8


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 11, hour, minute)


def test_before_send_hour_never_catches_up():
    # The cron is still ahead of us today — nothing was missed.
    assert should_catch_up(_at(7, 59), SEND_HOUR, ran_today=False) is False


def test_after_send_hour_and_not_ran_catches_up():
    assert should_catch_up(_at(8, 5), SEND_HOUR, ran_today=False) is True
    assert should_catch_up(_at(16, 0), SEND_HOUR, ran_today=False) is True


def test_after_send_hour_but_already_ran_does_not():
    assert should_catch_up(_at(9, 0), SEND_HOUR, ran_today=True) is False


def test_exactly_at_send_hour_counts_as_due():
    # Boot at exactly 08:00 with no run recorded → the cron may or may not
    # have fired in the dying process; the run-claim makes firing safe.
    assert should_catch_up(_at(8, 0), SEND_HOUR, ran_today=False) is True
