"""Public config endpoints (no auth — nothing sensitive).

GET  /api/config/tiers   — live feature gates + limits
GET  /api/config/app     — non-sensitive app config (display timezone)

The admin-only tier-config update lives in routers/admin/tier_config.py.
"""
from fastapi import APIRouter
from services import tier_config_service
from services import system_config_service

router = APIRouter()


@router.get("/config/app")
async def get_app_config():
    """Public, non-sensitive app config for the frontend. Currently just the
    display timezone (single source of truth for rendering stored-UTC times)."""
    cfg = await system_config_service.get_system_config()
    return {"display_timezone": cfg.get("display_timezone", "UTC")}


@router.get("/config/tiers")
async def get_tier_config():
    """Return the live tier config. No auth required — config is not sensitive."""
    return tier_config_service.get_config()
