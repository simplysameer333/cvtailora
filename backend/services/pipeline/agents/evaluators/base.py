from abc import abstractmethod
from ..base import BaseAgent


class BaseEvaluatorAgent(BaseAgent):
    """Contract for all evaluator agents.

    Extensibility
    -------------
    To add a new provider:
      1. Create a new file in agents/evaluators/ and subclass BaseEvaluatorAgent.
      2. Register the instance in EVALUATOR_REGISTRY in agents/evaluators/__init__.py.
      No other code changes needed anywhere else in the codebase.

    Concurrency note
    ----------------
    All active evaluators are gathered concurrently via asyncio.gather.
    Subclasses must be stateless between calls so they are safe to run in parallel
    and can be scaled horizontally without contention.
    """

    @property
    def is_configured(self) -> bool:
        """Return False when a required API key is absent — agent is silently skipped."""
        return True

    @abstractmethod
    async def run(self, resume_json: dict, job_description: str, profession_config: dict) -> dict:
        """Evaluate the resume and return {"model": str, "score": int, "suggestions": [str]}.

        profession_config shapes the scoring criteria and evaluation lens.
        Pass an empty dict to use generic baseline scoring.
        """
        ...
