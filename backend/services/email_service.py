import json
import logging
from datetime import datetime

logger = logging.getLogger("tailormycv")


async def send_quality_alert(session_id: str, aggregated: dict, resume_json: dict) -> None:
    """Log a quality alert warning. Email delivery is disabled until SMTP is configured."""
    scores = [
        f"{r['model'].upper()}={r['score']}/100"
        for r in aggregated.get("evaluator_results", [])
    ]
    logger.warning(
        "[quality-alert] session=%s min_score=%s all_passed=%s evaluators=[%s]",
        session_id,
        aggregated.get("min_score"),
        aggregated.get("all_passed"),
        ", ".join(scores),
    )
