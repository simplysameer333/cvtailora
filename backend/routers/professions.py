from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from services.profession_service import (
    get_all_professions,
    get_profession_by_slug,
    create_profession,
    update_profession,
    delete_profession,
)

router = APIRouter()


class ProfessionBody(BaseModel):
    slug: str
    display_name: str
    keywords: list[str]
    generator_context: str = ""
    evaluator_context: str = ""
    scoring_criteria: str = ""
    aggregator_context: str = ""
    # Names of evaluators to use for this profession. Empty = use all configured.
    evaluator_names: list[str] = []


class ProfessionUpdateBody(BaseModel):
    display_name: Optional[str] = None
    keywords: Optional[list[str]] = None
    generator_context: Optional[str] = None
    evaluator_context: Optional[str] = None
    scoring_criteria: Optional[str] = None
    aggregator_context: Optional[str] = None
    evaluator_names: Optional[list[str]] = None


@router.get("/professions")
async def list_professions():
    db = get_db()
    return await get_all_professions(db)


@router.get("/professions/{slug}")
async def get_profession(slug: str):
    db = get_db()
    profession = await get_profession_by_slug(db, slug)
    if not profession:
        raise HTTPException(404, f"Profession '{slug}' not found.")
    return profession


@router.post("/professions", status_code=201)
async def add_profession(body: ProfessionBody):
    db = get_db()
    existing = await get_profession_by_slug(db, body.slug)
    if existing:
        raise HTTPException(409, f"Profession '{body.slug}' already exists.")
    return await create_profession(db, body.model_dump())


@router.put("/professions/{slug}")
async def edit_profession(slug: str, body: ProfessionUpdateBody):
    db = get_db()
    updated = await update_profession(db, slug, {k: v for k, v in body.model_dump().items() if v is not None})
    if not updated:
        raise HTTPException(404, f"Profession '{slug}' not found.")
    return updated


@router.delete("/professions/{slug}", status_code=204)
async def remove_profession(slug: str):
    db = get_db()
    deleted = await delete_profession(db, slug)
    if not deleted:
        raise HTTPException(404, f"Profession '{slug}' not found.")
