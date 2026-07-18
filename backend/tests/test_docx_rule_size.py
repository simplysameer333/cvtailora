"""Generic DOCX/HTML separator-fidelity: the section-rule thickness is derived
from each template's own HTML, so every template (incl. future ones) renders a
DOCX separator matching the on-screen line width."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.cv_template_service import derive_rule_size, normalize_docx_config


def test_derives_thickness_from_accent_border():
    html = '<div style="color:#1d4ed8;">Profile</div><div style="border-top:2.5px solid #1d4ed8;"></div>'
    assert derive_rule_size(html, "1d4ed8") == 15   # 2.5px * 6
    assert derive_rule_size(html, "#1d4ed8") == 15  # tolerant of leading '#'


def test_thin_and_thick_lines_map_proportionally():
    assert derive_rule_size('<i style="border-bottom:1px solid #0891b2">', "0891b2") == 6
    assert derive_rule_size('<i style="border-left:3px solid #0891b2;border-top:3px solid #0891b2">', "0891b2") == 18


def test_widest_accent_border_wins():
    html = 'a border-top:1px solid #ea580c b border-bottom:2px solid #ea580c'
    assert derive_rule_size(html, "ea580c") == 12  # max(1,2)=2 -> 12


def test_no_accent_border_returns_none():
    # Divider is a neutral/tinted colour, not the accent -> not detectable here.
    assert derive_rule_size('<i style="border-top:1px solid #cbd5e1">', "2563eb") is None
    assert derive_rule_size("", "1d4ed8") is None


def test_clamped_to_sane_range():
    assert derive_rule_size('<i style="border-top:10px solid #111111">', "111111") == 20  # clamp high


def test_normalize_injects_derived_rule_size():
    html = '<div style="border-bottom:2px solid #10b981"></div>'
    cfg = normalize_docx_config({"accent": "10b981", "heading": "rule"}, html)
    assert cfg["rule_size"] == 12


def test_explicit_rule_size_wins_over_derivation():
    html = '<div style="border-bottom:2.5px solid #10b981"></div>'  # would derive 15
    cfg = normalize_docx_config({"accent": "10b981", "rule_size": 8}, html)
    assert cfg["rule_size"] == 8


def test_default_when_no_html_and_no_explicit():
    assert normalize_docx_config({"accent": "10b981"})["rule_size"] == 12
