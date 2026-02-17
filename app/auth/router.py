from typing import Annotated
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.auth import schemas, security, dependencies
from app.models.user import User
from app.core.responses import StandardResponse

router = APIRouter()

@router.post("/login", response_model=StandardResponse[schemas.Token])
async def login(
    login_data: schemas.LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    print(f"DEBUG LOGIN ATTEMPT: {login_data.email} | {login_data.password}")
    stmt = select(User).where(User.email == login_data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    print(f"DEBUG USER FOUND: {user}")

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
        username: str = payload.get("sub")
        token_type: str = payload.get("type")
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
