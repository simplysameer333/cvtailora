from .claude_evaluator import AnthropicEvaluator
from .gpt4_evaluator import OpenAIEvaluator
from .gemini_evaluator import GoogleEvaluator

EVALUATOR_REGISTRY = [AnthropicEvaluator(), OpenAIEvaluator(), GoogleEvaluator()]

__all__ = ["AnthropicEvaluator", "OpenAIEvaluator", "GoogleEvaluator", "EVALUATOR_REGISTRY"]
