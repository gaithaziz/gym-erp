import uuid
from datetime import datetime, timezone, time

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenancy import GymScopedMixin, Branch


class BranchOperatingHour(GymScopedMixin, Base):
    __tablename__ = "branch_operating_hours"
    __table_args__ = (
        UniqueConstraint("branch_id", "weekday", name="uq_branch_operating_hours_branch_weekday"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    open_time: Mapped[time | None] = mapped_column(Time(timezone=False), nullable=True)
    close_time: Mapped[time | None] = mapped_column(Time(timezone=False), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    branch = relationship(Branch)
