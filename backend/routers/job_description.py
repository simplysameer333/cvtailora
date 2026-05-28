from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel
from database import get_db

router = APIRouter()


class JobDescriptionBody(BaseModel):
    job_description: str


@router.post("/job-description")
async def save_job_description(session_id: str, body: JobDescriptionBody):
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"job_description": body.job_description}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"ok": True}
