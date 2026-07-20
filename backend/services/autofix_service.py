"""Auto-fix service — Pro feature: close score gaps using the user's OWN data.

Orchestrates the async auto-fix job (see routers/generate.py for the HTTP
layer). Flow, per the agreed design (2026-07-18):

  1. Gather sources: original CV text + session profile + account profile.
     These are the ONLY permitted fact pool.
  2. One dedicated gap-filler call (temperature=0) proposes minimal edits,
     each citing a verbatim source_quote.
  3. The PURE validation gate (autofix_validator) applies only edits whose
     every fact traces to the sources — fabrication is structurally dropped.
  4. Re-score with the SAME CV-Score engine the builder/score page uses, then
     rebuild the eval summary + the shrunken "only you can add" list.
  5. Persist, charge usage, audit-log (visible in Admin → Audit / cost columns).

Anything not present in any source stays on the user's to-do list — the
feature never invents emails, URLs, metrics, skills, or any other fact.
"""
from __future__ import annotations

import logging
import re

from bson import ObjectId

from database import get_db
from services import autofix_jobs
from services.pipeline import telemetry
from services import generation_jobs as gen_jobs
from services.pipeline.toon import encode as toon_encode
from services.pipeline.agents.gap_filler import GapFillerAgent
from services.pipeline.agents.evaluators.cv_score import CvScoreEvaluatorAgent
from services.autofix_validator import build_source_corpus, validate_and_apply
from services.user_actions_service import build_user_actions
from services.usage_service import increment_usage

logger = logging.getLogger("cvtailora")


def build_gaps_text(eval_summary: dict) -> tuple[str, dict[str, str]]:
    """Serialise the score gaps for the gap-filler prompt.

    User-action items (the card the user sees) get stable IDs ([A1], [A2] …)
    so the filler can report per-item outcomes and the card can drop items it
    verifiably addressed / label the ones it declared unfillable. Weak-category
    CV-Score suggestions ride along untagged (they aren't card items).

    Returns (gaps_text, {tag: action_text}).
    """
    lines: list[str] = []
    tags: dict[str, str] = {}
    ua = eval_summary.get("user_actions_needed") or {}
    for i, a in enumerate(ua.get("actions") or []):
        tag = f"A{i + 1}"
        tags[tag] = a.get("action", "")
        line = f"- [{tag}] [{a.get('category', '')}] {a.get('action', '')}"
        if a.get("example"):
            line += f" (e.g. {a['example']})"
        lines.append(line)
    for r in (eval_summary.get("evaluator_results") or []):
        if r.get("model") == "cv_score":
            for s in (r.get("suggestions") or []):
                lines.append(f"- {s}")
    seen: set[str] = set()
    unique = [ln for ln in lines if not (ln in seen or seen.add(ln))]
    return "\n".join(unique[:20]), tags


def apply_gap_outcomes(
    actions: list[dict],
    tags: dict[str, str],
    applied_changes: list[dict],
    unfillable: list[dict],
) -> list[dict]:
    """Pure: fold the filler's per-gap outcomes into the rebuilt action list.

    - An action whose tag appears in a GATE-VERIFIED applied change is removed
      (the data now demonstrably exists in the resume).
    - An action whose tag the filler declared unfillable is kept but marked
      needs_user (+ the filler's reason) so the UI can explain WHY it persists.
    - An action whose tag the filler didn't mention AT ALL still gets a
      needs_user label with a generic reason. The prompt instructs the filler
      to account for every tagged gap, but LLM compliance isn't guaranteed —
      observed in prod (2026-07-20): one card item got a real reason, the
      other was silently left untouched with no explanation, reading as "the
      tool didn't even try". A card item must never look frozen after a run.
    Matching is by tag -> original action text (the rebuilt list preserves
    action texts; index positions may differ).
    """
    addressed = {tags[t] for c in applied_changes
                 for t in _GAP_TAG.findall(str(c.get("gap_id", "") or c.get("gap", "")))
                 if t in tags}
    needs_user: dict[str, str] = {}
    for u in unfillable:
        for t in _GAP_TAG.findall(str(u.get("gap_id", "") or u.get("action", ""))):
            if t in tags:
                needs_user[tags[t]] = str(u.get("reason", ""))[:200]
    unaccounted = {
        text for tag, text in tags.items()
        if text not in addressed and text not in needs_user
    }

    out: list[dict] = []
    for a in actions:
        text = a.get("action", "")
        if text in addressed:
            continue
        if text in needs_user:
            a = {**a, "needs_user": True, "why_ai_cannot": needs_user[text]}
        elif text in unaccounted:
            a = {**a, "needs_user": True,
                 "why_ai_cannot": "Not checked in this pass — try Auto-fix again."}
        out.append(a)
    return out


_GAP_TAG = re.compile(r"\b(A\d+)\b")


def _rebuild_actions(
    eval_summary: dict,
    pass_threshold: int,
    score_after: int,
    new_resume: dict,
    gap_tags: dict[str, str],
    applied: list[dict],
    unfillable: list[dict],
) -> dict | None:
    """Rebuild the user-actions card from the STABLE original suggestion pool
    (churn fix), then fold in this run's per-gap outcomes: verifiably-addressed
    items drop off, unfillable ones get a needs_user label + reason."""
    # Keep the guidance target the generation run chose (the tier's stretch
    # score, e.g. Pro 90) rather than reverting to the pass bar; guidance
    # disappears only once the STRETCH target is reached.
    prior_target = ((eval_summary.get("user_actions_needed") or {}).get("target_score")) or pass_threshold
    target = max(prior_target, pass_threshold)
    if score_after >= target:
        return None
    ua = build_user_actions(
        eval_results=eval_summary.get("evaluator_results") or [],
        pass_threshold=target,
        final_score=score_after,
        resume_json=new_resume,
    )
    ua["actions"] = apply_gap_outcomes(ua.get("actions") or [], gap_tags, applied, unfillable)
    ua["estimated_points_available"] = sum(a.get("score_impact", 0) for a in ua["actions"])
    return ua


async def run_autofix(session_id: str, user: dict | None) -> None:
    """Background task: fill gaps, validate, rescore, persist, complete the job."""
    db = get_db()
    try:
        await _run(db, session_id, user)
    except Exception as exc:
        logger.exception("[autofix] session %s failed: %s", session_id, exc)
        await autofix_jobs.fail(db, session_id, "Auto-fix failed. Please try again.")


async def _run(db, session_id: str, user: dict | None) -> None:
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session or not session.get("generated_resume"):
        await autofix_jobs.fail(db, session_id, "Generate a resume first.")
        return

    gen_job = await gen_jobs.get(db, session_id)
    eval_summary = ((gen_job or {}).get("result") or {}).get("eval_summary") or {}
    if not eval_summary:
        await autofix_jobs.fail(db, session_id, "No score report found for this session — regenerate first.")
        return

    resume_json = session["generated_resume"]
    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    session_profile = session.get("user_profile") or {}
    user_tier = (user or {}).get("tier", "free")

    # Account profile (structured experience/education/skills) is a richer fill
    # source than the session profile alone; absent for anonymous users.
    account_profile: dict = {}
    if user and user.get("_id") is not None:
        account_profile = await db.user_profiles.find_one({"user_id": user["_id"]}) or {}
        account_profile.pop("_id", None)
        account_profile.pop("user_id", None)

    gaps_text, gap_tags = build_gaps_text(eval_summary)
    if not gaps_text:
        await autofix_jobs.fail(db, session_id, "Nothing to fix — no score gaps recorded.")
        return

    telemetry.start_capture()
    score_before = int(eval_summary.get("min_score", 0) or 0)
    pass_threshold = int(eval_summary.get("pass_threshold", 0) or 0)

    # ── 1+2. Dedicated fill call ──────────────────────────────────────────────
    await autofix_jobs.stage(db, session_id, "finding facts in your data")
    profile_text = toon_encode({"session_profile": session_profile,
                                "account_profile": account_profile})
    fill = await GapFillerAgent().run(
        resume_json=resume_json,
        gaps_text=gaps_text,
        source_resume_text=resume_text,
        profile_text=profile_text,
    )
    unfillable = fill.get("unfillable") or []

    # ── 3. Faithfulness gate (pure) — unverifiable edits are dropped ─────────
    corpus = build_source_corpus(resume_text, session_profile, account_profile)
    gate = validate_and_apply(resume_json, fill.get("changes") or [], corpus)
    applied, rejected = gate["applied"], gate["rejected"]
    if rejected:
        logger.info("[autofix] session %s: gate rejected %d/%d changes: %s",
                    session_id, len(rejected), len(rejected) + len(applied),
                    [r.get("reason") for r in rejected])

    llm_calls = 1
    new_resume = gate["resume"]
    new_summary = dict(eval_summary)
    reverted = False

    if applied:
        # ── 4. Re-score with the same engine the user sees ────────────────────
        await autofix_jobs.stage(db, session_id, "re-scoring your resume")
        cv_result = await CvScoreEvaluatorAgent().run(
            resume_json=new_resume,
            job_description=session.get("job_description") or "",
            profession_config={},
            source_resume_text=resume_text,
            conservative=user_tier not in ("plus", "pro"),
        )
        llm_calls += 1
        score_after = cv_result.get("score")
        if score_after is None:  # scoring failed — keep edits, keep old score
            score_after = score_before
            logger.warning("[autofix] session %s: rescore failed, keeping prior score.", session_id)
        elif score_after < score_before:
            # ── Keep-best: never ship a WORSE resume ──────────────────────────
            # The judge is deterministic for identical text but sensitive to
            # small changes — even faithful edits can rescore lower (observed
            # in prod 2026-07-18: 5 sourced edits, 87→82 persisted). Same rule
            # as the generation loop's best-cycle collapse: resume and score
            # are a bound pair, keep the better pair. Edits are reverted, the
            # user keeps their higher-scoring version, and the report says so.
            logger.info("[autofix] session %s: rescore %s < %s — reverting edits (keep-best).",
                        session_id, score_after, score_before)
            new_resume = resume_json
            new_summary = dict(eval_summary)
            reverted = True
        else:
            categories = cv_result.get("categories") or []
            all_passed = score_after >= pass_threshold
            new_summary.update({
                "min_score": score_after,
                "score": score_after,
                "all_passed": all_passed,
                "category_scores": categories,
                "blocking_categories": sorted(
                    [c for c in categories if int(c.get("score", 0) or 0) < pass_threshold],
                    key=lambda c: int(c.get("score", 0) or 0),
                ),
                # User actions are rebuilt from the ORIGINAL evaluation's
                # suggestion pool, NOT the fresh rescore. A fresh check_resume
                # authors different improvement hints for the edited text, which
                # match different action rules — the user saw their to-do list
                # CHURN to unrelated items while the score stood still (bug
                # report 2026-07-18). With the stable pool the list can only
                # shrink: build_user_actions' check_present suppresses items
                # whose data auto-fix just inserted. evaluator_results is left
                # untouched for the same reason (a 2nd auto-fix reuses it).
                # _rebuild_actions returns None once the STRETCH target is
                # reached — guidance persists on passing-but-below-stretch runs.
                "user_actions_needed": _rebuild_actions(
                    eval_summary, pass_threshold, int(score_after), new_resume,
                    gap_tags, applied, unfillable,
                ),
            })

        # Applied edits can lengthen content — refresh the page-fit status the
        # preview shows (pure function, no LLM call, no latency).
        if not reverted and new_summary.get("template_pages"):
            try:
                from services.resume_checker_service import validate_resume_layout
                new_summary["layout_validation"] = validate_resume_layout(
                    resume=new_resume,
                    page_count=int(new_summary["template_pages"]),
                    source_resume_text=resume_text,
                )
            except Exception as exc:
                logger.warning("[autofix] layout revalidation skipped (non-fatal): %s", exc)

        if not reverted:
            await db.sessions.update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {
                    "generated_resume": new_resume,
                    "final_min_score": new_summary.get("min_score", score_before),
                    "final_all_passed": new_summary.get("all_passed", False),
                }},
            )
    else:
        score_after = score_before

    # Even a run that applied NOTHING learned something: which card items the
    # filler declared unfillable. Fold those needs_user labels in so the most
    # common repeat-click outcome ("all remaining gaps need you") is explained
    # on the card instead of looking like a silent failure (observed in prod
    # right after the outcomes feature shipped: 7/7 rejected -> no labels).
    if not applied and unfillable:
        ua = new_summary.get("user_actions_needed")
        if ua and ua.get("actions"):
            new_summary["user_actions_needed"] = {
                **ua,
                "actions": apply_gap_outcomes(ua["actions"], gap_tags, [], unfillable),
            }

    report = {
        # On a revert the edits were NOT kept — report them as candidates that
        # didn't survive keep-best, never as applied changes.
        "applied": [] if reverted else [
            {"gap": c.get("gap", ""), "path": c.get("path", ""),
             "source_quote": c.get("source_quote", "")}
            for c in applied
        ],
        "rejected_count": len(rejected),
        "unfillable": unfillable,
        "score_before": score_before,
        "score_after": new_summary.get("min_score", score_before),
        "reverted": reverted,
        "reverted_count": len(applied) if reverted else 0,
    }
    new_summary["autofix"] = report

    # Keep the generation-job result in sync so a later auto-fix (or reload)
    # reads the post-fix resume and the annotated gap list, not stale data.
    # The summary syncs even on applied=0 runs (needs_user labels + report);
    # the resume syncs only when edits were actually kept.
    if gen_job and not reverted:
        sync: dict = {"result.eval_summary": new_summary}
        if applied:
            sync["result.resume"] = new_resume
        await db.generation_jobs.update_one({"session_id": session_id}, {"$set": sync})

    # ── 5. Cost + monitoring — same surfaces as every other AI feature ────────
    # Deliberately NOT charged to the per-session AI-call cap: that cap is the
    # anonymous-generation guardrail and a Pro generation already nearly fills
    # it — charging auto-fix here starved later regenerations. Auth'd users are
    # governed by the daily/monthly USD budgets (increment_usage below).
    usage = telemetry.summary()
    logger.info(
        "[autofix] TELEMETRY session=%s tier=%s applied=%d rejected=%d reverted=%s score %s->%s | "
        "llm_calls=%d in_tok=%d out_tok=%d est_cost=$%.4f",
        session_id, user_tier, len(report["applied"]), len(rejected), reverted,
        score_before, report["score_after"], usage["llm_calls"],
        usage["input_tokens"], usage["output_tokens"], usage["est_cost_usd"],
    )
    if user:
        await increment_usage(db, str(user.get("_id", "")), llm_calls, usage["est_cost_usd"])
        from services.audit import log_audit
        log_audit(user, "resume.autofix", {
            "session_id": session_id,
            "applied": len(report["applied"]),
            "rejected": len(rejected),
            "reverted": reverted,
            "unfillable": len(unfillable),
            "score_before": score_before,
            "score_after": report["score_after"],
            "llm_calls": usage["llm_calls"],
            "tokens": usage["input_tokens"] + usage["output_tokens"],
            "est_cost_usd": usage["est_cost_usd"],
        })

    await autofix_jobs.complete(db, session_id, {
        "resume": new_resume,
        "eval_summary": new_summary,
        "report": report,
    })
