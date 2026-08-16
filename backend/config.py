"""Application settings loaded from .env via pydantic-settings.

All tunable behaviour — model names, cost controls, feature flags — lives here.
Change a value in .env; no code changes required.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── API keys ────────────────────────────────────────────────────────────────────
    anthropic_api_key: str

    # ── LLM gateway (OpenRouter) — the graph+loop engine routes EVERY call here ──
    # Single provider, single model, fully config-driven. No model string is
    # hardcoded anywhere in services/graph or services/llm — swap the model by
    # editing primary_model here (or PRIMARY_MODEL in .env), nothing else.
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # OpenRouter model slug. NOTE: OpenRouter slugs differ from the native
    # Anthropic IDs (dotted minor version, provider prefix). Confirm the exact
    # slug for the model you want on openrouter.ai/models — this is the one
    # place it lives. Sonnet chosen per project decision (quality-bearing calls).
    # This is the TEST/PRODUCTION model (paid).
    primary_model: str = "anthropic/claude-sonnet-4.5"
    # DEV model — a FREE OpenRouter model (":free" slug) used while developing so
    # we don't burn paid tokens on every run. Picked 2026-08-16 by smoke-testing
    # the current free models: nemotron-3-super-120b returned clean JSON reliably
    # (the 550B model preambles/reasons instead; gpt-oss-20b returned empty). Free
    # models change + are rate-limited — re-check openrouter.ai/models if it fails.
    # Selected only when graph_dev_mode is true (see gateway.active_model()).
    dev_model: str = "nvidia/nemotron-3-super-120b-a12b:free"
    # true  → dev: every graph call uses the FREE dev_model (no paid cost).
    # false → test/prod: uses the paid primary_model.
    graph_dev_mode: bool = False
    # Optional attribution headers OpenRouter surfaces on its dashboard.
    openrouter_referer: str = "https://cvtailora.com"
    openrouter_title: str = "CVTailora"
    # Max LLM sub-agents running concurrently in one graph run. The fan-out
    # (per-section generators, per-category checkers) issues many BLOCKING LLM
    # calls; this bounds how many are in flight at once so we don't hammer the
    # provider's rate limit while still running independent nodes in parallel.
    graph_concurrency: int = 5

    # ── Model names — swap in .env without touching code ──────────────────────
    # LEGACY (pipeline/*): the old multi-provider evaluator-optimizer graph. Being
    # superseded by the single-model graph+loop engine (services/graph). Kept until
    # the migration flag flips both features over — see Phase 4 cleanup.
    # claude-sonnet-4-20250514 retires 2026-06-15 — claude-sonnet-4-6 is the
    # drop-in replacement at the same price ($3/$15 per MTok).
    generator_model: str = "claude-sonnet-4-6"
    anthropic_evaluator_model: str = "claude-sonnet-4-6"
    # Sonnet by user decision (2026-06-11): skill selection quality drives every
    # downstream generator cycle, so don't downgrade this call to Haiku.
    job_analyzer_model: str = "claude-sonnet-4-6"

    # ── Evaluator feature flags — LEGACY (pipeline/*) ────────────────────────
    # Single-model: only the Anthropic JD-alignment evaluator flag remains (off by
    # default). The OpenAI/Google evaluators were removed in the single-model move.
    anthropic_evaluator_enabled: bool = False

    # ── Pipeline quality thresholds — LEGACY (pipeline/*) ────────────────────
    # Superseded by the tier-managed graph loop rules (tier_config: pass_threshold
    # / max_eval_cycles / max_run_cost_cents, resolved by services/graph/tier_rules).
    pass_threshold: int = 50
    max_eval_cycles: int = 3

    # ── Per-session cost controls ───────────────────────────────────────────
    # Hard cap on total AI API calls per session across all generate invocations.
    # Minimum per full run: 1 job-analyzer + (1 gen + N evaluators) × max_eval_cycles
    #   Free  (1 eval, 3 cycles): 1 + 2×3  =  7
    #   Plus  (2 eval, 3 cycles): 1 + 3×3  = 10
    #   Pro   (3 eval, 3 cycles): 1 + 4×3  = 13  ← was hitting 10 limit
    # Set to 30 to allow 1 full run + multiple section regens per session.
    # Set to 0 to disable the cap entirely.
    max_ai_calls_per_session: int = 30

    # ── Skill extraction (JobAnalyzerAgent) ──────────────────────────────
    # Number of key skills the job analyzer picks and passes to the generator.
    # Maps to subscription tiers — override per-user when billing is wired:
    #   Free  = 3  |  Plus = 5  |  Pro = 10
    skill_extraction_count: int = 3

    # ── CV Score lazy evaluation + refinement loop — LEGACY (cv_check_flow) ──
    # Superseded by the CV Score graph (Generate→Review→Update→Loop/Exit) whose
    # loop is governed by the tier rules. Retires at the Phase 4 cutover.
    cv_score_lazy_threshold: int = 75
    cv_score_max_refine_cycles: int = 3
    cv_score_plateau_margin: int = 3

    # ── Feature flags ──────────────────────────────────────────────────────
    # PDF export runs LibreOffice headless — disable on environments without it.
    pdf_export_enabled: bool = False
    # Slug of the first/featured profession used as fallback when no keyword matches.
    featured_profession_slug: str = "software_engineer"

    # ── File storage ─────────────────────────────────────────────────────
    # Switch backends by changing STORAGE_BACKEND — no code changes needed.
    #   "local"  →  files saved under STORAGE_LOCAL_PATH (default; dev-friendly)
    #   "s3"     →  files uploaded to AWS S3 (set AWS_S3_BUCKET + credentials)
    storage_backend: str = "local"
    storage_local_path: str = "./uploads"
    # S3 backend settings (ignored when storage_backend=local)
    aws_s3_bucket: str = ""
    aws_s3_prefix: str = "uploads/"
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # ── Auth ─────────────────────────────────────────────────────────────────
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    google_client_id: str = ""
    google_client_secret: str = ""
    # Set to true on localhost to accept dev-free / dev-plus / dev-pro tokens with no JWT check.
    dev_bypass_auth: bool = False

    # ── Job search ───────────────────────────────────────────────────────────
    rapidapi_key: str = ""
    # Monthly call budget for JSearch free tier (500). Set higher if on a paid plan.
    jsearch_monthly_limit: int = 500
    # Warn in API responses when usage crosses this percentage (and every 10% after).
    jsearch_quota_warn_pct: int = 50
    # How long to serve cached search results before hitting RapidAPI again (seconds).
    # Same query+location+page within this window costs zero quota.
    jsearch_cache_ttl_s: int = 7200  # 2 hours default
    # Hide jobs posted more than this many days ago from all search results.
    jsearch_max_job_age_days: int = 100

    # ── LangSmith tracing (optional) ───────────────────────────────────────────
    # Set LANGSMITH_API_KEY to enable automatic LangGraph trace export.
    # LangChain/LangGraph reads LANGCHAIN_TRACING_V2 + LANGSMITH_API_KEY from
    # the OS environment — startup code sets them if this key is present.
    langsmith_api_key: str = ""
    langsmith_project: str = "cvtailora"

    # ── Infrastructure ─────────────────────────────────────────────────────────
    mongodb_uri: str
    allowed_origins: str = "http://localhost:4000"
    frontend_url: str = "http://localhost:4000"

    # ── Email (Brevo HTTP API for job alert digests) ───────────────────────
    # Brevo account cvtailora@gmail.com — domain cvtailora.com authenticated
    # (DKIM+DMARC), sender verified. API key from Settings → SMTP & API → API Keys.
    support_email: str = "support@cvtailora.com"
    brevo_api_key: str = ""
    brevo_sender_email: str = "support@cvtailora.com"

    # ── Alerts ────────────────────────────────────────────────────────────────
    # UTC hour (0–23) at which the daily alert job runs
    alert_send_hour: int = 8
    # Max jobs included per alert digest email
    alert_max_jobs_per_email: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
