from .graph import pipeline
from .agents.generator import GeneratorAgent

# Shared generator instance for section-level regeneration (used by the router directly,
# bypassing the full evaluation pipeline).
generator = GeneratorAgent()

__all__ = ["pipeline", "generator"]
