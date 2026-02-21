from typing import Optional
from datetime import date
import re
from pydantic import BaseModel, EmailStr, Field, field_validator
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
    profile_picture_url: Optional[str] = None
    phone_number: Optional[str] = None
    date_of_birth: Optional[date] = None
    emergency_contact: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=500)

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value

        normalized = value.strip()
        pattern = re.compile(r"^\+?[0-9][0-9\s\-()]{6,19}$")
        if not pattern.match(normalized):
            raise ValueError("Invalid phone number format")
        return normalized

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: Optional[date]) -> Optional[date]:
        if value is None:
            return value

        if value > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        if value < date(1900, 1, 1):
            raise ValueError("date_of_birth is too far in the past")
        return value

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: uuid.UUID
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    date_of_birth: Optional[date] = None
    emergency_contact: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=500)

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value

        normalized = value.strip()
        pattern = re.compile(r"^\+?[0-9][0-9\s\-()]{6,19}$")
        if not pattern.match(normalized):
            raise ValueError("Invalid phone number format")
        return normalized

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: Optional[date]) -> Optional[date]:
        if value is None:
            return value

        if value > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        if value < date(1900, 1, 1):
            raise ValueError("date_of_birth is too far in the past")
        return value

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
