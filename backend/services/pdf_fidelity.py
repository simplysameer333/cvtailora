"""PDF fidelity checker — deterministic, LLM-free template-match scoring.

Answers "how closely does the produced PDF match the previewed template?"
with a number, so template fidelity is MEASURED, not eyeballed (user request
2026-07-19). Pure pipeline, no LLM:

  1. Reference: headless-Chromium full-page screenshot of the SAME preview
     HTML the client displays (shares the browser from pdf_renderer).
  2. Candidate: the produced PDF's pages rasterised with pypdfium2 (pure-pip,
     no poppler) and stacked vertically.
  3. Both images normalised to the same width, cropped to the shared height,
     downscaled, and compared per-pixel -> similarity score 0-100.

`compare_images` is pure and unit-testable without a browser. Used by the
verification harness/tests as a regression gate for the 20+ templates; can
also run per-export behind settings.pdf_fidelity_check for telemetry.
"""
from __future__ import annotations

import asyncio
import io
import logging

logger = logging.getLogger("cvtailora")

_A4_WIDTH_PX = 794          # CSS px at 96 dpi — matches the preview iframe
_COMPARE_WIDTH = 220        # downscale before diffing: layout signal, not noise
_SCREENSHOT_TIMEOUT_S = 30


def compare_images(img_a, img_b) -> float:
    """Pure: similarity (0-100) of two PIL images, ink-aware.

    A naive whole-page mean diff saturates on resumes — pages are mostly
    white, so two entirely different designs still scored ~99 (observed in
    the first harness run). Instead:

      ink IoU   — binary content masks (luminance < 240) intersect/union:
                  does ink sit in the SAME PLACES (layout, indentation)?
      ink diff  — mean RGB difference restricted to the ink union:
                  where there is content, is it the SAME content/colour?

    similarity = 100 * (0.5*IoU + 0.5*(1 - ink_diff/255)). Identical -> 100;
    same layout with antialiasing noise -> 85+; different designs -> low.
    Returns 0 when either page has no measurable ink.
    """
    from PIL import Image, ImageChops, ImageStat

    def _norm(img):
        w, h = img.size
        scale = _COMPARE_WIDTH / w
        return img.convert("RGB").resize((_COMPARE_WIDTH, max(1, int(h * scale))), Image.BILINEAR)

    a, b = _norm(img_a), _norm(img_b)
    height = min(a.size[1], b.size[1])
    if height < 10:
        return 0.0
    a, b = a.crop((0, 0, _COMPARE_WIDTH, height)), b.crop((0, 0, _COMPARE_WIDTH, height))

    ink = lambda img: img.convert("L").point(lambda v: 255 if v < 240 else 0)
    mask_a, mask_b = ink(a), ink(b)
    inter = ImageChops.multiply(mask_a, mask_b).histogram()[255]
    union_mask = ImageChops.lighter(mask_a, mask_b)
    union = union_mask.histogram()[255]
    if union < 20:  # blank-vs-blank proves nothing
        return 0.0
    iou = inter / union

    diff = ImageChops.difference(a, b)
    black = Image.new("RGB", a.size, "black")
    masked = Image.composite(diff, black, union_mask)
    ink_diff = sum(ImageStat.Stat(masked).sum) / 3.0 / union  # mean over ink px

    return round(100.0 * (0.5 * iou + 0.5 * (1.0 - min(ink_diff, 255.0) / 255.0)), 1)


def pdf_to_image(pdf_bytes: bytes):
    """Rasterise all PDF pages (pypdfium2) and stack them vertically at the
    reference width. Returns a PIL image."""
    import pypdfium2 as pdfium
    from PIL import Image

    doc = pdfium.PdfDocument(pdf_bytes)
    try:
        pages = []
        for i in range(len(doc)):
            page = doc[i]
            scale = _A4_WIDTH_PX / page.get_size()[0]
            pages.append(page.render(scale=scale).to_pil())
        total_h = sum(p.size[1] for p in pages)
        stacked = Image.new("RGB", (_A4_WIDTH_PX, total_h), "white")
        y = 0
        for p in pages:
            stacked.paste(p.convert("RGB"), (0, y))
            y += p.size[1]
        return stacked
    finally:
        doc.close()


class PdfFidelityChecker:
    """Compares preview HTML against a produced PDF and scores the match."""

    async def screenshot_html(self, html: str):
        """Full-page PNG of the HTML at A4 width via the shared Chromium."""
        from PIL import Image
        from services.pdf_renderer import _get_browser

        browser = await _get_browser()
        page = await browser.new_page(viewport={"width": _A4_WIDTH_PX, "height": 1123})
        try:
            await asyncio.wait_for(page.set_content(html, wait_until="load"),
                                   timeout=_SCREENSHOT_TIMEOUT_S)
            png = await asyncio.wait_for(page.screenshot(full_page=True),
                                         timeout=_SCREENSHOT_TIMEOUT_S)
            return Image.open(io.BytesIO(png))
        finally:
            await page.close()

    async def check(self, html: str, pdf_bytes: bytes) -> dict:
        """Return {"similarity": 0-100, "pdf_pages": n} for html vs pdf."""
        import pypdfium2 as pdfium

        reference = await self.screenshot_html(html)
        candidate = pdf_to_image(pdf_bytes)
        n_pages = len(pdfium.PdfDocument(pdf_bytes))
        similarity = compare_images(reference, candidate)
        logger.info("[pdf-fidelity] similarity=%.1f pages=%d ref=%s pdf=%s",
                    similarity, n_pages, reference.size, candidate.size)
        return {"similarity": similarity, "pdf_pages": n_pages}
