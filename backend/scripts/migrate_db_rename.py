"""One-time DB migration for the CVTailora rebrand: copy every collection
from the legacy `tailormycv` database to `cvtailora` on the same cluster.

Usage (from backend/, venv active):
    python -m scripts.migrate_db_rename            # copy + verify
    python -m scripts.migrate_db_rename --verify   # counts comparison only

Design:
  - Non-destructive: the source DB is never modified; keep it as rollback.
  - Idempotent: a target collection with the same doc count is skipped;
    a partial/mismatched one is dropped and re-copied.
  - Copies indexes (except the default _id_) and all GridFS collections
    (fs.files / fs.chunks are ordinary collections).
"""
from __future__ import annotations

import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient

from config import settings

SOURCE = "tailormycv"
TARGET = "cvtailora"
BATCH = 500


async def copy_collection(src_db, dst_db, name: str) -> tuple[int, int]:
    src_count = await src_db[name].count_documents({})
    dst_count = await dst_db[name].count_documents({})

    if dst_count == src_count and src_count > 0:
        print(f"  {name}: already copied ({src_count}) — skipped")
        return src_count, dst_count
    if dst_count:
        print(f"  {name}: partial target ({dst_count} vs {src_count}) — re-copying")
        await dst_db[name].drop()

    batch: list[dict] = []
    async for doc in src_db[name].find({}):
        batch.append(doc)
        if len(batch) >= BATCH:
            await dst_db[name].insert_many(batch, ordered=False)
            batch = []
    if batch:
        await dst_db[name].insert_many(batch, ordered=False)

    # Recreate secondary indexes (preserves TTL/unique/sparse options)
    info = await src_db[name].index_information()
    for idx_name, spec in info.items():
        if idx_name == "_id_":
            continue
        opts = {k: v for k, v in spec.items() if k in ("unique", "sparse", "expireAfterSeconds")}
        keys = list(spec["key"])
        if any(field in ("_fts", "_ftsx") for field, _ in keys):
            # Text index: rebuild the real field list from `weights` (the raw
            # key spec exposes internal _fts/_ftsx fields that can't be re-fed)
            prefix = [(f, d) for f, d in keys if f not in ("_fts", "_ftsx")]
            text_fields = [(f, "text") for f in (spec.get("weights") or {})]
            keys = prefix + text_fields
            if spec.get("default_language"):
                opts["default_language"] = spec["default_language"]
        await dst_db[name].create_index(keys, name=idx_name, **opts)

    dst_count = await dst_db[name].count_documents({})
    status = "OK" if dst_count == src_count else "MISMATCH!"
    print(f"  {name}: {src_count} -> {dst_count} docs, {len(info) - 1} indexes [{status}]")
    return src_count, dst_count


async def main(verify_only: bool) -> int:
    client = AsyncIOMotorClient(settings.mongodb_uri)
    src_db, dst_db = client[SOURCE], client[TARGET]

    names = sorted(await src_db.list_collection_names())
    print(f"{'Verifying' if verify_only else 'Migrating'} {len(names)} collections: {SOURCE} -> {TARGET}\n")

    mismatches = 0
    for name in names:
        if verify_only:
            s = await src_db[name].count_documents({})
            d = await dst_db[name].count_documents({})
            flag = "OK" if s == d else "MISMATCH!"
            if s != d:
                mismatches += 1
            print(f"  {name}: source={s} target={d} [{flag}]")
        else:
            s, d = await copy_collection(src_db, dst_db, name)
            if s != d:
                mismatches += 1

    print(f"\n{'ALL COUNTS MATCH' if mismatches == 0 else f'{mismatches} MISMATCHES — investigate before cutover'}")
    client.close()
    return 0 if mismatches == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--verify" in sys.argv)))
