"""Global system configuration — admin-controlled app-wide flags.

A single document in the `system_config` collection holds master switches that
apply to the whole app (not per-tier, not per-user). Created lazily with defaults
on first read, so no seed step is required.

Currently:
  • alerts_enabled — master switch for the daily job-alert scheduler. When False,
    `run_daily_alerts()` skips the entire run and no alert emails go out to anyone.
"""
from __future__ import annotations

from database import get_db

_DOC_ID = "global"

# All recognised flags + their defaults. Updates are restricted to these keys.
DEFAULTS: dict = {
    "alerts_enabled": True,
    # Title-token synonyms for the job-match scorer (job_match_service).
    # DATA, not code — editable in Mongo without a deploy (no role/title
    # knowledge is hardcoded in the scorer itself).
    "match_token_synonyms": {
        "vp": ["vice", "president"],
        "svp": ["senior", "vice", "president"],
        "evp": ["executive", "vice", "president"],
        "avp": ["assistant", "vice", "president"],
        "sr": ["senior"],
        "jr": ["junior"],
        "mgr": ["manager"],
        "dev": ["developer"],
        "eng": ["engineer"],
        "swe": ["software", "engineer"],
        "pm": ["product", "manager"],
        "cto": ["chief", "technology", "officer"],
        "cio": ["chief", "information", "officer"],
        "md": ["managing", "director"],
    },
    # Global accent-colour palette offered as template colour variants when a
    # cv_templates doc has no per-template `accent_variants` list. DATA — the
    # UI and backend never hardcode colour choices.
    "template_accent_palette": [
        "#1d4ed8",  # blue
        "#0d9488",  # teal
        "#7c3aed",  # violet
        "#ea580c",  # orange
        "#e11d48",  # rose
        "#374151",  # slate
    ],
}


async def get_system_config(db=None) -> dict:
    """Return the global config (merged over defaults). Creates the doc if absent."""
    db = db if db is not None else get_db()
    doc = await db.system_config.find_one({"_id": _DOC_ID})
    if not doc:
        await db.system_config.insert_one({"_id": _DOC_ID, **DEFAULTS})
        doc = {"_id": _DOC_ID, **DEFAULTS}
    return {**DEFAULTS, **{k: v for k, v in doc.items() if k != "_id"}}


def _validate_palette(value) -> list[str]:
    """Normalise the accent palette to '#rrggbb' entries; rejects bad hexes."""
    import re
    out: list[str] = []
    for v in list(value or []):
        s = str(v).strip().lstrip("#").lower()
        if not re.fullmatch(r"[0-9a-f]{6}", s):
            raise ValueError(f"palette entry {v!r} is not a 6-digit hex colour")
        out.append(f"#{s}")
    return out


async def update_system_config(patch: dict, db=None) -> dict:
    """Update recognised flags only; returns the full merged config."""
    db = db if db is not None else get_db()
    allowed = {k: bool(v) if isinstance(DEFAULTS[k], bool) else v
               for k, v in patch.items() if k in DEFAULTS}
    if "template_accent_palette" in allowed:
        allowed["template_accent_palette"] = _validate_palette(allowed["template_accent_palette"])
    if allowed:
        await db.system_config.update_one({"_id": _DOC_ID}, {"$set": allowed}, upsert=True)
    return await get_system_config(db)


async def alerts_enabled(db=None) -> bool:
    cfg = await get_system_config(db)
    return bool(cfg.get("alerts_enabled", True))
