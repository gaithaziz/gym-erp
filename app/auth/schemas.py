from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.enums import Role
import uuid

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None
    type: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    role: Role = Role.CUSTOMER

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: uuid.UUID
    
    class Config:
        from_attributes = True
