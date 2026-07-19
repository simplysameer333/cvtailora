from __future__ import annotations
import asyncio
from .base import BaseEvaluatorAgent
from ...prompts.google import google_evaluator_messages
from ...utils import parse_json_response
from ...telemetry import record as record_usage
from config import settings

_TIMEOUT = 30  # seconds per Google evaluator call


class GoogleEvaluatorAgent(BaseEvaluatorAgent):
    """Evaluator backed by the Google Gemini API.

    Scoring criteria and evaluation lens are profession-specific — passed in
    via profession_config so the same evaluator can serve any role.
    Swap the model by setting GOOGLE_EVALUATOR_MODEL in .env — no code changes.
    """

    name = "google"

    @property
    def is_configured(self) -> bool:
        return bool(settings.google_api_key)

    def _model(self):
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.google_evaluator_model,
            google_api_key=settings.google_api_key,
            max_output_tokens=2048,
            # Scoring must be repeatable — same résumé, same score (no sampling noise).
            temperature=0,
            max_retries=2,
            # gemini-2.5-flash is a THINKING model: by default its thought
            # tokens count against max_output_tokens, and 1024 was fully eaten
            # by thinking → EMPTY visible text → "Expecting value: char 0" →
            # score=None on every prod run (observed 3x, 2026-07-19). Scoring
            # needs no visible reasoning chain, so turn thinking off and ask
            # for guaranteed-JSON output.
            thinking_budget=0,
            response_mime_type="application/json",
        )

    @staticmethod
    def _text(content) -> str:
        """Gemini responses may arrive as a list of content parts — join them."""
        if isinstance(content, list):
            return "".join(
                p if isinstance(p, str) else str(p.get("text", ""))
                for p in content if not (isinstance(p, dict) and p.get("type") == "thinking")
            )
        return content or ""

    async def run(self, resume_json: dict, job_description: str, profession_config: dict, source_resume_text: str = "") -> dict:
        try:
            messages = await google_evaluator_messages(resume_json, job_description, profession_config, source_resume_text)
            response = await asyncio.wait_for(
                self._model().ainvoke(messages),
                timeout=_TIMEOUT,
            )
            record_usage(settings.google_evaluator_model, self.name, response)
            result = parse_json_response(self._text(response.content))
            return {"model": self.name, "score": int(result["score"]), "suggestions": result.get("suggestions", [])}
        except asyncio.TimeoutError:
            return {"model": self.name, "score": None, "suggestions": [f"Evaluator timed out after {_TIMEOUT}s"]}
        except Exception as exc:
            return {"model": self.name, "score": None, "suggestions": [f"Evaluator error: {exc}"]}
