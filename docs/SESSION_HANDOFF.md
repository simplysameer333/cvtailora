# Session Handoff — CVTailora

> Rolling context for continuing work. **Last updated: 2026-07-09.**
> Branch: `main`. Railway auto-deploys both services on push.

This is the broad handoff. CV-score-preview specifics live in `docs/CV_SCORE_PREVIEW_CONTEXT.md`.

---

## What shipped in the 2026-07-09 session — pending-features programme (Phases 0–3)

Plan agreed with user up front (agent J5/J6, credit packs, country formats, multi-language
all explicitly deferred). Commits: `1d6c711`, `97b6fc8`, `00be0f0`, `f80fc4d`, `7c70db7` + docs.
NOT pushed. New standing user directives: **modular separation/SOLID (new module per
functionality, no very large files)** and **no hardcoding — config/colour/role data lives in
MongoDB with admin edit surfaces**.

### Phase 0 — job-alerts vs Find Jobs gap (bug fix)
- Digest was re-fetching the same relevance top-10 daily; `seen_job_ids` dedup starved emails.
  Now queries `date_posted=month` (measured on the user's real alert: 3days/week→0 jobs).
- `num_results` was NOT a JSearch param (silent no-op both call sites) — removed; Find Jobs
  `page_size` now maps to real `page`/`num_pages`; quota counts one call per page fetched.
- Tests: `tests/test_jsearch_params.py`.

### Phase 1 — quick wins
- **J3 match %**: deterministic scorer `services/job_match_service.py` (pure, tested) annotates
  `/jobs/search` per user AFTER the shared cache; `JobMatchBadge` (colour dot scale). Recalibrated
  on user feedback: evidence ladder (25/pt, saturates at 4), max-favouring 70/30 blend, sqrt curve;
  title synonyms (vp→vice president…) are DATA in `system_config.match_token_synonyms`.
  Match % is display-only — never feeds the generator.
- **Match filter panel** (replaced J9 source chips — user decision; SourceFilterChips deleted):
  `MatchFilterChips` in the desktop side rail under Profile Completeness, chips on mobile.
- **Public CV sharing**: `routers/resume_share.py` — revocable unguessable tokens
  (`shared_resumes`), public `/api/share/{token}` (+`/file`), `/share/[token]` page,
  `ShareResumeModal`, share state in ResumeLibrary. Revoke = hard delete; re-share mints a NEW token.
- **OCR fallback**: `services/ocr_service.py` — RapidOCR (pure pip, no tesseract/poppler,
  Railway-safe; `rapidocr-onnxruntime==1.2.3`). Parser falls back when PDF text layer <100 chars.
  End-to-end test with a generated image-only PDF.

### Phase 2 — J4 auto-assisted application tracker
- Reuses `saved_jobs` (a saved job = stage-"saved" application). Pipeline saved→applied→
  interview→offer (+terminal rejected). Pure rules in `services/application_service.py`
  (auto-advance never downgrades; monotonic funnel), router `routers/applications.py`
  (PATCH status / POST mark-applied / GET stats).
- Auto-capture: Apply click→applied; Tailor click→applied+tailored (jobs page handlers).
- UI: **Applications tab** on Find Jobs (`ApplicationTracker` — stat tiles double as filters,
  `ApplicationStatusSelect` per row); `ApplicationFunnelCard` on Analytics.
- Fixed pre-existing str(uid)-vs-ObjectId bugs: analytics `jobs_saved` AND `/account/stats`
  `saved_job_count` (both always counted 0).

### Phase 3 — templates & preview
- **Colour-scheme variants (fully data-driven, zero hardcoding)**: global
  `system_config.template_accent_palette` (hex-validated; Admin → System → "Template Colour
  Palette" editor card) with per-template `accent_variants` override (admin templates PATCH).
  Generic recolour — `applyAccent()` swaps the template's base accent hex in rendered HTML;
  DOCX `apply_accent_override()` (sidebar/banner follow only when equal to accent). Accent rides
  `PATCH /sessions/{id}/template` → `selected_accent` → DOCX export. Step 4: `AccentSwatches`
  in template modal (live recolour) + selected banner; localStorage `cvtailora_accent`.
  Known v1 limit: only exact base-hex occurrences swap (derived tints keep their hue).
- **Missing-sections prompt**: `MissingSectionsNotice` above CV-score template previews when the
  extractor found no contact/summary/skills/experience/education.
- **DOCX extra-sections VERIFIED** (old doubt settled): `tests/test_docx_extra_sections.py`
  renders + reads back all 4 layout families — sections present (headings upper-cased).

### Docs retired this session (user decision)
`COMPARISON.md` + `IMPROVEMENTS.md` deleted (fully implemented historical records);
`competitor_features.md` deleted after migrating its outstanding backlog here (below).

### Outstanding product backlog (migrated from competitor_features.md)
- **J5+J6 auto-apply AI agent** (largest build; ApplyChoiceModal groundwork + J4 tracker schema ready)
- **One-time credit packs** — blocked on billing/payment processor
- **WYSIWYG live editor** (high effort)
- **Country-specific formats** (region-aware template defaults) — deferred by user 2026-07-09
- **Multi-language output** (FR/ES/DE/AR) — deferred by user 2026-07-09
- **Student / enterprise pricing** (needs billing)
- **Action-verb suggestions in preview editor**

### Deferred infra (decided 2026-07-11)
- **UAT / pre-prod environment** — DEFERRED. NOTE: `tailormycv-frontend-production.up.railway.app`
  and `www.cvtailora.com` are the SAME deployment (railway URL is an alias), NOT two environments —
  cannot be used as UAT vs Prod. A real UAT needs: a separate Railway environment, a **separate DB**
  (`cvtailora_uat` — the app hardcodes `client.cvtailora` in `database.py`, so first make the DB name an
  env var, ~10 lines), separate secrets/URL (e.g. `uat.cvtailora.com`), and a branch (`develop`→UAT,
  `main`→Prod). `.env.uat` stub already exists. Cost: a permanent UAT ≈ doubles Railway resources.
  Recommended lighter alternative when picked up: **Railway PR/preview environments** (ephemeral per-PR,
  torn down on merge) over an always-on UAT, given solo/Hobby stage.

---

## What shipped in the 2026-07-05/06 session — full UI redesign + JobBuddy-inspired features

Driven by a competitor walkthrough (JobBuddy AI job-application agent — features catalogued as
J1–J9 in `competitor_features.md`). Iterated live with the user across many feedback rounds.

### 1. Theme + layout (app-wide)
- **Palette** (`tailwind.config.ts`): `brand` = deep-teal scale (900 `#0f3d3e`), `teal` = emerald CTA
  scale (500 `#10b981`), `surface` `#fafaf7` body bg, amber (Tailwind default) for scores/stats.
  Full 50–900 scales — the old config was missing 200/300/800 so those classes silently no-oped.
- **`SidebarShell`** wraps ALL app pages incl. `/cv-score`: common sticky `Navbar` (logo hard-left,
  nav CENTERED with roomy spacing, account hard-right; surface-blended w/ backdrop-blur — no hard
  white bar), deep-teal collapsible sidebar (authOnly items show disabled+lock for signed-out
  visitors and link to /auth/login), **Daily AI budget widget** (new `GET /api/account/usage`),
  single compact `Footer` (same on every page, visible on mobile, no top margin — a margin forced
  scrollbars on fitting pages). Only `/` still uses AppShell.
- **NO width caps on app pages** (user's screen ~2560 CSS px; a max-w-[1500px] workspace was tried
  and rejected): content anchors to the sidebar `w-full`; side rails
  (`xl:grid-cols-[minmax(0,1fr),300–420px]`) and side-by-side textareas fill the width.
- Landing: full-bleed deep-teal hero, two-column (copy left / static CV-Score product card right —
  no hover transform), How-It-Works = compact numbered strip, feature showcase grid (same
  left-header alignment), pricing. "Built with multi-model AI" and all user-facing "multi-model"
  phrasing REMOVED (backend had none).

### 2. Profile rebuild (JobBuddy J1+J2)
- Backend: `services/profile_completeness.py` — pure scorer (weights sum 100; 8 checklist items),
  8 unit tests in `tests/test_profile_completeness.py`. Profile doc + `ProfileBody` gained
  structured `experience/education/projects/certifications`; `_serialize_profile` embeds
  `completeness`; `_ai_prefill` extracts the new arrays too (12k chars in / 3k tokens out).
- Frontend: profile page = left rail (completeness ring + jump-to-fix checklist + upload strip)
  + 6-tab editor. Client mirrors the scorer (`computeCompleteness`) for live ring updates —
  **weights must stay in sync with the backend**. Type gotcha: `ProfileExperience/...` in api.ts,
  NOT `ExperienceItem` (that's the CV-extractor shape).

### 3. Shared `ResumeLibrary` component (+ preview/apply modals)
- `components/ResumeLibrary.tsx` — one component everywhere resumes appear: "full" variant
  (upload/rename/delete/download/preview; profile page, full-width section) and "picker" variant
  (CTA per row; builder upload "Use this resume", cover letter + interview prep "Copy into form").
  Single item spans full width; 2-col only with multiple items. `onLoaded` lets hosts adapt copy.
- `ResumePreviewModal` — authenticated blob fetch → inline PDF iframe (thumbnails kept for page
  nav) or resume_text fallback for DOCX/tailored; scroll-locked overlay.
- Jobs page cards: actions right-aligned, bookmark extreme right; "Apply with Saved" button removed
  — "Tailor Resume" opens ResumePickerModal (covers both paths). "Apply" opens `ApplyChoiceModal`
  (manual → new tab; "Apply Automatically with AI Agent" shown as COMING SOON ahead of J5).
- Builder preview panel (`EvalQualityPanel`): evaluator chips + "Optimized over N iterations" line
  removed — final **CV Score N/100** + label + category breakdown only.

### 4. Analytics page + full metric capture (J-adjacent)
- New `/analytics` under ACCOUNT in sidebar: compact stat strip, activity-breakdown donut +
  30-day histogram + resume usage + quality trend (all dependency-free SVG), then **Automated
  activity feed LAST with fixed max-h-80 + internal scroll**. (Category-strengths and job-search
  cards were built then removed on user decision — analytics is about automated actions only.)
- `GET /api/account/analytics` — audit-log-based counts (so numbers match the feed) + 30-day
  daily aggregation. **Every metric now has a capture path**: alert_scheduler logs
  `job_alert.email_sent` (with the jobs sent) / `email_no_results`; cover_letter + interview_prep
  generation log audits; `interview_prep.email_sent` on the email endpoint; exports/cv_score/
  saved/seen already existed.

### 5. Interview Prep upgrades + page identities
- Question count selector (5/10/15 — `_MIXES` in `interview_prep_service.py`; count override rides
  in the user message so the admin-overridable system prompt is untouched), additional-context
  field, **"Email me this pack"** → `POST /api/interview-prep/email` (Brevo, deep-teal template,
  audit-logged). Cover Letter = deep-teal identity band, Interview Prep = emerald (portal palette
  only — sky/violet were rejected).

### 6. Misc fixes
- Template-page preview modal: body scroll locked + overscroll-contain (was scrolling the gallery).
- Admin tables: `overflow-x-auto` wrappers (no page-level horizontal scroll on mobile).
- Mock jobs got real-ish apply links so the full card UI shows in dev.
- CV Score run button: standard size, centered (was a full-width bar).
- Logo: `variant="dark"` white tile for the teal sidebar; new palette hex in the wordmark.

### Decisions / notes
- **Step order stays Upload → Profile → Job → Preview → Template.** Flipping Template before
  Preview would let trim-enforcement target the real page budget — flagged as possible follow-up.
- Deferred: template-preview "all sections present else ask user"; J3 job match %; J4 application
  tracker; J5 auto-apply agent (modal UI groundwork done).
- Commits `7dcab0f`/`bb44609` (user-made, "updates on UI to user wider areas") carry most of this;
  the final polish round (analytics restructure, footer/navbar blend, library width) follows.

---

## What shipped in the 2026-06-18 session — builder score = CV-Score, tier calibration, page enforcement

Triggered by a report: a Plus résumé showed **40/100** in the builder but **75/100** on the
CV Score page (same résumé), and the 3-page output overflowed a 2-page template. Root causes +
fixes below. **Plan was agreed with the user before implementing.** Backend tests + frontend tsc green.

### 1. Headline score = the cv_score engine, NOT min() across the panel
- `aggregator.py`: the headline (`min_score` field, kept for compatibility) is now the **cv_score
  evaluator's score** — the same `check_resume` engine the CV Score page uses — so builder == page.
  Previously `min(panel)` let the OpenAI/Google evaluators (different JD rubric + a hard
  fabrication cap at 40) hijack the headline (75 shown as 40). `all_passed` now gates on that
  headline. Falls back to `min()` only if cv_score is somehow absent.
- OpenAI/Google now drive **feedback + a non-blocking faithfulness flag** only. The flag fires when
  a cross-provider evaluator scores ≤40 AND its #1 suggestion matches fabrication markers; surfaced
  to the user, never folded into the score. New state field `faithfulness_warning`.
- Tests: `backend/tests/test_aggregator_headline.py` (6 passing).

### 2. Tier-aware calibration (paid users not scored conservatively)
- `check_resume(..., conservative: bool = True)`. The standard ladder (strong CVs cap ~84) is the
  free-tier upgrade lever; `conservative=False` appends `_PAID_CALIBRATION` to the USER message
  (cache-safe) so Plus/Pro strong CVs reach the low-to-mid 80s and can clear their bar.
- Threaded from tier via new state field `conservative_scoring` → only the **cv_score evaluator**
  uses it (nodes.py `evaluate_node`). `_original_cv_score` is also tier-aware (bypasses the
  conservative `cv_check_results` cache for paid) so "beat the original" compares like with like.
- **DECISION / still conservative:** the **public CV Score page** (`routers/resume.py`) and template
  previews were left on the conservative ladder (the upgrade lever; avoids free/paid cache
  poisoning on the shared `cv_check_results` cache). If the public page should also be fair for
  logged-in paid users, that needs a calibration-keyed cache — easy follow-up, flagged to user.

### 3. Result page shows WHY the score is what it is
- `/generate` `eval_summary` now returns `category_scores` (8-category breakdown), `blocking_categories`
  (below the tier bar, weakest first), `faithfulness_warning`, `tier`, `template_pages`,
  `layout_validation`. `EvalQualityPanel.tsx` renders a per-category bar breakdown + "Below your
  {Tier} target of {N}: …" + faithfulness warning + page-fit line, on both the template result page
  and the preview page. Flows via the existing localStorage `cvtailora_eval_summary`.

### 4. Page limit is DATA + enforced
- Deleted the hardcoded `_TEMPLATE_PAGES` dict in `generate.py` (it disagreed with the data —
  e.g. listed TechModern=1 vs data pages=2 — and silently defaulted admin/AI templates to 2).
  Page budget now read from the `cv_templates` doc via `_resolve_template_pages(db, key)`, which
  **warns** instead of silently defaulting. `seed_cv_templates` backfills `pages` onto old rows.
- **Enforcement:** on layout-validator overflow, one bounded corrective **trim pass**
  (`GeneratorAgent.run_trim` + `trim_messages` — cut/tighten existing text, never invent, never drop
  a section), re-validate, keep only if it improved the fit, and re-persist `generated_resume`.

### Pending / notes
- Not committed or pushed (user was away). Local working tree has the changes.
- Railway env vars `GENERATOR_MODEL`/`ANTHROPIC_EVALUATOR_MODEL` → `claude-sonnet-4-6` were pushed
  via API this session (fixed the prod 404 on the retired model).
- Watch: paid scores will rise vs before (intended). The trim pass adds ≤1 Sonnet call only on overflow.

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
  LangSmith example to dataset `cvtailora-golden` (creates dataset if absent).
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
