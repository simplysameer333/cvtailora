import asyncio
import json
import re
from config import settings
from .base import BaseEvaluatorAgent, EVALUATOR_SYSTEM_PROMPT, build_evaluator_user_message

GOOGLE_MODEL = "gemini-1.5-pro"


class GoogleEvaluator(BaseEvaluatorAgent):
    """Evaluator backed by the Google Gemini API. Change GOOGLE_MODEL to swap models."""

    model = GOOGLE_MODEL

    async def run(self, resume_json: dict, job_description: str) -> dict:
        if not settings.google_api_key:
            return {"model": "google", "score": 0, "suggestions": ["Google API key not configured."]}

        import google.generativeai as genai
        genai.configure(api_key=settings.google_api_key)
        gemini = genai.GenerativeModel(
            model_name=self.model,
            system_instruction=EVALUATOR_SYSTEM_PROMPT,
        )
        user_content = build_evaluator_user_message(resume_json, job_description)
        response = await asyncio.to_thread(gemini.generate_content, user_content)
        raw = response.text.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        result = json.loads(raw)
        return {"model": "google", "score": int(result["score"]), "suggestions": result.get("suggestions", [])}
