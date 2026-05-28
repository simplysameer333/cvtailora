"""Local filesystem storage backend.

Files are written to STORAGE_LOCAL_PATH (configured in .env).
Directory structure mirrors the logical key:
    uploads/resumes/<session_id>/<filename>
    uploads/samples/<session_id>/<filename>

Safe for local development and single-server deployments.
Switch to S3StorageBackend for multi-instance or cloud deployments.
"""
from __future__ import annotations
from pathlib import Path

import aiofiles

from .base import BaseStorage


class LocalStorageBackend(BaseStorage):
    """Stores files in a local directory tree rooted at *base_path*."""

    def __init__(self, base_path: str) -> None:
        self._root = Path(base_path).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    # ── internal ──────────────────────────────────────────────────────────────

    def _resolve(self, key: str) -> Path:
        """Map a logical key to an absolute filesystem path.

        Raises ValueError if the resolved path escapes the storage root —
        prevents path-traversal attacks via crafted key values.
        """
        path = (self._root / key).resolve()
        if not str(path).startswith(str(self._root)):
            raise ValueError(f"Storage key escapes root directory: {key!r}")
        return path

    # ── BaseStorage interface ─────────────────────────────────────────────────

    async def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(path, "wb") as f:
            await f.write(data)
        return key

    async def load(self, key: str) -> bytes:
        path = self._resolve(key)
        if not path.exists():
            raise FileNotFoundError(f"Storage key not found: {key!r}")
        async with aiofiles.open(path, "rb") as f:
            return await f.read()

    async def delete(self, key: str) -> None:
        path = self._resolve(key)
        if path.exists():
            path.unlink()

    async def exists(self, key: str) -> bool:
        return self._resolve(key).exists()
