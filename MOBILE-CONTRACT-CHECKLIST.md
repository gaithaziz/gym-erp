# Mobile Contract Checklist

## Purpose

This checklist locks the backend assumptions the mobile app depends on during Phase 1.

Each area is marked as:

- `verified`: already exercised in mobile code or shared contracts
- `partial`: covered in some places, but not standardized across all target flows
- `pending`: not yet validated for mobile delivery

## Auth and Session

| Contract area | Endpoint(s) | Expected behavior | Status |
| --- | --- | --- | --- |
| Login envelope | `/auth/login` | returns token pair in stable `data` envelope | verified |
| Refresh lifecycle | `/auth/refresh` | refresh succeeds with valid token and invalidates bad refresh tokens cleanly | verified |
| Current user payload | `/auth/me` | returns role, profile fields, subscription fields, profile image url | verified |
| Blocked customer signal | `/auth/me` | `is_subscription_blocked`, `subscription_status`, `block_reason` are sufficient for routing | verified |
| Password update | `/auth/me/password` | stable validation and error shape | verified |

## Envelope and Error Shape

| Contract area | Endpoint(s) | Expected behavior | Status |
| --- | --- | --- | --- |
| Standard response envelope | all JSON endpoints | `data`, optional `message`, success semantics consistent | verified |
| Validation errors | all mutating endpoints | payload shape is predictable enough for mobile field/form handling | partial |
| Permission denied behavior | restricted endpoints | distinct permission failure signal, not ambiguous 500/404 fallback | partial |
| Pagination header support | large list endpoints | `X-Total-Count` present or alternate count strategy standardized | verified |

## Upload and File Handling

| Contract area | Endpoint(s) | Expected behavior | Status |
| --- | --- | --- | --- |
| Profile picture upload | `POST /auth/me/profile-picture` | multipart upload accepted from mobile file picker | verified |
| QR share action | mobile QR screen share flow | live mobile QR screen can share a scanner-compatible kiosk payload through the share abstraction | verified |
| File open action | mobile profile screen open-photo flow | live mobile profile screen can open the current profile image through the file-open abstraction | verified |
| Support attachments | `POST /support/tickets/{id}/attachments` | image upload contract stable | partial |
| Chat attachments | `POST /chat/threads/{id}/attachments` | file/image/audio upload contract stable | pending |
| Lost & found media | `POST /lost-found/items/{id}/media` | multipart upload contract stable | pending |
| Export/download response shape | finance/hr export endpoints | download/open/share helper expectations are defined, but export response behavior is not yet exercised in product UI | partial |

## QR and Access

| Contract area | Endpoint(s) | Expected behavior | Status |
| --- | --- | --- | --- |
| Personal QR token | `GET /access/qr` | token and expiry returned in stable payload | verified |
| Client access validation | `POST /access/scan` | stable granted/denied response for kiosk scans | verified |
| Staff attendance QR | `POST /access/check-in`, `POST /access/check-out` | stable staff scan semantics and role guard behavior | verified |
| Access history | `GET /access/my-history` | list shape and pagination expectations defined | pending |

## Customer Data Domains

| Contract area | Endpoint(s) | Expected behavior | Status |
| --- | --- | --- | --- |
| Gamification overview | `GET /gamification/stats` | stable `total_visits`, `streak`, `badges` payload | verified |
| Biometrics list | `GET /fitness/biometrics` | ordered response and safe empty-state behavior | verified |
| Workout plans | `GET /fitness/plans` | customer-specific filtering and archived fallback behavior defined | partial |
| Diet plans | `GET /fitness/diets` | customer-specific filtering behavior defined | partial |
| Feedback submission | `/fitness/diet-feedback`, `/fitness/gym-feedback` | validation and success response standardized | pending |

## Staff and Admin Domains

| Contract area | Endpoint(s) | Expected behavior | Status |
| --- | --- | --- | --- |
| Attendance lists | `GET /hr/attendance` | filter, pagination, correction update shape stable | partial |
| Member lookup / registration | `/hr/members`, `/hr/subscriptions` | member list and create/update payloads stable | pending |
| Inventory lists | `/inventory/products` | pagination/count/filter behavior stable | pending |
| Finance report/export | `/finance/transactions*` | report filters, file export, and metadata stable | pending |
| Audit/security | `/audit/logs`, `/audit/security` | list size/count and response format stable | pending |
| Support desk queue | `/support/tickets*` | status workflow and attachment semantics stable | partial |
| Chat threads/messages | `/chat/threads*` | unread counts, attachment behavior, paging/order stable | pending |

## Shared Foundation Decisions Now Locked

- Mobile uses shared `AuthUser`, token, role, subscription, and response envelope contracts from `packages/contracts`.
- Mobile capability interfaces now cover secure storage, file picking, file sharing, and file opening; QR payload parsing is shared in mobile code while scanning itself uses the native screen implementation.
- Mobile upload/download helpers now exist as platform-neutral wrappers under `mobile/src/modules/uploads` and `mobile/src/modules/downloads`.

## Phase 1 Close-Out

Phase 1 is complete.

The contract/foundation exit criteria are satisfied for:

- auth and session bootstrap
- standard response envelope parsing
- pagination/count handling
- uploads capability flows
- share capability flow
- open capability flow
- QR and access foundation
- export/download helper conventions
- automated contract verification for login, refresh, `/auth/me`, pagination/count, upload/download, and QR response shapes exists in [tests/test_mobile_phase1_contracts.py](/c:/Users/ahmad/gym-erp/tests/test_mobile_phase1_contracts.py)
- mobile verification now runs `npm test` in [mobile/package.json](/c:/Users/ahmad/gym-erp/mobile/package.json), covering typecheck plus config and syntax smoke checks

Remaining `partial` and `pending` rows above are later-phase domain validations that should be closed while the corresponding product flows are implemented.
