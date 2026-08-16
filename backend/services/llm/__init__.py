"""LLM gateway package.

One module, one job: route every graph/loop LLM call through a single
config-driven provider (OpenRouter) with prompt-cache breakpoints and exact
usage accounting. No model string or provider detail lives outside this package.
"""
from .gateway import LLMGateway, LLMResult, gateway

__all__ = ["LLMGateway", "LLMResult", "gateway"]
