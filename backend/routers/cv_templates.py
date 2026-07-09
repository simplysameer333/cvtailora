"""Public CV-template router — the HTML preview templates (`cv_templates`).

GET /api/cv-templates — active templates (metadata + standalone HTML + docx_config),
used by the frontend runtime store (lib/cvTemplates.ts) to render previews and by
the builder/CV-score galleries.
"""
from __future__ import annotations

from fastapi import APIRouter

from database import get_db
from services.cv_template_service import list_cv_templates
from services.system_config_service import get_system_config

router = APIRouter()


@router.get("/cv-templates")
async def get_cv_templates():
    db = get_db()
    templates = await list_cv_templates(db, active_only=True)
    # Colour variants are data: a per-template `accent_variants` list wins,
    # else the global palette from system_config (admin-editable, no deploy).
    cfg = await get_system_config(db)
    palette = cfg.get("template_accent_palette") or []
    for t in templates:
        if not t.get("accent_variants"):
            t["accent_variants"] = palette
    return templates
