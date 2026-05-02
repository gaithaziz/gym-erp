from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import PolicyDocument

POLICY_VERSION = "1.0"


def policy_version_sort_key(version: str | None) -> tuple[int, tuple[int, ...]]:
    if not version:
        return (1, ())
    parts = version.split(".")
    if all(part.isdigit() for part in parts):
        return (0, tuple(int(part) for part in parts))
    return (1, ())


async def get_gym_policy_version(db: AsyncSession, gym_id: uuid.UUID) -> str:
    result = await db.execute(
        select(PolicyDocument.version).where(
            PolicyDocument.gym_id == gym_id,
        )
    )
    versions = [version for (version,) in result.all() if version]
    if not versions:
        return POLICY_VERSION
    return max(versions, key=policy_version_sort_key)


async def get_next_gym_policy_version(db: AsyncSession, gym_id: uuid.UUID) -> str:
    current_version = await get_gym_policy_version(db, gym_id)
    parts = current_version.split(".")
    if all(part.isdigit() for part in parts):
        next_parts = [int(part) for part in parts]
        next_parts[-1] += 1
        return ".".join(str(part) for part in next_parts)
    if current_version.isdigit():
        return str(int(current_version) + 1)
    return f"{current_version}-updated"
