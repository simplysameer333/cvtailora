# TailorMyCv

AI-powered resume builder that tailors your resume to any job description using a multi-agent pipeline. A Job Analyzer extracts the skills that matter most for the role, a Generator writes the resume, and one or more Evaluator agents score it using profession-specific criteria — the generator refines until quality thresholds are met.

**Stack:** Next.js 14 · FastAPI · MongoDB Atlas · LangGraph 1.2.1 · Anthropic Claude · OpenAI · Google Gemini

---

## Project Structure

```
tailormycv/
│
├── backend/
│   ├── main.py                      FastAPI app entry point; mounts all routers under /api
│   ├── config.py                    Pydantic-settings; all tunable config (model names, thresholds, tier flags) from .env
│   ├── database.py                  Motor async MongoDB client; TTL indexes on sessions (24h) and GridFS files
│   ├── seed_templates.py            One-time script — upserts 3 prebuilt DOCX templates into MongoDB
│   ├── seed_professions.py          One-time script — upserts initial profession configs into MongoDB
│   │
│   ├── routers/
│   │   ├── resume.py                POST /api/resume/upload — parse PDF/DOCX + optional instructions, create session
│   │   │                            POST /api/resume/sample-format — upload sample CV as formatting reference
│   │   ├── profile.py               POST /api/profile — save user profile
│   │   │                            GET  /api/profile/prefill — AI-extract profile fields from parsed resume text
│   │   ├── job_description.py       POST /api/job-description — store pasted job description
│   │   ├── templates.py             GET /api/templates — template gallery
│   │   ├── generate.py              POST /api/generate — run job analysis then evaluator-optimizer pipeline
│   │   │                            PUT  /api/sessions/{id}/resume — sync client-side resume back to session
│   │   │                            PATCH /api/sessions/{id}/template — attach template to session
│   │   │                            PUT  /api/sessions/{id}/locked-facts — save user-pinned facts
│   │   ├── export.py                POST /api/export — fill template → DOCX + PDF (pure Python, no LibreOffice)
│   │   │                            GET  /api/download/{id} — stream file download
│   │   └── professions.py           CRUD /api/professions — manage profession profiles via admin UI
│   │
│   ├── models/
│   │   ├── session.py               GeneratedResume, UserProfile, EvaluatorResult, EvalCycle, OutputFiles
│   │   └── template.py              Template document model
│   │
│   └── services/
│       ├── resume_parser.py         Extracts text from PDF/DOCX via pdfplumber / python-docx
│       ├── template_service.py      Loads DOCX templates, substitutes {{PLACEHOLDER}} tags
│       ├── file_generator.py        generate_docx (python-docx) + generate_pdf (reportlab — no LibreOffice needed)
│       ├── email_service.py         Quality alert — logs WARNING to console; SMTP delivery via .env
│       ├── profession_service.py    MongoDB CRUD + resolve_profession_for_role()
│       │
│       └── pipeline/               LangGraph evaluator-optimizer pipeline
│           ├── graph.py             StateGraph definition
│           ├── nodes.py             generate_node, evaluate_node (parallel), aggregate_node, should_continue
│           ├── state.py             PipelineState TypedDict — all fields passed through the graph
│           ├── utils.py             parse_json_response() — strips markdown fences, parses LLM JSON
│           │
│           ├── prompts/
│           │   ├── anthropic.py     job_analyzer_messages(), generator_messages(), section_messages(), evaluator_messages()
│           │   ├── openai.py        openai_evaluator_messages()
│           │   └── google.py        google_evaluator_messages()
│           │
│           └── agents/
│               ├── job_analyzer.py  JobAnalyzerAgent — extracts top-N key skills from JD before eval loop
│               ├── generator.py     GeneratorAgent — full generation + section regen
│               ├── aggregator.py    AggregatorAgent — compares scores to PASS_THRESHOLD; prepares feedback
│               └── evaluators/      AnthropicEvaluatorAgent, OpenAIEvaluatorAgent, GoogleEvaluatorAgent
│
└── frontend/src/
    ├── app/
    │   ├── layout.tsx               Root layout — Inter font, global Toaster, metadata
    │   ├── page.tsx                 Landing page — hero, how-it-works steps, CTA
    │   ├── builder/
    │   │   ├── layout.tsx           Builder shell — StepProgress bar + SessionGuard (expiry handler)
    │   │   ├── SessionGuard.tsx     Client component — listens for session-expired event, redirects to upload
    │   │   ├── upload/page.tsx      Step 1 — drag-and-drop upload; clears previous session localStorage on new upload
    │   │   ├── profile/page.tsx     Step 2 — AI pre-fills profile fields from resume; user confirms
    │   │   ├── job/page.tsx         Step 3 — paste job description
    │   │   ├── template/page.tsx    Step 4 — template gallery; formatting reference upload; output format selector
    │   │   ├── preview/page.tsx     Step 5 — editable resume preview; per-section regeneration with guidance;
    │   │   │                        global regeneration with guidance; locked facts; dynamic section addition
    │   │   └── download/page.tsx    Step 6 — explicit Generate Files button; Word + PDF format cards; named download
    │   └── admin/
    │       └── professions/page.tsx Profession CRUD admin panel
    ├── components/
    │   └── StepProgress.tsx         Six-step indicator with completion checkmarks
    └── lib/
        ├── api.ts                   Typed API client + axios interceptor for session-expiry (404 → clear + redirect)
        ├── session.ts               getSessionId() / setSessionId() — tailormycv_session_id in localStorage
        ├── stepGuard.ts             useStepGuard() — prevents skipping steps
        └── useSessionGuard.ts       useSessionExpiredHandler() — toast + redirect on session-expired event
```

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Anthropic API key (required — generator, job analyzer, default evaluator)
- OpenAI API key (optional — evaluator skipped if absent or flag is false)
- Google API key (optional — evaluator skipped if absent or flag is false)

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

# Copy .env.example → .env and fill in ANTHROPIC_API_KEY and MONGODB_URI

python seed_templates.py        # Seeds Clean / Modern / Executive templates into MongoDB
python seed_professions.py      # Seeds initial profession profiles into MongoDB

uvicorn main:app --reload --port 9000
```

API docs: http://localhost:9000/docs

### Frontend

```powershell
cd frontend
npm install
# Copy .env.example → .env.local (minimum required values shown below)
npm run dev
```

Minimum `frontend/.env.local` for local development:
```
NEXT_PUBLIC_API_URL=http://localhost:9000
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

App: http://localhost:4000
Profession admin: http://localhost:4000/settings/professions

> **Dev auth bypass** — with `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` (and `DEV_BYPASS_AUTH=true` in the backend), no login is required. A plan switcher appears in the Navbar user dropdown to toggle between Free / Plus / Pro for testing tier-gated features. Remove both flags before deploying to production.

---

## Builder Flow (6 steps)

| Step | Route | What happens |
|------|-------|-------------|
| 1 | `/builder/upload` | Resume parsed (pdfplumber / python-docx); new session created; previous session localStorage cleared |
| 2 | `/builder/profile` | Claude extracts name, email, phone, LinkedIn, location, target role, skills from resume text; user reviews and confirms |
| 3 | `/builder/job` | User pastes job description |
| 4 | `/builder/template` | Pick Clean / Modern / Executive template, or upload a formatting reference CV; choose DOCX or PDF output |
| 5 | `/builder/preview` | Full AI pipeline runs; user edits any field inline; regenerates individual sections with freetext guidance; adds custom sections; locks facts the AI must never change |
| 6 | `/builder/download` | User clicks Generate Files; DOCX always available; PDF generated via reportlab (pure Python) |

Each step is guarded by `useStepGuard` — navigating to a later step without completing earlier ones redirects back.

---

## AI Pipeline

```
POST /api/generate
        │
        ▼
┌───────────────────┐
│ Profession Resolve│  MongoDB keyword match on target_role
└────────┬──────────┘
        │
        ▼
┌───────────────────┐
│  Job Analyzer     │  1 LLM call → ordered list of top-N key skills
│  (pre-loop)       │
└────────┬──────────┘
        │
        ▼ ╔══════════════════════════════════════════╗
        │ ║       EVALUATOR-OPTIMIZER LOOP           ║
        │ ║   (repeats up to MAX_EVAL_CYCLES times)  ║
        │ ║                                          ║
        └►║  ┌─────────────────────────────────┐    ║
          ║  │  Generator (GeneratorAgent)     │    ║
          ║  │  resume + profile + JD +        │    ║
          ║  │  profession + skills + feedback  │    ║
          ║  └──────────────┬──────────────────┘    ║
          ║                 │ resume JSON            ║
          ║                 ▼                        ║
          ║  ┌─────────────────────────────────┐    ║
          ║  │  Evaluators  (asyncio.gather)   │    ║
          ║  │  Anthropic · OpenAI · Google    │    ║
          ║  │  → score 0–100 + suggestions    │    ║
          ║  └──────────────┬──────────────────┘    ║
          ║                 │                        ║
          ║                 ▼                        ║
          ║  ┌─────────────────────────────────┐    ║
          ║  │  Aggregator  (pure computation) │    ║
          ║  │  min_score ≥ PASS_THRESHOLD?    │    ║
          ║  └──────┬───────────────┬──────────┘    ║
          ║    YES  │               │ NO             ║
          ╚═════════╪═══════════════╪════════════════╝
                    │               └──► feedback → next cycle
                    ▼
            Best result returned
```

`POST /api/generate` runs:

1. **Profession resolution** — `target_role` matched against keyword lists in the `professions` MongoDB collection; falls back to `FEATURED_PROFESSION_SLUG`, then generic
2. **Job Analyzer** (`JobAnalyzerAgent`) — one LLM call extracts top-N skills from the JD the candidate can credibly claim; N from `SKILL_EXTRACTION_COUNT`
3. **Generator** (`GeneratorAgent`) — writes resume JSON; receives: parsed resume, profile, JD, profession config, key skills, sample CV text (formatting reference), locked facts, and optional feedback
4. **Evaluators** — run in parallel; active set filtered by API key presence and `*_EVALUATOR_ENABLED` flag; each scores 0–100 with profession-specific criteria
5. **Aggregator** — compares min score to `PASS_THRESHOLD`; if all pass exits loop; otherwise sends feedback back to generator
6. Loop repeats up to `MAX_EVAL_CYCLES`; best result always returned

Quality scores are **never shown to users** — qualitative labels (Excellent / Strong / Good / Reviewed) are shown instead.

### Token Efficiency — TOON Encoding

All structured data sent to LLMs (resume JSON, user profiles) is serialised with **TOON** (Token-Oriented Object Notation, `toon-format==0.9.0b1`) before being placed in prompt messages. LLM outputs remain plain JSON — TOON is applied to inputs only.

TOON converts uniform arrays to a compact tabular format, eliminating repeated key names:

```
# Standard JSON: ~650 tokens for a full resume payload
# TOON-encoded:  ~370–400 tokens — 40–45% fewer tokens on structured data

experience[2|]: company|role|dates
  Acme Corp|Engineer|2020–2023
  Beta Ltd|Tech Lead|2023–present
```

The wrapper lives at `backend/services/pipeline/toon.py` and falls back to compact JSON if the package is unavailable. A one-line format legend is prepended to each prompt so the model can parse the encoded input.

**Estimated savings at scale:**

| Tier | Evaluators | Max cycles | Tokens saved / generation |
|------|-----------|-----------|--------------------------|
| Free | 1 | 1–3 | ~280 |
| Plus | 2 | 1–3 | ~950 |
| Pro  | 3 | 1–3 | ~2,500 |

At 10,000 Pro-tier generations/month (~25 M tokens), TOON reduces costs by roughly **$60–75/month** at Claude Sonnet input pricing.

### Subscription Tiers (env-flag driven until billing is wired)

| Feature | Free | Plus | Pro |
|---------|------|------|-----|
| Resume builder (6-step flow) | ✅ | ✅ | ✅ |
| DOCX + PDF export | ✅ | ✅ | ✅ |
| Basic templates (Clean / Modern / Executive) | ✅ | ✅ | ✅ |
| Persistent profile page | ✅ | ✅ | ✅ |
| AI evaluators | Anthropic only | Anthropic + Google | All three |
| Key skills extracted from JD | 3 | 5 | 10 |
| Max refinement cycles | 3 | 3 | 3 |
| Custom templates (upload your own .docx) | ❌ | ✅ | ✅ |
| Job search (JSearch — Indeed / LinkedIn / Glassdoor) | ❌ | ✅ | ✅ |
| Save jobs | ❌ | Up to 25 | Unlimited |
| One-click Tailor (job listing → builder) | ❌ | ✅ | ✅ |
| Section-level regeneration | ❌ | ❌ | ✅ |
| Locked Facts panel | ❌ | ❌ | ✅ |
| Sample CV formatting reference | ❌ | ❌ | ✅ |

Tier is stored on the `User` document (`tier: "free" | "plus" | "pro"`). Backend enforcement uses the `require_tier(min_tier)` FastAPI dependency. The `DEV_BYPASS_AUTH=true` flag bypasses all auth on localhost and exposes a plan switcher in the Navbar dropdown for testing tier-gated features.

### Adding a new profession
**Via UI** (preferred): `/admin/professions` → Add Profession — no deployment needed.
**Via code**: create `pipeline/prompts/professions/<slug>.py`, add to `INITIAL_PROFESSIONS`, run `seed_professions.py`.

### Adding a new evaluator provider
1. `pipeline/agents/evaluators/<provider>.py` — subclass `BaseEvaluatorAgent`
2. `pipeline/prompts/<provider>.py` — prompt builder
3. Register in `EVALUATOR_REGISTRY` in `agents/evaluators/__init__.py`
4. Add `<PROVIDER>_EVALUATOR_ENABLED` flag to `config.py` and `.env`

---

## Key Config Flags (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | **Required.** Claude API key |
| `MONGODB_URI` | — | **Required.** URL-encode special chars in password (e.g. `@` → `%40`) |
| `GENERATOR_MODEL` | `claude-sonnet-4-20250514` | Model for generator + job analyzer |
| `ANTHROPIC_EVALUATOR_MODEL` | `claude-sonnet-4-20250514` | Claude evaluator model |
| `OPENAI_EVALUATOR_MODEL` | `gpt-4o-mini` | OpenAI evaluator model |
| `GOOGLE_EVALUATOR_MODEL` | `gemini-1.5-pro` | Gemini evaluator model |
| `ANTHROPIC_EVALUATOR_ENABLED` | `true` | Enable Claude evaluator |
| `OPENAI_EVALUATOR_ENABLED` | `false` | Enable GPT-4o evaluator |
| `GOOGLE_EVALUATOR_ENABLED` | `false` | Enable Gemini evaluator |
| `PASS_THRESHOLD` | `50` | Min score (0–100) for evaluator pass |
| `MAX_EVAL_CYCLES` | `3` | Max generator-evaluator iterations |
| `MAX_AI_CALLS_PER_SESSION` | `10` | Hard per-session AI call cap (0 = unlimited) |
| `SKILL_EXTRACTION_COUNT` | `3` | Top-N skills extracted from job description |
| `FEATURED_PROFESSION_SLUG` | `software_engineer` | Fallback profession when no keyword match |
| `ALLOWED_ORIGINS` | `http://localhost:4000` | CORS origins (comma-separated) |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `SUPPORT_EMAIL` | — | Recipient for quality-alert emails |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/resume/upload` | Upload & parse resume; create session |
| POST | `/api/resume/sample-format?session_id=` | Upload formatting reference CV |
| GET | `/api/profile/prefill?session_id=` | AI-extract profile fields from resume text |
| POST | `/api/profile?session_id=` | Save user profile |
| POST | `/api/job-description?session_id=` | Save job description |
| GET | `/api/templates` | List all templates |
| PATCH | `/api/sessions/{id}/template` | Attach template to session |
| PUT | `/api/sessions/{id}/locked-facts` | Update locked facts list |
| PUT | `/api/sessions/{id}/resume` | Sync client-side resume to session (used when preview loads from localStorage) |
| POST | `/api/generate?session_id=` | Run full pipeline |
| POST | `/api/generate?session_id=` + `{section}` | Regenerate single section (no eval loop) |
| POST | `/api/export?session_id=` | Export DOCX + PDF |
| GET | `/api/download/{file_id}` | Stream file download |
| GET/POST/PUT/DELETE | `/api/professions` | Profession profile CRUD |

---

## Session Management

- Sessions are anonymous — identified by `tailormycv_session_id` in `localStorage`
- MongoDB TTL index auto-deletes sessions and GridFS files after **24 hours**
- On new upload, all previous-session localStorage keys are cleared so stale data never carries over
- The axios interceptor in `api.ts` catches any 404 "session not found" response, clears localStorage, and fires a `session-expired` custom event
- `SessionGuard` (mounted in the builder layout) listens for that event, shows a toast, and redirects to `/builder/upload`

---

## PDF Export

PDF is generated via **reportlab** (pure Python) — no LibreOffice or external tools required.
The `generate_pdf()` function in `services/file_generator.py` builds a styled A4 PDF directly from the resume JSON with branded headings, section dividers, and clean typography.

---

## Deployment (Railway)

1. Create two Railway services: `tailormycv-backend` (root: `/backend`) and `tailormycv-frontend` (root: `/frontend`)
2. Set environment variables per service (see `.env.example`)
3. Run seed scripts once after first deploy:
   ```
   python seed_templates.py
   python seed_professions.py
   ```

Minimum backend env vars for launch:
```
ANTHROPIC_API_KEY=sk-ant-...
MONGODB_URI=mongodb+srv://...
ALLOWED_ORIGINS=https://your-frontend.up.railway.app
```
