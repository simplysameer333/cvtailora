"""CV-Score check flow — the multi-call analysis pipeline behind /resume/check.

Moved out of routers/resume.py (2026-07-12 principles audit) and converted to
an async Mongo-checkpointed job (CLAUDE.md rule: any LLM workflow >30 s or
multi-call must not run inside one HTTP request). Worst case here is
1 quality check + N refine cycles × 2 calls + extraction + grammar — well over
a minute, the same connection-kill exposure that broke /generate.

Job state reuses services/generation_jobs (same collection, tested semantics):
the job key is "cvcheck:<text_hash>", so two people uploading the same CV
attach to one in-flight job, and the input-hash carry-over is trivially
satisfied (the key IS the input hash). Checkpoints: the step-1 quality result
is saved so a retried attempt skips re-scoring.
"""
from __future__ import annotations

import asyncio
import logging
import traceback
import uuid
from datetime import datetime

from config import settings
from database import get_db
from services import generation_jobs as jobs
from services.audit import log_audit
from services.email_service import send_error_alert
from services.graph.cv_score_graph import run_cv_score_graph
from services.resume_checker_service import (
    extract_contact_regex,
    extract_resume_for_preview,
)

logger = logging.getLogger("cvtailora")

# Same retry policy as generation: transient LLM failures retry from the
# checkpoint before the user ever sees an error.
_MAX_ATTEMPTS = 3


def job_key(text_hash: str) -> str:
    """Namespaced generation_jobs key for a CV-check job (no session here)."""
    return f"cvcheck:{text_hash}"


async def run_cv_check_job(text_hash: str, raw_text: str, file_ext: str, user: dict | None) -> None:
    """Background wrapper: run the analysis; retry recoverable failures from
    the checkpoint; mark the job complete/failed."""
    db = get_db()
    key = job_key(text_hash)
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            await _cv_check_body(db, key, text_hash, raw_text, file_ext, user)
            return
        except Exception as exc:
            if attempt < _MAX_ATTEMPTS:
                logger.warning(
                    "[cv-check-job] %s attempt %d/%d failed (%s) — retrying from checkpoint",
                    key, attempt, _MAX_ATTEMPTS, exc,
                )
                await jobs.checkpoint(db, key, f"recovering — retrying (attempt {attempt + 1})")
                await asyncio.sleep(5 * attempt)
                continue
            logger.exception("[cv-check-job] %s failed permanently: %s", key, exc)
            await jobs.fail(db, key, "CV analysis failed. Please try again.")
            asyncio.create_task(send_error_alert(
                "JOB", f"/api/resume/check hash={text_hash[:8]}", exc, traceback.format_exc(),
            ))
            return


async def _cv_check_body(db, key: str, text_hash: str, raw_text: str,
                         file_ext: str, user: dict | None) -> None:
    ran_grammar = True   # grammar is one of the graph's categories now

    # ── Score the CV with the graph engine (Review → refine loop → keep best) ──
    # The Evaluation Agent spawns one worker per quality category in parallel; the
    # tier-bounded loop refines weak areas and keeps the best. Grammar is a
    # category, so there is no separate grammar call. Replaces the old
    # check_resume + Ralph loop. persist=True so the run shows in admin Agent Runs.
    tier = (user or {}).get("tier", "free")
    await jobs.checkpoint(db, key, "reviewing your CV across every category")
    graph_run = await run_cv_score_graph(
        raw_text, tier=tier, persist=True,
        user_id=str(user["_id"]) if user else None,
    )
    result = {
        "overall_score": int((graph_run.result or {}).get("overall_score", 0) or 0),
        "categories": (graph_run.result or {}).get("categories", []),
    }
    refine_cycles = graph_run.totals.total_loops

    # ── Extraction — always runs (needed for the template preview) ────────────
    await jobs.checkpoint(db, key, "extracting your profile")
    extracted_llm_raw = (await asyncio.gather(
        extract_resume_for_preview(raw_text, settings.anthropic_api_key),
        return_exceptions=True,
    ))[0]
    grammar_raw = None   # grammar already scored inside the graph

    extracted_llm = None if isinstance(extracted_llm_raw, Exception) else extracted_llm_raw
    if isinstance(extracted_llm_raw, Exception):
        logger.warning("[cv_score] LLM extraction failed, using regex fallback: %s", extracted_llm_raw)

    # Grammar & spelling is best-effort — append as extra category when it succeeds.
    grammar = grammar_raw
    if ran_grammar and not isinstance(grammar, Exception) and isinstance(grammar, dict) and grammar.get("key"):
        result.setdefault("categories", []).append(grammar)
        try:
            base = float(result.get("overall_score", 0) or 0)
            g = float(grammar.get("score", base))
            _GRAMMAR_WEIGHT = 0.15
            result["overall_score"] = round((1 - _GRAMMAR_WEIGHT) * base + _GRAMMAR_WEIGHT * g)
        except (TypeError, ValueError):
            pass
    elif ran_grammar and isinstance(grammar, Exception):
        logger.warning("[cv_score] Grammar check failed: %s", grammar)

    # Build the extracted profile: LLM extraction primary, regex as field-level
    # fallback for anything the LLM left empty (or if the LLM call failed entirely).
    regex_profile = extract_contact_regex(raw_text)
    llm = extracted_llm or {}
    extracted_profile = {
        "name":           llm.get("name")           or regex_profile.get("name", ""),
        "title":          llm.get("title")          or regex_profile.get("title", ""),
        "email":          llm.get("email")          or regex_profile.get("email", ""),
        "phone":          llm.get("phone")          or regex_profile.get("phone", ""),
        "location":       llm.get("location")       or regex_profile.get("location", ""),
        "linkedin":       llm.get("linkedin")       or regex_profile.get("linkedin", ""),
        "summary":        llm.get("summary")        or regex_profile.get("summary", ""),
        "skills":         llm.get("skills")         or regex_profile.get("skills", []),
        "experience":     llm.get("experience")     or regex_profile.get("experience", []),
        "education":      llm.get("education")      or regex_profile.get("education", []),
        "extra_sections": llm.get("extra_sections") or regex_profile.get("extra_sections", []),
    }

    # ── Persist full result with a shareable UUID ──────────────────────────────
    result_id = str(uuid.uuid4())
    try:
        await db.cv_check_results.insert_one({
            "_id":           result_id,
            "user_id":       user["_id"] if user else None,
            "created_at":    datetime.utcnow(),
            "text_hash":     text_hash,   # enables cache lookup for same CV
            "overall_score": result.get("overall_score", 0),
            "file_ext":      file_ext,
            "result":        result,      # full JSON result for permalink page
            "raw_text":      raw_text,    # stored so profile can be re-extracted later
            "extracted_profile": extracted_profile,
            "categories": [
                {"key": c.get("key"), "score": c.get("score", 0), "status": c.get("status")}
                for c in result.get("categories", [])
            ],
        })
        # also write lightweight row to cv_checks for admin stats
        await db.cv_checks.insert_one({
            "result_id":     result_id,
            "user_id":       user["_id"] if user else None,
            "created_at":    datetime.utcnow(),
            "overall_score": result.get("overall_score", 0),
            "file_ext":      file_ext,
            "categories": [
                {"key": c.get("key"), "score": c.get("score", 0), "status": c.get("status")}
                for c in result.get("categories", [])
            ],
        })
    except Exception as exc:
        logger.warning("[cv_score] Failed to persist result: %s", exc)
        result_id = None

    # Audit: the graph's parallel category workers + refine cycles + 1 extraction.
    llm_calls = graph_run.totals.llm_calls + 1
    if user:
        log_audit(user, "resume.cv_score", {
            "result_id": result_id,
            "overall_score": result.get("overall_score", 0),
            "file_ext": file_ext,
            "llm_calls": llm_calls,
            "refine_cycles": refine_cycles,
            "est_cost_usd": round(graph_run.totals.usd, 4),
            "graph_run_id": graph_run.run_id,
        })

    await jobs.complete(db, key, {**result, "result_id": result_id, "extracted_profile": extracted_profile})
