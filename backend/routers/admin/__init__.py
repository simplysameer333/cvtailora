"""Admin API package — all superadmin-only endpoints grouped in one place,
separate from the core application routers.

Sub-modules (each own an APIRouter, all route paths under /api/admin/...):
  core         — users, prompt overrides, professions, system config
  cv_templates — CV template CRUD + AI generation
  scheduler    — alert-scheduler run audit
  tier_config  — tier/feature/pricing config update

Note: admin-*used* services (audit, prompt_store, system_config, tier_config,
agent_memory) stay in services/ — they are shared infrastructure the core
pipeline also depends on, so they are not admin-only.
"""
from fastapi import APIRouter

from . import core, cv_templates, scheduler, tier_config

router = APIRouter()
router.include_router(core.router)
router.include_router(cv_templates.router)
router.include_router(scheduler.router)
router.include_router(tier_config.router)
