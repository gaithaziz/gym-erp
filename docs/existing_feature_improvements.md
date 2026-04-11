# Existing Feature Improvements Backlog

## 1. Authentication & Session Management
- Add silent token refresh in frontend API client instead of immediate logout on any `401` (`frontend/src/lib/api.ts`).
- Store tokens more safely (HTTP-only cookie or encrypted storage strategy) to reduce XSS token theft risk (`frontend/src/lib/api.ts`).
- Add refresh-token rotation and revocation tracking so stolen refresh tokens can be invalidated (`app/auth/router.py`).
- Add profile update input guards (phone format, DOB limits, max bio length) to prevent low-quality or malformed profile data (`app/auth/router.py`).

## 2. Access Control & Scanner
- Improve offline scanner validation by checking cached membership end-date in addition to status; currently offline check uses ID presence only (`frontend/src/app/dashboard/admin/scanner/page.tsx`).
- Add signed/offline-safe cache versioning + integrity marker for member sync payload to avoid stale or tampered local data (`frontend/src/app/dashboard/admin/scanner/page.tsx`, `app/routers/access.py`).
- Persist and replay pending scans with explicit retry statuses in UI (queued/sent/failed) for operational trust during outages (`frontend/src/app/dashboard/admin/scanner/page.tsx`).
- Add rate limiting / abuse protection on `/access/scan` for kiosk endpoints to prevent brute-force token attempts (`app/routers/access.py`, `app/services/access_service.py`).
- Include `kiosk_id` in persisted access logs so audit trails can identify scanner source (`app/services/access_service.py`, `app/models/access.py`).

## 3. HR, Attendance, Payroll
- Replace N+1 queries in staff and attendance listing with joins/selectinload for scale (`app/routers/hr.py`).
- Validate attendance corrections (`check_out >= check_in`, max shift duration) before save to prevent negative/invalid hour calculations (`app/routers/hr.py`).
- Prevent overlapping open check-ins for the same user to avoid duplicate active shifts (`app/services/access_service.py`).
- Add payroll re-run strategy (idempotency or versioning) so regenerating payroll for same month does not create ambiguous records (`app/routers/hr.py`, `app/services/payroll_service.py`).
- Include leave deductions and approved leave handling directly in payroll computation to match HR workflow end-to-end (`app/routers/hr.py`, `app/services/payroll_service.py`).

## 4. Fitness & Coaching
- Enforce ownership/assignment in workout logging so members can only log plans assigned to them (`app/routers/fitness.py`).
- Restrict coach log visibility to their own created plans/assigned members (today any coach can query logs for any plan ID) (`app/routers/fitness.py`).
- Add exercise URL validation (allowed providers and valid URL format) to reduce broken video links (`app/routers/fitness.py`).
- Add plan template cloning for coaches to reduce repetitive plan creation time (`app/routers/fitness.py`, coach pages under `frontend/src/app/dashboard/coach/`).
- Add pagination and date filters for logs/biometrics endpoints to keep responses fast as history grows (`app/routers/fitness.py`).

## 5. Finance, POS, Inventory
- Use decimal/money-safe type for transaction amounts to prevent float rounding drift in finance totals (`app/routers/finance.py`, `app/models/finance.py`).
- Add transaction idempotency key for POS checkout to prevent duplicate sales on network retry (`app/routers/inventory.py`).
- Add low-stock alert workflow (acknowledge/snooze/restock target) rather than passive list only (`app/routers/inventory.py`, `frontend/src/app/dashboard/page.tsx`).
- Generate downloadable receipt/payslip documents (PDF/print template) rather than JSON only (`app/routers/finance.py`, `app/routers/hr.py`).
- Add validation to block negative or zero transaction amounts where not meaningful (`app/routers/finance.py`, `app/routers/inventory.py`).

## 6. Analytics & Dashboard Quality
- Fix chart ordering by real dates; current revenue chart sorts by formatted string which can misorder timeline (`app/services/analytics.py`).
- Add server-side support for `from/to` filters used by frontend dashboard to align UI controls with backend behavior (`frontend/src/app/dashboard/page.tsx`, `app/routers/analytics.py`).
- Reduce N+1 lookups in recent activity feed by preloading users in a single query (`app/routers/analytics.py`).
- Standardize recent-activity `type` values between backend and frontend mapping (currently mismatched categories can show wrong colors/icons) (`app/routers/analytics.py`, `frontend/src/app/dashboard/page.tsx`).
- Add cached aggregates/materialized snapshots for heavy dashboard metrics to keep response times stable as data grows (`app/services/analytics.py`).

## 7. Auditability, Reliability, and Test Coverage
- Expand audit coverage to sensitive actions currently missing logs (profile/password change, attendance correction, subscription status updates are partial) (`app/auth/router.py`, `app/routers/hr.py`).
- Add correlation/request IDs in logs and include them in error responses for support debugging (`app/main.py`, middleware layer).
- Add negative/security tests for cross-role access boundaries (especially fitness logs and payroll visibility) (`tests/`).
- Add contract tests for scanner offline sync behavior and duplicate scan handling (`tests/test_access.py`, frontend scanner behavior).
- Add performance tests for list endpoints (`/hr/attendance`, `/analytics/recent-activity`, `/finance/transactions`) with realistic row counts.
