from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class Template(BaseModel):
    name: str
    type: str  # "prebuilt" | "custom"
    preview_image_url: str = ""
    file_path: str
    placeholders: List[str] = []
    created_at: datetime = None
