# Flutter Full-Parity Plan

## Objective

Build a full Flutter application for the existing Gym ERP with no discarded features, using the current FastAPI backend as the system of record.

The target is feature parity with the current web application across all roles, while preserving:

- English and Arabic localization
- RTL behavior
- Existing role permissions
- Current backend workflows and business rules
- Current file upload, pagination, export, and PDF flows

## Source Scope Reviewed

This plan is based on the current repository scope reflected in:

- `COMPLETED-WORK-SUMMARY.md`
- `CONVO-CHANGELOG-2026-02-25.md`
- `frontend/docs/admin-i18n-rtl-matrix.md`
- frontend routes under `frontend/src/app`
- backend routers under `app/routers`

## Product Scope To Preserve

The Flutter app must cover all current role surfaces.

### Admin

- dashboard
- audit
- finance
- payroll
- staff
- attendance
- leaves
- members
- POS
- inventory
- notifications / WhatsApp automation
- support desk
- entrance QR
- chat
- profile
- lost & found

### Coach

- dashboard
- workout plans
- diet plans
- workout and diet library
- feedback
- member assignment workflows
- chat
- profile
- leaves
- QR
- lost & found

### Customer

- dashboard
- progress
- workout plans
- diets
- feedback
- history
- achievements
- subscription
- support
- chat
- profile
- QR
- lost & found

### Reception / Front Desk / Employee / Cashier

- role-appropriate dashboard access
- member registration and lookup
- POS
- notifications where allowed
- QR-related workflows
- leaves
- profile

### Cross-Cutting Capabilities

- authentication and token refresh
- role-based navigation and access control
- bilingual UI: English and Arabic
- RTL support
- chat unread indicators and read sync
- file uploads and attachments
- paginated heavy lists
- PDF and file downloads
- QR generation and QR scanning
- loading / empty / error states
- tablet-friendly admin screens
- phone-friendly customer flows

## Recommended Flutter Architecture

Build one Flutter app with role-aware routing, not separate apps.

### Suggested stack

- `go_router` for navigation
- `flutter_riverpod` for state management
- `dio` for HTTP client and interceptors
- `freezed` and `json_serializable` for models
- `intl` for localization and formatting
- `flutter_secure_storage` for tokens
- `mobile_scanner` for QR scanning
- `file_picker` for attachments
- `open_filex` or platform-native open/share flow for downloads
- optional `web_socket_channel` later if chat becomes real-time

### Suggested structure

```text
lib/
  core/
    api/
    auth/
    config/
    errors/
    i18n/
    routing/
    theme/
    utils/
    widgets/
  features/
    access_qr/
    audit/
    auth/
    chat/
    dashboard/
    finance/
    fitness/
    hr/
    inventory_pos/
    lost_found/
    notifications/
    profile/
    support/
```

### Contract strategy

- Prefer generating DTOs and API bindings from the FastAPI OpenAPI schema.
- If the API contract is inconsistent, fix the contract first instead of hand-maintaining a large set of custom Flutter models.

## Delivery Principles

- No feature cuts.
- No postponing i18n or RTL until later.
- No replacement of backend logic in the client.
- Keep the current web app alive until Flutter reaches verified parity.
- Migrate by domain and role, not by random screen order.

## Implementation Plan

## Phase 0: Contract and Parity Baseline

### Goals

- freeze the actual app scope
- define the backend contract Flutter will consume
- document parity targets route by route

### Work

- Export and review the API surface from `app/routers`.
- Normalize shared response envelope handling.
- Confirm auth refresh flow, error codes, upload conventions, and download conventions.
- Capture current route inventory from `frontend/src/app`.
- Build a parity matrix by screen, role, states, API dependencies, and blockers.
- Mark special cases:
  - PDF export flows
  - pagination via `X-Total-Count`
  - attachment uploads
  - QR scan modes
  - admin read-only chat behavior

### Deliverables

- API contract document
- screen parity matrix
- Flutter module map

## Phase 1: Flutter Foundation

### Goals

- create a production-ready Flutter shell
- solve the hard cross-cutting concerns first

### Work

- initialize Flutter app structure
- configure environments
- add shared theme tokens
- add localization system for English and Arabic
- add direction-aware layout support for RTL
- implement secure token storage
- implement login and refresh-token flow
- implement app shell and role-aware routing
- add shared loading / empty / error components
- add shared paginated list infrastructure
- add shared upload/download helpers

### Deliverables

- bootable Flutter app
- auth flow working against backend
- locale switch and RTL verified
- role-aware guarded routing

## Phase 2: Core Shared Infrastructure

### Goals

- avoid repeating basic behavior in every feature

### Work

- build API client with interceptors matching current web behavior
- build session and user-role state
- build reusable filter, search, date range, and table/list patterns
- build confirmation and feedback dialogs
- build file/image/video preview helpers
- build download and PDF open/share flow
- build unread badge state and common badge widgets
- build chart and summary card primitives for dashboards

### Deliverables

- reusable cross-feature foundation
- consistent network and state patterns

## Phase 3: Auth, Shell, Dashboard, Profile, Subscription

### Goals

- make the app usable end to end for sign-in and basic role entry

### Work

- login
- logout
- role-based landing flow
- admin dashboard
- coach dashboard
- customer dashboard
- profile page
- customer subscription-block flow
- self QR page
- personal leaves page

### Deliverables

- complete shell experience for all supported roles
- dashboard parity baseline

## Phase 4: Admin and Staff Operations

### Goals

- cover the largest operational workflows first

### Work

- member management
- member profile / details
- member registration and editing
- staff management
- staff details and summaries
- attendance management
- leave management
- finance summary and transactions
- payroll settings, pending payrolls, payments, status updates
- receipt and payslip downloads
- inventory management
- POS cart and checkout
- notifications / WhatsApp automation rules
- audit and security views

### Deliverables

- admin operational parity
- staff/admin finance parity

## Phase 5: Fitness Domain Parity

### Goals

- preserve the coaching and member fitness flows exactly

### Work

- exercise CRUD
- exercise video upload/use
- workout plan lifecycle:
  - create
  - edit
  - clone
  - publish
  - archive
  - fork draft
  - bulk assign
- workout adherence views
- exercise library CRUD
- quick-add and recent library usage
- diet plan lifecycle:
  - create
  - edit
  - clone
  - publish
  - archive
  - fork draft
  - bulk assign
- structured diet builder with meal groups and meals
- diet library CRUD
- library-to-plan conversion
- biometrics logging and charts
- workout logs
- session logs
- diet feedback
- gym feedback
- coach feedback review
- customer plans, diets, and progress screens

### Deliverables

- coach parity
- customer training and diet parity

## Phase 6: Communication and Service Modules

### Goals

- preserve all user communication workflows

### Work

- chat contacts, threads, messages, attachments
- unread state and read synchronization
- admin read-only chat behavior
- customer support ticket list, detail, reply, attachments
- admin support desk workflows
- lost & found list, detail, comments, media, assignment, status changes

### Deliverables

- communication parity
- service-desk parity

## Phase 7: Access, QR, and Remaining Operations

### Goals

- complete specialized operational tools

### Work

- entrance QR board
- QR scan modes for customer entry and staff attendance
- check-in and check-out flows
- member access history
- analytics screens where currently exposed
- achievements / gamification views
- history and operational summaries

### Deliverables

- full specialty workflow parity

## Phase 8: Hardening and Release Readiness

### Goals

- make the app stable enough to replace web usage gradually

### Work

- performance tuning for heavy paginated screens
- attachment and media edge-case handling
- retry and connectivity strategy
- tablet layout polish for admin-heavy modules
- mobile polish for customer flows
- crash/error reporting integration
- production build configs
- beta distribution setup

### Deliverables

- internal beta build
- release checklist

## Validation Strategy

Validation must be route-based and state-based, not just API-based.

### Required parity checks

- each current route has a Flutter equivalent
- each role sees only allowed actions
- English and Arabic both work
- RTL layout is visually correct
- loading, empty, error, and populated states are implemented
- uploads, downloads, and exports work on target devices
- pagination matches backend metadata
- workout and diet lifecycle restrictions match backend rules
- payroll lock behavior matches backend rules
- unread chat indicators match current semantics

### Testing layers

- unit tests for core logic
- widget tests for reusable UI
- golden tests for EN/LTR and AR/RTL on critical screens
- integration tests for:
  - auth
  - finance
  - payroll
  - workout plans
  - diet plans
  - support
  - chat
  - QR flows

## Recommended Build Order

1. foundation + API contract + app shell
2. customer parity
3. coach parity
4. admin and staff parity
5. hardening, exports, QR, and rollout

This order reduces delivery risk because customer and coach flows are narrower than admin operations, while still validating the shared infrastructure early.

## Key Risks

### Scope complexity

The current product is already broad. A full Flutter rewrite is a major application program, not a simple frontend swap.

### Contract drift

If backend response shapes are inconsistent, Flutter development will slow down unless the API contract is cleaned up first.

### RTL regressions

RTL must be built into the design system and layout components from the start or it will become expensive to retrofit later.

### Admin screen density

Some current web admin screens are naturally desktop-heavy. Flutter layouts will need tablet-first treatment instead of a naive phone-only port.

### Export and file handling

PDF, receipts, attachments, and downloads need explicit platform behavior on Android, iOS, desktop, and possibly web if Flutter web is included.

## Definition of Done

The Flutter effort is done only when:

- every current web feature has a Flutter equivalent
- no role loses access to an existing allowed workflow
- EN and AR are both complete
- RTL is verified visually
- critical integration flows pass end-to-end validation
- pilot users can operate in Flutter without relying on the web app for missing features

## Recommended Next Artifacts

After this document, the next useful planning files are:

1. a route-by-route parity matrix
2. a Flutter package and folder decision record
3. a milestone backlog with estimates by module
4. an API contract cleanup checklist
