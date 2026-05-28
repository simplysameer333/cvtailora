"""Thin wrapper around toon-format for LLM prompt serialisation.

Uses | as the column delimiter (avoids conflicts with commas in resume text).
All LLM outputs remain JSON — TOON is input-only; no decode needed here.
"""
from __future__ import annotations
import json

try:
    from toon_format import encode as _toon_encode

    _OPTS = {"delimiter": "|"}

    def encode(data: dict | list) -> str:
        return _toon_encode(data, _OPTS)

except ImportError:
    # Fallback to compact JSON if the package is not installed.
    def encode(data: dict | list) -> str:  # type: ignore[misc]
        return json.dumps(data, separators=(",", ":"))


# One-line legend to inject into system prompts that receive TOON-encoded input.
TOON_LEGEND = (
    "Input data uses TOON (compact notation): arrays shown as `field[N|]:` "
    "with tabular arrays declaring column headers and | as the value delimiter; "
    "flat lists as `field[N|]: val1|val2|val3`. Nested objects use indented key: value lines."
)
