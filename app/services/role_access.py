from __future__ import annotations

from app.models.enums import Role
from app.models.user import User


BRANCH_ADMIN_ROLES = {Role.ADMIN, Role.MANAGER}
GLOBAL_ADMIN_ROLES = {Role.SUPER_ADMIN}


def is_branch_admin_role(role: Role | str | None) -> bool:
    if role is None:
        return False
    return (role if isinstance(role, Role) else Role(role)) in BRANCH_ADMIN_ROLES


def is_branch_admin_user(user: User | None) -> bool:
    return bool(user and is_branch_admin_role(user.role))


def is_global_admin_role(role: Role | str | None) -> bool:
    if role is None:
        return False
    return (role if isinstance(role, Role) else Role(role)) in GLOBAL_ADMIN_ROLES
