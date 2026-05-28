import os
import io
from docx import Document
from typing import List

REQUIRED_PLACEHOLDERS = [
    "{{NAME}}", "{{EMAIL}}", "{{PHONE}}", "{{LINKEDIN}}", "{{LOCATION}}",
    "{{SUMMARY}}", "{{EXPERIENCE}}", "{{EDUCATION}}", "{{SKILLS}}",
]


def validate_custom_template(file_bytes: bytes) -> List[str]:
    doc = Document(io.BytesIO(file_bytes))
    full_text = "\n".join(p.text for p in doc.paragraphs)
    missing = [p for p in REQUIRED_PLACEHOLDERS if p not in full_text]
    return missing


def get_template_path(file_path: str) -> str:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, file_path)
