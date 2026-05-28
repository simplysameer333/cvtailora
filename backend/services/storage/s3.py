"""AWS S3 storage backend.

Requires boto3 (`pip install boto3`).  All S3 calls are synchronous boto3
operations run in a thread-pool executor so they do not block the FastAPI
event loop.

Configuration (all via .env / config.py):
    AWS_S3_BUCKET          — target bucket name (required for s3 backend)
    AWS_S3_PREFIX          — key prefix applied to every object (default "uploads/")
    AWS_REGION             — AWS region (default "us-east-1")
    AWS_ACCESS_KEY_ID      — IAM key (omit to use instance role / env credentials)
    AWS_SECRET_ACCESS_KEY  — IAM secret (omit to use instance role / env credentials)

Key layout in S3:
    <AWS_S3_PREFIX>/resumes/<session_id>/<filename>
    <AWS_S3_PREFIX>/samples/<session_id>/<filename>
"""
from __future__ import annotations
import asyncio
import functools
from typing import Any

from .base import BaseStorage


class S3StorageBackend(BaseStorage):
    """Stores files as S3 objects under a configurable bucket and prefix."""

    def __init__(
        self,
        bucket: str,
        prefix: str = "uploads/",
        region: str = "us-east-1",
        access_key: str = "",
        secret_key: str = "",
    ) -> None:
        if not bucket:
            raise ValueError("AWS_S3_BUCKET must be set when STORAGE_BACKEND=s3")
        self._bucket = bucket
        self._prefix = prefix.rstrip("/") + "/" if prefix else ""
        self._region = region
        self._access_key = access_key
        self._secret_key = secret_key

    # ── internal ──────────────────────────────────────────────────────────────

    def _client(self) -> Any:
        """Create a boto3 S3 client.

        Credentials are taken from constructor args when provided; otherwise
        boto3 falls back to its standard credential chain (env vars, instance
        profile, ~/.aws/credentials).
        """
        import boto3
        kwargs: dict = {"region_name": self._region}
        if self._access_key and self._secret_key:
            kwargs["aws_access_key_id"] = self._access_key
            kwargs["aws_secret_access_key"] = self._secret_key
        return boto3.client("s3", **kwargs)

    def _full_key(self, key: str) -> str:
        return f"{self._prefix}{key}"

    async def _run(self, fn: Any) -> Any:
        """Execute a synchronous boto3 call in the default thread-pool executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, fn)

    # ── BaseStorage interface ─────────────────────────────────────────────────

    async def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        full_key = self._full_key(key)
        client = self._client()
        await self._run(functools.partial(
            client.put_object,
            Bucket=self._bucket,
            Key=full_key,
            Body=data,
            ContentType=content_type,
        ))
        return key

    async def load(self, key: str) -> bytes:
        full_key = self._full_key(key)
        client = self._client()
        try:
            response = await self._run(functools.partial(
                client.get_object,
                Bucket=self._bucket,
                Key=full_key,
            ))
            return response["Body"].read()
        except Exception as exc:
            raise FileNotFoundError(f"S3 key not found: {full_key!r}") from exc

    async def delete(self, key: str) -> None:
        full_key = self._full_key(key)
        client = self._client()
        await self._run(functools.partial(
            client.delete_object,
            Bucket=self._bucket,
            Key=full_key,
        ))

    async def exists(self, key: str) -> bool:
        full_key = self._full_key(key)
        client = self._client()
        try:
            import botocore.exceptions
            await self._run(functools.partial(
                client.head_object,
                Bucket=self._bucket,
                Key=full_key,
            ))
            return True
        except Exception:
            return False
