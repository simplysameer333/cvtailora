from .anthropic import AnthropicEvaluatorAgent
from .cv_score import CvScoreEvaluatorAgent

# Single-model: the pipeline scores with the CV-Score evaluator (the unified,
# user-facing engine). The former cross-provider OpenAI/Google evaluators were
# removed in the single-model move; the graph engine's Verification Agent +
# decomposition provide the bias-reduction they used to. The Anthropic
# JD-alignment evaluator stays registered but is not selected by default.
EVALUATOR_REGISTRY: list = [
    CvScoreEvaluatorAgent(),
    AnthropicEvaluatorAgent(),
]

__all__ = [
    "CvScoreEvaluatorAgent",
    "AnthropicEvaluatorAgent",
    "EVALUATOR_REGISTRY",
]
