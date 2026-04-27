from typing import Annotated, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db, set_rls_context
from app.models.user import User
from app.auth.schemas import TokenPayload
from app.models.enums import Role
from app.services.subscription_status_service import SubscriptionStatusService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def _coerce_role(value: Role | str) -> Role:
    return value if isinstance(value, Role) else Role(value)

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        token_type = payload.get("type")
        token_gym_id = payload.get("gym_id")
        if username is None or token_type != "access":
            raise credentials_exception
        token_data = TokenPayload(
            sub=username,
            type=token_type,
            session_version=int(payload.get("session_version") or 0),
            gym_id=token_gym_id,
            home_branch_id=payload.get("home_branch_id"),
            is_impersonated=payload.get("is_impersonated", False),
        )
    except JWTError:
        raise credentials_exception

    # Use SUPER_ADMIN role to bypass tenant isolation for identifying the user from the token.
    # The get_db dependency resets RLS to ANONYMOUS, which would block this lookup.
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    stmt = select(User).where(User.email == token_data.sub)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception

    if int(getattr(user, "session_version", 0) or 0) != int(token_data.session_version or 0):
        raise credentials_exception
    
    user.is_impersonated = token_data.is_impersonated
    user.role = _coerce_role(user.role)
    if token_data.gym_id and str(user.gym_id) != str(token_data.gym_id):
        raise credentials_exception
    await set_rls_context(
        db,
        user_id=str(user.id),
        role=user.role.value,
        gym_id=str(user.gym_id),
        branch_id=str(user.home_branch_id) if user.home_branch_id else "",
    )
    return user

async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)]
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

class RoleChecker:
    def __init__(self, allowed_roles: List[Role]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: Annotated[User, Depends(get_current_active_user)]):
        user.role = _coerce_role(user.role)
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Operation not permitted"
            )
        return user

# Hierarchical Role Dependencies
get_current_admin = RoleChecker([Role.SUPER_ADMIN, Role.ADMIN])
# Managers can do everything Front Desk can, plus more. Admins can do everything.
get_current_manager = RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER])
get_current_front_desk = RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.FRONT_DESK, Role.RECEPTION])
get_current_coach = RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.COACH])
get_current_employee = RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.FRONT_DESK, Role.RECEPTION, Role.COACH, Role.EMPLOYEE, Role.CASHIER])


async def require_active_customer_subscription(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    current_user.role = _coerce_role(current_user.role)
    if current_user.role != Role.CUSTOMER:
        return current_user

    state = await SubscriptionStatusService.get_user_subscription_state(current_user.id, db)
    if state.is_subscription_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "detail": "Subscription blocked",
                "code": "SUBSCRIPTION_BLOCKED",
                "reason": state.block_reason,
            },
        )
    return current_user
