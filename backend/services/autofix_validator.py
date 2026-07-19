"""Auto-fix faithfulness gate — pure validation + application of gap-filler edits.

The gap-filler LLM proposes edits that close score gaps using ONLY facts from
the user's own sources (original CV text + profile). Raw LLM output is never
trusted (CLAUDE.md eval-gate rule): every proposed change passes through
`validate_and_apply` before it touches the resume.

Invariant enforced here (the whole point of the feature):
  NEVER insert information absent from the user's own sources.

Checks per change:
  1. `source_quote` must be non-empty and appear (normalised) in the source
     corpus — every insertion must cite the user data that supports it.
  2. Any digit-bearing token (metrics, years, phone numbers) in the new value
     that wasn't already at the edit site must appear in the corpus.
  3. Any URL-like token likewise.
  4. When the new value is a LIST (skills/section items), each newly added
     item must appear in the corpus.
An unverifiable change is REJECTED (dropped), never kept. Pure module —
no I/O, no LLM — so it unit-tests deterministically.
"""
from __future__ import annotations

import copy
import re

# ── Normalisation ──────────────────────────────────────────────────────────────

_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Lowercase + collapse whitespace so quote matching survives formatting."""
    return _WS.sub(" ", str(text or "").lower()).strip()


def _flatten(obj) -> list[str]:
    """Recursively collect every string/number leaf of a dict/list as text."""
    out: list[str] = []
    if isinstance(obj, dict):
        for v in obj.values():
            out.extend(_flatten(v))
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            out.extend(_flatten(v))
    elif obj is not None and obj != "":
        out.append(str(obj))
    return out


def build_source_corpus(*sources) -> str:
    """Normalised text corpus of everything the user has actually provided.

    Accepts any mix of strings (original CV text) and dicts (session profile,
    account profile). Only facts present here may be inserted by auto-fix.
    """
    parts: list[str] = []
    for src in sources:
        if isinstance(src, str):
            parts.append(src)
        elif isinstance(src, dict):
            parts.extend(_flatten(src))
    return normalize("\n".join(p for p in parts if p))


# ── Path access (dot keys + [n] list indices, e.g. experience[0].bullets[2]) ──

_PATH_TOKEN = re.compile(r"([a-zA-Z_][a-zA-Z0-9_]*)((?:\[\d+\])*)")


def parse_path(path: str) -> list[str | int] | None:
    """'contact.linkedin' -> ['contact','linkedin']; 'experience[0].bullets[1]'
    -> ['experience',0,'bullets',1]. None on malformed input."""
    if not path or not isinstance(path, str):
        return None
    parts: list[str | int] = []
    for segment in path.split("."):
        m = _PATH_TOKEN.fullmatch(segment.strip())
        if not m:
            return None
        parts.append(m.group(1))
        for idx in re.findall(r"\[(\d+)\]", m.group(2)):
            parts.append(int(idx))
    return parts


def _get_parent(resume: dict, parts: list[str | int]):
    """Walk to the parent container of the final path segment. None if the
    walk fails — auto-fix only edits locations that already exist."""
    node = resume
    for p in parts[:-1]:
        if isinstance(p, int):
            if not isinstance(node, list) or p >= len(node):
                return None
        else:
            if not isinstance(node, dict) or p not in node:
                return None
        node = node[p]
    return node


# ── Suspicious-token extraction ───────────────────────────────────────────────

_DIGIT_TOKEN = re.compile(r"[^\s,;()]*\d[^\s,;()]*")
_URL_TOKEN = re.compile(r"(?:https?://|www\.)\S+|\S+\.(?:com|org|io|net|dev)/?\S*")


def _value_text(value) -> str:
    if isinstance(value, (list, tuple)):
        return " ".join(str(v) for v in value)
    return str(value or "")


def _strip_edges(token: str) -> str:
    return token.strip(".,;:()[]\"'")


def digit_tokens(text: str) -> list[str]:
    """Digit-bearing tokens — metrics, years, phone fragments, versions."""
    return [_strip_edges(t) for t in _DIGIT_TOKEN.findall(text) if _strip_edges(t)]


def url_tokens(text: str) -> list[str]:
    return [_strip_edges(t) for t in _URL_TOKEN.findall(text) if _strip_edges(t)]


# ── Validation + application ──────────────────────────────────────────────────

# A quote shorter than this can't meaningfully evidence a fact.
_MIN_QUOTE_LEN = 4


def validate_and_apply(
    resume_json: dict,
    changes: list[dict],
    corpus: str,
) -> dict:
    """Apply only the changes whose every fact traces to the source corpus.

    Returns {"resume": <new dict>, "applied": [...], "rejected": [...]} where
    rejected entries carry a `reason`. The input resume is never mutated.
    """
    result = copy.deepcopy(resume_json)
    applied: list[dict] = []
    rejected: list[dict] = []

    for change in changes or []:
        if not isinstance(change, dict):
            continue
        path = change.get("path", "")
        new_value = change.get("new_value")
        quote = str(change.get("source_quote") or "")

        def _reject(reason: str) -> None:
            rejected.append({**change, "reason": reason})

        parts = parse_path(path)
        if not parts or new_value is None:
            _reject("bad_path")
            continue
        parent = _get_parent(result, parts)
        last = parts[-1]
        if parent is None:
            _reject("bad_path")
            continue
        if isinstance(last, int):
            if not isinstance(parent, list) or last >= len(parent):
                _reject("bad_path")
                continue
            before = parent[last]
        else:
            if not isinstance(parent, dict):
                _reject("bad_path")
                continue
            before = parent.get(last, "")

        # 0. No-op "changes" (value identical to what's already there) spend
        #    budget and mislead the report — observed in prod (2026-07-19:
        #    "confirming existing value is correct; no change"). Reject them.
        if normalize(_value_text(new_value)) == normalize(_value_text(before)):
            _reject("no_op")
            continue

        # 1. Every change must cite real user data.
        norm_quote = normalize(quote)
        if len(norm_quote) < _MIN_QUOTE_LEN:
            _reject("missing_source_quote")
            continue
        if norm_quote not in corpus:
            _reject("quote_not_in_source")
            continue

        before_norm = normalize(_value_text(before))
        new_text = _value_text(new_value)

        # 2. New numbers must come from the user's own data, never the model.
        bad = next(
            (t for t in digit_tokens(new_text)
             if normalize(t) not in before_norm and normalize(t) not in corpus),
            None,
        )
        if bad:
            _reject(f"unverified_number:{bad}")
            continue

        # 3. Same for URLs — a plausible-looking profile link is fabrication.
        bad = next(
            (t for t in url_tokens(new_text)
             if normalize(t) not in before_norm and normalize(t) not in corpus),
            None,
        )
        if bad:
            _reject(f"unverified_url:{bad}")
            continue

        # 4. List values (skills / section items): each ADDED item must exist
        #    in the sources — a skill the user never claimed is fabrication.
        if isinstance(new_value, list):
            before_items = {normalize(str(v)) for v in before} if isinstance(before, list) else set()
            bad_item = next(
                (str(it) for it in new_value
                 if normalize(str(it)) not in before_items and normalize(str(it)) not in corpus),
                None,
            )
            if bad_item:
                _reject(f"unverified_item:{bad_item}")
                continue

        parent[last] = new_value
        applied.append(dict(change))

    return {"resume": result, "applied": applied, "rejected": rejected}
