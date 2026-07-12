"""Generation service — orchestrates the profession-aware evaluator-optimizer
pipeline as an async, checkpointed background job.

Moved out of routers/generate.py (2026-07-12) so the router stays a thin HTTP
layer (SOLID: single responsibility, no very large files). All pipeline
orchestration, retry-from-checkpoint, cost accounting and quality gating live
here; job state persistence lives in services/generation_jobs.py.

Cost controls
-------------
- Evaluator flags (ANTHROPIC/OPENAI/GOOGLE_EVALUATOR_ENABLED) gate which evaluators run.
- PASS_THRESHOLD (default 50) determines when the loop exits early.
- MAX_EVAL_CYCLES caps the number of generator-evaluator loops per request.
- MAX_AI_CALLS_PER_SESSION is a hard per-session cap tracked in MongoDB. Once
  hit, the caller returns 429 until the session is reset.

Fact-locking
------------
- session.locked_facts is a list of strings the user has pinned.
- Passed through PipelineState and injected into the generator system prompt.
- The generator is instructed never to modify or remove locked facts.

Job analysis
------------
- JobAnalyzerAgent runs once before the pipeline loop to extract the top-N
  skills from the job description that the candidate can credibly claim.
- N is driven by SKILL_EXTRACTION_COUNT in .env (maps to subscription tier).
- The extracted skills are passed to every generator cycle as prioritisation hints.
"""
import asyncio
import hashlib
import logging
from datetime import datetime, timedelta

from fastapi import HTTPException
from bson import ObjectId

from database import get_db
from config import settings
from services.pipeline import pipeline, telemetry
from services import generation_jobs as gen_jobs
from services.usage_service import increment_usage
from services.agent_memory import record_generation_outcome
from services.pipeline.agents.job_analyzer import JobAnalyzerAgent
from services.resume_checker_service import validate_resume_layout
from services.user_actions_service import build_user_actions
from services.profession_service import resolve_profession_for_role
from services.email_service import send_quality_alert, send_error_alert

logger = logging.getLogger("cvtailora")
_job_analyzer = JobAnalyzerAgent()

# Every tier scores with the SAME engine the user sees: CV-Score (cv_score
# evaluator → check_resume). Plus/Pro additionally run cross-provider
# JD-alignment evaluators (OpenAI gpt-4o-mini, Google Gemini Flash) — user
# decision 2026-06-11: keep multi-provider calls to reduce single-model bias.
# Both are cheap and run in parallel with cv_score (asyncio.gather), so they
# add pennies, not latency. The Sonnet anthropic evaluator stays off (the
# generator is already Sonnet — same-model self-grading adds cost, not signal).
_TIER_EVALUATORS: dict[str, set[str]] = {
    "free": {"cv_score"},
    "plus": {"cv_score", "openai"},
    "pro":  {"cv_score", "openai", "google"},
}


def _enabled_evaluators_for_tier(user_tier: str) -> dict[str, bool]:
    """Return per-tier evaluator flags, respecting global env flags + API key presence."""
    allowed = _TIER_EVALUATORS.get(user_tier, {"cv_score"})
    return {
        "cv_score":  "cv_score"  in allowed and bool(settings.anthropic_api_key),
        "anthropic": "anthropic" in allowed and settings.anthropic_evaluator_enabled,
        "openai":    "openai"    in allowed and settings.openai_evaluator_enabled and bool(settings.openai_api_key),
        "google":    "google"    in allowed and settings.google_evaluator_enabled and bool(settings.google_api_key),
    }


async def _resolve_template_pages(db, template_key: str) -> int:
    """Page budget for the selected template — read from the cv_templates DATA.

    Templates are data, not code (see CLAUDE.md), so the page count lives on the
    template doc. Falls back to 2 with a WARNING when the template or its `pages`
    field is missing, so a new admin/AI-generated template never silently gets
    the wrong budget without a trace in the logs.
    """
    if not template_key:
        return 2
    try:
        doc = await db.cv_templates.find_one({"key": template_key}, {"pages": 1})
    except Exception as exc:
        logger.warning("[generate] template page lookup failed for %r: %s — defaulting to 2.", template_key, exc)
        return 2
    if doc and doc.get("pages"):
        return int(doc["pages"])
    logger.warning("[generate] template %r has no page count in cv_templates — defaulting to 2.", template_key)
    return 2


async def resolve_profession(db, target_role: str) -> dict:
    """Resolve profession config from DB; fall back to featured profession, then generic."""
    config = await resolve_profession_for_role(db, target_role)
    if config.get("slug") == "generic" and settings.featured_profession_slug:
        from services.profession_service import get_profession_by_slug
        featured = await get_profession_by_slug(db, settings.featured_profession_slug)
        if featured:
            return featured
    return config


async def check_cost_limit(db, session_id: str) -> int:
    """Raise 429 if this session has already reached its AI call limit.

    Checks current usage, not projected usage — allows the first generation
    to always complete regardless of tier/evaluator count.
    """
    if settings.max_ai_calls_per_session <= 0:
        return 0
    session = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"ai_call_count": 1})
    current = (session or {}).get("ai_call_count", 0)
    if current >= settings.max_ai_calls_per_session:
        logger.warning(
            "[generate] Session %s at AI call limit: used=%d limit=%d",
            session_id, current, settings.max_ai_calls_per_session,
        )
        import traceback
        await send_error_alert(
            "POST", "/api/generate",
            Exception(f"Session {session_id} at AI call limit: used={current} limit={settings.max_ai_calls_per_session}"),
            traceback.format_stack()[-1],
        )
        raise HTTPException(
            429,
            "Resume generation limit reached for this session. "
            "Please start a new session to continue."
        )
    return current


async def increment_call_count(db, session_id: str, count: int):
    """Add count to the session's ai_call_count field."""
    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$inc": {"ai_call_count": count}},
    )


async def _original_cv_score(db, resume_text: str, conservative: bool = True) -> int:
    """CV-Score of the UPLOADED résumé — the floor the generated one must not drop below.

    Reuses the cached score from the upload/score flow when present (free); otherwise
    computes it once with check_resume (Haiku, cheap). Returns 0 on any failure so the
    gate falls back to the plain tier bar.

    conservative must match the calibration the generated résumé is scored with
    (paid → False) so "beat the original" compares like with like. The shared
    cv_check_results cache holds conservative scores, so we bypass it for paid.
    """
    if not resume_text.strip():
        return 0
    text_hash = hashlib.sha256(resume_text[:8000].encode()).hexdigest()
    if conservative:
        try:
            doc = await db.cv_check_results.find_one({"text_hash": text_hash}, sort=[("created_at", -1)])
            if doc and doc.get("overall_score") is not None:
                return int(doc["overall_score"] or 0)
        except Exception:
            pass
    try:
        from services.resume_checker_service import check_resume
        result = await check_resume(resume_text, settings.anthropic_api_key, conservative=conservative)
        return int(result.get("overall_score", 0) or 0)
    except Exception:
        return 0


class _BG:
    """BackgroundTasks stand-in for the job context — schedules coroutines on
    the running loop; plain callables execute inline."""
    def add_task(self, fn, *args, **kwargs):
        out = fn(*args, **kwargs)
        if asyncio.iscoroutine(out):
            asyncio.create_task(out)


async def run_job_analysis(
    db, session_id: str, resume_text: str, user_profile: dict,
    job_description: str, user_tier: str, has_jd: bool,
) -> tuple[list, dict]:
    """Job analysis + GitHub enrichment (parallel when JD present).

    Both calls are independent: job analyzer extracts JD skills for the
    generator; GitHub enrichment fetches + ranks the user's public repos by JD
    relevance. asyncio.gather runs them concurrently. Returns (key_skills,
    user_profile-with-github-highlights) and persists key_skills on the session.
    """
    from services.tier_config_service import get_limit as _get_limit
    github_username = user_profile.get("github_username", "")
    if has_jd:
        n_skills = _get_limit(user_tier, "key_skills") or settings.skill_extraction_count

        async def _job_analysis():
            return await _job_analyzer.run(
                resume_text=resume_text,
                user_profile=user_profile,
                job_description=job_description,
                n=n_skills,
            )

        async def _github_enrich():
            if not github_username.strip():
                return []
            from services.github_enrichment_service import enrich_github_projects
            return await enrich_github_projects(github_username, job_description)

        key_skills, github_projects = await asyncio.gather(_job_analysis(), _github_enrich())
    else:
        key_skills = []
        github_projects = []

    if github_projects:
        highlights = "; ".join(
            f"{p['name']}: {p['highlight']}" for p in github_projects
        )
        user_profile = {**user_profile, "github_projects": highlights}
    # Persist key_skills on the session so export can bold them
    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"key_skills": key_skills}},
    )
    return key_skills, user_profile


# A failed attempt auto-retries from its checkpoint this many times before the
# user ever sees an error. Transient LLM/API hiccups (rate limits, overloads,
# timeouts) resolve silently; the UI just shows "taking longer than usual".
_MAX_JOB_ATTEMPTS = 3


def is_recoverable_failure(exc: Exception) -> bool:
    """Pure + unit-tested: can a retry-from-checkpoint plausibly fix this?

    Client-type errors (bad session, missing resume, tier gates — 4xx) are
    deterministic: retrying reproduces them, so fail fast. Everything else
    (LLM 429/5xx, network blips, pipeline crashes) is worth retrying because
    checkpoints make retries cheap — completed cycles are never re-run.
    """
    if isinstance(exc, HTTPException):
        return exc.status_code >= 500
    return True


async def run_full_generation(session_id: str, extra_instr: str, user: dict | None, input_hash: str) -> None:
    """Background wrapper: run the pipeline; auto-retry recoverable failures
    from the last checkpoint; mark the job complete/failed."""
    db = get_db()
    for attempt in range(1, _MAX_JOB_ATTEMPTS + 1):
        try:
            await _generation_body(db, session_id, extra_instr, user, input_hash)
            return
        except Exception as exc:
            detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
            if is_recoverable_failure(exc) and attempt < _MAX_JOB_ATTEMPTS:
                logger.warning(
                    "[generate-job] session %s attempt %d/%d hit recoverable failure (%s) "
                    "— retrying from checkpoint",
                    session_id, attempt, _MAX_JOB_ATTEMPTS, detail,
                )
                # Job stays "running"; the stage tells the UI to show the
                # "taking longer than usual" message instead of an error.
                await gen_jobs.checkpoint(
                    db, session_id, f"recovering — retrying (attempt {attempt + 1})",
                )
                await asyncio.sleep(5 * attempt)
                continue

            logger.exception("[generate-job] session %s failed permanently: %s", session_id, exc)
            await gen_jobs.fail(
                db, session_id,
                str(detail) if isinstance(exc, HTTPException)
                else "Resume generation failed. Please try again — your progress is saved.",
            )
            if not isinstance(exc, HTTPException):
                try:
                    import traceback
                    asyncio.create_task(send_error_alert(
                        "JOB", f"/api/generate session={session_id}", exc, traceback.format_exc(),
                    ))
                except Exception:
                    pass
            return


async def _generation_body(db, session_id: str, extra_instr: str, user: dict | None, input_hash: str) -> None:
    background_tasks = _BG()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    # ── Re-derive inputs (same rules as the endpoint) ─────────────────────────
    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    user_profile = session.get("user_profile") or {}
    job_description = session.get("job_description") or ""
    tone = user_profile.get("preferred_tone", "Professional")
    target_role = user_profile.get("target_role", "")
    locked_facts = session.get("locked_facts") or []
    sample_cv_text: str | None = session.get("sample_cv_text") or None

    from services.tier_config_service import has_feature as _has_feature
    user_tier = (user or {}).get("tier", "free")
    if not _has_feature(user_tier, "locked_facts"):
        locked_facts = []
    if not _has_feature(user_tier, "sample_cv"):
        sample_cv_text = None

    extra_parts = []
    upload_instructions = (session.get("upload_instructions") or "").strip()
    if upload_instructions:
        extra_parts.append(f"[User instructions]: {upload_instructions}")
    if extra_instr.strip():
        extra_parts.append(f"[User instructions]: {extra_instr.strip()}")
    if extra_parts:
        existing_notes = user_profile.get("additional_notes", "")
        merged = "\n\n".join(filter(None, [existing_notes] + extra_parts))
        user_profile = {**user_profile, "additional_notes": merged}

    if not resume_text:
        raise HTTPException(422, "No parsed resume found in session.")

    has_jd = bool(job_description.strip())

    _TIER_THRESHOLDS = {"free": 70, "plus": 80, "pro": 90}
    tier_bar = _TIER_THRESHOLDS.get(user_tier, settings.pass_threshold)
    # Paid tiers are scored fairly; free/anon get the conservative calibration.
    conservative_scoring = user_tier not in ("plus", "pro")
    telemetry.start_capture()
    await gen_jobs.checkpoint(db, session_id, "scoring original")
    original_score = await _original_cv_score(db, resume_text, conservative=conservative_scoring)
    pass_threshold = min(100, max(tier_bar, int(original_score * 0.90)))
    _TIER_MAX_CYCLES = {"free": 3, "plus": 4, "pro": 5}
    max_cycles = _TIER_MAX_CYCLES.get(user_tier, settings.max_eval_cycles)

    profession_config = await resolve_profession(db, target_role)

    # ── Checkpoint resume: reuse analyzer output from a prior attempt ─────────
    job_doc = await gen_jobs.get(db, session_id)
    cp = (job_doc or {}).get("checkpoint") or {}
    if cp.get("key_skills") is not None:
        key_skills = cp["key_skills"]
        job_analyzer_calls = 0  # analyzer skipped — resumed from checkpoint
        logger.info("[generate-job] session %s reusing checkpointed key_skills (%d)",
                    session_id, len(key_skills))
    else:
        await gen_jobs.checkpoint(db, session_id, "analyzing job description")
        key_skills, user_profile = await run_job_analysis(
            db, session_id, resume_text, user_profile, job_description, user_tier, has_jd,
        )
        job_analyzer_calls = 1 if has_jd else 0
        await gen_jobs.checkpoint(db, session_id, "analyzed", {"key_skills": key_skills})

    template_id = session.get("selected_template_id") or ""

    cached_gen = await db.generation_cache.find_one({
        "input_hash": input_hash,
        "created_at": {"$gt": datetime.utcnow() - timedelta(days=7)},
    })
    cached_score = (cached_gen or {}).get("eval_summary", {}).get("min_score", 0)
    if cached_gen and cached_score >= pass_threshold:
        logger.info("[generate] Cache hit — session %s score %d >= threshold %d",
                    session_id, cached_score, pass_threshold)
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "generated_resume": cached_gen["resume_json"],
                "key_skills": key_skills,
                "final_min_score": cached_score,
                "final_all_passed": cached_gen["eval_summary"].get("all_passed", False),
            }},
        )
        await gen_jobs.complete(db, session_id, {
            "resume": cached_gen["resume_json"],
            "mode": "tailored" if has_jd else "polished",
            "cached": True,
            "eval_summary": cached_gen["eval_summary"],
        })
        return

    enabled_evaluators = _enabled_evaluators_for_tier(user_tier)
    active_evaluator_count = sum(enabled_evaluators.values())
    await check_cost_limit(db, session_id)

    template_pages = await _resolve_template_pages(db, template_id)

    # Checkpoint seeding: a resumed attempt starts the loop where the last one
    # stopped — prior best resume/score become the floor (never lost), the last
    # feedback steers the next draft, and the seeded cycle count preserves the
    # ORIGINAL tier budget across attempts (cycle >= 2 also re-enables patch mode).
    cp_cycle = int(cp.get("cycle", 0) or 0) if cp.get("best_resume_json") else 0
    initial_state = {
        "resume_text": resume_text,
        "user_profile": user_profile,
        "job_description": job_description,
        "tone": tone,
        "profession_config": profession_config,
        "locked_facts": locked_facts,
        "key_skills": key_skills,
        "sample_cv_text": sample_cv_text,
        "enabled_evaluators": enabled_evaluators,
        "pass_threshold": pass_threshold,
        "max_cycles": max_cycles,
        "template_pages": template_pages,
        "conservative_scoring": conservative_scoring,
        "cycle": cp_cycle,
        "feedback": cp.get("feedback") if cp_cycle else None,
        "resume_json": cp.get("best_resume_json") if cp_cycle else None,
        "eval_results": [],
        "eval_history": [],
        "seen_suggestions": [],
        "best_resume_json": cp.get("best_resume_json") if cp_cycle else None,
        "best_min_score": int(cp.get("best_min_score", 0) or 0) if cp_cycle else 0,
        "last_gain": 99,  # never plateau-exit purely from seeded state
        "all_passed": False,
        "min_score": 0,
        "faithfulness_warning": None,
    }
    if cp_cycle:
        logger.info("[generate-job] session %s resuming loop at cycle %d (best %s)",
                    session_id, cp_cycle, initial_state["best_min_score"])

    pipeline_timeout = 300.0
    _snap: list[dict] = [dict(initial_state)]
    _timed_out = False
    _last_cp_cycle = [cp_cycle]

    async def _stream() -> None:
        async for state in pipeline.astream(initial_state, stream_mode="values"):
            _snap[0] = state
            # Checkpoint after every completed cycle — a crash/retry resumes
            # here instead of restarting the whole loop.
            _cyc = state.get("cycle", 0)
            if _cyc != _last_cp_cycle[0] and state.get("best_resume_json"):
                _last_cp_cycle[0] = _cyc
                await gen_jobs.checkpoint(db, session_id, f"cycle {_cyc} complete", {
                    "cycle": _cyc,
                    "best_min_score": state.get("best_min_score", 0),
                    "best_resume_json": state.get("best_resume_json"),
                    "feedback": state.get("feedback"),
                })

    try:
        await asyncio.wait_for(_stream(), timeout=pipeline_timeout)
    except asyncio.TimeoutError:
        _timed_out = True
        logger.warning(
            "[generate] Pipeline timed out after %ds (tier=%s) — "
            "returning best intermediate result. session=%s cycles_completed=%d best_score=%d",
            pipeline_timeout, user_tier, session_id,
            _snap[0].get("cycle", 0), _snap[0].get("best_min_score", 0),
        )
    except Exception as exc:
        logger.exception("[generate] Pipeline failed for session %s: %s", session_id, exc)
        raise HTTPException(500, f"Resume generation failed: {exc}")

    final_state = _snap[0]

    if _timed_out and not final_state.get("best_resume_json") and not final_state.get("resume_json"):
        raise HTTPException(
            504,
            "Resume generation timed out before producing a result. "
            "Please try again — it usually completes in 60–120 seconds.",
        )

    if final_state.get("best_resume_json") is not None:
        final_state["resume_json"] = final_state["best_resume_json"]
        final_state["min_score"] = final_state["best_min_score"]
        final_state["all_passed"] = final_state["best_min_score"] >= pass_threshold

    # ── Reviewer sub-agent — post-loop polish pass ────────────────────────────
    # A second focused Sonnet call reviews the finished draft against the JD with
    # fresh eyes: framing, emphasis, verb precision, JD keyword alignment.
    # Runs only when a JD is present (tailored run) AND the loop did NOT reach
    # the tier bar — on a passing run the draft already cleared the same score
    # the user sees, and the reviewer's output is never re-scored, so running it
    # there spends a full Sonnet call on an unmeasured (possibly regressive) edit.
    # Non-fatal: keeps loop output on any failure. Skipped on timed-out runs.
    await gen_jobs.checkpoint(db, session_id, "polishing result")
    if (not _timed_out and final_state.get("resume_json") and job_description.strip()
            and not final_state.get("all_passed")):
        try:
            from services.pipeline.agents.reviewer import ReviewerAgent
            reviewed = await ReviewerAgent().run(
                resume_json=final_state["resume_json"],
                job_description=job_description,
            )
            if reviewed:
                final_state["resume_json"] = reviewed
                logger.info("[generate] Reviewer pass applied for session %s.", session_id)
        except Exception as _rev_exc:
            logger.warning("[generate] Reviewer pass skipped (non-fatal): %s", _rev_exc)

    # Actual calls used THIS attempt: analyzer (0 when resumed from checkpoint)
    # + (generator + evaluators) × fresh cycles only (seeded cycles were already
    # charged by the attempt that ran them).
    fresh_cycles = max(0, final_state["cycle"] - cp_cycle)
    actual_calls = job_analyzer_calls + (1 + active_evaluator_count) * fresh_cycles
    await increment_call_count(db, session_id, actual_calls)

    usage = telemetry.summary()
    logger.info(
        "[generate] TELEMETRY session=%s tier=%s cycles=%d min_score=%d passed=%s | "
        "llm_calls=%d in_tok=%d out_tok=%d cache_read=%d est_cost=$%.4f",
        session_id, user_tier, final_state["cycle"], final_state["min_score"],
        final_state["all_passed"], usage["llm_calls"], usage["input_tokens"],
        usage["output_tokens"], usage["cache_read_tokens"], usage["est_cost_usd"],
    )

    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "generated_resume": final_state["resume_json"],
            "eval_cycles": final_state["cycle"],
            "eval_history": final_state["eval_history"],
            "key_skills": key_skills,
            "profession_slug": profession_config.get("slug", "generic"),
            "final_min_score": final_state["min_score"],
            "final_all_passed": final_state["all_passed"],
            "llm_usage": usage,
        }},
    )

    if user:
        await increment_usage(db, str(user.get("_id", "")), actual_calls, usage["est_cost_usd"])

    eval_hist = final_state.get("eval_history") or []
    background_tasks.add_task(record_generation_outcome, {
        "first_score": (eval_hist[0]["min_score"] if eval_hist else final_state["min_score"]),
        "cycles": final_state["cycle"],
        "cost_usd": usage["est_cost_usd"],
        "passed": final_state["all_passed"],
        "tier": user_tier,
        "evaluators": final_state.get("eval_results") or [],
    })

    # Final-cycle CV-Score categories — the per-run answer to "which category
    # kept the score below the bar". The dict feeds the admin Audit tab; the full
    # list (with display names) feeds the result-page breakdown the user sees.
    cv_categories = next(
        ((r.get("categories") or [])
         for r in (final_state.get("eval_results") or []) if r.get("model") == "cv_score"),
        [],
    )
    category_scores = {c["key"]: c["score"] for c in cv_categories if c.get("key")}
    if category_scores:
        logger.info("[generate] CATEGORY SCORES session=%s %s", session_id, category_scores)
    # Categories below the tier bar, weakest first — "what blocked your target".
    blocking_categories = sorted(
        [c for c in cv_categories if int(c.get("score", 0) or 0) < pass_threshold],
        key=lambda c: int(c.get("score", 0) or 0),
    )

    if user:
        from services.audit import log_audit
        log_audit(user, "resume.generate.complete", {
            "tier": user_tier,
            "cycles": final_state["cycle"],
            "max_cycles": max_cycles,
            "min_score": final_state["min_score"],
            "category_scores": category_scores,
            "passed": final_state["all_passed"],
            "llm_calls": usage["llm_calls"],
            "tokens": usage["input_tokens"] + usage["output_tokens"],
            "cache_read_tokens": usage["cache_read_tokens"],
            "est_cost_usd": usage["est_cost_usd"],
        })

    if not final_state["all_passed"]:
        alert_payload = {
            "min_score": final_state["min_score"],
            "all_passed": False,
            "evaluator_results": final_state["eval_results"],
            "feedback_prompt": "",
        }
        background_tasks.add_task(
            send_quality_alert, session_id, alert_payload, final_state["resume_json"]
        )
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"quality_alert_sent": True}},
        )

    layout_validation = None
    if final_state.get("resume_json"):
        try:
            # Deterministic pure function — no LLM call, no latency.
            layout_validation = validate_resume_layout(
                resume=final_state["resume_json"],
                page_count=template_pages,
                source_resume_text=resume_text,
            )
            # ── Enforce the page budget ───────────────────────────────────────
            # The generator is told the limit every cycle but can still overflow.
            # On overflow, run ONE deterministic-gated corrective trim pass (cut/
            # tighten existing content, never invent) and re-validate. Bounded:
            # at most one extra Sonnet call, only when the résumé actually overflows.
            if layout_validation.get("truncated") and not _timed_out:
                try:
                    from services.pipeline.agents.generator import GeneratorAgent
                    overflow_note = (
                        f"Estimated {layout_validation.get('estimated_pages')} pages vs a "
                        f"{template_pages}-page budget. "
                        + " ".join(layout_validation.get("suggestions") or [])
                    )
                    trimmed = await GeneratorAgent().run_trim(
                        final_state["resume_json"], template_pages, overflow_note,
                    )
                    if trimmed is not final_state["resume_json"]:
                        revalid = validate_resume_layout(
                            resume=trimmed, page_count=template_pages, source_resume_text=resume_text,
                        )
                        # Keep the trim only if it actually helped the fit.
                        if revalid.get("estimated_pages", 99) <= layout_validation.get("estimated_pages", 0):
                            final_state["resume_json"] = trimmed
                            layout_validation = revalid
                            # generated_resume was persisted before this point; re-save
                            # so export/library get the trimmed version, not the overflow.
                            await db.sessions.update_one(
                                {"_id": ObjectId(session_id)},
                                {"$set": {"generated_resume": trimmed}},
                            )
                            logger.info(
                                "[generate] LAYOUT trim applied session %s: now est %s pages (budget %s), truncated=%s.",
                                session_id, revalid.get("estimated_pages"), template_pages, revalid.get("truncated"),
                            )
                except Exception as _trim_exc:
                    logger.warning("[generate] Layout trim skipped (non-fatal): %s", _trim_exc)

            if layout_validation.get("truncated") or not layout_validation.get("page_breaks_clean", True):
                logger.warning(
                    "[generate] LAYOUT — session %s: est %s pages (template %s), truncated=%s, clean_breaks=%s. Fixes: %s",
                    session_id, layout_validation.get("estimated_pages"), template_pages,
                    layout_validation.get("truncated"), layout_validation.get("page_breaks_clean"),
                    layout_validation.get("suggestions"),
                )
            elif not layout_validation.get("optimized") or layout_validation.get("page_fit") != "good":
                logger.info(
                    "[generate] Layout validation flagged session %s: fit=%s issues=%s",
                    session_id, layout_validation.get("page_fit"), layout_validation.get("issues"),
                )
        except Exception as val_exc:
            logger.warning("[generate] Layout validation failed (non-fatal): %s", val_exc)

    final_score = final_state["min_score"]
    if original_score and final_score < original_score:
        logger.warning(
            "[generate] REGRESSION — session %s: generated CV-Score %s < original %s (tier %s). "
            "Loop could not beat the upload within %s cycles.",
            session_id, final_score, original_score, user_tier, final_state["cycle"],
        )

    user_actions = None
    if not final_state["all_passed"]:
        user_actions = build_user_actions(
            eval_results=final_state.get("eval_results") or [],
            pass_threshold=pass_threshold,
            final_score=final_score,
            resume_json=final_state.get("best_resume_json") or final_state.get("resume_json"),
        )

    eval_summary = {
        "cycles": final_state["cycle"],
        "all_passed": final_state["all_passed"],
        "min_score": final_score,
        "score": final_score,
        "original_score": original_score,
        "beat_original": (not original_score) or final_score >= original_score,
        "pass_threshold": pass_threshold,
        "tier": user_tier,
        "evaluator_results": final_state["eval_results"],
        # Per-category CV-Score breakdown (same engine as the CV Score page) +
        # which categories fell below the tier bar — so the result page can show
        # the user EXACTLY why the score is what it is.
        "category_scores": cv_categories,
        "blocking_categories": blocking_categories,
        "faithfulness_warning": final_state.get("faithfulness_warning"),
        "profession": profession_config.get("display_name", "General"),
        "key_skills": key_skills,
        "layout_validation": layout_validation,
        "template_pages": template_pages,
        "user_actions_needed": user_actions,
        "timed_out": _timed_out,
    }

    if final_state.get("resume_json") and not _timed_out:
        try:
            await db.generation_cache.update_one(
                {"input_hash": input_hash},
                {"$set": {
                    "input_hash":   input_hash,
                    "resume_json":  final_state["resume_json"],
                    "eval_summary": eval_summary,
                    "created_at":   datetime.utcnow(),
                }},
                upsert=True,
            )
        except Exception as cache_exc:
            logger.warning("[generate] Failed to write generation cache: %s", cache_exc)

    await gen_jobs.complete(db, session_id, {
        "resume": final_state["resume_json"],
        "mode":   "tailored" if has_jd else "polished",
        "eval_summary": eval_summary,
        "layout_validation": layout_validation,
    })
