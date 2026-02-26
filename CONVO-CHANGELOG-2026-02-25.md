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

## 15) Diet Flow Hardening + Admin/Coach UX Fixes
- Backend diet access/assignment improvements in `app/routers/fitness.py`:
  - Explicit admin/coach read branch for `GET /fitness/diets/{diet_id}` (admin + all coaches can read by ID).
  - `POST /fitness/diets/{diet_id}/bulk-assign` now:
    - Archives only coach-owned active diets for coach users.
    - Archives all active diets for admin users.
    - Skips non-customer `member_ids` with reason `not a customer`.
  - Added optional query params for admin cross-creator retrieval:
    - `include_all_creators`
    - `creator_id`
    - `templates_only`
    - on both `GET /fitness/diet-summaries` and `GET /fitness/diets`.
- Admin member assignment modal updated in `frontend/src/app/dashboard/admin/members/page.tsx`:
  - Diet fetch now requests cross-creator templates with:
    - `include_archived=true`
    - `include_all_creators=true`
    - `templates_only=true`
- Tests added/expanded in `tests/test_fitness.py`:
  - Coach replace-active archives only own active diets.
  - Admin replace-active archives all active diets.
  - Non-customer assignment targets are skipped.
  - Coach can read another coach’s diet by ID; customer blocked when unassigned.
  - Admin can list diet summaries across creators with `include_all_creators`.

## 16) Chat Reliability + Admin Visibility
- `frontend/src/app/dashboard/chat/page.tsx`:
  - Prevented transient fetch errors from clearing admin threads/messages.
  - Only clears selected thread/messages on true `404` thread-not-found.
  - Chat entry behavior adjusted to open at top with jump-to-latest available.
- `frontend/src/app/dashboard/layout.tsx`:
  - Global chat icon/drawer visibility updated to include `ADMIN`.
- `frontend/src/app/dashboard/admin/members/page.tsx`:
  - Message action visibility updated from coach-only to admin+coach in:
    - desktop member rows
    - mobile cards
    - profile modal action

## 17) Diet Planner Rebuild (Workout-Parity Structure)
- Rebuilt diet plan builder in `frontend/src/app/dashboard/coach/diets/page.tsx`:
  - Added editable meal groups and editable meals:
    - `Meal Group 1 -> Meal 1, Meal 2, ...`
    - add/remove groups and meals
  - Removed manual raw `content`/JSON editing from the modal.
  - Save now auto-generates:
    - text `content`
    - structured `content_structured.meal_groups`
  - Edit flow parses existing structured content first, falls back to text parsing.
- Added diet library integration directly in planner modal:
  - `Choose from Library` with search + apply into planner.
- Readability improvements:
  - Template cards preview grouped meal content.
  - Assigned diets now grouped by root template (like workout assigned grouping).
  - Added `View Details / Collapse` on templates and assigned rows.
  - Collapsed cards show group names only; expanded view shows full meal details.

## 18) Validation Performed (This Conversation)
- `python -m py_compile app/routers/fitness.py` passed.
- `pytest -q tests/test_fitness.py -k "diet or bulk_assign"` passed (`11 passed, 9 deselected`).
- `pytest -q tests/test_chat.py` passed (`2 passed`).
- `npx tsc --noEmit` (frontend) passed after each frontend change set.

## 19) Workout UX Refactor + Coach Dashboard Metrics (This Conversation)
- Workout plans page refactor for coach in `frontend/src/app/dashboard/coach/plans/page.tsx`:
  - Reworked layout hierarchy to clearer `Templates` and `Assigned Plans` sections.
  - Added independent detail toggles for template cards and assigned member cards.
  - Converted create/edit workflow to a **2-step modal**:
    - Step 1: Plan basics
    - Step 2: Workout builder
  - Kept existing behavior and endpoints for create/edit/assign/publish/archive/delete.
- Added new shared presentational components:
  - `frontend/src/components/PlanCardShell.tsx`
  - `frontend/src/components/PlanDetailsToggle.tsx`
  - `frontend/src/components/PlanSectionHeader.tsx`
  - `frontend/src/components/AssignPlanSummaryPanel.tsx`
- Coach dashboard biometric chart improvements in `frontend/src/app/dashboard/page.tsx`:
  - First added per-metric visibility controls for time-series lines.
  - Then changed controls to **radio (single-select)** per request.
  - Removed `Height` from chart metric selector.
  - Final chart metrics selectable: `Weight`, `Body Fat`, `Muscle Mass`.
- Coach KPI correction in `frontend/src/app/dashboard/page.tsx`:
  - `Diet Plans` KPI now counts **assigned diets only** (`member_id` present), excluding templates.
  - KPI label updated to `Assigned Diet Plans` with subtitle `Assigned to members`.

## 20) Validation Performed (This Conversation)
- `npx eslint src/app/dashboard/coach/plans/page.tsx src/components/PlanCardShell.tsx src/components/PlanDetailsToggle.tsx src/components/PlanSectionHeader.tsx src/components/AssignPlanSummaryPanel.tsx` passed.
- `npx eslint src/app/dashboard/page.tsx` passed.
- `npm run build` (frontend) passed after changes.
- Note: full-repo `npm run lint` previously showed unrelated pre-existing errors in other files (not introduced by these edits).

## 21) Customer Dashboard Decomposition + IA Cleanup
- Refactored customer `/dashboard` into overview-only (summary + quick access), removed heavy detailed sections.
- Added dedicated customer pages:
  - `/dashboard/member/progress`
  - `/dashboard/member/plans`
  - `/dashboard/member/diets`
- Added shared customer data/types modules:
  - `frontend/src/app/dashboard/member/_shared/customerData.ts`
  - `frontend/src/app/dashboard/member/_shared/types.ts`
- Updated customer sidebar navigation in:
  - `frontend/src/app/dashboard/layout.tsx`

## 22) Customer Plans/Progress UX Enhancements
- Moved session logging flow to customer plans page:
  - `frontend/src/app/dashboard/member/plans/page.tsx`
- Added immediate progress refresh trigger after session log:
  - emits local refresh event + storage timestamp from plans page
  - progress page listens and refetches instantly
  - files:
    - `frontend/src/app/dashboard/member/plans/page.tsx`
    - `frontend/src/app/dashboard/member/progress/page.tsx`
- Repositioned PR table under `Quick Body Log` on progress page per UX request.
- Added section/group-aware rendering for assigned workout plans:
  - plan exercises now shown grouped by `section_name`.
- Session logger now requires selecting which workout group was completed today before submitting.

## 23) Feedback UX Fixes (Member)
- Replaced raw `Diet Plan ID` input with member-friendly diet name selector.
- Diet list is loaded from assigned diets; submit disabled with guidance when none assigned.
- File:
  - `frontend/src/app/dashboard/member/feedback/page.tsx`

## 24) Styling/System Cleanup
- Fixed mono font token override regression:
  - removed `--font-mono` override to serif in layout/body.
- Added reusable `section-chip` class and reduced card hover lift for less visual noise.
- Files:
  - `frontend/src/app/layout.tsx`
  - `frontend/src/app/globals.css`

## 25) Backend Fix: Diet/Gym Feedback 500 Errors
- Root cause identified from backend logs:
  - timezone-aware datetimes being inserted into `TIMESTAMP WITHOUT TIME ZONE`.
- Fixed datetime defaults to use naive UTC (`datetime.utcnow`) in:
  - `WorkoutLog.date`
  - `WorkoutSession.performed_at`
  - `DietFeedback.created_at`
  - `GymFeedback.created_at`
- File:
  - `app/models/workout_log.py`
- Rebuilt backend container:
  - `docker compose up -d --build backend`

## 26) Validation Performed (This Session)
- `npm run build` (frontend) passed after each major frontend change set.
- `docker compose up -d --build backend` completed successfully.
- Backend startup logs confirmed healthy service after model fix.

## 27) Chat Indicators: Receiver-Only + Faster Read Sync
- Reported issue:
  - When coach/customer sent a message, both sides could appear as having a "new chat" indicator.
  - Read status could feel delayed before indicators cleared.
- Root cause:
  - Floating chat badge in dashboard layout was computed from `last_message_at` vs local `last_seen_chat`, which is sender/receiver symmetric.
- Implemented fixes:
  - Switched floating badge logic to backend unread state:
    - Count unread threads using `thread.unread_count > 0`.
    - Removed chat `last_seen_chat_*` dependency for badge calculation.
  - Added immediate indicator sync after marking thread as read:
    - Chat page now refreshes threads and dispatches `chat:sync-indicators` right after `POST /chat/threads/{threadId}/read`.
    - Dashboard layout listens for `chat:sync-indicators` and refreshes indicators immediately.
- Scope confirmation:
  - Drawer and chat page thread badges already used `unread_count` and were kept.
  - Admin remains read-only and does not show unread chat badge behavior.
- Files changed:
  - `frontend/src/app/dashboard/layout.tsx`
  - `frontend/src/app/dashboard/chat/page.tsx`
- Validation note:
  - Targeted lint still shows a pre-existing `react-hooks/set-state-in-effect` warning in `layout.tsx` (support/lost-found effect), unrelated to the chat indicator logic.

## 28) Member Payments Clarification + Reception Assign UI Restriction
- Clarified how client payment history is tracked:
  - Member history page reads from `GET /finance/my-transactions`.
  - Backend returns transactions where `Transaction.user_id == current_user.id`, ordered by latest date.
  - Subscription renewals and member-linked POS sales appear only when transaction `user_id` is set to that member.
- Enforced UI restriction for receptionist/front-desk on plan assignment:
  - Removed visible `Assign` action for these roles in members list (desktop and mobile).
  - Kept `Assign` available for `ADMIN`/`COACH` only via `canAssignPlans`.
  - Guarded assign modal visibility and `openAssignPlan` execution by role.
- File changed:
  - `frontend/src/app/dashboard/admin/members/page.tsx`
- Validation:
  - `npm run lint -- src/app/dashboard/admin/members/page.tsx` passed.

## 29) Member Workout Details + Video Popup Modal (Mobile Friendly)
- Enhanced member workout plans view to show fuller exercise details in assigned plans:
  - sets/reps chips
  - optional duration
  - video provider metadata
  - per-exercise rendering under section groups without truncating to a short preview list
- Added exercise video playback via popup modal for both:
  - URL/embed sources (YouTube variants normalized to embed URL)
  - uploaded/direct video files (`<video controls playsInline>`)
- Modal UX/mobile responsiveness improvements:
  - full-screen dimmed overlay with close action
  - responsive container sizing (`max-w-4xl`, compact mobile padding)
  - aspect-ratio video frame for embeds
  - `Open Source` link fallback
- Files changed:
  - `frontend/src/app/dashboard/member/plans/page.tsx`
  - `frontend/src/app/dashboard/member/_shared/types.ts`
- Validation:
  - `npx eslint src/app/dashboard/member/plans/page.tsx src/app/dashboard/member/_shared/types.ts` (no errors; one pre-existing hook dependency warning)

## 30) Performance Refactor: Polling Reduction + Shared Chat Cache
- Reduced duplicate polling and moved chat thread state to shared cache:
  - Added shared SWR hook for chat thread list/unread data.
  - Dashboard floating chat badge now reads shared unread counts instead of separate polling fetch.
  - Chat drawer now consumes same shared cache and removed its own polling loop.
- Removed frequent members auto-refresh polling loop.
- Files changed:
  - `frontend/src/hooks/useChatThreads.ts`
  - `frontend/src/app/dashboard/layout.tsx`
  - `frontend/src/components/chat/ChatDrawer.tsx`
  - `frontend/src/app/dashboard/admin/members/page.tsx`

## 31) Backend Query/Pagination Improvements (Scalability)
- Fixed chat threads N+1 pattern in backend:
  - Batched latest-message lookup per thread.
  - Batched unread-count computation per thread/user.
  - Replaced per-thread unread/message queries in list API.
- Added server-side pagination metadata (`X-Total-Count`) and offset support:
  - `GET /finance/transactions` now supports `offset` and returns total count header.
  - `GET /hr/payrolls/pending` now returns total count header.
  - `GET /hr/attendance` now supports `offset` and returns total count header.
  - `GET /support/tickets` now returns total count header.
- Files changed:
  - `app/routers/chat.py`
  - `app/routers/finance.py`
  - `app/routers/hr.py`
  - `app/routers/support.py`

## 32) Frontend Pagination on Heavy Screens
- Wired server pagination (`limit/offset` + total header) into:
  - Admin finance transactions table
  - Admin finance payroll table
  - Staff attendance table
  - Customer support queue
  - Admin support queue
- Added page controls and total counts in-page for each list.
- Files changed:
  - `frontend/src/app/dashboard/admin/finance/page.tsx`
  - `frontend/src/app/dashboard/admin/staff/attendance/page.tsx`
  - `frontend/src/app/dashboard/support/page.tsx`
  - `frontend/src/app/dashboard/admin/support/page.tsx`

## 33) Exports Upgrade: Popup Print -> Download Exports + True PDFs
- Replaced popup-print patterns with backend export/download flows.
- Added download helper:
  - `frontend/src/lib/download.ts`
- Added/kept HTML export endpoints and added true PDF endpoints:
  - `GET /finance/transactions/{transaction_id}/receipt/export-pdf`
  - `GET /finance/transactions/report.pdf`
  - `GET /hr/payroll/{payroll_id}/payslip/export-pdf`
- Frontend buttons now download files directly:
  - Finance receipt/report buttons download PDFs.
  - Staff payslip action downloads PDF.
- Added PDF dependency:
  - `reportlab` in `requirements.txt`
- Files changed:
  - `app/routers/finance.py`
  - `app/routers/hr.py`
  - `frontend/src/app/dashboard/admin/finance/page.tsx`
  - `frontend/src/app/dashboard/admin/staff/page.tsx`
  - `frontend/src/lib/download.ts`
  - `requirements.txt`

## 34) Support Module Consolidation + Lint Cleanup
- Began support-module decomposition:
  - Shared support domain types module.
  - Shared support ticket-list fetching hook reused by both customer and admin support pages.
- Resolved remaining frontend lint blockers/warnings:
  - Fixed `setState` in effect warning on entrance QR page via lazy `useState` initializers.
  - Converted support attachment previews from `<img>` to `next/image`.
  - Fixed hook dependency warning by memoizing ticket-details fetch callbacks.
- Files added:
  - `frontend/src/features/support/types.ts`
  - `frontend/src/features/support/useSupportTickets.ts`
- Files changed:
  - `frontend/src/app/dashboard/admin/entrance-qr/page.tsx`
  - `frontend/src/app/dashboard/support/page.tsx`
  - `frontend/src/app/dashboard/admin/support/page.tsx`

## 35) E2E Baseline Added (Playwright Smoke)
- Added Playwright configuration and smoke test scaffold:
  - login flow
  - member create API smoke
  - support ticket create/reply API smoke
  - payroll payment API smoke (conditional skip if no payable row)
- Added npm scripts:
  - `test:e2e`
  - `test:e2e:ui`
- Files changed:
  - `frontend/playwright.config.ts`
  - `frontend/e2e/smoke.spec.ts`
  - `frontend/package.json`
  - `frontend/package-lock.json`

## 36) Validation Performed (This Session)
- Backend:
  - `python -m compileall app/routers` passed after backend edits.
- Frontend:
  - `npm run lint` now passes with no errors/warnings after cleanup.

## 37) Coach Feedback UX Fix: Diet Plan Name Instead of UUID
- Reported issue:
  - Diet feedback cards on coach feedback page displayed raw `diet_plan_id` UUIDs in the `Plan:` label.
- Implemented fix:
  - Coach feedback page now loads diet plans (`/fitness/diet-summaries` with fallback to `/fitness/diets`).
  - Added an `id -> name` lookup map for diet plans.
  - Diet feedback cards now display `Plan: <diet name>` and only fall back to UUID when name cannot be resolved.
- File changed:
  - `frontend/src/app/dashboard/coach/feedback/page.tsx`
- Validation:
  - `npx eslint src/app/dashboard/coach/feedback/page.tsx` passed.
