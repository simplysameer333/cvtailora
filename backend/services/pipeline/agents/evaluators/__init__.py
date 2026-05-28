from .anthropic import AnthropicEvaluatorAgent
from .openai import OpenAIEvaluatorAgent
from .google import GoogleEvaluatorAgent

# Add a new evaluator: subclass BaseEvaluatorAgent and append an instance here.
EVALUATOR_REGISTRY: list = [
    AnthropicEvaluatorAgent(),
    OpenAIEvaluatorAgent(),
    GoogleEvaluatorAgent(),
]

__all__ = [
    "AnthropicEvaluatorAgent",
    "OpenAIEvaluatorAgent",
    "GoogleEvaluatorAgent",
    "EVALUATOR_REGISTRY",
]
