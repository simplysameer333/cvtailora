from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class JobAlert(BaseModel):
    id: Optional[str] = None
    user_id: str
    name: str
    query_tags: list[str] = []
    location_tags: list[str] = []
    company: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    last_sent_at: Optional[datetime] = None
