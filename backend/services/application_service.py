"""Application-tracker status logic (J4).

The tracker reuses the existing `saved_jobs` collection — a saved job IS a
tracked application at stage "saved". This module holds the PURE status rules
(ordering, validation, auto-advance) so they unit-test without a DB or LLM.

Pipeline: saved → applied → interview → offer, with `rejected` as a terminal
side branch. Auto-capture (Apply / Tailor clicks) only bumps saved → applied;
every later transition is a deliberate manual choice by the user, so the
tracker never fabricates progress the user didn't make.
"""
from __future__ import annotations

# Ordered pipeline stages. `rejected` sits outside the linear rank — it's a
# terminal outcome reachable from any stage, not "further along" than offer.
PIPELINE = ["saved", "applied", "interview", "offer"]
STATUSES = PIPELINE + ["rejected"]

_RANK = {status: i for i, status in enumerate(PIPELINE)}


def is_valid_status(status: str) -> bool:
    return status in STATUSES


def auto_advance(current: str, minimum: str) -> str:
    """Return the status after an auto-capture event that implies `minimum`.

    Only advances forward along the pipeline and never past a manually-set
    later/terminal stage — clicking Apply on a job you already marked
    "interview" or "rejected" must not drag it back to "applied".
    """
    if current not in _RANK or minimum not in _RANK:
        return current  # rejected (or unknown) is terminal — leave it be
    return minimum if _RANK[current] < _RANK[minimum] else current


def funnel_counts(status_list: list[str]) -> dict[str, int]:
    """Tally statuses into the funnel buckets the Analytics page shows.

    `applied` counts everyone who reached applied OR beyond (interview/offer)
    so the funnel reads as a monotonic drop-off; `rejected` is reported
    separately as it's not a forward stage.
    """
    counts = {s: 0 for s in STATUSES}
    for s in status_list:
        if s in counts:
            counts[s] += 1

    reached_applied = counts["applied"] + counts["interview"] + counts["offer"]
    reached_interview = counts["interview"] + counts["offer"]
    return {
        "total": len(status_list),
        "saved": len(status_list),          # every tracked job was saved first
        "applied": reached_applied,
        "interview": reached_interview,
        "offer": counts["offer"],
        "rejected": counts["rejected"],
    }
