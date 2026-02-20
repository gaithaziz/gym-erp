from datetime import datetime, timezone
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog

class AuditService:
    @staticmethod
    async def log_action(
        db: AsyncSession,
        user_id: uuid.UUID,
        action: str,
        target_id: str | None = None,
        details: str | None = None
    ):
        """
        Log an audit event.
        """
        audit_entry = AuditLog(
            user_id=user_id,
            action=action,
            target_id=target_id,
            details=details,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(audit_entry)
        # We don't commit here to allow the caller to commit as part of a transaction,
        # OR we can commit if we want it to be independent (but async session is usually shared).
        # Best practice: let the caller handle commit, or flush.
        # But if the caller *fails* (rollback), we might lose the audit log.
        # For critical audit logs (failure or success), we might want a separate session or commit immediately.
        # But for now, attaching to the current transaction is standard for "action completed successfully".
        # If we want to log attempts that fail, we need a separate session/transaction logic.
        # Sticking to simple "transactional" logging for V1.
