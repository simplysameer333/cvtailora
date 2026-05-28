# User Requirements Document
## TailorMyCv — AI-Powered Resume Builder

**Version:** 1.4  
**Date:** May 2026  
**App Name:** TailorMyCv  
**Support Email:** samorsameer@gmail.com  
**Deployment Target:** Railway.com  

---

## 1. Project Overview

**TailorMyCv** is a full-stack web application that takes three inputs — an existing resume, a user profile, and a job description — and uses a multi-agent AI pipeline to generate a tailored, professionally formatted resume in a user-selected template. The primary output is a `.docx` file; PDF export is an optional server-side feature.

The AI pipeline is profession-aware and tier-driven:
- A **Job Analyzer** agent extracts the top-N skills from the job description before generation begins, giving the generator focused direction
- A **Generator** agent writes the resume tailored to the role and profession
- One or more **Evaluator** agents score the result using profession-specific criteria (active evaluators determined by subscription tier)
- An **Aggregator** consolidates feedback and the generator refines until the quality threshold is met or max cycles are reached

Profession profiles are stored in MongoDB and managed via an admin UI at `/settings/professions` — no code changes needed to add new professions.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Python 3.13 + FastAPI |
| Pipeline Orchestration | LangGraph 1.2.1 (`StateGraph` with cyclic evaluator-optimizer loop) |
| Database | MongoDB Atlas |
| AI — Job Analyzer | Anthropic Claude API (same model as generator; one call before the loop) |
| AI — Generator | Anthropic Claude API (model configured via `GENERATOR_MODEL` env var) |
| AI — Evaluators | Anthropic + OpenAI + Google (models via `*_EVALUATOR_MODEL` env vars; active set per tier) |
| Profession Profiles | MongoDB `professions` collection; managed via admin UI |
| File Parsing | `pdfplumber` (PDF resume), `python-docx` (DOCX resume + sample CV) |
| File Generation | `python-docx` (DOCX output); LibreOffice headless (optional PDF) |
| Quality Alerts | Logged to server console (`WARNING` level); email delivery disabled until SMTP configured |
| Observability | LangSmith tracing (optional; auto-detected from env vars) |
| Deployment | Railway.com — two services: `frontend` (Next.js) + `backend` (FastAPI) |
| Storage | MongoDB GridFS for generated output files |

---

## 3. Application Flow

### Step 1 — Upload Resume
- User uploads their existing resume as a `.pdf` or `.docx` file (max 5 MB)
- An optional **Additional Instructions** text box lets the user tell the AI what to prioritise or avoid (e.g. "focus on leadership experience", "I'm switching to product management")
- Backend parses the file and extracts raw text; both the resume text and any instructions are stored in the session

### Step 2 — Complete User Profile
- User fills in a profile form:
  - Full name, email, phone, LinkedIn URL, location
  - Target job title / role ← used to auto-detect profession
  - Preferred tone (Professional / Conversational / Executive)
  - Key skills (comma-separated)
  - Additional notes or achievements
- Profile is saved to MongoDB

### Step 3 — Paste Job Description
- User pastes the full job description text into a textarea
- Stored in MongoDB against the session

### Step 4 — Select Template + Optional Formatting Reference
- User selects a template from the gallery (prebuilt or custom upload)
- Optionally uploads a **sample CV for formatting reference** — a real CV whose layout and section order the generator should mirror (content is never copied)
- Selected template ID is saved to the session; sample CV text is parsed and stored

### Step 5 — AI Resume Generation
On clicking "Generate Resume" the backend runs:

1. **Profession resolution** — `target_role` matched against profession keyword lists in MongoDB; matched profession config loaded once (no DB calls inside the loop)
2. **Job Analyzer** (`JobAnalyzerAgent`) — one LLM call extracts the top-N skills from the job description that the candidate can credibly claim; N driven by subscription tier (`SKILL_EXTRACTION_COUNT`)
3. **Generator** (`GeneratorAgent`) — writes a tailored resume JSON using: parsed resume + profile + JD + profession config + locked facts + key skills + sample CV formatting reference
4. **Evaluators** (run in parallel via `asyncio.gather`) — score the resume 0–100 using profession-specific criteria; active set determined by tier flags
5. **Aggregator** — consolidates scores; if all meet `PASS_THRESHOLD` the loop exits; otherwise feedback is returned to the generator
6. Loop repeats up to `MAX_EVAL_CYCLES` times; best result is always returned
7. If quality threshold was not met, a `WARNING` log entry is written (email delivery is disabled; will be re-enabled when SMTP is configured)

- User sees a loading spinner during generation
- On completion, resume content is displayed in an editable preview with qualitative quality indicators (no raw scores shown to users)

### Step 6 — Download
- Backend applies AI-generated content to the selected template
- DOCX is always generated; PDF is optional (requires `PDF_EXPORT_ENABLED=true` and LibreOffice on server)
- Files are stored in GridFS and download links provided
- Filenames derived from the `name` field in the generated resume (e.g. `jane_doe.docx`)

---

## 4. Functional Requirements

### 4.1 Resume Upload & Parsing
- Accept `.pdf` and `.docx` files, max 5 MB
- Extract structured raw text for pipeline use
- Accept optional free-text additional instructions alongside the file upload
- Store parsed text and instructions in the session

### 4.2 User Profile Form
- Fields: Full Name, Email, Phone, LinkedIn, Location, Target Role, Preferred Tone, Key Skills, Additional Notes
- Required: Full Name, Email
- Persist profile to MongoDB

### 4.3 Job Description Input
- Large textarea; min 50 characters enforced
- Stored in MongoDB against the session

### 4.4 Template System
- **Prebuilt templates**: stored server-side as `.docx` files with named placeholder tags
- **Custom template upload**: accept `.docx`; validate required placeholder tags
- **Sample CV for formatting reference**: accept `.pdf` or `.docx`; parse text; store as `sample_cv_text` in session; injected into generator prompt as structural guidance — content never copied
- Selected template ID saved to session via `PATCH /api/sessions/{id}/template`

### 4.5 Profession Profile Management (Admin)

Profession profiles define pipeline behaviour per occupational domain. Stored in MongoDB; managed via `/settings/professions`.

#### Profession Config Schema
```json
{
  "slug": "software_engineer",
  "display_name": "Software Engineer",
  "keywords": ["software", "developer", "engineer", "backend"],
  "generator_context": "Appended to generator system prompt",
  "evaluator_context": "Appended to evaluator system prompt",
  "scoring_criteria": "Replaces generic 0–100 scoring breakdown",
  "aggregator_context": "Prepended to feedback prompt for next generator cycle",
  "evaluator_names": [],
  "is_active": true
}
```

**`evaluator_names`**: list of evaluators to use for this profession (`"anthropic"`, `"openai"`, `"google"`). Empty = use all tier-enabled evaluators.

#### Profession Resolution
- `user_profile.target_role` matched case-insensitively against each profession's `keywords`
- Falls back to `FEATURED_PROFESSION_SLUG` (default `software_engineer`) if no match, then to generic baseline
- Resolved once before the graph — zero DB calls inside the loop

#### Built-in Professions
| Slug | Display Name | Focus |
|---|---|---|
| `software_engineer` | Software Engineer | Tech stack specificity, quantified scale, architecture ownership, GitHub presence |
| `animator` | Animator / Creative | Portfolio/showreel link, software tools, named production credits, style range |
| `hotel_management` | Hotel Management | RevPAR/NPS/occupancy KPIs, operations scale, brand experience, certifications |

### 4.6 AI Resume Generation Pipeline

#### Pipeline Flow

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
          ║  │  Input: resume + profile + JD + │    ║
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

#### Job Analyzer Agent (`JobAnalyzerAgent`)
- Runs **once before the generator-evaluator loop** — adds one LLM call total
- Input: job description + resume text + user profile
- Output: ordered list of top-N skills the candidate can credibly claim
- N is set by `SKILL_EXTRACTION_COUNT` in `.env` — maps to subscription tier (see §4.9)
- On any failure, returns an empty list — pipeline is never blocked

#### Generator Agent (`GeneratorAgent`)
- Model: `GENERATOR_MODEL` env var
- Each cycle receives: resume text + profile + JD + profession config + key skills + sample CV text + locked facts + optional feedback from previous cycle
- Key skills injected as "KEY SKILLS TO EMPHASISE" — generator prioritises these in bullets, skills section, and summary
- Sample CV text injected as "FORMATTING REFERENCE" — structure mirrored, content never copied
- Output: resume JSON

#### Evaluator Agents (run in parallel)
Provider-based class names — model swap requires only an `.env` change:

| Class | Provider | Model env var | Default model |
|---|---|---|---|
| `AnthropicEvaluatorAgent` | Anthropic | `ANTHROPIC_EVALUATOR_MODEL` | `claude-sonnet-4-20250514` |
| `OpenAIEvaluatorAgent` | OpenAI | `OPENAI_EVALUATOR_MODEL` | `gpt-4o-mini` |
| `GoogleEvaluatorAgent` | Google | `GOOGLE_EVALUATOR_MODEL` | `gemini-1.5-pro` |

Active evaluators are filtered by: API key present AND feature flag `true` AND profession allows it.  
Evaluator errors return `score=0` — pipeline never crashes.  
Returns: `{ "model": str, "score": int, "suggestions": [str] }`

#### Aggregator Agent
- Pure synchronous computation — zero I/O, zero added latency
- Computes minimum score; compares against `PASS_THRESHOLD` (config, not hardcoded)
- Prepends `aggregator_context` to feedback for the next generator cycle
- Returns: `{ all_passed: bool, min_score: int, feedback_prompt: str, evaluator_results: [...] }`

#### Fact-Locking
- Users can pin specific facts on the Preview page (e.g. "Senior Engineer at Google, 2019–2023")
- Stored in session as `locked_facts: list[str]`
- Injected into generator system prompt as "LOCKED FACTS — MUST NOT BE CHANGED"
- Persisted via `PUT /api/sessions/{id}/locked-facts`

#### Quality Alert
- If `all_passed = false` after all cycles, a `WARNING` log entry is written to the server console
- Email delivery is disabled until SMTP is configured; alert body is preserved in code for future activation

#### Cost Controls
| Config | Default | Purpose |
|---|---|---|
| `PASS_THRESHOLD` | 50 | Minimum score for "pass" — lower = fewer loops = lower cost |
| `MAX_EVAL_CYCLES` | 3 | Max generator-evaluator iterations per request |
| `MAX_AI_CALLS_PER_SESSION` | 10 | Hard per-session cap; returns HTTP 429 when exceeded |

#### Resume JSON Schema
```json
{
  "name": "string",
  "contact": { "email": "string", "phone": "string", "linkedin": "string", "location": "string" },
  "summary": "string",
  "experience": [{ "company": "string", "role": "string", "dates": "string", "bullets": ["string"] }],
  "education": [{ "institution": "string", "degree": "string", "dates": "string" }],
  "skills": ["string"],
  "certifications": ["string"]
}
```

### 4.7 Editable Preview
- Each section displayed as editable fields; changes persisted to `localStorage`
- "Regenerate All" re-runs the full pipeline
- "Regenerate Section" per section — targeted rewrite, bypasses eval loop
- Qualitative quality indicators shown (Excellent / Strong / Good) — no raw scores shown to users
- **Locked Facts panel** — collapsible; add/remove facts that the AI must preserve verbatim on next generate

### 4.8 File Generation & Download
- DOCX always generated; PDF optional (`PDF_EXPORT_ENABLED=true` + LibreOffice on server)
- Files stored in MongoDB GridFS; download links provided on Step 6
- Filenames: `first_last.docx` derived from `name` in generated resume JSON
- Files auto-expire after 24 hours via GridFS TTL

### 4.9 Subscription Tiers (planned — flags drive current behaviour)

| Tier | Evaluators | Skills extracted | Config |
|---|---|---|---|
| **Free** | Anthropic only | 3 | `ANTHROPIC_EVALUATOR_ENABLED=true`, `SKILL_EXTRACTION_COUNT=3` |
| **Plus** | Anthropic + Google | 5 | `GOOGLE_EVALUATOR_ENABLED=true`, `SKILL_EXTRACTION_COUNT=5` |
| **Pro** | All three | 10 | All evaluators enabled, `SKILL_EXTRACTION_COUNT=10` |

Current deployment runs Free tier. Per-user tier lookup will replace the global flags when billing is wired.

---

## 5. Non-Functional Requirements

- **Responsiveness**: Desktop and tablet; mobile is nice-to-have
- **Performance**: AI generation is non-streaming (spinner shown); file generation < 15 seconds; profession resolution adds zero in-loop latency
- **Scalability**: All agents stateless and independently testable; evaluators run concurrently; aggregator is pure computation; new professions require no code change
- **Error handling**: Graceful errors for failed uploads, API failures, invalid templates; evaluator failures score 0 (no crash); job analyzer failures return empty list (no crash)
- **Security**: API keys in Railway env vars; never exposed to frontend; scores not shown in UI to avoid misleading quality claims
- **File cleanup**: Generated files auto-deleted from GridFS after 24 hours

---

## 6. Data Model (MongoDB)

### `sessions` collection
```json
{
  "_id": "ObjectId",
  "created_at": "datetime",
  "resume_parsed": { "raw_text": "string", "filename": "string" },
  "upload_instructions": "string",
  "user_profile": {},
  "job_description": "string",
  "selected_template_id": "string",
  "sample_cv_text": "string",
  "locked_facts": ["string"],
  "key_skills": ["string"],
  "generated_resume": {},
  "profession_slug": "software_engineer",
  "eval_cycles": 0,
  "eval_history": [
    {
      "cycle": 1,
      "profession": "software_engineer",
      "evaluator_results": [
        { "model": "anthropic", "score": 82, "suggestions": ["string"] }
      ],
      "min_score": 82,
      "all_passed": false,
      "timestamp": "datetime"
    }
  ],
  "ai_call_count": 3,
  "quality_alert_sent": false,
  "output_files": {
    "docx_file_id": "GridFS ObjectId",
    "pdf_file_id": "GridFS ObjectId"
  }
}
```

### `templates` collection
```json
{
  "_id": "ObjectId",
  "name": "string",
  "type": "prebuilt | custom",
  "preview_image_url": "string",
  "file_path": "string",
  "placeholders": ["string"],
  "created_at": "datetime"
}
```

### `professions` collection
```json
{
  "_id": "ObjectId",
  "slug": "software_engineer",
  "display_name": "Software Engineer",
  "keywords": ["software", "developer", "engineer"],
  "generator_context": "string",
  "evaluator_context": "string",
  "scoring_criteria": "string",
  "aggregator_context": "string",
  "evaluator_names": [],
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

---

## 7. API Endpoints (FastAPI)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/resume/upload` | Upload resume (PDF/DOCX) + optional instructions; creates session |
| `POST` | `/api/resume/sample-format?session_id=` | Upload sample CV as formatting reference; stored as `sample_cv_text` |
| `POST` | `/api/profile?session_id=` | Save user profile form data |
| `POST` | `/api/job-description?session_id=` | Save pasted job description |
| `GET` | `/api/templates` | List all available templates |
| `POST` | `/api/templates/upload` | Upload a custom `.docx` template |
| `PATCH` | `/api/sessions/{id}/template` | Attach selected template ID to session |
| `PUT` | `/api/sessions/{id}/locked-facts` | Save/replace user-pinned locked facts |
| `POST` | `/api/generate?session_id=` | Run full pipeline (job analysis + evaluator-optimizer loop) |
| `POST` | `/api/generate?session_id=&section=` | Regenerate single section (no eval loop) |
| `POST` | `/api/export?session_id=` | Generate DOCX (+ optional PDF) and store in GridFS |
| `GET` | `/api/download/{file_id}` | Download a generated file |
| `GET` | `/api/professions` | List all active profession profiles |
| `GET` | `/api/professions/{slug}` | Get single profession profile |
| `POST` | `/api/professions` | Create new profession profile |
| `PUT` | `/api/professions/{slug}` | Update profession profile |
| `DELETE` | `/api/professions/{slug}` | Deactivate profession profile (soft delete) |

---

## 8. Frontend Pages (Next.js App Router)

| Route | Page |
|---|---|
| `/` | Landing page — hero, how it works, "Start for Free" CTA |
| `/builder/upload` | Step 1 — drag-and-drop resume upload + optional additional instructions textarea |
| `/builder/profile` | Step 2 — user profile form (name, contact, tone, target role drives profession detection) |
| `/builder/job` | Step 3 — paste job description textarea |
| `/builder/template` | Step 4 — template gallery + custom upload + optional sample CV for formatting reference |
| `/builder/preview` | Step 5 — editable resume preview; qualitative quality indicator; locked facts panel; section regen |
| `/builder/download` | Step 6 — download DOCX (and PDF if enabled); filename from resume name |
| `/settings/professions` | Admin — manage profession profiles (add, edit, delete, set prompts + evaluator selection) |

A persistent **step progress bar** (steps 1–6 with completion indicators) is shown across all `/builder/*` pages.

---

## 9. Prebuilt Templates (Launch)

| Template Name | Style |
|---|---|
| **Clean** | Minimal single-column, Arial font, subtle section dividers |
| **Modern** | Two-column header, accent colour sidebar for skills |
| **Executive** | Classic serif font, formal layout, suited for senior roles |

Each `.docx` template uses placeholder tags: `{{NAME}}`, `{{EMAIL}}`, `{{PHONE}}`, `{{LINKEDIN}}`, `{{LOCATION}}`, `{{SUMMARY}}`, `{{EXPERIENCE}}`, `{{EDUCATION}}`, `{{SKILLS}}`, `{{CERTIFICATIONS}}`.

---

## 10. Environment Variables

### Backend (FastAPI)
```
# API keys
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=

# Model names — swap in .env; no code changes needed
GENERATOR_MODEL=claude-sonnet-4-20250514
ANTHROPIC_EVALUATOR_MODEL=claude-sonnet-4-20250514
OPENAI_EVALUATOR_MODEL=gpt-4o-mini
GOOGLE_EVALUATOR_MODEL=gemini-1.5-pro

# Subscription tier — evaluators active per tier
# Free: ANTHROPIC=true, others false
# Plus: ANTHROPIC+GOOGLE=true
# Pro: all three true
ANTHROPIC_EVALUATOR_ENABLED=true
OPENAI_EVALUATOR_ENABLED=false
GOOGLE_EVALUATOR_ENABLED=false

# Skill extraction — top-N skills the job analyzer extracts
# Free=3 | Plus=5 | Pro=10
SKILL_EXTRACTION_COUNT=3

# Pipeline quality controls
PASS_THRESHOLD=50
MAX_EVAL_CYCLES=3

# Per-session AI cost cap (0 = unlimited)
MAX_AI_CALLS_PER_SESSION=10

# Feature flags
PDF_EXPORT_ENABLED=false
FEATURED_PROFESSION_SLUG=software_engineer

# Infrastructure
MONGODB_URI=
ALLOWED_ORIGINS=https://your-frontend.railway.app
SUPPORT_EMAIL=samorsameer@gmail.com

# SMTP alerts (disabled until configured)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# Observability (optional)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=tailormycv
```

### Frontend (Next.js)
```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

---

## 11. Out of Scope (v1)

- User authentication / login (sessions are anonymous, identified by `tailormycv_session_id` in `localStorage`)
- Subscription billing and per-user tier enforcement (tiers exist as config flags; per-user lookup is a future milestone)
- Resume version history
- Cover letter generation
- LinkedIn import
- Mobile app
- Team / multi-user accounts
- Role-based access control for `/settings/professions`
- Email quality alerts (log-only until SMTP is configured)

---

## 12. AI Prompts Architecture

Prompts are organised by **two orthogonal axes**:

1. **Provider axis** — which API is called: `prompts/anthropic.py`, `prompts/openai.py`, `prompts/google.py`  
   Every LLM call's base system prompt and message builder lives in the provider file.

2. **Profession axis** — which domain: `prompts/professions/<slug>.py`  
   Each profession file defines context strings injected into provider prompts at call time. Stored in MongoDB and editable via admin UI.

| File | Prompts owned |
|---|---|
| `pipeline/prompts/anthropic.py` | `job_analyzer_messages()`, `generator_messages()`, `section_messages()`, `anthropic_evaluator_messages()` |
| `pipeline/prompts/openai.py` | `openai_evaluator_messages()` |
| `pipeline/prompts/google.py` | `google_evaluator_messages()` |
| `pipeline/prompts/professions/generic.py` | Fallback config (no profession match) |
| `pipeline/prompts/professions/software_engineer.py` | SWE contexts (seed data) |
| `pipeline/prompts/professions/animator.py` | Animation/creative contexts (seed data) |
| `pipeline/prompts/professions/hotel_management.py` | Hospitality contexts (seed data) |

---

## 13. Token Efficiency — TOON Encoding

All structured data sent to LLMs (resume JSON, user profiles) is serialised with **TOON** (Token-Oriented Object Notation) before being placed in prompt messages. LLM **outputs** remain plain JSON — TOON is applied to inputs only.

### Library

| | |
|---|---|
| PyPI package | `toon-format==0.9.0b1` |
| Wrapper module | `backend/services/pipeline/toon.py` |
| Fallback | Compact JSON (`json.dumps(data, separators=(",",":"))`) if package is unavailable |

### How TOON works

TOON converts uniform arrays to a tabular format, eliminating the repetitive key names that JSON repeats for every object in an array.

**JSON (verbose):**
```json
[
  {"company": "Acme Corp", "role": "Engineer",  "dates": "2020–2023"},
  {"company": "Beta Ltd",  "role": "Tech Lead",  "dates": "2023–present"}
]
```
**TOON (compact):**
```
experience[2|]: company|role|dates
  Acme Corp|Engineer|2020–2023
  Beta Ltd|Tech Lead|2023–present
```

A one-line TOON legend is prepended to every system prompt where encoded input is used, so the model can parse it correctly. The legend deliberately avoids curly braces to prevent conflicts with Python's `.format()` calls on prompt template strings.

### Where TOON is applied

| Prompt builder | TOON-encoded inputs |
|---|---|
| `job_analyzer_messages()` | `user_profile` dict |
| `generator_messages()` | `user_profile` dict |
| `section_messages()` | `user_profile` dict + `existing_resume` JSON |
| `anthropic_evaluator_messages()` | `resume_json` (the resume being evaluated) |
| `openai_evaluator_messages()` | `resume_json` |
| `google_evaluator_messages()` | `resume_json` |

### Estimated token savings

A typical resume JSON payload is ~650 tokens in standard JSON and ~370–400 tokens in TOON — a **40–45% reduction on structured data inputs**.

| Tier | Active evaluators | Max cycles | TOON-encoded calls | Tokens saved / generation |
|---|---|---|---|---|
| Free | 1 | 1–3 | 2–4 | ~280 |
| Plus | 2 | 1–3 | 3–7 | ~950 |
| Pro | 3 | 1–3 | 4–10 | ~2,500 |

At 10,000 Pro-tier generations per month (~25 M tokens saved) TOON reduces costs by approximately **$60–75/month** at Claude Sonnet input pricing.

---

## 14. Naming Conventions

| Context | Format |
|---|---|
| Brand / UI / logo | `TailorMyCv` |
| GitHub repo | `tailormycv` |
| Railway services | `tailormycv-frontend`, `tailormycv-backend` |
| MongoDB database | `tailormycv` |
| localStorage keys | `tailormycv_session_id`, `tailormycv_generated`, `tailormycv_eval_summary`, `tailormycv_template_id`, `tailormycv_locked_facts` |
| Domain | `tailormycv.com` |
| Agent class names | Provider-based: `JobAnalyzerAgent`, `GeneratorAgent`, `AnthropicEvaluatorAgent`, `OpenAIEvaluatorAgent`, `GoogleEvaluatorAgent` |
| Profession slugs | `lowercase_underscored`: `software_engineer`, `hotel_management` |
| URLs / API routes | `lowercase-hyphenated`: `/api/job-description`, `/api/sample-format` |

---

*End of User Requirements Document — TailorMyCv v1.4*
