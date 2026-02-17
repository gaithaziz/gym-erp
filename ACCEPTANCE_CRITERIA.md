# ACCEPTANCE_CRITERIA.md
Version: 2.0
Scope: Strict Definition of Done (DoD)

---

## 1. AUTHENTICATION MODULE
**COMPLETE WHEN:**
- [ ] `POST /auth/login` returns a valid JWT `access_token` and `refresh_token`.
- [ ] JWT payload contains `sub` (user_id), `role`, and `exp`.
- [ ] Access tokens expire strictly after 30 minutes.
- [ ] `POST /auth/refresh` issues a new access token using a valid refresh token.
- [ ] Invalid/Expired tokens return `401 Unauthorized`.
- [ ] RBAC is enforced: A `COACH` token cannot access `/admin` endpoints (Returns `403 Forbidden`).
- [ ] Passwords are never stored in plain text (Bcrypt verification).
- [ ] Unit tests for Auth flow pass with 100% success.

---

## 2. ACCESS & SUBSCRIPTION MODULE
**COMPLETE WHEN:**
- [ ] `GET /access/qr` returns a JWT-signed QR token.
- [ ] QR token expires strictly after 30 seconds.
- [ ] `POST /access/scan` returns `GRANTED` only if:
    - User exists.
    - Subscription status is `ACTIVE`.
    - Current date is <= `end_date`.
- [ ] `POST /access/scan` returns `DENIED` with reason `EXPIRED` if date > `end_date`.
- [ ] `POST /access/check-in` creates an `attendance_log` entry with `check_in_time`.
- [ ] `POST /access/check-out` updates the entry and calculates `hours_worked`.
- [ ] Scanning a QR code twice in 1 minute is flagged or handled gracefully.
- [ ] Access Control tests pass.

---

## 3. HR & PAYROLL MODULE
**COMPLETE WHEN:**
- [ ] Admin can create a Contract with `hourly_rate` or `fixed_salary`.
- [ ] `GET /admin/payroll/preview` correctly calculates salary:
    - **Hourly:** `Sum(hours_worked) * hourly_rate`.
    - **Fixed:** Returns `base_salary`.
- [ ] "Partial Hour" logic is verified (e.g., 15 mins = 0.25 hours).
- [ ] `POST /admin/payroll/process` creates a `EXPENSE` transaction in the Financial Ledger.
- [ ] Attendance logs cannot be modified by `EMPLOYEE` role (Read-only).
- [ ] Payroll calculation tests pass against known edge cases (e.g., 0 hours worked).

---

## 4. FITNESS & COACHING MODULE
**COMPLETE WHEN:**
- [ ] `POST /fitness/exercises` successfully saves a video URL.
- [ ] Coach can assign a `WorkoutPlan` to a specific Customer.
- [ ] Customer can fetch ONLY their assigned active plan.
- [ ] `POST /fitness/log` saves feedback (`difficulty_rating`, `comment`).
- [ ] Coach receives/views the feedback logged by the customer.
- [ ] A Customer cannot view another Customer's plan (Data Isolation).
- [ ] Integration tests verify the Coach-Trainee relationship loop.

---

## 5. FINANCIAL DASHBOARD
**COMPLETE WHEN:**
- [ ] `GET /admin/finance/dashboard` returns correct JSON structure:
    - `total_revenue` = Sum of all `INCOME`.
    - `total_expenses` = Sum of all `EXPENSE`.
    - `net_profit` = `Revenue - Expenses`.
- [ ] `POST /admin/finance/transaction` correctly adds a manual bill (e.g., Electricity).
- [ ] Ledger queries execute in under 200ms for datasets < 10,000 rows.
- [ ] Data is correctly filtered by month/year range.

---

## 6. INFRASTRUCTURE & DEPLOYMENT
**COMPLETE WHEN:**
- [ ] Docker container builds successfully without errors.
- [ ] Application starts successfully in a Cloud Run environment.
- [ ] Database migrations (`alembic upgrade head`) run automatically on deploy.
- [ ] CI Pipeline passes all tests before allowing a merge to `main`.
- [ ] API Documentation (Swagger/Redoc) is accessible at `/docs`.
- [ ] No secrets (DB passwords, API keys) are visible in the source code or Dockerfile.

---

## 7. FRONTEND (WEB & MOBILE)
**COMPLETE WHEN:**
- [ ] **Web:** Admin can log in and view the Financial Dashboard charts.
- [ ] **Web:** Admin can register a new Employee.
- [ ] **Mobile:** Customer can tap "Show QR" and see a visible code.
- [ ] **Mobile:** Customer can view their daily workout list.
- [ ] **Mobile:** App handles "No Internet" state on the QR screen gracefully.