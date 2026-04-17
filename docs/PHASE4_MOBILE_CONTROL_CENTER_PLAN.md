# Phase 4 Mobile Control Center Plan

Status: Phase 4 implementation and hardening complete

Source roadmap: `docs/PLAN.md` Phase 4, "Admin and Manager Mobile Control Center".

## Goal

Deliver a mobile-appropriate control center for `ADMIN` and `MANAGER` roles. The app should provide summaries, alerts, search, and drill-downs for daily oversight without copying web-only spreadsheet workflows into mobile.

## Current State

- Bootstrap already enables admin/manager mobile modules: `home`, `members`, `operations`, `finance`, `inventory`, `audit`, `support`, `chat`, `profile`, and `notifications`.
- Admin/manager capabilities already include member lookup, finance summary, POS, inventory, support queue, audit summary, chat, and notifications.
- Shared staff endpoints already cover member search/detail, check-in lookup/process, finance summary, POS checkout, and recent transactions for `ADMIN` and `MANAGER`.
- The mobile tab shell already exposes `Home`, `Members`, `Operations`, `Finance`, and `More` through capability-gated modules.
- Gap: `/mobile/staff/home` currently allows only coach, reception/front desk, cashier, and employee. Admin/manager need a dedicated control-center home instead of falling through to unsupported staff home behavior.
- Gap: `inventory` and `audit` are enabled modules, but the current tab layout has no direct inventory/audit tabs. These should live under `Operations` and `More` for Phase 4 unless a later design adds extra tabs.

## Product Shape

Admin/Manager tabs:

- `Home`: executive dashboard, alerts, approvals, and recent activity.
- `People`: member search, member summaries, staff summary, attendance snapshot.
- `Operations`: inventory snapshot, support queue entry, attendance snapshot, notifications/automation snapshot, quick links.
- `Finance`: mobile finance snapshot plus recent transactions. POS remains available only behind `use_pos`.
- `More`: profile, notifications, support, chat, audit summary, inventory detail, settings-style actions.

Admin/Manager rules:

- Keep mobile workflows summary-first.
- Use drill-down cards and compact lists, not table-heavy editing screens.
- Prefer existing shared endpoints where the shape is already mobile-safe.
- Add mobile-specific admin endpoints when the web/admin endpoint is too broad, admin-only, or table-shaped.
- `MANAGER` should receive the same Phase 4 mobile summaries unless a backend rule explicitly makes a domain admin-only.

## API Plan

Add mobile-first admin/manager endpoints under `/mobile/admin/*`:

- `GET /mobile/admin/home`
  - Executive dashboard cards.
  - Alert counts.
  - Approval counts.
  - Recent activity.
- `GET /mobile/admin/people/summary`
  - Member counts by status.
  - Staff counts by role.
  - Attendance today.
  - Recent members.
- `GET /mobile/admin/operations/summary`
  - Check-ins today.
  - Open support tickets.
  - Lost/found open items.
  - Low-stock products.
  - Pending notifications or automation items.
- `GET /mobile/admin/finance/summary`
  - Revenue today/month.
  - Expense today/month.
  - Net snapshot.
  - Recent transactions.
  - Low-stock count copied here only if finance screen should surface inventory risk.
- `GET /mobile/admin/audit/summary`
  - Recent audit events.
  - Security audit score/status if cheap enough to compute.
  - Counts by action family.
- `GET /mobile/admin/inventory/summary`
  - Low-stock count.
  - Out-of-stock count.
  - Top low-stock products.
  - Recent inventory-impacting transactions if available.

Reuse existing endpoints:

- `GET /mobile/staff/members`
- `GET /mobile/staff/members/{member_id}`
- `GET /mobile/staff/check-in/lookup`
- `POST /mobile/staff/check-in/process`
- `GET /mobile/staff/finance/summary`
- `GET /mobile/staff/transactions/recent`
- `GET /mobile/support/tickets`
- `GET /mobile/chat/*`
- `GET /mobile/me/*`

Backend implementation target:

- Add `MobileAdminService` in `app/services/mobile_admin_service.py`.
- Add Pydantic response models in `app/routers/mobile.py` or split mobile router files if the current file becomes too large.
- Allow both `ADMIN` and `MANAGER` for Phase 4 mobile summary routes.
- Keep existing web analytics/admin endpoints unchanged unless a query helper should be shared.

## Contract Plan

Add shared TypeScript schemas/types in `packages/contracts/src/mobile.ts`:

- `MobileAdminHome`
- `MobileAdminPeopleSummary`
- `MobileAdminOperationsSummary`
- `MobileAdminFinanceSummary`
- `MobileAdminAuditSummary`
- `MobileAdminInventorySummary`
- Supporting row types:
  - `MobileAlertItem`
  - `MobileApprovalItem`
  - `MobileRecentActivityItem`
  - `MobileCountMetric`
  - `MobileAuditEvent`
  - `MobileInventoryRiskItem`

Add parser functions in `apps/mobile/src/lib/api.ts`:

- `parseMobileAdminHomeEnvelope`
- `parseMobileAdminPeopleSummaryEnvelope`
- `parseMobileAdminOperationsSummaryEnvelope`
- `parseMobileAdminFinanceSummaryEnvelope`
- `parseMobileAdminAuditSummaryEnvelope`
- `parseMobileAdminInventorySummaryEnvelope`

## Mobile UI Plan

Home:

- Detect `ADMIN`/`MANAGER` in `apps/mobile/src/app/(tabs)/home.tsx`.
- Render `AdminHomeTab` instead of `StaffHomeTab`.
- Pull from `/mobile/admin/home`.
- Show executive metrics, urgent alerts, approvals, and recent activity.

People:

- Extend `apps/mobile/src/app/(tabs)/members.tsx` for admin/manager.
- Keep member search/detail reuse.
- Add staff summary and attendance snapshot card above search.
- Link to member registration if permitted.

Operations:

- Extend `apps/mobile/src/app/(tabs)/operations.tsx` for admin/manager.
- Use `/mobile/admin/operations/summary`.
- Include inventory snapshot, support queue shortcut, attendance snapshot, notification/automation snapshot, and audit shortcut.

Finance:

- Keep POS available only when `use_pos` is present.
- For admin/manager, default the top of `apps/mobile/src/app/(tabs)/finance.tsx` to snapshot and recent transactions.
- Avoid forcing a POS cart as the primary finance screen for admin/manager.

More:

- Add admin/manager quick links for audit summary and inventory summary.
- Reuse existing profile, notifications, chat, support, lost/found, and leaves/profile links where allowed.

## Sub-phases

### Sub-phase 4A: Backend Summary Foundation

Goal:

- Create the mobile admin/manager API surface and response contracts that every Phase 4 screen can consume.

Tasks:

- [x] Add `MobileAdminService` in `app/services/mobile_admin_service.py`.
- [x] Add `/mobile/admin/*` summary endpoints with `ADMIN` and `MANAGER` guards.
- [x] Add response models for home, people, operations, finance, audit, and inventory summaries.
- [x] Add focused backend tests for allowed and denied roles.
- [x] Keep all payloads useful when the database is sparse or empty.

Acceptance:

- [x] `ADMIN` and `MANAGER` can call all mobile admin summary endpoints.
- [x] Non-admin-control roles receive `403` for all mobile admin summary endpoints.
- [x] Each endpoint returns stable summary cards/lists without requiring web-table payloads.

### Sub-phase 4B: Shared Contracts And API Parsers

Goal:

- Make the new backend payloads type-safe for the Expo app.

Tasks:

- [x] Add `MobileAdminHome`.
- [x] Add `MobileAdminPeopleSummary`.
- [x] Add `MobileAdminOperationsSummary`.
- [x] Add `MobileAdminFinanceSummary`.
- [x] Add `MobileAdminAuditSummary`.
- [x] Add `MobileAdminInventorySummary`.
- [x] Add parser functions in `apps/mobile/src/lib/api.ts`.

Acceptance:

- [x] Mobile typecheck validates the new response shapes.
- [x] Runtime parsers reject malformed admin summary payloads.

### Sub-phase 4C: Control-Center Home

Goal:

- Give admin/manager a proper mobile landing screen.

Tasks:

- [x] Add `isAdminControlRole(role)` helper.
- [x] Detect admin/manager in `apps/mobile/src/app/(tabs)/home.tsx`.
- [x] Render `AdminHomeTab` using `/mobile/admin/home`.
- [x] Show executive metrics, alerts/approvals, and recent activity.

Acceptance:

- [x] Admin/manager no longer call `/mobile/staff/home`.
- [x] Admin/manager land on a summary-first control center.

### Sub-phase 4D: People And Operations Summaries

Goal:

- Put the daily oversight surfaces into the existing People and Operations tabs.

Tasks:

- [x] Extend `members.tsx` with admin/manager people summary cards.
- [x] Preserve member search/detail behavior.
- [x] Extend `operations.tsx` with inventory, support, attendance, notifications, and audit shortcuts.

Acceptance:

- [x] People tab exposes member, staff, and attendance snapshots.
- [x] Operations tab exposes support, inventory, notification/automation, and audit snapshots.

### Sub-phase 4E: Finance, More, And Verification

Goal:

- Finish the Phase 4 mobile shell and verify it end to end.

Tasks:

- [x] Make admin/manager finance summary-first while retaining POS behind capability.
- [x] Add More quick links for audit and inventory summaries.
- [x] Run backend tests.
- [x] Run mobile typecheck.

Acceptance:

- [x] Finance is useful for admin/manager without requiring a POS checkout flow.
- [x] Audit is reachable from Operations or More for admins.
- [x] Backend and mobile verification commands pass.

### Sub-phase 4F: Drill-Downs, Permissions, Copy, And Coverage

Goal:

- Finish the practical polish items needed before mobile QA.

Tasks:

- [x] Add true drill-down screens for audit and inventory summaries.
- [x] Make audit summary `ADMIN`-only and remove audit capability/module from `MANAGER`.
- [x] Hide audit links and audit activity for `MANAGER`.
- [x] Move Phase 4 user-facing labels into mobile copy for English and Arabic.
- [x] Add seeded-count backend tests for support, audit, inventory, finance, approvals, and attendance summaries.
- [x] Run web typecheck and lint.

Acceptance:

- [x] `/admin-audit` shows admin audit details and blocks manager with a neutral message.
- [x] `/inventory-summary` shows low-stock drill-down details for admin/manager.
- [x] `MANAGER` cannot call `/mobile/admin/audit/summary`.
- [x] Phase 4 labels are no longer hardcoded in screen components.
- [x] Backend tests assert populated summary counts, not only successful responses.
- [x] Web typecheck passes and web lint has no new errors.

## Verification Plan

Backend:

- Add tests covering:
  - `ADMIN` can access all `/mobile/admin/*` summaries.
  - `MANAGER` can access mobile admin summaries except audit.
  - `CUSTOMER`, `COACH`, `RECEPTION`, `FRONT_DESK`, `CASHIER`, and `EMPLOYEE` cannot access `/mobile/admin/*`.
  - Summary payloads remain valid with empty data.
  - Summary payloads include seeded data for people, finance, operations, inventory, support, and audit.

Mobile:

- Run `npm run typecheck:mobile`.
- Manually verify admin/manager login lands on control-center home.
- Confirm tabs visible for admin/manager: Home, People, Operations, Finance, More.
- Confirm Finance does not make POS the only useful admin/manager workflow.
- Confirm Manager does not see audit entry points.

Suggested commands:

```bash
.venv/bin/pytest tests/test_phase3_4.py
npm run typecheck:mobile
npm run typecheck:web
npm run lint:web
```

## Acceptance Mapping

Phase 4 acceptance from `docs/PLAN.md`:

- Admin can view mobile summaries for people, finance, operations, support, and audit.

Concrete acceptance checklist:

- [x] Admin/manager home shows executive dashboard, alerts/approvals, and recent activity.
- [x] People tab shows member summary/search, staff summary, and attendance snapshot.
- [x] Operations tab shows support, inventory, notification/automation, and attendance snapshots.
- [x] Finance tab shows admin/manager finance snapshot and recent transactions.
- [x] More or Operations exposes audit summary.
- [x] Restricted roles cannot open admin/manager summaries.
- [x] Mobile contracts validate all Phase 4 payloads.
- [x] Backend and mobile verification commands pass for the completed Phase 4 slice.
- [x] Admin has audit drill-down access.
- [x] Manager does not have audit drill-down access.
- [x] Inventory has a drill-down screen.
- [x] Web verification passes with no new errors.

## Open Decisions

- Resolved: `MANAGER` does not see audit summaries by default; audit remains `ADMIN`-only.
- Resolved: admin/manager finance is summary-first; POS is available behind an explicit action when capability allows it.
- Resolved for v1: notification automation starts as counts plus recent summary indicators.
- Resolved for v1: inventory drill-down uses the mobile admin inventory summary payload.
