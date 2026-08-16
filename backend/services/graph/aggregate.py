"""Pure aggregation — weighted overall score from per-category results.

Replaces the single mega-prompt's internal weighting with an explicit, testable
function over the fan-out's category results. Weights are DATA (prompts.CATEGORIES)
and are renormalised over the categories actually present, so a skipped/failed
category doesn't distort the total. No I/O — unit-tests directly.
"""
from __future__ import annotations

from .prompts import CATEGORY_BY_KEY


def aggregate_categories(category_results: list[dict]) -> dict:
    """Blend per-category scores into an overall 0-100 score.

    category_results: list of validated category dicts ({key, name, score, ...}).
    Returns {overall_score, categories, weakest} where `weakest` lists categories
    below 75 worst-first (the refine loop / user actions consume this).
    """
    valid = [c for c in category_results if isinstance(c, dict) and "key" in c]
    if not valid:
        return {"overall_score": 0, "categories": [], "weakest": []}

    weighted_sum = 0.0
    weight_total = 0.0
    for c in valid:
        w = float(CATEGORY_BY_KEY.get(c["key"], {}).get("weight", 1))
        weighted_sum += w * float(c.get("score", 0) or 0)
        weight_total += w

    overall = round(weighted_sum / weight_total) if weight_total else 0

    weakest = sorted(
        (c for c in valid if int(c.get("score", 0) or 0) < 75),
        key=lambda c: int(c.get("score", 0) or 0),
    )
    return {
        "overall_score": overall,
        "categories": valid,
        "weakest": [
            {"key": c["key"], "name": c.get("name", c["key"]),
             "score": int(c.get("score", 0) or 0),
             "improvements": c.get("improvements", [])}
            for c in weakest
        ],
    }
