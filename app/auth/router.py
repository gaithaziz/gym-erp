import os
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
from app.services.subscription_status_service import SubscriptionStatusService

router = APIRouter()


def _to_utc_datetime(value: int | float | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(value, tz=timezone.utc)


async def _persist_refresh_token(db: AsyncSession, user_id, refresh_token: str):
    payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    jti = payload.get("jti")
    exp = payload.get("exp")
    if not jti or exp is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token payload")

    token_record = RefreshToken(
        user_id=user_id,
        jti=str(jti),
        token_hash=security.hash_token(refresh_token),
        expires_at=_to_utc_datetime(exp),
    )
    db.add(token_record)


async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


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
    user = User(
        email=user_in.email,
        hashed_password=security.get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        is_active=True
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="REGISTER_USER",
        target_id=str(user.id),
        details=f"Registered user {user.email} with role {user.role.value}",
    )
    
    return StandardResponse(data=user, message="User registered successfully")

@router.post("/login", response_model=StandardResponse[schemas.Token])
async def login(
    login_data: schemas.LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    user = await _get_user_by_email(db, login_data.email)

    if not user or not security.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )
    refresh_token = security.create_refresh_token(
        subject=user.email
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

@router.post("/refresh", response_model=StandardResponse[schemas.Token])
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
        if username is None or token_type != "refresh" or jti is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = await _get_user_by_email(db, username)
    
    if user is None:
        raise credentials_exception
        
    refresh_stmt = select(RefreshToken).where(
        RefreshToken.user_id == user.id,
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
        subject=user.email, expires_delta=access_token_expires
    )
    new_refresh_token = security.create_refresh_token(subject=user.email)
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
    user_payload = schemas.UserResponse.model_validate(current_user).model_dump()

    if current_user.role == Role.CUSTOMER:
        state = await SubscriptionStatusService.get_user_subscription_state(current_user.id, db)
        user_payload.update(
            {
                "subscription_status": state.subscription_status,
                "subscription_end_date": state.subscription_end_date,
                "subscription_plan_name": state.subscription_plan_name,
                "is_subscription_blocked": state.is_subscription_blocked,
                "block_reason": state.block_reason,
            }
        )
    else:
        user_payload.update(
            {
                "subscription_status": "ACTIVE",
                "subscription_end_date": None,
                "subscription_plan_name": None,
                "is_subscription_blocked": False,
                "block_reason": None,
            }
        )

    return StandardResponse(data=schemas.UserResponse(**user_payload))

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
