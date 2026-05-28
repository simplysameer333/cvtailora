"""MongoDB CRUD for profession configs + runtime resolution.

Professions are seeded from code (seed_professions.py) and can be managed
via the /api/professions endpoints. The pipeline resolves the correct config
once before invoking the graph — no DB calls happen inside the eval loop.
"""
from __future__ import annotations
from datetime import datetime

from services.pipeline.prompts.professions import resolve_profession
from services.pipeline.prompts.professions.generic import CONFIG as GENERIC_CONFIG


async def get_all_professions(db) -> list[dict]:
    """Return all active profession configs from MongoDB, excluding the _id field."""
    cursor = db.professions.find({"is_active": True}, {"_id": 0})
    return await cursor.to_list(None)


async def get_profession_by_slug(db, slug: str) -> dict | None:
    """Return a single active profession config by slug, or None if not found."""
    return await db.professions.find_one({"slug": slug, "is_active": True}, {"_id": 0})


async def resolve_profession_for_role(db, target_role: str) -> dict:
    """Return the best-matching profession config for the target role.

    Fetches all active professions from MongoDB and delegates matching to
    the code-level resolve_profession() function. Falls back to GENERIC_CONFIG
    if the DB is empty or no profession matches.
    """
    professions = await get_all_professions(db)
    return resolve_profession(professions, target_role)


async def create_profession(db, data: dict) -> dict:
    """Insert a new profession config into MongoDB and return the stored document."""
    now = datetime.utcnow().isoformat()
    doc = {**data, "is_active": True, "created_at": now, "updated_at": now}
    await db.professions.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def update_profession(db, slug: str, data: dict) -> dict | None:
    """Update the profession with the given slug and return the updated document.

    Returns None if no profession with that slug exists.
    """
    data["updated_at"] = datetime.utcnow().isoformat()
    result = await db.professions.find_one_and_update(
        {"slug": slug},
        {"$set": data},
        return_document=True,
    )
    if result:
        result.pop("_id", None)
    return result


async def delete_profession(db, slug: str) -> bool:
    """Soft-delete a profession by setting is_active=False. Returns True if a doc was updated."""
    result = await db.professions.update_one(
        {"slug": slug},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
    )
    return result.modified_count > 0
