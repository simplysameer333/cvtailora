"""Graph+loop engine endpoints — additive, do NOT replace the live CV Score /
CV Build flows yet (cutover happens after the OpenRouter cache spike + parity
gate). These let us drive the new engine and render its run graph.

POST /api/graph/cv-score   {resume_text, job_description?}  -> {run_id}
POST /api/graph/cv-build   {resume_text, job_description?, profile_text?, key_skills?}
GET  /api/graph/runs/{id}                                    -> full GraphRun (poll + viz)
GET  /api/graph/runs                                         -> recent runs (admin viewer)

The POST returns immediately and runs the graph as a background task that
checkpoints each node into `graph_runs` (services/graph/runner on_update), so the
client polls GET /runs/{id} and the visualization updates live — the async,
Mongo-checkpointed pattern this codebase already uses for generation jobs.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from dependencies.auth import get_optional_user, require_superadmin
from services.graph import store
from services.graph.cv_build_graph import run_cv_build_graph
from services.graph.cv_score_graph import run_cv_score_graph
from services.graph.state import GraphRun

logger = logging.getLogger("cvtailora.graph")
router = APIRouter(prefix="/graph", tags=["graph"])


class CvScoreBody(BaseModel):
    resume_text: str
    job_description: str = ""


class CvBuildBody(BaseModel):
    resume_text: str
    job_description: str = ""
    profile_text: str = ""
    key_skills: list[str] = []
    # Loop exit rules (quality/cycles/cost) come from the user's tier config;
    # not client-settable here.


async def _seed_run(run_id: str, kind: str, user: Optional[dict]) -> None:
    """Persist a pending run immediately so the client can poll before the
    background task writes its first node."""
    run = GraphRun(run_id=run_id, kind=kind, status="pending",
                   user_id=str(user["_id"]) if user else None)
    await store.save(run, get_db())


def _launch(coro) -> None:
    """Fire-and-forget the graph run; failures are recorded on the run doc by the
    graph service itself, so we only need to log an unexpected launch error."""
    async def _wrap():
        try:
            await coro
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("[graph] background run crashed: %s", exc)
    asyncio.create_task(_wrap())


@router.post("/cv-score")
async def start_cv_score(body: CvScoreBody, user: Optional[dict] = Depends(get_optional_user)):
    if not body.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required")
    run_id = uuid.uuid4().hex
    await _seed_run(run_id, "cv_score", user)
    _launch(run_cv_score_graph(
        body.resume_text, body.job_description, tier=(user or {}).get("tier", "free"),
        run_id=run_id, user_id=str(user["_id"]) if user else None, persist=True, db=get_db(),
    ))
    return {"run_id": run_id, "status": "pending"}


@router.post("/cv-build")
async def start_cv_build(body: CvBuildBody, user: Optional[dict] = Depends(get_optional_user)):
    if not body.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required")
    run_id = uuid.uuid4().hex
    await _seed_run(run_id, "cv_build", user)
    _launch(run_cv_build_graph(
        body.resume_text, body.job_description, tier=(user or {}).get("tier", "free"),
        profile_text=body.profile_text, key_skills=body.key_skills, run_id=run_id,
        user_id=str(user["_id"]) if user else None, persist=True, db=get_db(),
    ))
    return {"run_id": run_id, "status": "pending"}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, user: Optional[dict] = Depends(get_optional_user)):
    """Full GraphRun for polling + the graph visualization."""
    run = await store.load(run_id, get_db())
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run.model_dump(mode="json")


@router.get("/runs")
async def list_runs(kind: Optional[str] = None, limit: int = 25,
                    _admin: dict = Depends(require_superadmin)):
    """Recent runs for the admin runs viewer (superadmin only)."""
    return {"runs": await store.list_recent(kind=kind, limit=min(limit, 100), db=get_db())}
