"""Unit tests for the pure image-comparison core of the PDF fidelity checker.

Browser/PDF integration runs in the verification harness; these tests keep
the similarity metric honest without needing Chromium.
"""
from PIL import Image, ImageDraw

from services.pdf_fidelity import compare_images


def _page(color="white", band=None, band_color="#0f766e"):
    img = Image.new("RGB", (794, 1123), color)
    if band:
        ImageDraw.Draw(img).rectangle(band, fill=band_color)
    return img


def test_identical_images_score_100():
    a = _page(band=(0, 0, 794, 120))
    assert compare_images(a, a.copy()) == 100.0


def test_same_layout_minor_noise_scores_high():
    a = _page(band=(0, 0, 794, 120))
    b = _page(band=(0, 0, 794, 124))  # slight band difference ~ antialiasing
    assert compare_images(a, b) > 85.0


def test_different_designs_score_low():
    # Same ink AMOUNT in different places + colours — must not score high.
    a = _page(band=(0, 0, 794, 200), band_color="#0f766e")     # teal top banner
    b = _page(band=(0, 923, 794, 1123), band_color="#7c3aed")  # violet bottom
    assert compare_images(a, b) < 40.0


def test_blank_pages_prove_nothing():
    a = _page()
    assert compare_images(a, a.copy()) == 0.0


def test_tiny_images_return_zero():
    a = Image.new("RGB", (794, 5), "white")
    assert compare_images(a, a.copy()) == 0.0
