from abc import ABC, abstractmethod

EVALUATOR_SYSTEM_PROMPT = """You are an expert resume reviewer. You will be given a candidate's resume (as JSON)
and a job description. Your task is to score how well the resume matches the job.

Scoring criteria (0–100):
- Keyword alignment with job description (30 pts)
- Strength of action verbs and impact quantification (20 pts)
- Relevance and ordering of experience (20 pts)
- Summary quality and clarity (15 pts)
- Skills section completeness (15 pts)

Return ONLY a valid JSON object — no preamble, no markdown:
{"score": 0, "suggestions": ["string"]}"""


def build_evaluator_user_message(resume_json: dict, job_description: str) -> str:
    import json
    return (
        f"## RESUME\n{json.dumps(resume_json, indent=2)}\n\n"
        f"## JOB DESCRIPTION\n{job_description}"
    )


class BaseEvaluatorAgent(ABC):
    model: str

    @abstractmethod
    async def run(self, resume_json: dict, job_description: str) -> dict:
        """Return {"model": str, "score": int, "suggestions": [str]}"""
        ...
