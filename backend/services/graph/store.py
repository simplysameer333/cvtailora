"""Persistence for GraphRun — the `graph_runs` collection.

One document per run, keyed by run_id (mirrored to _id). This is the durable
state the polling endpoints read and the graph-visualization endpoints render.
Thin CRUD only; all shaping logic lives on the GraphRun model. Motor is async,
so every call is awaited.

Note: Motor `Database`/`Collection` truthiness raises — callers pass an explicit
db or we fall back to get_db(); never use `db or get_db()`.
"""
from __future__ import annotations

import logging
from typing import Optional

from database import get_db
from .state import GraphRun

logger = logging.getLogger("cvtailora.graph")

COLLECTION = "graph_runs"


def _col(db=None):
    database = db if db is not None else get_db()
    return database[COLLECTION]


async def save(run: GraphRun, db=None) -> None:
    """Upsert the full run document (recomputes totals first so the stored copy
    is always internally consistent with its nodes/loops)."""
    run.recompute_totals()
    doc = run.to_doc()
    await _col(db).replace_one({"_id": run.run_id}, doc, upsert=True)


async def load(run_id: str, db=None) -> Optional[GraphRun]:
    """Load one run, or None if absent."""
    doc = await _col(db).find_one({"_id": run_id})
    return GraphRun.from_doc(doc) if doc else None


async def list_recent(kind: Optional[str] = None, limit: int = 25, db=None) -> list[dict]:
    """Lightweight recent-runs listing for the admin runs viewer (no full node
    payloads — just the header fields the list UI needs)."""
    query = {"kind": kind} if kind else {}
    projection = {
        "kind": 1, "status": 1, "model": 1, "created_at": 1, "finished_at": 1,
        "totals": 1, "session_id": 1, "user_id": 1,
    }
    cursor = _col(db).find(query, projection).sort("created_at", -1).limit(limit)
    return [{**d, "run_id": d.pop("_id")} async for d in cursor]


async def ensure_indexes(db=None) -> None:
    """Indexes for the runs collection. Called from startup alongside the others.
    TTL matches the 24h session lifetime so runs self-clean like generation_jobs."""
    col = _col(db)
    await col.create_index([("created_at", -1)])
    await col.create_index([("kind", 1), ("created_at", -1)])
    await col.create_index("session_id", sparse=True)
    await col.create_index("updated_at", expireAfterSeconds=86400)
