from __future__ import annotations

import asyncio
import time
from collections import deque
import json
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request


APPLIED_RATE_LIMITS: set[str] = set()


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._entries: dict[str, deque[float]] = {}
        self._lock = asyncio.Lock()

    async def allow(self, key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        async with self._lock:
            bucket = self._entries.setdefault(key, deque())
            boundary = now - window_seconds
            while bucket and bucket[0] <= boundary:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(int(window_seconds - (now - bucket[0])) + 1, 1)
                return False, retry_after
            bucket.append(now)
            return True, 0

    async def reset(self) -> None:
        async with self._lock:
            self._entries.clear()


_rate_limiter = SlidingWindowRateLimiter()


async def reset_rate_limiter_state() -> None:
    await _rate_limiter.reset()


def rate_limit_dependency(
    *,
    route_key: str,
    scope: str,
    limit: int,
    window_seconds: int,
    json_fields: tuple[str, ...] = (),
):
    APPLIED_RATE_LIMITS.add(route_key)

    async def dependency(
        request: Request,
        x_forwarded_for: Annotated[str | None, Header(alias="X-Forwarded-For")] = None,
    ) -> None:
        client_host = request.client.host if request.client else "unknown"
        forwarded = (x_forwarded_for or "").split(",")[0].strip()
        client_key = forwarded or client_host or "unknown"
        key_parts = [scope, client_key]
        if json_fields:
            content_type = (request.headers.get("content-type") or "").lower()
            if "application/json" in content_type:
                try:
                    payload = json.loads((await request.body()) or b"{}")
                except json.JSONDecodeError:
                    payload = {}
                for field in json_fields:
                    value = payload.get(field)
                    if value is not None:
                        key_parts.append(f"{field}={str(value).strip().lower()}")
        limiter_key = ":".join(key_parts)
        allowed, retry_after = await _rate_limiter.allow(
            limiter_key,
            limit=limit,
            window_seconds=window_seconds,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Retry in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    return Depends(dependency)
