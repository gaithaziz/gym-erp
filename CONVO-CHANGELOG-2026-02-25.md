# Conversation Changelog (2026-02-25)

## 1) Workout Plans UX (Coach)
- Improved workout template/assigned-plan readability and grouping.
- Added status-based template filters (`All`, `Published`, `Draft`, `Archived`) aligned to the left.
- Improved mobile-friendly spacing and action layout.
- File: `frontend/src/app/dashboard/coach/plans/page.tsx`

## 2) Admin Assign Modal Improvements
- Added workout status filter chips in assign flow.
- Filtered workout plan dropdown by selected status.
- Kept assign preview, warnings, and archived-plan assignment guardrails.
- File: `frontend/src/app/dashboard/admin/members/page.tsx`

## 3) New Sidebar Hub: Workout & Diet Library
- Added new Coaching nav item for `ADMIN` and `COACH`:
  - Route: `/dashboard/coach/library`
  - Label: `Workout & Diet Library`
- New page includes:
  - Tabs: `Workout Library`, `Diet Library`
  - Shared filters: scope (`all/global/mine`) + search
  - Add/edit/delete for both library types
  - Diet template `To Plan` action
- Files:
  - `frontend/src/app/dashboard/layout.tsx`
  - `frontend/src/app/dashboard/coach/library/page.tsx`

## 4) Backend: Workout Library CRUD Expansion
- Added:
  - `PUT /fitness/exercise-library/{item_id}`
  - `DELETE /fitness/exercise-library/{item_id}`
- Added ownership/global authorization rules:
  - Admin can manage global and own items
  - Coach can manage own non-global items
- File: `app/routers/fitness.py`

## 5) Backend: Diet Library (New)
- Added new model/table: `diet_library_items`
  - Fields: `id, name, description, content, is_global, owner_coach_id, created_at, updated_at`
- Added endpoints:
  - `GET /fitness/diet-library`
  - `POST /fitness/diet-library`
  - `PUT /fitness/diet-library/{item_id}`
  - `DELETE /fitness/diet-library/{item_id}`
  - `POST /fitness/diet-library/{item_id}/to-plan`
- Files:
  - `app/models/fitness.py`
  - `app/routers/fitness.py`
  - `alembic/versions/6a9f21b7c3d4_add_diet_library_items.py`

## 6) Integrations/Navigation Shortcuts
- Added helper link from workout plan builder to library page.
- Added `Open Library` shortcut button on diet plans page.
- Files:
  - `frontend/src/app/dashboard/coach/plans/page.tsx`
  - `frontend/src/app/dashboard/coach/diets/page.tsx`

## 7) Copy/Text Cleanup
- Replaced confusing message mentioning `Save reusable` on library page with neutral guidance.
- File: `frontend/src/app/dashboard/coach/library/page.tsx`

## 8) Tests Added/Updated
- Added tests for:
  - Workout library update/delete authorization
  - Diet library CRUD and `to-plan` conversion
- File: `tests/test_fitness.py`

## 9) Validation Performed
- `python -m py_compile app/routers/fitness.py app/models/fitness.py` passed.
- `npx tsc --noEmit` (frontend) passed.
- `pytest -q tests/test_fitness.py` passed (`13 passed`).

## 10) Migration Note
- Apply DB changes with:
  - `alembic upgrade head`
  - then rebuild services if needed:
    - `docker compose up -d --build backend frontend`

## 11) Diet Plan Workflow Parity (Full + Hybrid Content)
- Implemented full diet lifecycle parity with workout plans:
  - Added fields to `DietPlan`: `status`, `version`, `parent_plan_id`, `published_at`, `archived_at`, `is_template`, `content_structured`.
  - Added self-referential version lineage for diet plans.
- Added backend endpoints/features:
  - Updated: `POST /fitness/diets`, `GET /fitness/diets`, `GET /fitness/diets/{diet_id}`, `POST /fitness/diets/{diet_id}/clone`
  - Added: `PUT /fitness/diets/{diet_id}`, `POST /fitness/diets/{diet_id}/publish`, `POST /fitness/diets/{diet_id}/archive`, `POST /fitness/diets/{diet_id}/fork-draft`, `POST /fitness/diets/{diet_id}/bulk-assign`, `GET /fitness/diet-summaries`
  - Added lifecycle enforcement:
    - Published diets are read-only; must fork draft to edit.
    - Archived diets are non-editable and non-assignable.
  - Updated diet library conversion:
    - `POST /fitness/diet-library/{item_id}/to-plan` now creates a `DRAFT` diet by default.
- Added migration:
  - `alembic/versions/a7d3b91f4c2e_add_diet_lifecycle_parity.py`
  - Includes schema changes, backfill to published defaults for existing rows, FK, and indexes:
    - `ix_diet_plans_creator_status`
    - `ix_diet_plans_member_status`
    - `ix_diet_plans_parent_plan_id`
- Frontend parity updates:
  - Rebuilt coach diets page to mirror workout workflow:
    - status chips, template/assigned grouping, lifecycle actions, bulk assign modal
    - create/edit modal includes optional `content_structured` JSON with validation
  - Updated admin member assignment modal:
    - diet status filter chips + warnings
    - diet assignment now uses `bulk-assign` endpoint
    - archived diet assignment guardrails
- Files:
  - `app/models/fitness.py`
  - `app/routers/fitness.py`
  - `alembic/versions/a7d3b91f4c2e_add_diet_lifecycle_parity.py`
  - `frontend/src/app/dashboard/coach/diets/page.tsx`
  - `frontend/src/app/dashboard/admin/members/page.tsx`
  - `tests/test_fitness.py`

## 12) Validation Performed (Post-Parity)
- `python -m py_compile app/routers/fitness.py app/models/fitness.py alembic/versions/a7d3b91f4c2e_add_diet_lifecycle_parity.py` passed.
- `npx tsc --noEmit` (frontend) passed.
- `pytest -q tests/test_fitness.py` passed (`16 passed`).
- `pytest -q tests/test_phase3_4.py` passed (`3 passed`).
- `pytest -q tests/test_roles_feedback_notifications.py -k "diet or feedback"` passed (`6 passed`).

## 13) Payroll Automation (Hybrid + Hard Paid Lock)
- Implemented automatic payroll sync with hybrid strategy:
  - Event-driven recalculation hooks
  - Daily scheduler run
  - Hard lock for `PAID` payroll rows
- New service:
  - `app/services/payroll_automation_service.py`
  - Handles:
    - current + previous period resolution using cutoff + timezone
    - per-user recalc for selected periods
    - skipping `PAID` payroll rows
    - run summaries (`users_scanned`, `periods_scanned`, `created`, `updated`, `skipped_paid`, `errors`)
    - automation status payload
- Payroll lock behavior:
  - `PayrollService.calculate_payroll(..., allow_paid_recalc=False)` now blocks recalculating `PAID` rows.
  - Manual `POST /hr/payroll/generate` now returns HTTP 400 when payroll is locked.
  - File: `app/services/payroll_service.py`
- New admin automation APIs:
  - `GET /hr/payrolls/automation/status`
  - `POST /hr/payrolls/automation/run`
    - Optional payload: `month`, `year`, `user_id`, `dry_run`
  - File: `app/routers/hr.py`
- Event-driven auto-recalc hooks (best effort, post-commit):
  - Contract create/update (`POST /hr/contracts`)
  - Leave status transitions into/out of `APPROVED` (`PUT /hr/leaves/{leave_id}`)
  - Attendance correction (`PUT /hr/attendance/{attendance_id}`)
  - Staff checkout (`POST /access/check-out`)
  - Files:
    - `app/routers/hr.py`
    - `app/routers/access.py`
- Scheduler integration (no external worker):
  - Added startup/shutdown managed async scheduler loop in `app/main.py`
  - Daily local-time execution with:
    - `PAYROLL_AUTO_HOUR_LOCAL`
    - `PAYROLL_AUTO_MINUTE_LOCAL`
    - timezone from `PAYROLL_AUTO_TZ` (fallback `GYM_TIMEZONE`)
  - Cross-replica guard with Postgres advisory lock:
    - `pg_try_advisory_lock` / `pg_advisory_unlock`
- New config flags:
  - `PAYROLL_AUTO_ENABLED` (default `True`)
  - `PAYROLL_AUTO_HOUR_LOCAL` (default `2`)
  - `PAYROLL_AUTO_MINUTE_LOCAL` (default `0`)
  - `PAYROLL_AUTO_TZ` (optional; fallback to `GYM_TIMEZONE`)
  - File: `app/config.py`

## 14) Validation Performed (Payroll Automation)
- `python -m py_compile app/main.py app/routers/hr.py app/routers/access.py app/services/payroll_service.py app/services/payroll_automation_service.py app/config.py` passed.
- `pytest -q tests/test_hr.py` passed (`14 passed`).
- `pytest -q tests/test_fitness.py -k "diet"` passed (`6 passed, 10 deselected`).
