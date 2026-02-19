import asyncio
import uuid
from datetime import date
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.hr import Contract, ContractType, Payroll
from app.models.enums import Role
from app.auth.security import get_password_hash
from app.services.payroll_service import PayrollService

async def verify():
    async with AsyncSessionLocal() as db:
        print("Starting Verification...")
        
        # 1. Create Test User
        email = f"test_hybrid_{uuid.uuid4().hex[:6]}@example.com"
        user = User(
            email=email,
            hashed_password=get_password_hash("secret"),
            full_name="Hybrid Test User",
            role=Role.EMPLOYEE
        )
        db.add(user)
        await db.flush()
        print(f"User created: {user.id}")

        # 2. Create Hybrid Contract
        # Base: 2000, Commission Rate: 10% (0.10)
        contract = Contract(
            user_id=user.id,
            start_date=date.today(),
            contract_type=ContractType.HYBRID,
            base_salary=2000.0,
            commission_rate=0.10,
            standard_hours=160
        )
        db.add(contract)
        await db.commit()
        print("Hybrid Contract created.")

        # 3. Calculate Payroll
        # Sales Volume: 10,000. Commission should be 1,000. Total: 3,000.
        sales_volume = 10000.0
        month = 5
        year = 2025
        
        print(f"Calculating payroll for sales_volume={sales_volume}...")
        payroll = await PayrollService.calculate_payroll(
            user_id=user.id,
            month=month,
            year=year,
            sales_volume=sales_volume,
            db=db
        )
        
        print(f"Payroll Result: Base={payroll.base_pay}, Commission={payroll.commission_pay}, Total={payroll.total_pay}")

        # 4. Assertions
        assert payroll.base_pay == 2000.0, f"Expected Base 2000.0, got {payroll.base_pay}"
        assert payroll.commission_pay == 1000.0, f"Expected Commission 1000.0, got {payroll.commission_pay}"
        assert payroll.total_pay == 3000.0, f"Expected Total 3000.0, got {payroll.total_pay}"
        
        print("[SUCCESS] VERIFICATION SUCCESSFUL: Hybrid Payroll logic works!")

if __name__ == "__main__":
    asyncio.run(verify())
