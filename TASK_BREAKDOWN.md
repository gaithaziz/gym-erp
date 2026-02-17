# TASK_BREAKDOWN.md
Version: 2.0
Scope: Full System Implementation (Backend + Frontend + Infra)

============================================================
PHASE 1 — CORE FOUNDATION (Backend Initialization)
============================================================

- [ ] Initialize FastAPI project structure
- [ ] Configure async SQLAlchemy 2.0
- [ ] Configure Alembic migrations
- [ ] Create base database connection module
- [ ] Implement User model
- [ ] Implement Role enum
- [ ] Implement password hashing (bcrypt)
- [ ] Implement JWT utilities (access + refresh)
- [ ] Implement authentication schemas (Pydantic v2)
- [ ] Implement /auth/login endpoint
- [ ] Implement /auth/refresh endpoint
- [ ] Implement RBAC dependency system
- [ ] Implement global API response wrapper
- [ ] Write unit tests for authentication
- [ ] Verify test coverage >= 80%

STOP. Await review before Phase 2.

============================================================
PHASE 2 — ACCESS CONTROL & SUBSCRIPTIONS
============================================================

- [ ] Implement Subscription model
- [ ] Implement AccessLog model
- [ ] Implement QR token generator (30s expiry JWT)
- [ ] Implement /access/qr endpoint
- [ ] Implement /access/scan endpoint
- [ ] Implement subscription validation logic
- [ ] Implement access grant/deny logic
- [ ] Implement background tasks (last visit update)
- [ ] Implement attendance log model
- [ ] Implement /access/check-in endpoint
- [ ] Implement /access/check-out endpoint
- [ ] Write tests for QR expiration
- [ ] Write tests for expired subscriptions
- [ ] Write tests for attendance logging

STOP. Await review before Phase 3.

============================================================
PHASE 3 — HR & PAYROLL MODULE
============================================================

- [ ] Implement Contract model
- [ ] Implement payroll calculation service
- [ ] Implement salary calculation (Hourly)
- [ ] Implement salary calculation (Fixed)
- [ ] Implement salary calculation (Hybrid)
- [ ] Implement monthly aggregation logic
- [ ] Implement /admin/contracts endpoint
- [ ] Implement /admin/payroll/preview endpoint
- [ ] Implement /admin/payroll/process endpoint
- [ ] Implement financial ledger model
- [ ] Log salary payouts to ledger
- [ ] Write tests for payroll correctness
- [ ] Validate edge cases (no clock-out, partial days)

STOP. Await review before Phase 4.

============================================================
PHASE 4 — FITNESS MODULE
============================================================

- [ ] Implement Exercise model
- [ ] Implement WorkoutPlan model
- [ ] Implement WorkoutDetail model
- [ ] Implement DietPlan model
- [ ] Implement DietMeal model
- [ ] Implement WorkoutFeedback model
- [ ] Implement /fitness/exercises (GET)
- [ ] Implement /fitness/exercises (POST)
- [ ] Implement /fitness/plans/assign endpoint
- [ ] Implement /fitness/plans/active endpoint
- [ ] Implement /fitness/log endpoint
- [ ] Implement /fitness/diet/current endpoint
- [ ] Implement /fitness/diet/{id} endpoint
- [ ] Write validation tests
- [ ] Write RBAC enforcement tests

STOP. Await review before Phase 5.

============================================================
PHASE 5 — FINANCIAL DASHBOARD & ANALYTICS
============================================================

- [ ] Implement financial dashboard service
- [ ] Implement revenue vs expenses query
- [ ] Implement net profit calculation
- [ ] Implement top expense category query
- [ ] Implement /admin/finance/dashboard endpoint
- [ ] Implement /admin/finance/transaction endpoint
- [ ] Implement projection placeholder logic
- [ ] Optimize queries for performance
- [ ] Write performance tests

STOP. Await review before Phase 6.

============================================================
PHASE 6 — WEB DASHBOARD (React)
============================================================

- [ ] Initialize React + TypeScript + Vite
- [ ] Setup API client service
- [ ] Implement authentication UI
- [ ] Implement admin dashboard layout
- [ ] Implement KPI cards (headcount, revenue, salaries)
- [ ] Implement Visits by Hour chart
- [ ] Implement Revenue vs Expenses chart
- [ ] Implement Activity Log component
- [ ] Protect routes with role-based guards
- [ ] Write component tests

STOP. Await review before Phase 7.

============================================================
PHASE 7 — MOBILE APP (Flutter)
============================================================

- [ ] Initialize Flutter project
- [ ] Configure Dio API client
- [ ] Implement authentication flow
- [ ] Implement QR code display screen
- [ ] Implement subscription status display
- [ ] Implement workout plan screen
- [ ] Implement feedback logging screen
- [ ] Implement coach trainee list
- [ ] Implement plan builder UI
- [ ] Write widget tests

STOP. Await review before Phase 8.

============================================================
PHASE 8 — INFRASTRUCTURE & DEPLOYMENT
============================================================

- [ ] Write Dockerfile for backend
- [ ] Write docker-compose for local dev
- [ ] Configure Cloud Run deployment config
- [ ] Configure Cloud SQL connection
- [ ] Setup GitHub Actions CI pipeline
- [ ] Configure test execution in CI
- [ ] Configure build and deploy steps
- [ ] Validate environment variable injection
- [ ] Perform staging deployment test

STOP. Await production approval.

============================================================
FINAL CHECKLIST
============================================================

- [ ] All migrations applied successfully
- [ ] All endpoints documented
- [ ] 80%+ backend test coverage
- [ ] No hardcoded secrets
- [ ] RBAC verified
- [ ] Performance targets met
- [ ] Seed data script functional
- [ ] OpenAPI schema exported and locked

End of Implementation Plan.