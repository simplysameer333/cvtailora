from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class User(BaseModel):
    id: Optional[str] = None
    email: str
    name: str
    hashed_password: Optional[str] = None
    google_id: Optional[str] = None
    tier: Literal["free", "plus", "pro"] = "free"
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    tier: Literal["free", "plus", "pro"]
    has_password: bool
