"""Unit tests for JSearch request-param builders.

Covers the job-alerts gap fix: the daily digest must query a rolling
fresh-jobs window (date_posted) instead of the static relevance top-10, and
the search endpoint must map page_size onto JSearch's real num_pages param
(the old num_results was a silent no-op).
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.jobs import _search_params
from services.alert_scheduler import _digest_search_params


# ── Alert digest params ───────────────────────────────────────────────────────

def test_digest_uses_fresh_jobs_window():
    params = _digest_search_params("python developer London")
    assert params["date_posted"] == "month"
    assert params["query"] == "python developer London"
    assert params["page"] == "1"


def test_digest_widened_fallback_omits_date_filter():
    # "all" = the second pass when the month pool is exhausted — JSearch's
    # default (no date_posted param) searches all listings.
    params = _digest_search_params("python developer London", date_posted="all")
    assert "date_posted" not in params
    assert params["query"] == "python developer London"


def test_digest_has_no_dead_params():
    assert "num_results" not in _digest_search_params("x")


# ── Search endpoint page/page_size → JSearch page/num_pages ──────────────────

def test_default_page_size_is_one_jsearch_page():
    assert _search_params("q", page=1, page_size=10) == {
        "query": "q", "page": "1", "num_pages": "1",
    }


def test_second_page_at_default_size():
    assert _search_params("q", page=2, page_size=10) == {
        "query": "q", "page": "2", "num_pages": "1",
    }


def test_page_size_20_spans_two_jsearch_pages():
    assert _search_params("q", page=1, page_size=20) == {
        "query": "q", "page": "1", "num_pages": "2",
    }
    # UI page 2 starts where page 1 ended (JSearch pages 3–4)
    assert _search_params("q", page=2, page_size=20) == {
        "query": "q", "page": "3", "num_pages": "2",
    }


def test_page_size_50_spans_five_jsearch_pages():
    assert _search_params("q", page=3, page_size=50) == {
        "query": "q", "page": "11", "num_pages": "5",
    }


def test_sub_10_page_size_clamps_to_one_page():
    assert _search_params("q", page=1, page_size=5)["num_pages"] == "1"


def test_search_has_no_dead_params():
    assert "num_results" not in _search_params("q", page=1, page_size=10)
