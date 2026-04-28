import os
import logging
import shutil
import uuid
from typing import Annotated
from datetime import timedelta, datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.auth import schemas, security, dependencies
from app.models.user import User
from app.models.auth import RefreshToken
from app.models.enums import Role
from app.services.audit_service import AuditService
from app.core.responses import StandardResponse
from app.services.mobile_bootstrap_service import MobileBootstrapService
from app.core.rate_limit import rate_limit_dependency
from app.services.tenancy_service import TenancyService
from app.services.password_reset_service import PasswordResetService

router = APIRouter()
logger = logging.getLogger(__name__)


def _role_value(role: Role | str) -> str:
    return role.value if hasattr(role, "value") else str(role)


def _to_utc_datetime(value: int | float | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(value, tz=timezone.utc)


async def _persist_refresh_token(db: AsyncSession, user_id, refresh_token: str):
    payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    jti = payload.get("jti")
    exp = payload.get("exp")
    gym_id = payload.get("gym_id")
    if not jti or exp is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token payload")

    token_record = RefreshToken(
        user_id=user_id,
        gym_id=gym_id,
        jti=str(jti),
        token_hash=security.hash_token(refresh_token),
        expires_at=_to_utc_datetime(exp),
    )
    db.add(token_record)


async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    # Use SUPER_ADMIN role to bypass tenant isolation for identifying users by email globally.
    # We save and restore the previous context to avoid side effects in other parts of the request.
    prev_role = db.info.get("rls_user_role", "ANONYMOUS")
    prev_user_id = db.info.get("rls_user_id", "")
    prev_gym_id = db.info.get("rls_gym_id", "")
    prev_branch_id = db.info.get("rls_branch_id", "")

    await dependencies.set_rls_context(db, role=Role.SUPER_ADMIN.value)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    await dependencies.set_rls_context(
        db, 
        user_id=prev_user_id, 
        role=prev_role, 
        gym_id=prev_gym_id, 
        branch_id=prev_branch_id
    )
    return user


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _current_session_version(user: User) -> int:
    return int(getattr(user, "session_version", 0) or 0)


async def _log_and_commit(
    db: AsyncSession,
    *,
    user_id,
    action: str,
    target_id: str,
    details: str,
) -> None:
    await AuditService.log_action(
        db=db,
        user_id=user_id,
        action=action,
        target_id=target_id,
        details=details,
    )
    await db.commit()

@router.post("/register", response_model=StandardResponse[schemas.UserResponse])
async def register(
    user_in: schemas.UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.RECEPTION, Role.FRONT_DESK]))],
):
    if user_in.role == Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ADMIN accounts cannot be created via this endpoint.",
        )

    # Check if user exists
    if await _get_user_by_email(db, user_in.email):
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    
    # Create new user
    home_branch_id = current_user.home_branch_id
    user = User(
        gym_id=current_user.gym_id,
        email=user_in.email,
        hashed_password=security.get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        is_active=True,
        home_branch_id=home_branch_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    if home_branch_id:
        await TenancyService.ensure_user_branch_access(
            db,
            user_id=user.id,
            gym_id=user.gym_id,
            branch_id=home_branch_id,
        )
        await db.commit()

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="REGISTER_USER",
        target_id=str(user.id),
        details=f"Registered user {user.email} with role {_role_value(user.role)}",
    )
    
    return StandardResponse(data=user, message="User registered successfully")

@router.post(
    "/login",
    response_model=StandardResponse[schemas.Token],
    dependencies=[
        rate_limit_dependency(
            route_key="POST /api/v1/auth/login",
            scope="auth_login",
            limit=5,
            window_seconds=60,
            json_fields=("email",),
        )
    ],
)
async def login(
    login_data: schemas.LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    logger.info("Login attempt for email: %s", login_data.email)
    user = await _get_user_by_email(db, login_data.email)

    if not user:
        logger.warning("User not found for email: %s", login_data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not security.verify_password(login_data.password, user.hashed_password):
        logger.warning("Invalid password for user: %s", login_data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    await dependencies.ensure_gym_accessible(db=db, current_user=user)
    
    logger.info("Login successful for user: %s (gym_id: %s)", user.email, user.gym_id)
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user.email,
        expires_delta=access_token_expires,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        session_version=_current_session_version(user),
    )
    refresh_token = security.create_refresh_token(
        subject=user.email,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        session_version=_current_session_version(user),
    )
    # Set context to the identified user to allow persisting their refresh token and other actions
    await dependencies.set_rls_context(
        db,
        user_id=str(user.id),
        role=_role_value(user.role),
        gym_id=str(user.gym_id)
    )

    await _persist_refresh_token(db, user.id, refresh_token)
    await db.commit()
    
    return StandardResponse(
        data=schemas.Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer"
        ),
        message="Login Successful"
    )

@router.post(
    "/refresh",
    response_model=StandardResponse[schemas.Token],
    dependencies=[rate_limit_dependency(route_key="POST /api/v1/auth/refresh", scope="auth_refresh", limit=10, window_seconds=60)],
)
async def refresh_token(
    token: Annotated[str, Depends(dependencies.oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    credentials_exception = _credentials_exception()
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        token_type = payload.get("type")
        jti = payload.get("jti")
        gym_id = payload.get("gym_id")
        is_impersonated = payload.get("is_impersonated", False)
        token_session_version = int(payload.get("session_version") or 0)
        if username is None or token_type != "refresh" or jti is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = await _get_user_by_email(db, username)
    
    if user is None:
        raise credentials_exception
    if _current_session_version(user) != token_session_version:
        raise credentials_exception

    await dependencies.ensure_gym_accessible(db=db, current_user=user)
        
    # Set context to the identified user to allow finding their refresh token
    await dependencies.set_rls_context(
        db, 
        user_id=str(user.id), 
        role=_role_value(user.role), 
        gym_id=str(user.gym_id)
    )
    
    refresh_stmt = select(RefreshToken).where(
        RefreshToken.user_id == user.id,
        RefreshToken.gym_id == user.gym_id,
        RefreshToken.jti == str(jti),
        RefreshToken.revoked_at.is_(None)
    )
    refresh_result = await db.execute(refresh_stmt)
    token_record = refresh_result.scalar_one_or_none()

    if token_record is None:
        raise credentials_exception

    if token_record.token_hash != security.hash_token(token):
        raise credentials_exception

    now = datetime.now(timezone.utc)
    expires_at = token_record.expires_at if token_record.expires_at.tzinfo else token_record.expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        raise credentials_exception

    token_record.revoked_at = now

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user.email,
        expires_delta=access_token_expires,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        is_impersonated=is_impersonated,
        session_version=_current_session_version(user),
    )
    new_refresh_token = security.create_refresh_token(
        subject=user.email,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        is_impersonated=is_impersonated,
        session_version=_current_session_version(user),
    )
    await _persist_refresh_token(db, user.id, new_refresh_token)
    await db.commit()
    
    return StandardResponse(
        data=schemas.Token(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer"
        ),
        message="Token Refreshed"
    )

@router.get("/me", response_model=StandardResponse[schemas.UserResponse])
async def read_users_me(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user_payload = await MobileBootstrapService.build_user_response(
        current_user=current_user, 
        db=db,
        is_impersonated=current_user.is_impersonated
    )
    return StandardResponse(data=user_payload)

@router.put("/me", response_model=StandardResponse[schemas.UserResponse])
async def update_user_me(
    user_update: schemas.UserUpdate,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Update current user profile."""
    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="UPDATE_PROFILE",
        target_id=str(current_user.id),
        details="Updated profile fields via /auth/me",
    )

    return StandardResponse(data=current_user, message="Profile updated successfully")

@router.post("/me/profile-picture", response_model=StandardResponse[schemas.UserResponse])
async def upload_profile_picture(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...)
):
    """Upload and update user profile picture."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Create static directory if it doesn't exist
    upload_dir = "static/profiles"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}.{file_extension}"
    file_path = os.path.join(upload_dir, filename)
    
    # Save the file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Update user model
    # Delete old picture if it exists
    if current_user.profile_picture_url:
        old_path = current_user.profile_picture_url.lstrip("/")
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass
                
    current_user.profile_picture_url = f"/{upload_dir}/{filename}"
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="UPDATE_PROFILE_PICTURE",
        target_id=str(current_user.id),
        details=f"Updated profile picture to {current_user.profile_picture_url}",
    )
    
    return StandardResponse(data=current_user, message="Profile picture updated successfully")

@router.put("/me/password", response_model=StandardResponse)
async def change_password(
    password_data: schemas.PasswordChange,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Change current user password."""
    if not security.verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    await PasswordResetService.revoke_user_sessions(db, user=current_user)
    current_user.hashed_password = security.get_password_hash(password_data.new_password)
    db.add(current_user)
    await db.commit()

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="CHANGE_PASSWORD",
        target_id=str(current_user.id),
        details="Password changed successfully",
    )
    
    return StandardResponse(message="Password changed successfully")


@router.post(
    "/password-reset/request",
    response_model=StandardResponse[schemas.PasswordResetRequestResult],
    dependencies=[rate_limit_dependency(route_key="POST /api/v1/auth/password-reset/request", scope="auth_password_reset_request", limit=5, window_seconds=60, json_fields=("email",))],
)
async def request_password_reset(
    payload: schemas.PasswordResetRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await _get_user_by_email(db, payload.email)
    if user is not None:
        await dependencies.set_rls_context(
            db,
            role=Role.SUPER_ADMIN.value,
            gym_id=str(user.gym_id),
        )
        raw_token = await PasswordResetService.issue_reset_token(db, user=user)
        await PasswordResetService.send_reset_link(user=user, raw_token=raw_token)
        return StandardResponse(
            data=schemas.PasswordResetRequestResult(account_found=True),
            message="An account was found for that email. A password reset link has been sent.",
        )
    return StandardResponse(
        data=schemas.PasswordResetRequestResult(account_found=False),
        message="No account was found for that email.",
    )


@router.post(
    "/password-reset/confirm",
    response_model=StandardResponse,
    dependencies=[rate_limit_dependency(route_key="POST /api/v1/auth/password-reset/confirm", scope="auth_password_reset_confirm", limit=10, window_seconds=60)],
)
async def confirm_password_reset(
    payload: schemas.PasswordResetConfirm,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await dependencies.set_rls_context(db, role=Role.SUPER_ADMIN.value)
    try:
        await PasswordResetService.confirm_password_reset(db, token=payload.token, new_password=payload.new_password)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")
    return StandardResponse(message="Password reset successfully")
