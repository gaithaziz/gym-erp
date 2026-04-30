from typing import Optional
from datetime import date, datetime
import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.models.enums import Role
import uuid
from typing import Literal

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None
    type: Optional[str] = None
    session_version: int = 0
    gym_id: Optional[uuid.UUID] = None
    home_branch_id: Optional[uuid.UUID] = None
    is_impersonated: bool = False

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    role: Role = Role.CUSTOMER
    home_branch_id: Optional[uuid.UUID] = None
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
    gym_id: uuid.UUID
    home_branch_id: Optional[uuid.UUID] = None
    subscription_status: Literal["ACTIVE", "FROZEN", "EXPIRED", "NONE"] = "ACTIVE"
    subscription_end_date: Optional[datetime] = None
    subscription_plan_name: Optional[str] = None
    is_subscription_blocked: bool = False
    block_reason: Optional[Literal["SUBSCRIPTION_EXPIRED", "SUBSCRIPTION_FROZEN", "NO_ACTIVE_SUBSCRIPTION"]] = None
    is_impersonated: bool = False
    
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


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetRequestResult(BaseModel):
    account_found: bool


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


CapabilityValue = Literal[
    "view_personal_qr",
    "scan_gym_qr",
    "scan_member_qr",
    "lookup_members",
    "manage_member_plans",
    "manage_member_diets",
    "view_finance_summary",
    "use_pos",
    "manage_inventory",
    "handle_support_queue",
    "view_audit_summary",
    "renew_subscription",
    "view_receipts",
    "view_profile",
    "view_notifications",
    "view_chat",
    "view_support",
]

EnabledModuleValue = Literal[
    "home",
    "qr",
    "members",
    "plans",
    "progress",
    "support",
    "chat",
    "profile",
    "notifications",
    "operations",
    "finance",
    "inventory",
    "audit",
]


class SubscriptionSnapshot(BaseModel):
    status: Literal["ACTIVE", "FROZEN", "EXPIRED", "NONE"]
    end_date: Optional[datetime] = None
    plan_name: Optional[str] = None
    is_blocked: bool = False
    block_reason: Optional[Literal["SUBSCRIPTION_EXPIRED", "SUBSCRIPTION_FROZEN", "NO_ACTIVE_SUBSCRIPTION"]] = None


class GymBranding(BaseModel):
    gym_id: uuid.UUID
    gym_name: str
    brand_name: str
    logo_url: Optional[str] = None
    primary_color: str
    secondary_color: str
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    plan_tier: str = "standard"
    deployment_mode: str = "shared"
    public_web_domain: Optional[str] = None
    mobile_shell_key: Optional[str] = None


class BranchSummary(BaseModel):
    id: uuid.UUID
    gym_id: uuid.UUID
    name: str
    display_name: Optional[str] = None
    code: str
    slug: str
    timezone: str
    phone: Optional[str] = None
    email: Optional[str] = None


class NotificationPreference(BaseModel):
    push_enabled: bool = True
    chat_enabled: bool = True
    support_enabled: bool = True
    billing_enabled: bool = True
    announcements_enabled: bool = True


class MobileBootstrap(BaseModel):
    user: UserResponse
    role: Role
    subscription: SubscriptionSnapshot
    gym: GymBranding
    home_branch: Optional[BranchSummary] = None
    accessible_branches: list[BranchSummary] = []
    capabilities: list[CapabilityValue]
    enabled_modules: list[EnabledModuleValue]
    notification_settings: NotificationPreference
