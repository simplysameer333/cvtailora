from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ContactInfo(BaseModel):
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    location: str = ""


class ExperienceItem(BaseModel):
    company: str = ""
    role: str = ""
    dates: str = ""
    bullets: List[str] = []


class EducationItem(BaseModel):
    institution: str = ""
    degree: str = ""
    dates: str = ""


class GeneratedResume(BaseModel):
    name: str = ""
    contact: ContactInfo = ContactInfo()
    summary: str = ""
    experience: List[ExperienceItem] = []
    education: List[EducationItem] = []
    skills: List[str] = []
    certifications: List[str] = []


class UserProfile(BaseModel):
    full_name: str
    email: str
    phone: str = ""
    linkedin: str = ""
    location: str = ""
    target_role: str = ""
    preferred_tone: str = "Professional"
    key_skills: List[str] = []
    additional_notes: str = ""


class EvaluatorResult(BaseModel):
    model: str
    score: int
    suggestions: List[str] = []


class EvalCycle(BaseModel):
    cycle: int
    evaluator_results: List[EvaluatorResult] = []
    min_score: int = 0
    all_passed: bool = False
    timestamp: Optional[datetime] = None


class OutputFiles(BaseModel):
    docx_file_id: Optional[str] = None
    pdf_file_id: Optional[str] = None
