# Session Handoff — TailorMyCv

> Rolling context for continuing work. **Last updated: 2026-06-11.**
> Branch: `main`. Railway auto-deploys both services on push.

This is the broad handoff. CV-score-preview specifics live in `docs/CV_SCORE_PREVIEW_CONTEXT.md`.

---

## What shipped in the 2026-06-11 session — LLM cost reduction + correctness

Focus: reduce per-run LLM cost without sacrificing quality. Plan agreed with user before
final changes; user decisions recorded inline.

### 1. URGENT — generator model retirement fix
- `claude-sonnet-4-20250514` **retires 2026-06-15**. Swapped generator + anthropic evaluator
  to `claude-sonnet-4-6` (drop-in, same $3/$15 price) in `config.py` defaults and local `.env`.
- **ACTION REQUIRED: update `GENERATOR_MODEL` + `ANTHROPIC_EVALUATOR_MODEL` on Railway before June 15.**
- New `job_analyzer_model` setting — **kept on Sonnet by user decision** ("Haiku calls are very
  bad… need to use better model"); do not downgrade quality-bearing calls to Haiku.

### 2. Multi-provider evaluators restored (user decision — reduce single-model bias)
- `_TIER_EVALUATORS` in `routers/generate.py`: Free = cv_score; Plus = cv_score + OpenAI
  (gpt-4o-mini); Pro = cv_score + OpenAI + Google (gemini-2.5-flash). Run in parallel — cheap, no
  latency. `.env`: OPENAI/GOOGLE_EVALUATOR_ENABLED=true, GOOGLE_EVALUATOR_MODEL→gemini-2.5-flash.
- Sonnet anthropic evaluator stays OFF (generator is already Sonnet; self-grading adds cost not signal).

### 3. Prompt caching — static human-message prefix (former deferred opt #5)
- `prompts/anthropic.py`: new `_stable_input_blocks()` + `_cached_human()`. Résumé/profile/JD/
  sample/skills now form ONE byte-identical cached prefix across generator/patch/section calls;
  per-cycle content (feedback, current sections, output schema) sits in an uncached suffix.
  Cycles 2+ and patch calls read the prefix at ~0.1× input price.
- Cache-minimum gotcha learned from current docs: **Haiku 4.5 minimum cacheable prefix is 4096
  tokens** — the CV-score Haiku prompts (~2.4k tok) can never cache; their `cache_control` markers
  are silent no-ops. Output tokens dominate those calls, not input.

### 4. Telemetry now covers ALL calls (budget caps were under-charging ~40-50%)
- `telemetry.record_anthropic()` records raw AsyncAnthropic responses; instrumented
  check_resume / extract / grammar (`cv_score_quality|extract|grammar` agents) + the reviewer.
- `start_capture()` moved to before the FIRST llm call in `/generate` (original-score + job
  analyzer were previously uncaptured; section-regen path no longer re-captures).
- Audit-log data that drove this (9 runs): avg $0.076 tracked vs ≈$0.13–0.16 true; all 9 runs
  FAILED their tier bar (65–78 vs Plus 80/Pro 90) and plateau-exited at 2 cycles.

### 5. Reviewer gate
- Post-loop Sonnet reviewer now SKIPPED when the loop already passed the tier bar — its output is
  never re-scored, so on a passing run it was an unmeasured (possibly regressive) extra Sonnet call.
  Still runs on failing runs.

### 6. Layout validator → pure function (was a Haiku call)
- `validate_resume_layout` in `resume_checker_service.py` is now deterministic (line-count
  heuristics the old prompt asked the LLM to compute). Sync, no `anthropic_key` param. Removes
  1 Haiku call + 3–5 s per generation. Unit tests: `tests/test_layout_validator.py` (7 passing).
- Dead prompt keys `cv_score_validate_system/prompt` removed from `prompt_store.py` +
  `routers/admin.py` DEFAULTS.

### Verified
- 7/7 unit tests pass; full backend imports clean; smoke test confirms cached message structure
  + byte-identical prefixes across generator/patch/section builders.
- Mongo `prompt_overrides` is EMPTY — all live prompts are the code defaults.

### Process note (user feedback)
- **Plan first, get explicit agreement, then implement.** Do not start multi-file changes from a
  "come up with a plan" request without confirming the steps.

### Later same session (continued)
- **Prompt quality pass over all 17 keys** (user-approved): generator prompt rewritten around the
  REAL CV-Score weights (exp 25/skills 20/ats 20/summary 15/design 10/contact 7/edu 3); 1-page
  rules aligned with grader checks (3-sentence summary, exactly 8 skills); OpenAI/Gemini evaluator
  bases got explicit 0-100 calibration bands + "don't deduct for qualifications the candidate
  genuinely lacks"; CV-Score calibration contradiction fixed (one ladder: 45-65 typical / 65-84
  strong / 85+ excellent — note this shifts user-facing upload scores slightly); check count 51→52.
- **Per-run score diagnostics**: cv_score evaluator returns per-category scores → flow through
  aggregator into eval_history/session/quality-alert; `category_scores` added to the
  resume.generate.complete audit entry. Answers "which category blocked the bar" per run.
- **/health now returns the Railway commit SHA** (RAILWAY_GIT_COMMIT_SHA) — deploys are
  externally verifiable. Used it to confirm 3bf1b42 live in prod.
- **All prompt overrides DELETED from Mongo** (verified identical to deployed code first) —
  code defaults are the single source of truth again; admin "Override active" badges gone.
- Pushed: 27fa495, 312c3cb, 2ef0fcf, d60ff48, 3bf1b42. Railway deploy of 3bf1b42 confirmed.
- STILL PENDING: Railway env vars GENERATOR_MODEL/ANTHROPIC_EVALUATOR_MODEL → claude-sonnet-4-6
  (override code defaults; old model 404s June 15) + optional OPENAI/GOOGLE_EVALUATOR_ENABLED=true.

### Deferred / next
- Trim in-loop CV-score output (54 check labels echoed every cycle ≈ 1.5k wasted output tokens)
  — biggest remaining cut; gated on the now-accurate telemetry + the score-unification decision.
- Watch new telemetry: cache_read share after the prefix caching, true $/run, effect of the
  restored OpenAI/Google evaluators on cycles-to-pass (min over mixed rubrics may raise cycles).
- All 9 recent runs failed the tier bar → first-pass quality is the real cost lever; revisit
  generator prompt/model settings (e.g. Sonnet 4.6 `effort`) with eval-harness data.

---

## What shipped in the 2026-06-07 session — pipeline correctness + observability + CI

Focus: fix two silent reliability bugs in the evaluator-optimizer loop, wire LangSmith tracing, add a CI regression gate, and establish a golden dataset for LLM-as-a-Judge evaluation. Also enforced coding principles in CLAUDE.md.

### 1. Aggregator feedback-loop bug fix (`services/pipeline/agents/aggregator.py`)
- `aggregate_node` filtered `evaluator_results` into `valid_results` for score calculation but then
  iterated over `evaluator_results` again when building the generator feedback prompt.
- Result: on any evaluator failure, the raw error string (e.g. `"Evaluator error: connection
  timeout"`) appeared in the generator's improvement suggestions — noise the generator would act on.
- **Fix:** feedback-building loop now iterates `valid_results` only. Error-free evaluator drops
  out silently; generator receives only scored feedback.

### 2. Evaluator transient-failure resilience (`evaluators/anthropic.py`, `openai.py`, `google.py`)
- All three evaluator SDK clients were constructed with `max_retries=0` — the default disables SDK
  retry entirely. A single transient 503/rate-limit immediately set score=None, shrinking the
  consensus pool.
- **Fix:** `max_retries=2` on each SDK client constructor. SDK handles exponential backoff —
  zero application-level retry code added.

### 3. Dead code removal (6 files deleted)
- `backend/services/evaluators/` (`__init__.py`, `base.py`, `claude_evaluator.py`,
  `gemini_evaluator.py`, `gpt4_evaluator.py`) — pre-LangGraph evaluators, fully superseded.
- `backend/services/aggregator.py` — standalone aggregator with hardcoded `PASS_THRESHOLD = 95`
  (never used; conflicts with tier-aware dynamic thresholds). Deleted.
- All 6 files were import-dead after the LangGraph refactor.

### 4. `agent_memory.py` silent failure logging
- Changed `except Exception: pass` to `except Exception as exc: logger.debug(...)`.
- Added missing `import logging` + `logger = logging.getLogger(__name__)`.

### 5. LangSmith tracing wiring
- Added `langsmith_api_key` + `langsmith_project` to `config.py`.
- Added `_configure_langsmith()` in `main.py` — sets LangChain env vars at startup when key
  is present; no-op when absent. No instrumentation code in pipeline nodes (LangGraph auto-detects).
- Added `langsmith>=0.1.0` to `requirements.txt`.
- To enable: set `LANGSMITH_API_KEY` + `LANGSMITH_PROJECT` in `.env`.

### 6. GitHub Actions CI regression gate (`.github/workflows/eval.yml`)
- New workflow triggers on pushes to `main` that touch `backend/services/pipeline/**`,
  evaluators, or `backend/tests/**`.
- Runs the eval harness against `backend/tests/fixtures/sample_cv.txt` (free tier, 1 attempt).
- Exits 1 (CI fails) if generated score < original score. Uploads JSON report as artifact (30 days).
- Estimated cost: ~$0.05–0.10 per run (1 Sonnet call × 3 cycles).
- **Requires:** `ANTHROPIC_API_KEY` secret set in GitHub repository settings.

### 7. Golden CV fixture (`backend/tests/fixtures/sample_cv.txt`)
- Realistic mid-level software engineer CV (Alex Johnson) with intentional weaknesses:
  no LinkedIn URL, no quantified metrics, vague summary language.
- Used as a fixed non-trivial input for CI — the pipeline always has meaningful improvements to make.

### 8. LangSmith dataset export script (`backend/tests/export_to_langsmith.py`)
- Reads all `harness_*.json` reports from a directory and uploads each tier result as a
  LangSmith example to dataset `tailormycv-golden` (creates dataset if absent).
- Run after any harness session to grow the golden dataset from real executions.
- Usage: `python tests/export_to_langsmith.py /tmp/harness_results/ [--dataset NAME]`
- Requires only `LANGSMITH_API_KEY`.

### 9. Coding principles added to `CLAUDE.md`
- Added full "Coding behaviour principles" section with 4 rules: Think Before Coding, Simplicity
  First, Surgical Changes, Goal-Driven Execution.
- These apply every session — Claude reads CLAUDE.md on start and enforces them.

---

## What shipped in the 2026-06-06 session — tailoring pipeline cost/quality + daily budgets

Focus: make the resume-tailoring pipeline hit its tier quality bar reliably while controlling cost, and add account-level spend guardrails.

### 1. Quality / loop correctness (`services/pipeline/`)
- **Returns the BEST cycle, not the last.** The refine loop is non-monotonic (observed min_score `[72,82,75]`). `aggregate_node` tracks `best_resume_json`/`best_min_score`; `generate.py` collapses `final_state` onto the best before persisting/returning.
- **Tier-aware refinement budget** — `_TIER_MAX_CYCLES = {free:3, plus:4, pro:5}` in `generate.py`, threaded as `state["max_cycles"]`; `should_continue` reads it (falls back to `settings.max_eval_cycles`).
- **Tier pass thresholds** — `{free:75, plus:80, pro:90}`.
- **Plateau early-exit** — `should_continue` stops after ≥2 cycles when a cycle gains `< _PLATEAU_MARGIN (2)`; since we return best, a stalled cycle is wasted spend. `aggregate_node` records `last_gain`.
- **Faithfulness check** in all 3 evaluator base prompts (verify tailored résumé vs ORIGINAL; cap score at 40 + #1 suggestion on fabrication). Original résumé plumbed via `faithfulness_user_block`.

### 2. Cost levers
- **Anthropic prompt caching** — `_cached_system()` in `prompts/anthropic.py` marks all builder system prompts (generator, job analyzer, Anthropic evaluator) with `cache_control` (~90% input discount on cache hits across cycles/requests).
- **Per-call telemetry** — `services/pipeline/telemetry.py` (contextvar collector + pricing table). Every agent calls `record(...)` after `ainvoke`. `generate.py` calls `telemetry.start_capture()` then `summary()` → logged, persisted on session (`llm_usage`), and written to `audit_log` as `resume.generate.complete` with `cycles/max_cycles/tokens/llm_calls/est_cost_usd`.
- **Rubric-aware generator (opt #1)** — generator system prompt now states the weighted evaluator rubric (JD-align 30 / quantify 25 / verbs 20 / summary 15 / structure 10) so the FIRST draft targets the gate → higher first-pass score → fewer cycles.
- **Agent memory / self-learning** — `services/agent_memory.py`: per-agent doc in `agent_memory` collection. After each run (background, no LLM) it tallies the weaknesses evaluators flagged + scores/cycles/cost, derives "worked / didn't / improve" lessons. The generator injects its top improvement hints into its prompt (`get_generator_memory_text`, after ≥5 runs) so it pre-empts recurring weaknesses and converges in fewer cycles. Read-only **admin → User Management → Agent Memory** tab (`GET /admin/agent-memory`). Seeded at startup.
- **DEFERRED (opts #2–#5) — decide once we have metrics.** Per-criterion sub-score feedback; section-level refine (regenerate only the weakest section); cheap-evals drive refine + Sonnet panel only as final gate; cache the static résumé/JD blocks in the human messages. These rewire the scoring loop, so we are **intentionally waiting on telemetry** (audit log now records cycles + $/run): read the real average cycles-to-90 per tier first, then implement #2–#4 data-driven as one verified change. #4 (drop Sonnet eval from refine cycles) is the biggest remaining single cut.

### 3. Per-user cost budgets — daily + monthly (account-level guardrail)
- **`services/usage_service.py`** — one doc per (user, UTC month) in `ai_usage` (month totals + per-day breakdown; TTL-indexed via `expires_at`). `check_budget()` enforces BOTH caps (429 before any LLM cost), `increment_usage()` charges day + month after each run (full + section-regen paths). Anonymous users fall back to the per-session cap.
- **Limits are Mongo tier config** — `daily_cost_cents` + `monthly_cost_cents` in `DEFAULT_LIMITS`/`LIMIT_LABELS`. Defaults: Free 25¢/50¢, Plus $1/$10, Pro $2/$20 (monthly ≈ subscription price = never-spend-more-than-paid ceiling; daily rations it). All admin-editable. `load_config` **backfills** missing keys into an existing `tier_config` doc (else `get_limit` → 0 = blocked) and persists. `PricingTiers` shows ~N tailored resumes/mo (monthly budget ÷ `EST_TAILOR_COST_CENTS`); `config.ts TIER_LIMITS` kept in sync.
- **NOTE:** sustainable budgets depend on per-generation cost coming down — see the cost-optimization plan (reduce cycles, drop Sonnet evaluator from refine cycles, cache the original-résumé block). Not yet implemented.

### 4. Prompts fully Mongo-overridable
- `_page_rules` extracted to `generator_page_rules_1page` / `generator_page_rules_2page` prompt keys (`prompt_store.py` + admin `DEFAULTS`). (Profession `scoring_criteria`/contexts were already DB-sourced via the `professions` collection.)

### 5. Admin dashboard UX
- **Audit tab**: new **Cycles (taken/max) · LLM Calls · Tokens · Est. Cost** columns.
- **Per-column filters** on Users + Audit tables (reusable `ColFilterText`/`ColFilterSelect`), replacing the separate Users filter bar.

**Deferred:** extend telemetry to CV-score calls + latency capture; measure real cache-hit rate; cache the static original-résumé block in evaluator human messages; `**bold**` JD-keyword rendering in generator output (needs renderer support across HTML/DOCX/PDF). Backend restart required to load these (runs without `--reload`).

---

## What shipped in the 2026-06-04 session

### 1. Resume templates are now DATA, not code
- 20 templates migrated to the **`cv_templates`** MongoDB collection: each a complete **standalone HTML doc** with logic-less **Mustache** placeholders + a **`docx_config`** (layout/header/heading/font/accent knobs).
- Rendering lives once in `frontend/src/lib/cvTemplates.ts` (`render` + `renderCtx`; the `splitExtra` extra-section routing moved here). `templateHtml.ts` `getTemplateHtml()` renders the stored HTML (the 20 JS generators remain only as an emergency fallback).
- **DOCX download** is config-driven: `services/docx_templates.py` reads `docx_config` from the DB doc — a new admin/AI template downloads as a real Word doc with no code change. PDF (`reportlab`) was already template-agnostic.
- **Admin → Prompts & Templates → Resume Templates**: edit HTML + metadata + DOCX knobs, enable/disable, **Show in CV Score** flag, copy/download standalone `.html`, and **AI-generate** a template from a prompt (one focused Anthropic call → `{html, docx_config, suggested_metadata}`) with **eval gate** (`validate_template_html` / `normalize_docx_config`) + **telemetry** logging.
- Backend: `routers/cv_templates.py`, `routers/admin_cv_templates.py`, `services/cv_template_service.py`, `services/cv_template_seed_data.py`, `scripts/seed_cv_templates.py`. Auto-seeds at startup (`main.py` lifespan).
- **Legacy DOCX-template system REMOVED**: deleted `routers/templates.py`, `services/template_service.py`, `seed_templates.py`, `models/template.py`, the `templates` collection usage, the `/api/templates` endpoints, and the admin DOCX tab.

### 2. CV Score — 8th category + admin-editable prompts
- New **Grammar & Spelling** category (the 8th → **54 checks**). Dedicated `check_grammar()` in `resume_checker_service.py` runs in the `routers/resume.py` `asyncio.gather`. Returns a category-shaped dict (`key="grammar"`) with the exact corrections in `improvements`. **Factored into the overall score** (15% blend in `resume.py`).
- **All CV-score prompts are now admin-editable** (no deploy): quality, grammar, preview-extractor, layout-validator (system + user). Registered in `services/prompt_store.py` (`PROMPT_KEYS` + `PROMPT_CATEGORIES="cv_score"`), defaults imported into `routers/admin.py` `DEFAULTS`. Resolved at call time via `get_override()` with a **`_safe_format` fallback** so a broken edit can't break scoring. Editable under **Admin → Prompts & Templates → CV Score Prompts**.

### 3. Admin dashboard overhaul
- **Grouped nav** (two levels): **User Management** (Users · Audit Log) · **Prompts & Templates** (CV Builder Prompts · CV Score Prompts · Professions · Resume Templates) · **Feature Controls** (Tiers & Pricing · System). Driven by `TAB_META` + `GROUPS` in `frontend/src/app/admin/page.tsx`.
- New **System** tab — app-wide master switches. `system_config` collection + `services/system_config_service.py`; `GET/PUT /api/admin/system-config`. The **Daily Job Alerts** toggle makes `alert_scheduler.run_daily_alerts()` skip the whole run.
- **Audit log expanded**: now logs user/tier/superadmin changes, deletes, template + prompt edits, resume generate/export, system-config changes (`log_audit` added across `admin.py`, `generate.py`, `export.py`, `admin_cv_templates.py`).
- **Numeric limits** unlimited UX: blank / `unlimited` / `-1` / `∞` button all mean unlimited (`setLimit` in admin page).

### 4. UI polish
- **No LLM vendor names** anywhere user-facing → "multi-model AI" (footer, site metadata, builder pages).
- **Colourful CV-score "What we'll analyse" cards** (per-category accent via `CATEGORY_ACCENT` in `cv-score/page.tsx`) + the new Grammar card.

---

## AI-engineering directive (applies app-wide)
Per `CLAUDE.md`: every AI feature must build in **evals (validation gate), context engineering, optimized calls (caching/model choice), monitoring (telemetry + audit), testing**. The template AI-generator, CV-score grammar check, and pipeline loop all follow this pattern.

**AI-engineering checklist status (2026-06-07):**
| Standard | Status |
|----------|--------|
| Evals / validation gate | ✅ `ResumeValidator`, `validate_template_html`, eval harness + CI gate |
| Context engineering | ✅ Prompt caching, TOON, focused system prompts, PATCH mode, memory injection |
| Optimized LLM calls | ✅ Haiku for extract/validate, Sonnet for generate/eval, max_tokens bounded, `max_retries=2` |
| Monitoring | ✅ Per-call telemetry (`telemetry.py`), audit_log entries, LangSmith traces (opt-in) |
| Testing | ✅ Eval harness (`pipeline_harness.py`), CI regression gate, golden fixture, LangSmith dataset |

---

## Current local dev state
- Backend on `:9000` (uvicorn, no `--reload`), frontend on `:4000` (`next dev`). **Dev-bypass auth ON** (`DEV_BYPASS_AUTH=true` / `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`) → admin accessible; api.ts seeds a `dev-pro` token at module load.
- No new env vars needed; `cv_templates` + `system_config` auto-seed/create on startup.
- **LangSmith tracing** (optional): set `LANGSMITH_API_KEY` + `LANGSMITH_PROJECT` in `.env` to enable.
- **CI regression gate**: set `ANTHROPIC_API_KEY` as a GitHub repository secret to enable the eval workflow.

## Gotchas learned this session
- **Windows `uvicorn --reload` is flaky** — it showed updated source but ran old bytecode. Restart the backend explicitly after backend edits rather than trusting reload.
- **Don't run `npm run build` while `next dev` is running** — they share `.next` and it corrupts the dev server (causes 404s). Clear `.next` + restart dev if it happens.
- **Motor `Database` objects forbid `bool()`** — use `db if db is not None else get_db()`, never `db or get_db()`.
- **`mcp__github__push_files` cannot delete files** — use `mcp__github__delete_file` separately for each file to remove.
- **Local git desyncs after MCP pushes** — MCP creates commits on remote. After a push, run `git fetch origin main && git reset --hard origin/main` to resync local.

## Pending / deferred (see memory for full list)
- Verify **extra-section rendering in DOCX export** (preview handles it; DOCX may not).
- **Jobs Applied tracking** (planned autonomous job-application agent).
- **Billing/payment processor** (tiers are DB-driven; no payments yet).
- **Per-criterion sub-score feedback** — evaluators return a single score today; per-rubric-axis scores would steer the generator more precisely (deferred: wait for telemetry data on which categories fail most).
- **Drop Sonnet evaluator from refine cycles** — use Haiku for mid-cycle scoring; Sonnet only as final gate. Biggest remaining cost cut. Deferred until telemetry shows average cycles-to-pass per tier.
- **Cache static original-résumé/JD block in evaluator human messages** — Anthropic human-message caching.
- **Background job architecture** — needed before adding LangGraph checkpointers (persist pipeline state across restarts/crashes for long-running Pro runs).
- Audit log: retention/TTL, search/filter.

## Uncommitted local files (not pushed)
`competitor_features.md`, `prompts/`, `.claude/settings.local.json`, and this handoff doc — left out of the commit intentionally.
