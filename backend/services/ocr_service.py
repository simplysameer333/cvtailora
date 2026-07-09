"""OCR fallback for scanned / image-based PDFs.

Engine: RapidOCR (ONNX runtime) — pure pip install with bundled models, no
system binaries (tesseract/poppler), so it behaves identically on Windows dev
and Railway. Page rendering uses pdfplumber's pypdfium2 backend, which is
already a project dependency.

The engine is lazily initialised on first use (model load ~1–2 s) and cached
at module level. `ocr_available()` lets callers degrade gracefully when the
package isn't installed.
"""
from __future__ import annotations

import io
import logging

logger = logging.getLogger("cvtailora")

_engine = None

# 200 dpi balances OCR accuracy against render time/memory (~1–3 s per page).
_RENDER_RESOLUTION = 200


def ocr_available() -> bool:
    try:
        import rapidocr_onnxruntime  # noqa: F401
        return True
    except ImportError:
        return False


def _get_engine():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _engine = RapidOCR()
    return _engine


def ocr_pdf_text(file_bytes: bytes) -> str:
    """Extract text from a scanned PDF by rendering each page and OCR-ing it.

    Returns concatenated page text ("" when nothing is recognised). Blocking —
    same contract as the pdfplumber text path in resume_parser.
    """
    import numpy as np
    import pdfplumber

    engine = _get_engine()
    page_texts: list[str] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            image = page.to_image(resolution=_RENDER_RESOLUTION).original
            result, _elapse = engine(np.array(image))
            if result:
                # result rows: [box, text, confidence] — top-to-bottom order
                page_texts.append("\n".join(row[1] for row in result))

    text = "\n".join(page_texts)
    logger.info("[ocr] Extracted %d chars from scanned PDF (%d pages)",
                len(text), len(page_texts))
    return text
