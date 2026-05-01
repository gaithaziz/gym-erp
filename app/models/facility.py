import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenancy import BranchScopedMixin


class FacilityMachine(BranchScopedMixin, Base):
    __tablename__ = "facility_machines"
    __table_args__ = (
        UniqueConstraint("gym_id", "branch_id", "machine_name", name="uq_facility_machines_branch_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    machine_name: Mapped[str] = mapped_column(String(255), nullable=False)
    accessories_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    condition_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    maintenance_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_by = relationship("User", foreign_keys=[updated_by_user_id])


class FacilitySection(BranchScopedMixin, Base):
    __tablename__ = "facility_sections"
    __table_args__ = (
        UniqueConstraint("gym_id", "branch_id", "section_key", name="uq_facility_sections_branch_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    section_key: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_by = relationship("User", foreign_keys=[updated_by_user_id])
