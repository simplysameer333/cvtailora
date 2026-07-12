# CVTailora — Engineering Directions

## LLM / Agent design

**One dedicated LLM call per purpose. Each call targets a single task, with a focused, clean system prompt.**

- Never make one call multi-task (e.g. scoring + extracting + formatting in a single mega-prompt). An overloaded call spreads attention and produces lazy, low-quality output for every job it's juggling.
- Give each call its own tight system prompt that describes only that one job.
- When you need multiple outputs from the same input, run separate focused calls **concurrently** (`asyncio.gather`) — you get higher quality with no added latency.
- Proven in this codebase: CV-score quality analysis (`check_resume`) and resume extraction (`extract_resume_for_preview`) are separate parallel calls. Splitting them fixed merged job entries, truncated bullets, and dropped sections that the combined call produced.

## Production AI-engineering standards (apply to EVERY AI feature, app-wide)

These are not optional polish — build them into any feature that calls an LLM/agent. If a feature can't yet meet one, note it in the deferred backlog rather than skipping silently.

- **Evals / validation gate** — never trust raw LLM output. Validate before use/persistence with pure, unit-testable functions. Example: the CV-template AI generator (`services/cv_template_service.py` → `validate_template_html` / `normalize_docx_config`) rejects malformed HTML, missing placeholders, unbalanced Mustache sections, or out-of-vocabulary config before a template can be saved.
- **Context engineering** — one focused system prompt stating the exact output contract, plus a minimal in-context reference (few-shot) where it helps. No multi-task bloat.
- **Optimizing LLM calls** — cache static system prompts with Anthropic `cache_control`; bound `max_tokens`; pick the right model per task (Haiku for extract/validate, Sonnet for authoring); serialise structured inputs with TOON.
- **Monitoring** — log structured telemetry per call (model, latency, input/output tokens, cache hits, validation result) and an `audit_log` entry for admin AI actions.
- **Testing** — keep validators/renderers/parsers pure and deterministic so they unit-test; isolate the LLM call behind a service so it can be mocked.
- **Async + checkpointed workflows** — any LLM workflow that can exceed ~30 s or makes multiple calls must NOT run inside one HTTP request. Run it as a background job with state in MongoDB (see `services/generation_jobs.py`): the client POSTs then POLLS a status endpoint; every completed stage/cycle checkpoints to the job doc so a crash, deploy restart, or retry RESUMES from the checkpoint instead of restarting (and is never double-charged); recoverable failures (5xx/crashes) auto-retry server-side while the UI shows "taking longer than usual" — the user only sees an error when retries are exhausted or the failure is deterministic (4xx). Proven by the boom.tds incident (2026-07-12): 4 successful ~150 s runs were all lost to client-side connection kills.

## Resume templates are DATA, not code

The 20+ resume templates live in MongoDB (`cv_templates`) as standalone HTML (logic-less Mustache) + a `docx_config`. Add/edit/AI-generate them from Admin → Manage Templates with **no deploy**. Rendering logic lives once in `frontend/src/lib/cvTemplates.ts` (`render`/`renderCtx`); DOCX is config-driven in `services/docx_templates.py`. Don't reintroduce per-template hardcoding — extend the data model or the shared renderer instead.

## Coding behaviour principles (apply every session)

These four rules govern how every change is made, regardless of feature size. They exist to prevent the most common LLM-coding failure modes: silent assumptions, scope creep, and solutions that outgrow the problem.

### 1. Think Before Coding — surface assumptions, don't hide confusion

Before implementing anything:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Magic numbers, silent fallbacks, and default choices must have a one-line comment explaining why.

### 2. Simplicity First — minimum code that solves the problem, nothing speculative

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Dead code (replaced modules, unused imports, orphaned helpers) must be deleted immediately — not commented out, not left "just in case".
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes — touch only what you must

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it silently mid-task.
- When your changes create orphans (unused imports, variables, helpers), remove only those orphans YOUR change created.
- Every changed line must trace directly to the user's request.

### 4. Goal-Driven Execution — define success criteria, verify before closing

Transform every task into a verifiable goal before writing code:
- "Add validation" → "write tests for invalid inputs, then make them pass"
- "Fix the bug" → "write a test that reproduces it, then make it pass"
- "Refactor X" → "ensure tests pass before and after"

For multi-step tasks, state a brief plan with a verification step for each stage.
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These principles are working if:** diffs contain no unnecessary changes, rewrites due to overcomplication are rare, and clarifying questions come before implementation rather than after mistakes.
