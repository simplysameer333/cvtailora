"""Catalog router — predefined roles and skills for profile autocomplete.

GET /api/catalog/roles?q=   — search target roles
GET /api/catalog/skills?q=  — search skills

No authentication required — public read-only data.
"""
from fastapi import APIRouter
from database import get_db

router = APIRouter()


@router.get("/catalog/roles")
async def search_roles(q: str = ""):
    db = get_db()
    query: dict = {"type": "role"}
    if q.strip():
        query["name"] = {"$regex": q.strip(), "$options": "i"}
    cursor = db.catalog.find(query, {"name": 1, "_id": 0}).limit(12)
    items = await cursor.to_list(12)
    return [i["name"] for i in items]


@router.get("/catalog/skills")
async def search_skills(q: str = ""):
    db = get_db()
    query: dict = {"type": "skill"}
    if q.strip():
        query["name"] = {"$regex": q.strip(), "$options": "i"}
    cursor = db.catalog.find(query, {"name": 1, "category": 1, "_id": 0}).limit(15)
    items = await cursor.to_list(15)
    return [i["name"] for i in items]
