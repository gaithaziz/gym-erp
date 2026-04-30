from __future__ import annotations

import re
import uuid
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import Role
from app.models.tenancy import Branch, Gym, UserBranchAccess
from app.models.user import User
from app.services.role_access import is_branch_admin_role


def _slugify(value: str, *, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or fallback


class TenancyService:
    DEFAULT_BRANCH_CODE = "HQ"

    @classmethod
    async def _fallback_branch_for_branch_admin(cls, db: AsyncSession, *, gym_id: uuid.UUID) -> Branch | None:
        branch = (
            await db.execute(
                select(Branch)
                .where(
                    Branch.gym_id == gym_id,
                    Branch.is_active.is_(True),
                )
                .order_by(Branch.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if branch is not None:
            return branch

        return (
            await db.execute(
                select(Branch)
                .where(Branch.gym_id == gym_id)
                .order_by(Branch.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()

    @classmethod
    async def ensure_default_gym_and_branch(cls, db: AsyncSession) -> tuple[Gym, Branch]:
        gym = (await db.execute(select(Gym).order_by(Gym.created_at.asc()).limit(1))).scalar_one_or_none()
        if gym is None:
            gym = Gym(
                slug=_slugify(settings.GYM_NAME or settings.PROJECT_NAME, fallback="default-gym"),
                name=settings.GYM_NAME or settings.PROJECT_NAME,
                brand_name=settings.GYM_NAME or settings.PROJECT_NAME,
                logo_url=settings.GYM_LOGO_URL,
                primary_color=settings.GYM_PRIMARY_COLOR,
                secondary_color=settings.GYM_SECONDARY_COLOR,
                support_email=settings.GYM_SUPPORT_EMAIL,
                support_phone=settings.GYM_SUPPORT_PHONE,
                timezone=settings.GYM_TIMEZONE,
            )
            db.add(gym)
            await db.flush()

        branch = (
            await db.execute(
                select(Branch)
                .where(Branch.gym_id == gym.id)
                .order_by(Branch.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if branch is None:
            branch = Branch(
                gym_id=gym.id,
                slug="hq",
                code=cls.DEFAULT_BRANCH_CODE,
                name=f"{gym.name} HQ",
                display_name="Main Branch",
                timezone=gym.timezone,
                phone=gym.support_phone,
                email=gym.support_email,
            )
            db.add(branch)
            await db.flush()

        return gym, branch

    @classmethod
    async def ensure_user_branch_access(
        cls,
        db: AsyncSession,
        *,
        user_id,
        gym_id,
        branch_id,
    ) -> None:
        existing = (
            await db.execute(
                select(UserBranchAccess).where(
                    UserBranchAccess.user_id == user_id,
                    UserBranchAccess.branch_id == branch_id,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(UserBranchAccess(user_id=user_id, gym_id=gym_id, branch_id=branch_id))

    @classmethod
    async def get_accessible_branches(cls, db: AsyncSession, *, user) -> Sequence[Branch]:
        if user.role == Role.ADMIN:
            rows = await db.execute(
                select(Branch)
                .where(Branch.gym_id == user.gym_id)
                .order_by(Branch.name.asc())
            )
            return list(rows.scalars().all())

        rows = await db.execute(
            select(Branch)
            .join(UserBranchAccess, UserBranchAccess.branch_id == Branch.id)
            .where(
                UserBranchAccess.user_id == user.id,
                Branch.gym_id == user.gym_id,
            )
            .order_by(Branch.name.asc())
        )
        branches = list(rows.scalars().all())
        if user.home_branch_id is not None and all(branch.id != user.home_branch_id for branch in branches):
            home_branch = await db.get(Branch, user.home_branch_id)
            if home_branch is not None:
                branches.insert(0, home_branch)
        if not branches and is_branch_admin_role(user.role):
            fallback_branch = await cls._fallback_branch_for_branch_admin(db, gym_id=user.gym_id)
            if fallback_branch is not None:
                branches = [fallback_branch]
        return branches

    @classmethod
    async def get_user_in_gym(
        cls,
        db: AsyncSession,
        *,
        gym_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> User | None:
        return (
            await db.execute(
                select(User).where(
                    User.id == user_id,
                    User.gym_id == gym_id,
                )
            )
        ).scalar_one_or_none()

    @classmethod
    async def require_user_in_gym(
        cls,
        db: AsyncSession,
        *,
        current_user,
        user_id: uuid.UUID,
        allowed_roles: set[Role] | None = None,
        detail: str = "User not found",
    ) -> User:
        user = await cls.get_user_in_gym(db, gym_id=current_user.gym_id, user_id=user_id)
        if user is None:
            raise HTTPException(status_code=404, detail=detail)
        if allowed_roles and user.role not in allowed_roles:
            raise HTTPException(status_code=400, detail=f"User role '{user.role}' is not allowed here")
        return user

    @classmethod
    async def get_branch_in_gym(
        cls,
        db: AsyncSession,
        *,
        gym_id: uuid.UUID,
        branch_id: uuid.UUID,
    ) -> Branch | None:
        return (
            await db.execute(
                select(Branch).where(
                    Branch.id == branch_id,
                    Branch.gym_id == gym_id,
                )
            )
        ).scalar_one_or_none()

    @classmethod
    async def require_branch_access(
        cls,
        db: AsyncSession,
        *,
        current_user,
        branch_id: uuid.UUID,
        allow_all_for_admin: bool = False,
    ) -> Branch:
        branch = await cls.get_branch_in_gym(db, gym_id=current_user.gym_id, branch_id=branch_id)
        if branch is None:
            raise HTTPException(status_code=404, detail="Branch not found")
        if allow_all_for_admin and current_user.role == Role.ADMIN:
            return branch

        accessible_branches = await cls.get_accessible_branches(db, user=current_user)
        if all(item.id != branch_id for item in accessible_branches):
            raise HTTPException(status_code=403, detail="Not authorized for this branch")
        return branch

    @classmethod
    async def branch_scope_ids(
        cls,
        db: AsyncSession,
        *,
        current_user,
        branch_id: uuid.UUID | None = None,
        allow_all_for_admin: bool = False,
    ) -> list[uuid.UUID]:
        if branch_id is not None:
            branch = await cls.require_branch_access(
                db,
                current_user=current_user,
                branch_id=branch_id,
                allow_all_for_admin=allow_all_for_admin,
            )
            return [branch.id]

        if allow_all_for_admin and current_user.role == Role.ADMIN:
            rows = await db.execute(select(Branch.id).where(Branch.gym_id == current_user.gym_id))
            return list(rows.scalars().all())

        accessible_branches = await cls.get_accessible_branches(db, user=current_user)
        if accessible_branches:
            return [item.id for item in accessible_branches]
        if current_user.home_branch_id is not None:
            return [current_user.home_branch_id]
        if is_branch_admin_role(current_user.role):
            fallback_branch = await cls._fallback_branch_for_branch_admin(db, gym_id=current_user.gym_id)
            if fallback_branch is not None:
                return [fallback_branch.id]
        return []

    @classmethod
    async def resolve_user_attribution_branch_id(
        cls,
        db: AsyncSession,
        *,
        user: User,
    ) -> uuid.UUID | None:
        """
        Resolve the canonical branch for cross-branch attribution.

        Precedence:
        1) `home_branch_id` when it exists inside the same gym.
        2) Earliest active branch assignment from `user_branch_access`.
        3) None (unattributed).
        """
        if user.home_branch_id is not None:
            home_branch = await cls.get_branch_in_gym(db, gym_id=user.gym_id, branch_id=user.home_branch_id)
            if home_branch is not None and home_branch.is_active:
                return home_branch.id

        fallback_branch_id = (
            await db.execute(
                select(UserBranchAccess.branch_id)
                .join(Branch, Branch.id == UserBranchAccess.branch_id)
                .where(
                    UserBranchAccess.user_id == user.id,
                    UserBranchAccess.gym_id == user.gym_id,
                    Branch.is_active.is_(True),
                )
                .order_by(UserBranchAccess.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if fallback_branch_id is not None:
            return fallback_branch_id
        if is_branch_admin_role(user.role):
            fallback_branch = await cls._fallback_branch_for_branch_admin(db, gym_id=user.gym_id)
            if fallback_branch is not None:
                return fallback_branch.id
        return None
