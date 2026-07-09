"""End-to-end test for the scanned-PDF OCR fallback in resume_parser.

Builds an image-only PDF (text drawn as pixels — no text layer, exactly what
a scanned/Canva-exported resume looks like) and asserts parse_resume recovers
the content through the OCR path.
"""
import io
import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ocr_service import ocr_available
from services.resume_parser import parse_resume


def _scanned_pdf(lines: list[str]) -> bytes:
    """Render text lines onto a white A4-ish image and save it as a PDF."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (1240, 1754), "white")  # A4 at ~150 dpi
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=40)
    y = 100
    for line in lines:
        draw.text((100, y), line, fill="black", font=font)
        y += 80

    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


@pytest.mark.skipif(not ocr_available(), reason="rapidocr not installed")
def test_scanned_pdf_falls_back_to_ocr():
    pdf_bytes = _scanned_pdf([
        "ALEX JOHNSON",
        "Senior Python Developer",
        "alex.johnson@example.com",
        "EXPERIENCE",
        "Built FastAPI services on MongoDB",
    ])
    parsed = parse_resume(pdf_bytes, "scanned_resume.pdf")
    text = parsed["raw_text"].upper()

    assert "ALEX JOHNSON" in text
    assert "PYTHON" in text
    assert "EXPERIENCE" in text


def test_text_pdf_does_not_use_ocr(monkeypatch):
    """A PDF with a real text layer must never enter the OCR path."""
    from reportlab.pdfgen import canvas as rl_canvas

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf)
    y = 800
    # Enough text to clear the 100-char scanned-PDF heuristic
    for line in [
        "Alex Johnson - Senior Python Developer",
        "alex.johnson@example.com | London, UK",
        "EXPERIENCE: Built FastAPI services on MongoDB Atlas",
        "Led a team of four engineers delivering LLM pipelines",
    ]:
        c.drawString(72, y, line)
        y -= 24
    c.save()

    import services.resume_parser as rp

    def _boom(*args, **kwargs):  # pragma: no cover
        raise AssertionError("OCR must not run for text-layer PDFs")

    monkeypatch.setattr("services.ocr_service.ocr_pdf_text", _boom)
    parsed = parse_resume(buf.getvalue(), "text_resume.pdf")
    assert "Alex Johnson" in parsed["raw_text"]
