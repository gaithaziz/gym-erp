from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SecurityStatus = Literal["pass", "warn", "fail", "not_applicable"]
SecurityCategory = Literal[
    "rate_limits",
    "row_level_security",
    "server_validation",
    "api_keys",
    "env_vars",
    "cors",
    "dependencies",
]


class SecurityCheckResult(BaseModel):
    id: str
    category: SecurityCategory
    title: str
    status: SecurityStatus
    summary: str
    details: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    recommended_action: str | None = None


class SecurityAuditSummary(BaseModel):
    overall_status: SecurityStatus
    passed: int
    warnings: int
    failed: int
    not_applicable: int


class SecurityAuditResponse(BaseModel):
    summary: SecurityAuditSummary
    checks: list[SecurityCheckResult]
    generated_at: datetime
