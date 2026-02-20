import uuid
from datetime import datetime, timezone
from sqlalchemy import String, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True) # Nullable for system actions
    action: Mapped[str] = mapped_column(String, nullable=False) # e.g. "CREATE_USER", "UPDATE_PAYROLL"
    target_id: Mapped[str] = mapped_column(String, nullable=True) # ID of target object, stored as string
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    details: Mapped[str] = mapped_column(Text, nullable=True) # JSON payload or description

    user = relationship("User")
