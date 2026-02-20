from typing import Annotated
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.auth import schemas, security, dependencies
from app.models.user import User
from app.core.responses import StandardResponse

router = APIRouter()

@router.post("/register", response_model=StandardResponse[schemas.UserResponse])
async def register(
    user_in: schemas.UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    # Check if user exists
    stmt = select(User).where(User.email == user_in.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
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
    
    return StandardResponse(data=user, message="User registered successfully")

@router.post("/login", response_model=StandardResponse[schemas.Token])
async def login(
    login_data: schemas.LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = select(User).where(User.email == login_data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

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
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        token_type = payload.get("type")
        if username is None or token_type != "refresh":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    stmt = select(User).where(User.email == username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )
    
    return StandardResponse(
        data=schemas.Token(
            access_token=access_token,
            refresh_token=token, # Return the same refresh token
            token_type="bearer"
        ),
        message="Token Refreshed"
    )

@router.get("/me", response_model=StandardResponse[schemas.UserResponse])
async def read_users_me(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)]
):
    return StandardResponse(data=current_user)

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
    return StandardResponse(data=current_user, message="Profile updated successfully")

import os
import shutil
import uuid
from fastapi import UploadFile, File

@router.post("/me/profile-picture", response_model=StandardResponse[schemas.UserResponse])
async def upload_profile_picture(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...)
):
    """Upload and update user profile picture."""
    if not file.content_type.startswith("image/"):
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
    
    return StandardResponse(message="Password changed successfully")
