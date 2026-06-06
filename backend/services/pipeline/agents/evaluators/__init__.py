from .anthropic import AnthropicEvaluatorAgent
from .openai import OpenAIEvaluatorAgent
from .google import GoogleEvaluatorAgent
from .cv_score import CvScoreEvaluatorAgent

# Add a new evaluator: subclass BaseEvaluatorAgent and append an instance here.
# cv_score is the unified, user-facing evaluator (see _TIER_EVALUATORS in
# routers/generate.py — every tier now scores with CV-Score). The JD-alignment
# panel (anthropic/openai/google) stays registered but isn't selected by default.
EVALUATOR_REGISTRY: list = [
    CvScoreEvaluatorAgent(),
    AnthropicEvaluatorAgent(),
    OpenAIEvaluatorAgent(),
    GoogleEvaluatorAgent(),
]

__all__ = [
    "CvScoreEvaluatorAgent",
    "AnthropicEvaluatorAgent",
    "OpenAIEvaluatorAgent",
    "GoogleEvaluatorAgent",
    "EVALUATOR_REGISTRY",
]
