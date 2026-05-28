"""Abstract storage contract for all file backends.

Every backend (local filesystem, S3, GCS, Azure Blob, …) must implement
this interface. Callers depend only on BaseStorage — never on a concrete class.

Key format convention
---------------------
Keys are forward-slash–separated logical paths, e.g.:
    resumes/<session_id>/<filename>
    samples/<session_id>/<filename>

Backends are responsible for mapping a key to their own namespace
(filesystem path, S3 object key with prefix, etc.).
"""
from __future__ import annotations
from abc import ABC, abstractmethod


class BaseStorage(ABC):

    @abstractmethod
    async def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Persist *data* under *key*.

        Returns the canonical storage key (may differ from the input key
        after prefix expansion). Callers should store the returned key so
        they can retrieve the file later.
        """

    @abstractmethod
    async def load(self, key: str) -> bytes:
        """Return raw bytes stored under *key*.

        Raises FileNotFoundError if the key does not exist.
        """

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Remove the stored object. Silent no-op if key does not exist."""

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Return True if *key* has a corresponding stored object."""
