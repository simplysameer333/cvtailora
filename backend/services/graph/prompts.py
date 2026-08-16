"""Prompt DATA for the graph engine — per-category rubrics + shared bases.

The bodies here are the DEFAULTS. Admin can override any of them in MongoDB
(`prompt_overrides`, keys registered in services/prompt_store); each agent
resolves its prompt at run time via the async resolvers below (override → default
fallback), so prompts are editable from the admin dashboard with no deploy.

Prompt-engineering notes (Anthropic best practices applied to the defaults):
- Each system prompt opens with a clear ROLE, then the TASK, then explicit rules
  stated positively (what to do), then the output contract.
- Scoring prompts carry an explicit CALIBRATION SCALE so scores are consistent
  run to run.
- Inputs are delimited (=== HEADERS ===) so the model can't confuse instructions
  with candidate data.
- Instructions are specific, not prescriptive-to-a-fault, and never ask the model
  to invent facts.

Caching layout (critical): the SHARED base + corpus form the cached prefix that
is byte-identical across every fan-out sub-agent; each agent's differing rubric
rides in the UNCACHED task suffix. So the resume+JD corpus caches once and all
eight category workers read it. See services/llm/gateway.complete.
"""
from __future__ import annotations

# One shared, stable system prompt for ALL category workers. Byte-identical
# across the fan-out → part of the cached prefix. Contains no per-category text.
CATEGORY_CHECKER_SYSTEM = (
    "You are an expert technical recruiter and resume reviewer. Your job is to "
    "score ONE named quality category of a candidate's resume against a specific "
    "target job, and nothing else.\n\n"
    "How to judge:\n"
    "- Judge only the category you are told to score; ignore weaknesses that "
    "belong to other categories.\n"
    "- Base every judgement on evidence actually present in the resume and the "
    "job description provided — never assume facts that are not there.\n"
    "- Be fair and consistent: reward a category that genuinely meets its bar, "
    "and do not deduct points for qualifications the job does not require or the "
    "candidate does not claim.\n\n"
    "Calibration scale (apply it literally):\n"
    "- 85-100: excellent — meets essentially every expectation for this category.\n"
    "- 70-84: strong — solid with minor, specific gaps.\n"
    "- 50-69: needs work — real weaknesses a recruiter would notice.\n"
    "- below 50: weak — the category materially undermines the application.\n\n"
    "Reply with ONLY a single JSON object and no prose outside it."
)

# Output contract appended to every category task (kept out of the rubric text
# so all rubrics share the same schema instructions).
_CATEGORY_SCHEMA = (
    '\n\nReturn ONLY this JSON object:\n'
    '{"score": <int 0-100 per the calibration scale>, '
    '"status": "strong"|"needs_work"|"weak", '
    '"checks": [{"label": <specific check>, "passed": <bool>}], '
    '"improvements": [<specific, actionable suggestion>, ...]}\n'
    "Give 2-4 concrete improvements the candidate could act on today — even for a "
    "strong category. Each improvement names WHAT to change, not just that it is weak."
)

# Category metadata: key, display label, weight (points; normalised at
# aggregation), and the focused rubric that rides in the uncached task suffix.
CATEGORIES: list[dict] = [
    {
        "key": "contact", "label": "Contact Details", "weight": 7,
        "rubric": "Assess contact info: full name, professional email, phone, "
                  "location (city/country), and a LinkedIn or portfolio URL. "
                  "Reward completeness and professionalism; flag missing links.",
    },
    {
        "key": "summary", "label": "Professional Summary", "weight": 15,
        "rubric": "Assess the summary/profile: 2-3 sentences, role-targeted, "
                  "states seniority and specialisation, quantified where possible, "
                  "no clichés or first-person filler. Reward tight, tailored copy.",
    },
    {
        "key": "experience", "label": "Work Experience", "weight": 25,
        "rubric": "Assess work experience: reverse-chronological roles with "
                  "company, title, dates; achievement-oriented bullets that start "
                  "with strong action verbs and quantify impact (%, $, counts). "
                  "Penalise duty-listing and vague, unmeasured bullets.",
    },
    {
        "key": "skills", "label": "Skills", "weight": 20,
        "rubric": "Assess the skills section: relevant hard/technical skills for "
                  "the target job, organised and specific, aligned to the job's "
                  "requirements, neither padded nor sparse. Reward JD alignment.",
    },
    {
        "key": "education", "label": "Education", "weight": 3,
        "rubric": "Assess education: degree, institution, dates/graduation, and "
                  "relevant certifications. Reward clarity and relevance; do not "
                  "penalise a candidate for a degree the job does not require.",
    },
    {
        "key": "ats", "label": "ATS Compatibility", "weight": 20,
        "rubric": "Assess ATS-friendliness: presence of the job's key terms and "
                  "role-standard section headings, parseable structure, no "
                  "reliance on tables/graphics for meaning. Reward keyword match "
                  "to THIS job description without keyword stuffing.",
    },
    {
        "key": "design", "label": "Design & Formatting", "weight": 10,
        "rubric": "Assess layout: consistent formatting, clear section headings, "
                  "appropriate length and density, readable structure. Judge "
                  "structure and consistency from the text, not visual styling.",
    },
    {
        "key": "grammar", "label": "Grammar & Spelling", "weight": 10,
        "rubric": "Assess grammar, spelling, punctuation, and consistent verb "
                  "tense. List concrete corrections as improvements. A clean "
                  "resume scores high; each real error lowers the score.",
    },
]

CATEGORY_BY_KEY = {c["key"]: c for c in CATEGORIES}


def resolve_category_prompt(key: str) -> str:
    """The task-suffix rubric + output schema for one category. Single lookup
    point; a Mongo override layer slots in here in Phase 4."""
    meta = CATEGORY_BY_KEY.get(key)
    if not meta:
        return "Assess this category of the resume." + _CATEGORY_SCHEMA
    return (
        f"Category to score: {meta['label']}.\n{meta['rubric']}" + _CATEGORY_SCHEMA
    )


def build_corpus(resume_text: str, job_description: str = "") -> str:
    """The shared, cache-friendly context block: identical across every
    sub-agent in a run, so it caches once and all sub-agents read it. Keep the
    ordering/labels stable — any byte change invalidates the shared cache."""
    parts = ["=== CANDIDATE RESUME ===", (resume_text or "").strip()]
    if job_description and job_description.strip():
        parts += ["\n=== TARGET JOB DESCRIPTION ===", job_description.strip()]
    return "\n".join(parts)


# ── CV Build: section generators ─────────────────────────────────────────────
# One shared, stable system prompt for ALL section generators (cached prefix).
SECTION_GENERATOR_SYSTEM = (
    "You are an expert resume writer. You tailor a candidate's resume to a "
    "specific target job, writing ONE named section at a time.\n\n"
    "Rules (follow all of them):\n"
    "- Use ONLY facts present in the candidate material. Never invent employers, "
    "titles, dates, metrics, technologies, or achievements. If a detail is not in "
    "the source, leave it out.\n"
    "- Mirror the job description's terminology wherever the candidate genuinely "
    "matches it, so the resume reads as targeted to this role.\n"
    "- Write tight, achievement-oriented, ATS-friendly copy: lead bullets with "
    "strong action verbs and quantify impact whenever the numbers exist in the "
    "source.\n"
    "- Preserve the candidate's real seniority and scope — do not inflate.\n\n"
    "Reply with ONLY a single JSON object and no prose outside it."
)

# Sections and their generation contract. `depends_on` lists OTHER section keys
# whose output should inform this one — this is what makes summary/skills connect
# to experience in the graph (and only to those). Independent sections run fully
# in parallel. `shape` documents the JSON the section's content must take.
SECTIONS: list[dict] = [
    {
        "key": "contact", "label": "Contact", "depends_on": [],
        "instruction": "Extract the candidate's name and contact details.",
        "shape": '{"name": <str>, "contact": {"email": <str>, "phone": <str>, '
                 '"location": <str>, "linkedin": <str>}}',
    },
    {
        "key": "experience", "label": "Work Experience", "depends_on": [],
        "instruction": "Rewrite work experience as reverse-chronological roles "
                       "with achievement bullets that start with action verbs and "
                       "quantify impact. Keep only real roles/dates from the source.",
        "shape": '{"experience": [{"company": <str>, "role": <str>, "dates": <str>, '
                 '"bullets": [<str>, ...]}]}',
    },
    {
        "key": "education", "label": "Education", "depends_on": [],
        "instruction": "List education and relevant certifications from the source.",
        "shape": '{"education": [{"institution": <str>, "degree": <str>, "dates": <str>}]}',
    },
    {
        "key": "skills", "label": "Skills", "depends_on": ["experience"],
        "instruction": "Select and organise the candidate's real skills most "
                       "relevant to the target job, aligned with what the "
                       "experience section demonstrates. 8-14 concrete skills.",
        "shape": '{"items": [<str>, ...]}',
    },
    {
        "key": "summary", "label": "Professional Summary", "depends_on": ["experience", "skills"],
        "instruction": "Write a 2-3 sentence, role-targeted professional summary "
                       "that synthesises the experience and skills sections and "
                       "states seniority and specialisation. No first-person filler.",
        "shape": '{"summary": <str>}',
    },
]

SECTION_BY_KEY = {s["key"]: s for s in SECTIONS}

_SECTION_SCHEMA_SUFFIX = (
    '\n\nReturn JSON exactly: {{"content": {shape}}}. Use ONLY facts from the '
    "candidate material. If a fact is genuinely absent, omit it — never fabricate."
)


def resolve_section_prompt(key: str) -> str:
    """The task-suffix instruction + output schema for one section generator."""
    meta = SECTION_BY_KEY.get(key)
    if not meta:
        return "Write this resume section using only source facts."
    return (
        f"Section to write: {meta['label']}.\n{meta['instruction']}"
        + _SECTION_SCHEMA_SUFFIX.format(shape=meta["shape"])
    )


# ── Update (refine) agent — the "Update" phase of Generate→Review→Update→Loop ──
REFINE_SYSTEM = (
    "You are a precise resume editor. You are given a resume and a short list of "
    "weak areas identified by a reviewer, and you produce an improved version.\n\n"
    "Rules:\n"
    "- Fix ONLY the weak areas listed. Leave everything that was already strong "
    "exactly as it is.\n"
    "- Use ONLY facts already present in the candidate's material — never invent "
    "employers, titles, dates, metrics, or skills to make a section look better.\n"
    "- Prefer concrete, quantified, action-verb-led phrasing drawn from the real "
    "content over vague claims.\n"
    "- Return the COMPLETE resume (all sections), not just the parts you changed.\n\n"
    "Reply with ONLY a single JSON object and no prose outside it."
)


def resolve_refine_prompt(weak: list[dict]) -> str:
    """Task suffix for the refine agent: which weak areas to fix + output schema."""
    lines = ["Improve the resume, focusing on these weak areas:"]
    for w in weak:
        tips = "; ".join((w.get("improvements") or [])[:2])
        lines.append(f"- {w.get('name', w.get('key'))} (score {w.get('score')}): {tips}")
    lines.append(
        '\nReturn JSON exactly: {"resume_text": <the FULL improved resume as plain '
        'text>}. Use ONLY facts from the candidate material — never fabricate.'
    )
    return "\n".join(lines)


# ── Verification agent (guardrail) — the single-model "second opinion" ────────
# Distinct role + prompt from the evaluators, so it catches faithfulness errors
# the generation/scoring pass can miss — the same-model analog of the old
# cross-model consensus guardrail.
VERIFICATION_SYSTEM = (
    "You are a strict faithfulness auditor for resumes. You compare a PRODUCED "
    "resume against the candidate's ORIGINAL source material and decide whether "
    "the produced resume is faithful to it.\n\n"
    "What counts as a fabrication (flag these): any employer, job title, date, "
    "degree, certification, metric, or skill stated in the produced resume that "
    "the original material does not support.\n"
    "What does NOT count (do not flag these): rewording, summarising, reordering, "
    "stronger action verbs, or reasonable formatting of facts that ARE present.\n\n"
    "Be conservative and precise: only flag a genuine unsupported claim, and quote "
    "the specific claim in each issue. Reply with ONLY a single JSON object."
)

VERIFICATION_TASK = (
    "Audit the PRODUCED RESUME below against the candidate's ORIGINAL material "
    "(above) for fabrication, following your rules.\n\n"
    'Return ONLY this JSON object: '
    '{"faithful": <bool: true only if there are zero unsupported claims>, '
    '"confidence": <int 0-100>, '
    '"issues": [<the exact unsupported claim>, ...]}. '
    "Leave issues empty when the resume is faithful."
)


def build_build_corpus(resume_text: str, profile_text: str = "",
                       job_description: str = "", key_skills: list[str] | None = None) -> str:
    """Shared cache-friendly corpus for CV Build section generators: resume +
    profile + JD + prioritised skills, identical across all section agents."""
    parts = ["=== CANDIDATE RESUME ===", (resume_text or "").strip()]
    if profile_text and profile_text.strip():
        parts += ["\n=== CANDIDATE PROFILE ===", profile_text.strip()]
    if job_description and job_description.strip():
        parts += ["\n=== TARGET JOB DESCRIPTION ===", job_description.strip()]
    if key_skills:
        parts += ["\n=== PRIORITISED SKILLS FROM THE JOB ===", ", ".join(key_skills)]
    return "\n".join(parts)


# ── MongoDB-editable prompt registry ─────────────────────────────────────────
# These keys register in services/prompt_store (PROMPT_KEYS/PROMPT_CATEGORIES,
# category "graph") so the admin dashboard lists + edits them, and admin/core
# DEFAULTS pulls its default bodies from GRAPH_PROMPT_DEFAULTS below (single
# source of truth). Editable = the rubric/instruction text and the system
# prompts; the machine-readable JSON schema suffixes stay in code so an edit
# can't break the output contract.

GRAPH_PROMPT_KEYS: dict[str, str] = {
    "graph_category_system": "Review — Category Reviewer System (shared)",
    **{f"graph_category_{c['key']}": f"Review — {c['label']} rubric" for c in CATEGORIES},
    "graph_section_system": "Build — Section Writer System (shared)",
    **{f"graph_section_{s['key']}": f"Build — {s['label']} instruction" for s in SECTIONS},
    "graph_refine_system": "Update — Refine Agent System",
    "graph_verification_system": "Guardrail — Verification Agent System",
    "graph_verification_task": "Guardrail — Verification Agent Task",
}

GRAPH_PROMPT_DEFAULTS: dict[str, str] = {
    "graph_category_system": CATEGORY_CHECKER_SYSTEM,
    **{f"graph_category_{c['key']}": c["rubric"] for c in CATEGORIES},
    "graph_section_system": SECTION_GENERATOR_SYSTEM,
    **{f"graph_section_{s['key']}": s["instruction"] for s in SECTIONS},
    "graph_refine_system": REFINE_SYSTEM,
    "graph_verification_system": VERIFICATION_SYSTEM,
    "graph_verification_task": VERIFICATION_TASK,
}


async def _ov(key: str) -> str | None:
    """DB-safe override fetch: returns the admin override for `key`, or None when
    unset OR when there is no DB (tests) / the lookup fails."""
    try:
        from services.prompt_store import get_override
        return await get_override(key)
    except Exception:
        return None


# ── Async resolvers used by the agents at run time (override → default) ───────

async def category_system() -> str:
    return (await _ov("graph_category_system")) or CATEGORY_CHECKER_SYSTEM


async def category_task(key: str) -> str:
    """Category worker task suffix: (overridable) rubric + fixed output schema."""
    meta = CATEGORY_BY_KEY.get(key)
    if not meta:
        return "Assess this category of the resume." + _CATEGORY_SCHEMA
    rubric = (await _ov(f"graph_category_{key}")) or meta["rubric"]
    return f"Category to score: {meta['label']}.\n{rubric}" + _CATEGORY_SCHEMA


async def section_system() -> str:
    return (await _ov("graph_section_system")) or SECTION_GENERATOR_SYSTEM


async def section_task(key: str) -> str:
    """Section worker task suffix: (overridable) instruction + fixed shape schema."""
    meta = SECTION_BY_KEY.get(key)
    if not meta:
        return "Write this resume section using only source facts."
    instruction = (await _ov(f"graph_section_{key}")) or meta["instruction"]
    return (f"Section to write: {meta['label']}.\n{instruction}"
            + _SECTION_SCHEMA_SUFFIX.format(shape=meta["shape"]))


async def refine_system() -> str:
    return (await _ov("graph_refine_system")) or REFINE_SYSTEM


async def verification_system() -> str:
    return (await _ov("graph_verification_system")) or VERIFICATION_SYSTEM


async def verification_task() -> str:
    return (await _ov("graph_verification_task")) or VERIFICATION_TASK
