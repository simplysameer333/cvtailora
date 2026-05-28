"""Storage backend factory.

Usage
-----
    from services.storage import get_storage

    storage = get_storage()
    key = await storage.save("resumes/abc123/cv.pdf", file_bytes, "application/pdf")

The returned backend is determined entirely by STORAGE_BACKEND in .env:
    "local"  →  LocalStorageBackend  (default; great for dev + single-server)
    "s3"     →  S3StorageBackend     (production; requires AWS_S3_BUCKET in .env)

The factory is cached after the first call — one backend instance per process.
To add a new provider (GCS, Azure Blob, …):
  1. Create services/storage/<provider>.py implementing BaseStorage
  2. Add a branch here and the matching config fields in config.py
"""
from __future__ import annotations
from functools import lru_cache

from .base import BaseStorage


@lru_cache(maxsize=1)
def get_storage() -> BaseStorage:
    """Return the configured storage backend (singleton per process)."""
    from config import settings

    backend = settings.storage_backend.lower()

    if backend == "s3":
        from .s3 import S3StorageBackend
        return S3StorageBackend(
            bucket=settings.aws_s3_bucket,
            prefix=settings.aws_s3_prefix,
            region=settings.aws_region,
            access_key=settings.aws_access_key_id,
            secret_key=settings.aws_secret_access_key,
        )

    if backend == "local":
        from .local import LocalStorageBackend
        return LocalStorageBackend(settings.storage_local_path)

    raise ValueError(
        f"Unknown STORAGE_BACKEND={backend!r}. "
        "Supported values: 'local', 's3'."
    )
