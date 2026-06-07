"""Per-agent memory — historical knowledge that makes agents cheaper over time.

Each agent keeps a rolling record of how its recent work turned out: what tended
to go well, what fell short, and concrete suggestions to do better next time —
both for RESULT quality (hitting the tier score bar) and for COST (fewer refine
cycles). The generator reads its own lessons and injects them into its prompt so
the FIRST draft already targets the weaknesses past runs revealed → fewer cycles
→ lower cost. The whole thing is read-only in the admin dashboard.

Design (cheap by construction — no extra LLM calls):
- Stats are updated deterministically from each completed run's telemetry + eval
  results (running sums in a per-agent doc).
- Lessons are derived from those stats (frequency of each weakness, pass rate,
  avg cycles/cost). So the "agent learning" loop costs one Mongo upsert per run,
  not an LLM call — which matters when the whole point is to reduce spend.

Section-level tracking:
- section_weaknesses: {section_slug: {weakness_type: count}} — tracks which
  weakness types appear most in each CV section so the generator gets targeted,
  per-section advice rather than only global hints.

Collection `agent_memory`, one doc per agent (_id = agent name).
"""
from __future__ import annotations

from datetime import datetime, timezone

_COLLECTION = "agent_memory"

# Agents we track + a one-line description for the admin view.
AGENT_DESCRIPTIONS: dict[str, str] = {
    "generator":  "Writes the tailored resume each cycle. Its lessons feed back into its own prompt.",
    "anthropic":  "Claude evaluator — narrative / hiring-manager judgement.",
    "openai":     "GPT evaluator — ATS / keyword-match lens.",
    "google":     "Gemini evaluator — evidence / coverage lens.",
}

# Weakness taxonomy — maps a canonical weakness to substrings that signal it in
# an evaluator's free-text suggestion. Drives the "what didn't work" tallies and
# the improvement hints injected back into the generator.
_WEAKNESS_KEYWORDS: dict[str, list[str]] = {
    "JD alignment / keywords": ["keyword", "jd ", "job description", "ats", "terminolog", "align", "requirement"],
    "quantification":          ["quantif", "metric", "number", "measur", "%", "impact", "result"],
    "action verbs / bullets":  ["verb", "passive", "filler", "weak", "responsib"],
    "professional summary":    ["summary", "headline", "objective", "positioning"],
    "structure / ordering":    ["structur", "ordering", "order ", "layout", "section"],
    "grammar / spelling":      ["grammar", "spelling", "typo", "punctuation", "tense"],
    "length / page fit":       ["page", "length", "truncat", "overflow", "too long", "spill"],
}

# Maps display section names (substrings) → canonical slugs used in section_weaknesses.
# Ordered: more specific patterns first so "work experience" beats "experience".
_SECTION_SLUG_MAP: list[tuple[str, str]] = [
    ("contact information", "contact"),
    ("contact",             "contact"),
    ("work experience",     "experience"),
    ("experience",          "experience"),
    ("professional summary","summary"),
    ("summary",             "summary"),
    ("education",           "education"),
    ("ats",                 "ats"),
    ("design",              "design"),
    ("skill",               "skills"),   # "Skills", "Technical Skills"
]


def _section_slug(name: str) -> str:
    """Normalise a section display name (e.g. 'Work Experience') to a slug."""
    low = (name or "").lower().strip()
    for pattern, slug in _SECTION_SLUG_MAP:
        if pattern in low:
            return slug
    return "other"


def _classify(suggestion: str) -> list[str]:
    """Return canonical weakness types found in a suggestion string."""
    s = (suggestion or "").lower()
    return [w for w, keys in _WEAKNESS_KEYWORDS.items() if any(k in s for k in keys)]


def _classify_with_section(suggestion: str) -> tuple[str, list[str]]:
    """Parse a '[Section Name] improvement text' suggestion.

    Returns (section_slug, [weakness_type, ...]).
    Suggestions from cv_score evaluator use this prefix format.
    """
    section = "other"
    text = suggestion or ""
    if text.startswith("[") and "]" in text:
        bracket = text[1:text.index("]")]
        section = _section_slug(bracket)
        text = text[text.index("]") + 2:]   # skip "] "
    return section, _classify(text)


def _round(v: float, n: int = 2) -> float:
    return round(v, n)


async def ensure_seed(db) -> None:
    """Create empty memory docs for known agents so the admin view isn't blank."""
    now = datetime.now(timezone.utc)
    for agent, desc in AGENT_DESCRIPTIONS.items():
        await db[_COLLECTION].update_one(
            {"_id": agent},
            {"$setOnInsert": {
                "_id": agent, "agent": agent, "description": desc,
                "runs": 0, "totals": {}, "weaknesses": {}, "section_weaknesses": {},
                "lessons": [], "created_at": now, "updated_at": now,
            }},
            upsert=True,
        )


def _derive_generator_lessons(
    runs: int, totals: dict, weaknesses: dict, section_weaknesses: dict,
) -> list[dict]:
    """Turn rolling stats into human-readable 'worked / didn't / improve' lessons."""
    if runs <= 0:
        return []
    avg_first = _round(totals.get("first_score", 0) / runs, 1)
    avg_cycles = _round(totals.get("cycles", 0) / runs, 1)
    avg_cost = _round(totals.get("cost", 0) / runs, 3)
    pass_rate = _round(100 * totals.get("passes", 0) / runs, 0)
    top_global = sorted(weaknesses.items(), key=lambda kv: kv[1], reverse=True)[:3]

    lessons: list[dict] = []
    # What worked
    lessons.append({
        "kind": "worked",
        "text": f"Average first-draft score {avg_first}; {pass_rate:.0f}% of runs cleared the tier bar. "
                f"Strongest when the draft already mirrors the JD and quantifies results.",
    })
    # Global worst weaknesses
    if top_global:
        worst = ", ".join(f"{w} ({n}×)" for w, n in top_global)
        lessons.append({
            "kind": "didnt",
            "text": f"Most frequent shortfalls across all sections: {worst}. These forced extra refine cycles.",
        })
    # Per-section breakdown (top weakness per section, for the most-troubled sections)
    section_summaries: list[tuple[str, str, int]] = []  # (section, worst_weakness, count)
    for sec, weak_counts in (section_weaknesses or {}).items():
        if not weak_counts:
            continue
        top_w, top_n = max(weak_counts.items(), key=lambda kv: kv[1])
        section_summaries.append((sec, top_w, top_n))
    section_summaries.sort(key=lambda t: -t[2])

    if section_summaries:
        per_sec = "; ".join(f"{sec} → {w} ({n}×)" for sec, w, n in section_summaries[:4])
        lessons.append({
            "kind": "section",
            "text": f"Per-section recurring gaps: {per_sec}.",
        })

    # Improvement directive injected into the generator prompt
    directives: list[str] = []
    if top_global:
        directives.append(", ".join(w for w, _ in top_global[:3]))
    if section_summaries:
        sec_tips = "; ".join(f"{sec}: fix {w}" for sec, w, _ in section_summaries[:3])
        directives.append(f"Section-level: {sec_tips}")

    if directives:
        lessons.append({
            "kind": "improve",
            "text": f"Pre-empt these on the FIRST pass: {' | '.join(directives)}. "
                    f"Currently averaging {avg_cycles} cycles and ${avg_cost} per resume.",
        })
    return lessons


def _derive_evaluator_lessons(runs: int, totals: dict) -> list[dict]:
    if runs <= 0:
        return []
    avg_score = _round(totals.get("score", 0) / runs, 1)
    return [{
        "kind": "worked",
        "text": f"Scored {runs} resumes, average {avg_score}/100. Use this as a calibration baseline "
                f"against the other evaluators in the panel.",
    }]


async def record_generation_outcome(outcome: dict) -> None:
    """Update agent memory after a completed generation run (call in background).

    outcome = {
      first_score, cycles, cost_usd, passed, tier,
      evaluators: [{model, score, suggestions:[str]}],   # final-cycle results
    }
    Best-effort: never raise into the request path.
    """
    try:
        from database import get_db
        db = get_db()
        now = datetime.now(timezone.utc)

        # ── Generator memory ─────────────────────────────────────────────
        weakness_inc: dict[str, int] = {}
        section_weak_inc: dict[str, dict[str, int]] = {}

        for ev in outcome.get("evaluators", []):
            for sug in ev.get("suggestions", []):
                sec, weaknesses = _classify_with_section(sug)
                for w in weaknesses:
                    weakness_inc[w] = weakness_inc.get(w, 0) + 1
                    section_weak_inc.setdefault(sec, {})
                    section_weak_inc[sec][w] = section_weak_inc[sec].get(w, 0) + 1

        gen = await db[_COLLECTION].find_one({"_id": "generator"}) or {}
        runs = gen.get("runs", 0) + 1
        totals = dict(gen.get("totals", {}) or {})
        totals["first_score"] = totals.get("first_score", 0) + outcome.get("first_score", 0)
        totals["cycles"]      = totals.get("cycles", 0)      + outcome.get("cycles", 0)
        totals["cost"]        = totals.get("cost", 0.0)       + float(outcome.get("cost_usd", 0.0))
        totals["passes"]      = totals.get("passes", 0)       + (1 if outcome.get("passed") else 0)

        weaknesses = {**(gen.get("weaknesses", {}) or {})}
        for w, n in weakness_inc.items():
            weaknesses[w] = weaknesses.get(w, 0) + n

        section_weaknesses: dict[str, dict[str, int]] = dict(gen.get("section_weaknesses", {}) or {})
        for sec, weak_counts in section_weak_inc.items():
            section_weaknesses.setdefault(sec, {})
            for w, n in weak_counts.items():
                section_weaknesses[sec][w] = section_weaknesses[sec].get(w, 0) + n

        lessons = _derive_generator_lessons(runs, totals, weaknesses, section_weaknesses)

        await db[_COLLECTION].update_one(
            {"_id": "generator"},
            {"$set": {
                "agent": "generator",
                "description": AGENT_DESCRIPTIONS["generator"],
                "runs": runs,
                "totals": totals,
                "weaknesses": weaknesses,
                "section_weaknesses": section_weaknesses,
                "lessons": lessons,
                "updated_at": now,
            }, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )

        # ── Per-evaluator memory (calibration baseline) ────────────────────
        for ev in outcome.get("evaluators", []):
            name = ev.get("model")
            if name not in AGENT_DESCRIPTIONS:
                continue
            doc = await db[_COLLECTION].find_one({"_id": name}) or {}
            e_runs = doc.get("runs", 0) + 1
            e_tot = dict(doc.get("totals", {}) or {})
            e_tot["score"] = e_tot.get("score", 0) + int(ev.get("score", 0))
            await db[_COLLECTION].update_one(
                {"_id": name},
                {"$set": {
                    "agent": name, "description": AGENT_DESCRIPTIONS[name],
                    "runs": e_runs, "totals": e_tot,
                    "lessons": _derive_evaluator_lessons(e_runs, e_tot),
                    "updated_at": now,
                }, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
    except Exception:
        pass  # memory is best-effort; never break generation


async def get_generator_memory_text(db) -> str:
    """Concise injectable block of the generator's top improvement hints (or '').

    Read once per generation (cheap). Empty until enough runs have accumulated.
    Includes both global weakness hints and per-section targeted advice so the
    generator can address the worst offenders section by section on the first pass.
    """
    try:
        doc = await db[_COLLECTION].find_one(
            {"_id": "generator"},
            {"weaknesses": 1, "section_weaknesses": 1, "runs": 1},
        )
    except Exception:
        return ""
    if not doc or doc.get("runs", 0) < 5:  # wait for a little signal before steering
        return ""

    top_global = sorted(
        (doc.get("weaknesses", {}) or {}).items(), key=lambda kv: kv[1], reverse=True
    )[:3]

    section_weaknesses: dict[str, dict] = doc.get("section_weaknesses", {}) or {}
    SECTION_ORDER = ["experience", "summary", "contact", "skills", "education", "ats", "design"]
    section_hints: list[str] = []
    for sec in SECTION_ORDER:
        weak_counts = section_weaknesses.get(sec, {})
        if not weak_counts:
            continue
        top = sorted(weak_counts.items(), key=lambda kv: kv[1], reverse=True)[:2]
        items = ", ".join(f"{w} ({n}×)" for w, n in top)
        section_hints.append(f"  [{sec}] {items}")
    for sec, weak_counts in section_weaknesses.items():
        if sec in SECTION_ORDER or not weak_counts:
            continue
        top = sorted(weak_counts.items(), key=lambda kv: kv[1], reverse=True)[:1]
        items = ", ".join(f"{w} ({n}×)" for w, n in top)
        section_hints.append(f"  [{sec}] {items}")

    if not top_global and not section_hints:
        return ""

    lines = ["## LEARNED FROM PAST RUNS — pre-empt these weaknesses on the FIRST draft\n"]
    if top_global:
        global_str = "; ".join(w for w, _ in top_global)
        lines.append(f"Global most-common gaps: {global_str}\n")
    if section_hints:
        lines.append("Per-section recurring gaps (fix these in the relevant section):")
        lines.extend(section_hints)
    return "\n".join(lines)


async def list_agent_memory(db) -> list[dict]:
    """Return all agent memory docs with computed averages for the admin view."""
    out: list[dict] = []
    docs = await db[_COLLECTION].find({}).to_list(length=50)
    order = {name: i for i, name in enumerate(AGENT_DESCRIPTIONS)}
    for d in sorted(docs, key=lambda d: order.get(d.get("agent", ""), 99)):
        runs = d.get("runs", 0)
        totals = d.get("totals", {}) or {}
        stats: dict = {"runs": runs}
        if runs > 0:
            if "first_score" in totals:
                stats.update({
                    "avg_first_score": _round(totals.get("first_score", 0) / runs, 1),
                    "avg_cycles":      _round(totals.get("cycles", 0) / runs, 1),
                    "avg_cost_usd":    _round(totals.get("cost", 0.0) / runs, 3),
                    "pass_rate_pct":   _round(100 * totals.get("passes", 0) / runs, 0),
                })
            if "score" in totals:
                stats["avg_score"] = _round(totals.get("score", 0) / runs, 1)
        out.append({
            "agent":             d.get("agent", d.get("_id", "")),
            "description":       d.get("description", ""),
            "stats":             stats,
            "weaknesses":        sorted(
                (d.get("weaknesses", {}) or {}).items(), key=lambda kv: kv[1], reverse=True
            ),
            "section_weaknesses": {
                sec: sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
                for sec, counts in (d.get("section_weaknesses", {}) or {}).items()
            },
            "lessons":    d.get("lessons", []),
            "updated_at": d.get("updated_at"),
        })
    return out
