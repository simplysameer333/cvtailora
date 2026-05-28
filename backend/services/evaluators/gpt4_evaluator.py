import json
import re
from config import settings
from .base import BaseEvaluatorAgent, EVALUATOR_SYSTEM_PROMPT, build_evaluator_user_message

OPENAI_MODEL = "gpt-4o"


class OpenAIEvaluator(BaseEvaluatorAgent):
    """Evaluator backed by the OpenAI API. Change OPENAI_MODEL to swap models."""

    model = OPENAI_MODEL

    async def run(self, resume_json: dict, job_description: str) -> dict:
        if not settings.openai_api_key:
            return {"model": "openai", "score": 0, "suggestions": ["OpenAI API key not configured."]}

        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model=self.model,
            max_tokens=1024,
            messages=[
                {"role": "system", "content": EVALUATOR_SYSTEM_PROMPT},
                {"role": "user", "content": build_evaluator_user_message(resume_json, job_description)},
            ],
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        result = json.loads(raw)
        return {"model": "openai", "score": int(result["score"]), "suggestions": result.get("suggestions", [])}
