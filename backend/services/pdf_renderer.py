"""Template-faithful PDF rendering — prints the SAME HTML the preview shows.

Why this exists (2026-07-19, user key-feature report): the legacy reportlab
PDF is one generic layout that ignores the selected template entirely, so the
downloaded PDF never matched the preview (bullets, fonts, colours, spacing).
Fidelity is guaranteed here by construction: the client sends the exact
rendered template HTML it displays (rendering lives once, in
frontend/src/lib/cvTemplates.ts — per the templates-are-data rule), and this
module prints it with headless Chromium — the same engine the browser preview
uses. No per-template code; a new admin/AI template exports correctly with no
deploy.

Ops notes:
- Chromium is installed at image build (backend/Dockerfile: playwright
  install --with-deps chromium). When unavailable (e.g. a dev machine without
  the browser), is_available() is False and the export route falls back to
  the legacy generic PDF — export never breaks.
- One shared browser process, lazily launched; per-render pages; a semaphore
  bounds concurrent renders (PDF printing is memory-hungry).
"""
from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger("cvtailora")

# Bound concurrent Chromium pages — each render holds ~50-150 MB.
_MAX_CONCURRENT = 2
# A rendered resume template is ~20-200 KB; anything huge is not a resume.
MAX_HTML_BYTES = 3_000_000
_RENDER_TIMEOUT_S = 30

_semaphore = asyncio.Semaphore(_MAX_CONCURRENT)
_browser = None
_playwright = None
_lock = asyncio.Lock()


def is_available() -> bool:
    """True when the playwright package is importable (browser presence is
    checked lazily at first render — a missing browser raises there and the
    caller falls back)."""
    try:
        import playwright  # noqa: F401
        return True
    except ImportError:
        return False


async def _get_browser():
    global _browser, _playwright
    async with _lock:
        if _browser is not None and _browser.is_connected():
            return _browser
        from playwright.async_api import async_playwright
        _playwright = await async_playwright().start()
        # --no-sandbox: required in the Railway container (no user namespaces).
        _browser = await _playwright.chromium.launch(args=["--no-sandbox"])
        logger.info("[pdf-renderer] Headless Chromium launched.")
        return _browser


async def render_html_to_pdf(html: str) -> bytes:
    """Print self-contained resume HTML to an A4 PDF (background colours kept).

    Raises on any failure — the export route catches and falls back to the
    legacy generic PDF so the user always gets a file.
    """
    if not html or len(html.encode("utf-8", "ignore")) > MAX_HTML_BYTES:
        raise ValueError("rendered_html missing or too large")

    async with _semaphore:
        browser = await _get_browser()
        page = await browser.new_page()
        try:
            await asyncio.wait_for(
                page.set_content(html, wait_until="load"),
                timeout=_RENDER_TIMEOUT_S,
            )
            pdf = await asyncio.wait_for(
                page.pdf(
                    format="A4",
                    print_background=True,  # template accent fills/rules ARE backgrounds
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                    prefer_css_page_size=True,  # templates that declare @page win
                ),
                timeout=_RENDER_TIMEOUT_S,
            )
            return pdf
        finally:
            await page.close()
