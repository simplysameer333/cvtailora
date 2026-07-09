"""GitHub profile enrichment service — fetches public repos and ranks them by JD relevance.

Two-step process:
  1. Pure HTTP fetch of the user's public GitHub repos (no LLM, no auth needed).
  2. ONE focused Haiku call to pick the top-3 most JD-relevant repos and write
     a one-line project highlight for each that mirrors JD vocabulary.

CLAUDE.md contract: one call per purpose. The ranking call does nothing else.
Result injected into user_profile["github_projects"] before the generator loop —
auto-flows into the CANDIDATE PROFILE section via TOON encoding.

Fast: ~3–5 s. Non-fatal: if GitHub is unreachable or the user has no public repos
the caller gets an empty list without raising.
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any
from config import settings

logger = logging.getLogger("cvtailora")

_GITHUB_API = "https://api.github.com"
_MAX_REPOS_TO_FETCH = 30  # fetch top-30 by star count; Haiku then picks top 3

_RANK_SYSTEM = """You are a technical recruiter reviewing a developer's GitHub profile for a specific role.

## TASK
Given a list of the candidate's public GitHub repos and the job description, select the
top 3 repos that are most relevant to this role. For each, write a one-line project
highlight in the first person that mirrors vocabulary from the JD.

## RULES
- Select at most 3 repos. Fewer is fine if less than 3 are genuinely relevant.
- Each highlight must be ≤ 25 words, start with a strong past-tense verb (Built, Designed, Led, etc.).
- Only use information present in the repo metadata — do not invent features.
- If no repos are relevant at all, return an empty selected array.

## OUTPUT
Return ONLY valid JSON — no markdown fences, no explanation:
{
  "selected": [
    {
      "name": "repo-name",
      "url": "https://github.com/user/repo-name",
      "highlight": "Built a REST API with FastAPI and PostgreSQL serving 10k daily requests."
    }
  ]
}"""


def _validate_projects(data: dict) -> list[dict]:
    """Validate ranked project list from Haiku. Returns list of project dicts."""
    selected = data.get("selected")
    if not isinstance(selected, list):
        raise ValueError("'selected' must be a list")
    result = []
    for item in selected[:3]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        url = str(item.get("url", "")).strip()
        highlight = str(item.get("highlight", "")).strip()
        if name and url and highlight:
            result.append({"name": name, "url": url, "highlight": highlight})
    return result


async def _fetch_repos(github_username: str) -> list[dict[str, Any]]:
    """Fetch top-30 public repos sorted by stars. Returns [] on any error."""
    import httpx
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    url = f"{_GITHUB_API}/users/{github_username}/repos"
    params = {"per_page": str(_MAX_REPOS_TO_FETCH), "sort": "stars", "direction": "desc", "type": "owner"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, headers=headers, params=params)
            if res.status_code == 404:
                logger.info("[github_enrichment] User '%s' not found on GitHub.", github_username)
                return []
            res.raise_for_status()
            repos = res.json()
            return [
                {
                    "name": r.get("name", ""),
                    "url": r.get("html_url", ""),
                    "description": r.get("description") or "",
                    "language": r.get("language") or "",
                    "stars": r.get("stargazers_count", 0),
                    "topics": r.get("topics") or [],
                }
                for r in repos
                if not r.get("fork")  # skip forks — they don't represent the candidate's own work
            ]
    except Exception as exc:
        logger.warning("[github_enrichment] Failed to fetch repos for '%s': %s", github_username, exc)
        return []


async def enrich_github_projects(github_username: str, job_description: str) -> list[dict]:
    """Return top-3 JD-relevant project highlights for the given GitHub user.

    Returns an empty list if the user has no public repos, GitHub is unreachable,
    or no repos are relevant to the JD. Never raises.
    """
    if not github_username.strip():
        return []
    if not settings.anthropic_api_key:
        logger.warning("[github_enrichment] ANTHROPIC_API_KEY not set — skipping.")
        return []

    repos = await _fetch_repos(github_username.strip())
    if not repos:
        return []

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=settings.anthropic_api_key,
        max_tokens=500,
        timeout=20,
        max_retries=2,
    )

    repos_text = "\n".join(
        f"- {r['name']} ({r['language']}): {r['description']} [stars: {r['stars']}, topics: {', '.join(r['topics'][:5])}] — {r['url']}"
        for r in repos[:_MAX_REPOS_TO_FETCH]
    )

    content = (
        f"## CANDIDATE GITHUB REPOS\n{repos_text}\n\n"
        f"## JOB DESCRIPTION\n{job_description[:3000]}\n\n"
        "Select the top 3 most relevant repos and write a highlight for each. Return only JSON."
    )

    try:
        response = await llm.ainvoke([SystemMessage(content=_RANK_SYSTEM), HumanMessage(content=content)])
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
        projects = _validate_projects(data)
        logger.info(
            "[github_enrichment] user=%s repos_fetched=%d repos_selected=%d",
            github_username, len(repos), len(projects),
        )
        return projects
    except Exception as exc:
        logger.warning("[github_enrichment] Ranking call failed (non-fatal): %s", exc)
        return []
