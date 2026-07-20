"""User-actions advisor — tells the user exactly what to provide to push past the threshold.

Pure function: no LLM call, no I/O. Takes the final eval_results + pass_threshold
and returns a structured list of concrete, user-side actions. Called only when the
pipeline exits without meeting the threshold.

Anti-hallucination guarantee
-----------------------------
Every action rule carries a `check_present` function that inspects the actual
generated resume_json. If the data is already there, the action is suppressed —
we never tell the user to "add LinkedIn" when LinkedIn is already in their CV.
Only verifiably absent information surfaces as a gap. This is the most important
invariant in this module: only map available information, never fabricate.

Each action has:
  - category:      which CV section it relates to
  - priority:      "critical" | "high" | "medium"
  - action:        what the user should do (imperative sentence)
  - example:       a concrete example where helpful
  - score_impact:  rough estimate of points this fix is worth
"""
from __future__ import annotations

import re

# ── Presence-check helpers ─────────────────────────────────────────────

def _contact_field(resume_json: dict | None, field: str) -> bool:
    return bool(((resume_json or {}).get("contact") or {}).get(field))


def _phone_has_country_code(resume_json: dict | None) -> bool:
    phone = str(((resume_json or {}).get("contact") or {}).get("phone", "") or "")
    return phone.strip().startswith("+")


def _bullets_contain(resume_json: dict | None, *keywords: str) -> bool:
    for exp in ((resume_json or {}).get("experience") or []):
        for bullet in (exp.get("bullets") or []):
            if any(kw.lower() in bullet.lower() for kw in keywords):
                return True
    return False


def _edu_has_year(resume_json: dict | None) -> bool:
    for edu in ((resume_json or {}).get("education") or []):
        if re.search(r"\b(19|20)\d{2}\b", str(edu.get("dates", ""))):
            return True
    return False


def _certs_have_year(resume_json: dict | None) -> bool:
    for edu in ((resume_json or {}).get("education") or []):
        dates = str(edu.get("dates", ""))
        degree = str(edu.get("degree", ""))
        if re.search(r"\b(19|20)\d{2}\b", dates + " " + degree):
            return True
    return False


def _sections_contain(resume_json: dict | None, *keywords: str) -> bool:
    for sec in ((resume_json or {}).get("sections") or []):
        for item in (sec.get("items") or []):
            if any(kw.lower() in str(item).lower() for kw in keywords):
                return True
    return False


# ── Action rule tables ─────────────────────────────────────────────
# trigger:        substrings in evaluator suggestion text that activate this rule
# check_present:  called with resume_json; True if data IS present -> suppress action
# action:         imperative instruction for the user
# example:        concrete illustration
# score_impact:   rough point estimate

_CONTACT_ACTIONS = [
    {
        "trigger": ["linkedin"],
        "check_present": lambda rj: _contact_field(rj, "linkedin"),
        "action": "Add your LinkedIn profile URL to your CV",
        "example": "linkedin.com/in/your-name",
        "score_impact": 6,
    },
    {
        "trigger": ["github"],
        "check_present": lambda rj: _contact_field(rj, "github"),
        "action": "Add your GitHub profile URL to your CV",
        "example": "github.com/your-username",
        "score_impact": 4,
    },
    {
        "trigger": ["city", "location", "country", "geography"],
        "check_present": lambda rj: _contact_field(rj, "location"),
        "action": "Add your current city and country to your contact section",
        "example": "Mumbai, India  or  London, UK",
        "score_impact": 5,
    },
    {
        "trigger": ["country code", "phone", "+91", "+44", "international", "dialling"],
        "check_present": lambda rj: _phone_has_country_code(rj),
        "action": "Add your country dialling code to your phone number",
        "example": "+44 7911 123456  or  +91 99103 46443",
        "score_impact": 3,
    },
]

_EXPERIENCE_ACTIONS = [
    {
        "trigger": ["team size", "team of", "engineers", "managed", "led a team"],
        "check_present": lambda rj: _bullets_contain(
            rj, "team of", "engineers", "squad of", "people", "led a", "managed a"
        ),
        "action": "State the size of each team you led or worked in",
        "example": "Led a team of 6 QA engineers  /  Worked in a squad of 12",
        "score_impact": 7,
    },
    {
        "trigger": ["defect", "defects", "detection rate", "zero-defect", "critical bug"],
        "check_present": lambda rj: _bullets_contain(
            rj, "defect", "bug", "zero defect", "zero-defect", "critical"
        ),
        "action": "Add a real defect or quality metric for at least one role",
        "example": "Reduced critical defects escaping to production by 40%  /  0 P1 defects in 18 months",
        "score_impact": 8,
    },
    {
        "trigger": ["test case", "test cases", "coverage", "cases per"],
        "check_present": lambda rj: _bullets_contain(
            rj, "test case", "test cases", "coverage", "cases per"
        ),
        "action": "State how many test cases you wrote or executed per release",
        "example": "Authored 350+ test cases per release cycle covering regression, smoke, and UAT",
        "score_impact": 6,
    },
    {
        "trigger": ["release", "releases", "production", "deploy"],
        "check_present": lambda rj: _bullets_contain(
            rj, "release", "deploy", "production", "rollback"
        ),
        "action": "Quantify how many releases you delivered or supported per year",
        "example": "Delivered 12 quarterly releases with zero production rollbacks",
        "score_impact": 6,
    },
    {
        "trigger": ["time", "hours", "reduce", "faster", "sla", "cycle time", "efficiency"],
        "check_present": lambda rj: _bullets_contain(
            rj, "hours", "days", "minutes", "reduce", "faster", "sla", "cycle time", "%"
        ),
        "action": "Add a time-saving or efficiency metric for at least one project",
        "example": "Reduced regression cycle from 4 days to 6 hours using ALM automation",
        "score_impact": 7,
    },
]

_EDUCATION_ACTIONS = [
    {
        "trigger": ["graduation year", "graduation", "year", "btech", "bachelor", "degree year"],
        "check_present": lambda rj: _edu_has_year(rj),
        "action": "Add your graduation year to your degree",
        "example": "Bachelor of Technology (Computer Science) — Ambala College, 2010",
        "score_impact": 5,
    },
    {
        "trigger": ["certification year", "certification date", "valid", "obtained", "istqb", "scrum", "pmp"],
        "check_present": lambda rj: _certs_have_year(rj),
        "action": "Add the year you obtained each certification",
        "example": "ISTQB Foundation Level (2014)  /  Certified Scrum Master (2018)",
        "score_impact": 4,
    },
]

_SKILLS_ACTIONS = [
    {
        "trigger": ["automation", "selenium", "uft", "cypress", "playwright", "framework"],
        "check_present": lambda rj: _sections_contain(
            rj, "selenium", "uft", "cypress", "playwright", "automation"
        ) or _bullets_contain(rj, "selenium", "uft", "cypress", "playwright", "automation"),
        "action": "Confirm whether you have test automation experience and add the tool",
        "example": "Selenium WebDriver (Python)  /  UFT / QTP  /  Cucumber + JUnit",
        "score_impact": 8,
    },
    {
        "trigger": ["modern", "outdated", "legacy", "current", "deprecated"],
        "check_present": lambda rj: False,
        "action": "Replace or label legacy tools with modern equivalents where possible",
        "example": "Replace 'DB2-QMF' with 'SQL Server / PostgreSQL' if applicable",
        "score_impact": 4,
        "always_needs_user": True,
        "why_always": "Only you can judge whether a tool is legacy and what a fair modern equivalent is — this isn't a fact to look up.",
    },
    {
        "trigger": ["keyword", "ats", "job description", "missing skill", "requirement"],
        "check_present": lambda rj: False,
        "action": "Add any key skills from the job description that you genuinely have but omitted",
        "example": "If the JD asks for Jira and you use it daily, add it to your skills section",
        "score_impact": 6,
        "always_needs_user": True,
        "why_always": "Only you can confirm you genuinely have this skill — the AI will never claim one on your behalf.",
    },
]

_CATEGORY_MAP: dict[str, list[dict]] = {
    "contact information": _CONTACT_ACTIONS,
    "contact":             _CONTACT_ACTIONS,
    "work experience":     _EXPERIENCE_ACTIONS,
    "experience":          _EXPERIENCE_ACTIONS,
    "education":           _EDUCATION_ACTIONS,
    "skills":              _SKILLS_ACTIONS,
    "technical skills":    _SKILLS_ACTIONS,
    "ats":                 _SKILLS_ACTIONS,
}

_PRIORITY_MAP = {
    "contact information": "critical",
    "contact":             "critical",
    "work experience":     "critical",
    "experience":          "critical",
    "education":           "high",
    "skills":              "high",
    "technical skills":    "high",
    "ats":                 "high",
}


def _match_actions(
    category_name: str,
    suggestions: list[str],
    resume_json: dict | None,
) -> list[dict]:
    """Return actions triggered by suggestions for a category.

    Anti-hallucination: check_present(resume_json) True -> data already in CV -> skip.
    """
    cat_lower = category_name.lower()
    rule_list: list[dict] | None = None
    priority = "medium"
    for key, rules in _CATEGORY_MAP.items():
        if key in cat_lower:
            rule_list = rules
            priority = _PRIORITY_MAP.get(key, "medium")
            break
    if not rule_list:
        return []

    combined_text = " ".join(suggestions).lower()
    seen_actions: set[str] = set()
    matched: list[dict] = []
    for rule in rule_list:
        if not any(t in combined_text for t in rule["trigger"]):
            continue
        check = rule.get("check_present")
        if check is not None and resume_json is not None and check(resume_json):
            continue  # data present -> not a real gap
        if rule["action"] not in seen_actions:
            seen_actions.add(rule["action"])
            item = {
                "category":     category_name,
                "priority":     priority,
                "action":       rule["action"],
                "example":      rule.get("example", ""),
                "score_impact": rule.get("score_impact", 3),
            }
            # Some gaps are confirmation-only by nature (e.g. "do you have
            # this skill?") — no data lookup can ever resolve them, so the
            # card says so immediately instead of the user having to click
            # Auto-fix and wait to learn it can't help (user report
            # 2026-07-20: "no point showing the button if nothing gets
            # fixed" — true for THESE items specifically, not auto-fix as a
            # whole, which does apply real fixes elsewhere on the same run).
            if rule.get("always_needs_user"):
                item["needs_user"] = True
                item["why_ai_cannot"] = rule.get("why_always", "")
            matched.append(item)
    return matched


def build_user_actions(
    eval_results: list[dict],
    pass_threshold: int,
    final_score: int,
    resume_json: dict | None = None,
) -> dict:
    """Build the user_actions_needed payload.

    resume_json: the best generated resume JSON used for anti-hallucination checks.
                 Pass None to skip checks (actions shown unconditionally).
    """
    category_suggestions: dict[str, list[str]] = {}
    for result in eval_results:
        for suggestion in result.get("suggestions") or []:
            if suggestion.startswith("[") and "]" in suggestion:
                cat = suggestion[1: suggestion.index("]")]
                text = suggestion[suggestion.index("]") + 2:]
                category_suggestions.setdefault(cat, []).append(text)

    actions: list[dict] = []
    for cat, suggestions in category_suggestions.items():
        actions.extend(_match_actions(cat, suggestions, resume_json))

    priority_order = {"critical": 0, "high": 1, "medium": 2}
    actions.sort(key=lambda a: (priority_order.get(a["priority"], 9), -a["score_impact"]))

    seen: set[str] = set()
    unique_actions: list[dict] = []
    for a in actions:
        if a["action"] not in seen:
            seen.add(a["action"])
            unique_actions.append(a)

    points_needed = max(0, pass_threshold - final_score)
    total_potential = sum(a["score_impact"] for a in unique_actions)

    return {
        "threshold_not_met": True,
        "current_score":  final_score,
        "target_score":   pass_threshold,
        "points_needed":  points_needed,
        "estimated_points_available": total_potential,
        "message": (
            f"Your CV scored {final_score}/100 — {points_needed} points below the {pass_threshold} threshold. "
            f"The actions below are things only you can add (real data the AI cannot fabricate). "
            f"Providing them could unlock an estimated +{total_potential} points."
        ),
        "actions": unique_actions,
    }
