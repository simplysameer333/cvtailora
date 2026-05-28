"""Seed the MongoDB professions collection from the code-level profession configs.

Run once after setting up the database, or re-run to upsert new professions:
    python seed_professions.py

Adding a new profession via UI is the preferred runtime path.
This script is for the initial set and for disaster recovery.
"""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings
from services.pipeline.prompts.professions import INITIAL_PROFESSIONS


async def seed():
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client.tailormycv

    now = datetime.utcnow().isoformat()
    seeded, skipped = 0, 0

    for config in INITIAL_PROFESSIONS:
        slug = config["slug"]
        existing = await db.professions.find_one({"slug": slug})
        if existing:
            print(f"  skip  {slug} (already exists)")
            skipped += 1
            continue
        doc = {**config, "created_at": now, "updated_at": now}
        await db.professions.insert_one(doc)
        print(f"  seed  {slug}")
        seeded += 1

    await db.professions.create_index("slug", unique=True)
    client.close()
    print(f"\nDone — {seeded} seeded, {skipped} skipped.")


if __name__ == "__main__":
    asyncio.run(seed())
