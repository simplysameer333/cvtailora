import json
import re
from anthropic import AsyncAnthropic
from config import settings
from .base import BaseEvaluatorAgent, EVALUATOR_SYSTEM_PROMPT, build_evaluator_user_message

ANTHROPIC_MODEL = "claude-sonnet-4-20250514"


class AnthropicEvaluator(BaseEvaluatorAgent):
    """Evaluator backed by the Anthropic API. Change ANTHROPIC_MODEL to swap models."""

    model = ANTHROPIC_MODEL

    async def run(self, resume_json: dict, job_description: str) -> dict:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=EVALUATOR_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": build_evaluator_user_message(resume_json, job_description),
            }],
        )
        raw = message.content[0].text.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        result = json.loads(raw)
        return {"model": "anthropic", "score": int(result["score"]), "suggestions": result.get("suggestions", [])}
