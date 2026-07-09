from abc import ABC, abstractmethod


class BaseAgent(ABC):
    """Root contract for every agent in the CVTailora pipeline.

    Design principles
    -----------------
    - Single responsibility: each subclass does exactly one well-defined thing.
    - Stateless: all inputs are explicit parameters; no hidden shared state.
    - Swappable: model names come from settings/env, never hardcoded.
    - Independently testable: each agent can be exercised in isolation.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable identifier used in logs, eval summaries, and metrics."""
        ...
