"""Unit tests for template colour-variant logic (Phase 3).

Covers the pure DOCX accent override and the accent_variants validator —
colour data lives in MongoDB; these functions must stay generic (no
per-template or per-colour knowledge).
"""
import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.docx_templates import TemplateConfig, apply_accent_override
from services.cv_template_service import _normalize_accent_variants, TemplateGenerationError


def _cfg(accent="ea580c", sidebar_color="", banner_bg="") -> TemplateConfig:
    return TemplateConfig(
        accent=accent, header="left", font="Calibri", heading="rule",
        compact=False, layout="single", sidebar_color=sidebar_color,
        sidebar_ratio=0.0, banner_bg=banner_bg,
    )


def test_accent_override_swaps_accent():
    out = apply_accent_override(_cfg(), "#1d4ed8")
    assert out.accent == "1d4ed8"


def test_sidebar_follows_accent_only_when_it_matched():
    # Vivid-style: sidebar colour == accent → follows the new accent
    linked = apply_accent_override(_cfg(accent="7c3aed", sidebar_color="7c3aed"), "#0d9488")
    assert linked.sidebar_color == "0d9488"
    # TechModern-style: independent dark banner stays untouched
    indep = apply_accent_override(_cfg(accent="10b981", banner_bg="0f172a"), "#e11d48")
    assert indep.banner_bg == "0f172a"
    assert indep.accent == "e11d48"


def test_override_is_pure_copy():
    cfg = _cfg()
    apply_accent_override(cfg, "#111111")
    assert cfg.accent == "ea580c"  # original untouched


def test_variant_validator_normalises():
    assert _normalize_accent_variants(["#1D4ED8", "0d9488"]) == ["#1d4ed8", "#0d9488"]


def test_variant_validator_rejects_bad_hex():
    with pytest.raises(TemplateGenerationError):
        _normalize_accent_variants(["#12345"])
    with pytest.raises(TemplateGenerationError):
        _normalize_accent_variants(["red"])
