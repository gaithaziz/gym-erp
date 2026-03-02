# Mobile Parity Matrix

## Purpose

This matrix is the Phase 1 implementation inventory for the React Native + Expo mobile program.

It maps:

- web route groups
- backend endpoint families
- allowed roles
- target devices
- implementation complexity
- current mobile status

Status values:

- `implemented`: mobile screen or flow exists and uses live backend data
- `foundation`: route/shell/auth basis exists, but product flow is not complete
- `pending`: not started in mobile product terms

## Account Flows

| Domain | Web route(s) | Backend endpoint(s) | Roles | Device | Complexity | Mobile status |
| --- | --- | --- | --- | --- | --- | --- |
| Login / bootstrap | `/login` | `/auth/login`, `/auth/refresh`, `/auth/me` | all | phone/tablet | medium | implemented |
| Dashboard shell | `/dashboard` | `/auth/me` plus role-specific queries | all | phone/tablet | medium | foundation |
| Profile | `/dashboard/profile` | `/auth/me`, `PUT /auth/me`, `POST /auth/me/profile-picture` | admin, coach, customer, employee, cashier, reception, front_desk | phone/tablet | medium | implemented |
| QR | `/dashboard/qr` | `GET /access/qr`, `POST /access/grant`, `POST /access/check-in`, `POST /access/check-out` | customer, coach, admin, employee, cashier, reception, front_desk | phone/tablet | high | foundation |
| Subscription | `/dashboard/subscription` | `/auth/me`, support escalation endpoints | customer | phone/tablet | medium | implemented |
| Leaves | `/dashboard/leaves`, `/dashboard/admin/leaves` | `/hr/leaves`, `/hr/leaves/me` | admin, coach, employee, cashier, reception, front_desk | phone/tablet | medium | pending |
| Support | `/dashboard/support`, `/dashboard/admin/support` | `/support/tickets`, `/support/tickets/{id}`, `/support/tickets/{id}/messages`, `/support/tickets/{id}/attachments`, `/support/tickets/{id}/status` | customer, admin, reception | phone/tablet | high | pending |
| Chat | `/dashboard/chat` | `/chat/contacts`, `/chat/threads`, `/chat/threads/{id}/messages`, `/chat/threads/{id}/attachments`, `/chat/threads/{id}/read` | admin, coach, customer | phone/tablet | high | pending |
| Lost & Found | `/dashboard/lost-found` | `/lost-found/items`, `/lost-found/items/{id}`, comments/media/status/assign endpoints | customer, coach, admin, employee, cashier, reception, front_desk | phone/tablet | high | pending |

## Customer Domains

| Domain | Web route(s) | Backend endpoint(s) | Roles | Device | Complexity | Mobile status |
| --- | --- | --- | --- | --- | --- | --- |
| Progress | `/dashboard/member/progress` | `/fitness/stats`, `/fitness/biometrics`, `/fitness/session-logs/me` | customer | phone/tablet | medium | pending |
| Workout plans | `/dashboard/member/plans` | `/fitness/plans`, `/fitness/session-logs` | customer | phone/tablet | high | pending |
| Diet plans | `/dashboard/member/diets` | `/fitness/diets` | customer | phone/tablet | medium | pending |
| Feedback | `/dashboard/member/feedback` | `/fitness/diet-feedback`, `/fitness/gym-feedback` | customer | phone/tablet | medium | pending |
| History | `/dashboard/member/history` | `/access/my-history`, finance history endpoints | customer | phone/tablet | medium | pending |
| Achievements | `/dashboard/member/achievements` | `/gamification/stats` | customer | phone/tablet | medium | pending |

## Coach Domains

| Domain | Web route(s) | Backend endpoint(s) | Roles | Device | Complexity | Mobile status |
| --- | --- | --- | --- | --- | --- | --- |
| Coach dashboard | `/dashboard` | analytics, assigned-member, summary endpoints | coach | phone/tablet | medium | pending |
| Workout plans management | `/dashboard/coach/plans` | `/fitness/plans`, clone/publish/archive/bulk-assign endpoints | coach, admin | phone/tablet | high | pending |
| Diet plans management | `/dashboard/coach/diets` | `/fitness/diets`, clone/publish/archive/bulk-assign endpoints | coach, admin | phone/tablet | high | pending |
| Workout / diet library | `/dashboard/coach/library` | `/fitness/exercise-library`, `/fitness/diet-library` | coach, admin | phone/tablet | high | pending |
| Coach feedback review | `/dashboard/coach/feedback` | fitness feedback endpoints | coach, admin | phone/tablet | medium | pending |

## Staff / Operations Domains

| Domain | Web route(s) | Backend endpoint(s) | Roles | Device | Complexity | Mobile status |
| --- | --- | --- | --- | --- | --- | --- |
| Reception registration / members | `/dashboard/admin/members` | `/hr/members`, `/hr/subscriptions` | admin, coach, reception, front_desk | phone/tablet | high | pending |
| Staff attendance | `/dashboard/admin/staff/attendance` | `/hr/attendance`, `PUT /hr/attendance/{id}` | admin | phone/tablet | medium | pending |
| POS | `/dashboard/admin/pos` | `/inventory/pos/sell`, `/inventory/pos/recent` | admin, cashier, employee | phone/tablet | medium | pending |
| Notifications automation | `/dashboard/admin/notifications` | `/admin/notifications/automation-rules`, `/admin/notifications/whatsapp-logs` | admin, reception, front_desk | phone/tablet | high | pending |

## Admin Dense Domains

| Domain | Web route(s) | Backend endpoint(s) | Roles | Device | Complexity | Mobile status |
| --- | --- | --- | --- | --- | --- | --- |
| Admin dashboard | `/dashboard` | `/analytics/dashboard`, `/analytics/attendance`, `/analytics/revenue-chart`, `/analytics/recent-activity`, `/analytics/daily-visitors` | admin | tablet first, phone fallback | high | pending |
| Inventory | `/dashboard/admin/inventory` | `/inventory/products`, low-stock endpoints | admin | tablet first, phone fallback | high | pending |
| Finance | `/dashboard/admin/finance` | `/finance/transactions`, `/finance/summary`, export/report endpoints | admin | tablet first, phone fallback | high | pending |
| Audit | `/dashboard/admin/audit` | `/audit/logs`, `/audit/security` | admin | tablet first, phone fallback | medium | pending |
| Entrance QR | `/dashboard/admin/entrance-qr` | `/access/grant`, kiosk-related access endpoints | admin | tablet first, phone fallback | medium | pending |
| Staff management | `/dashboard/admin/staff` | `/hr/staff`, `/hr/staff/{id}/summary` | admin | tablet first, phone fallback | high | pending |
| Payroll | admin finance/staff pages | payroll and payslip endpoints under `/hr/payroll*` | admin | tablet first, phone fallback | high | pending |

## Phase 1 Close-Out Notes

- Shared contracts and i18n packages exist.
- Auth/bootstrap foundation exists.
- Customer profile, QR token render, and subscription detail flows are live.
- Native QR scan, download/export handling, parity coverage artifacts, and tablet admin layout primitives still needed broader product rollout.
