# React Native + Expo Full-Parity Mobile Plan

## Summary

Replace the Flutter mobile direction with a single **React Native + Expo** mobile program built around the existing **FastAPI backend** and the current **Next.js web app**.

Execution and handoff status for the currently implemented mobile foundation is tracked in:

- [MOBILE-STATUS-HANDOFF.md](/c:/Users/user/gym-erp/MOBILE-STATUS-HANDOFF.md)

This plan locks in these product decisions:

- Mobile stack: **React Native + TypeScript + Expo + expo-router + TanStack Query + NativeWind + Zod + expo-secure-store + EAS**
- Delivery model: **one mobile app**, role-aware, not separate apps per role
- Scope goal: **full feature parity across all roles**
- Device policy:
  - **Customer, staff, reception, cashier, employee:** full parity on phone
  - **Coach:** full parity on phone and tablet
  - **Admin:** full parity on tablet/iPad, **usable operational fallback** on phone
- UX rule: **feature parity is mandatory; UI parity is not**
- Web remains active for dense desktop workflows until tablet admin flows are proven in production

## Architecture Direction

### Mobile app structure

Create a new Expo app in-repo as the mobile client. Recommended root:

- `mobile/`

Recommended internal layout:

```text
mobile/
  app/
  src/
    core/
      api/
      auth/
      config/
      i18n/
      navigation/
      permissions/
      storage/
      theme/
      device/
      ui/
    features/
      access/
      admin/
      attendance/
      audit/
      auth/
      chat/
      coach/
      customer/
      finance/
      inventory/
      leaves/
      lost-found/
      members/
      notifications/
      payroll/
      pos/
      profile/
      progress/
      qr/
      subscription/
      support/
    modules/
      contracts/
      pagination/
      uploads/
      downloads/
      realtime/
```

### Shared-code policy

Use **shared contracts/utilities only**, not shared UI.

Create a small shared workspace package for cross-platform logic:

- `packages/contracts/`
- `packages/i18n/` if dictionaries are extracted cleanly
- Optional `packages/utils/` only for platform-neutral logic

What should be shared:

- API DTOs and response typings
- Zod schemas for request/response validation where useful
- auth/user role enums and guards
- locale dictionaries and translation key types
- formatting helpers that are platform-neutral
- pagination envelope parsing
- common error-code constants

What should remain separate:

- screens, components, layouts, navigation
- file upload/download implementations
- storage implementations
- browser-specific session logic
- any Next.js-only or React Native-only hooks

## Product and Device Matrix

### Customer

Phone and tablet:

- full parity
- polished native UX
- priority flows:
  - login
  - QR entry
  - subscription status
  - workout plans
  - diets
  - progress
  - feedback
  - history
  - achievements
  - support
  - chat
  - profile
  - lost & found

### Coach

Phone and tablet:

- full parity
- tablet may expose richer split-view and denser management screens
- must include:
  - dashboard
  - workout plan management
  - diet plan management
  - workout/diet library
  - assigned member workflows
  - feedback review
  - leaves
  - profile
  - chat
  - QR
  - lost & found

### Staff / Reception / Cashier / Employee

Phone and tablet:

- full parity for their allowed workflows
- must include:
  - login
  - dashboard
  - attendance clock-in/out where applicable
  - member lookup/registration where permitted
  - POS where permitted
  - QR workflows where permitted
  - leaves
  - profile
  - notifications where allowed

### Admin

Tablet/iPad:

- full parity required

Phone:

- all critical functions must remain available
- dense workflows may use simplified card-based or drill-down UX
- acceptance rule: phone admin is for operational and emergency use, not dense spreadsheet replacement

Tablet admin must cover:

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

## Core Technical Decisions

### Navigation

Use `expo-router` with route groups by auth state and role.

Suggested route groups:

- `(public)` for login and registration flows if needed
- `(authenticated)` for shared shell
- role-aware screen guards inside route groups
- device-aware presentation, not separate app binaries

### Data layer

Use **TanStack Query** for all server state.

Rules:

- no large server datasets in global state
- all heavy lists paginated
- query keys standardized by domain and filter state
- optimistic updates used only where rollback is cheap and safe
- chat unread counts and profile/session state may use lightweight app state, but canonical data remains query-backed

### API client

Reuse the current web client patterns conceptually, but implement a mobile-native client.

Needed client behaviors:

- base URL normalization
- bearer token injection
- refresh-token retry flow
- standardized handling for blocked subscription responses
- multipart uploads
- binary/file download abstraction
- typed parsing of `data` envelopes and headers such as `X-Total-Count`

### Auth/session

Use:

- `expo-secure-store` for tokens
- in-memory session cache for active runtime state
- query/bootstrap fetch for `/auth/me`

Session flow:

1. app boots
2. restore secure tokens
3. refresh or validate access token if needed
4. fetch `/auth/me`
5. resolve role and subscription state
6. route to correct dashboard/home entry

### Localization and RTL

Reuse existing English/Arabic translation content where possible.

Requirements:

- translation keys remain consistent across web and mobile
- Arabic must be first-class, not backfilled later
- direction must flip layout and iconography where needed
- numbers, dates, and currency must use locale-aware formatting
- all new mobile strings must be added to shared dictionaries before merge

### Styling

Use **NativeWind** with a shared design token layer.

Rules:

- preserve existing product identity where it exists
- define spacing, typography, colors, radius, elevation, and semantic status tokens
- tablet admin layouts may use responsive multi-column compositions
- phone screens prioritize quick scanning and thumb reach

### Device capability adapters

Abstract platform-sensitive features behind interfaces from the start:

- camera/QR scanning
- secure storage
- file upload selection
- file download/open/share
- notifications
- image picking/cropping if needed later

Do not couple UI screens directly to Expo modules.

## Backend and Contract Work Required

The backend remains the system of record. Before broad mobile implementation, lock contract behavior.

### Important changes or additions to public APIs/interfaces/types

These are the interface-level items the implementation must standardize:

- A shared `UserSession` / `AuthUser` type covering:
  - `id`
  - `email`
  - `full_name`
  - `role`
  - `profile_picture_url`
  - subscription fields already returned by `/auth/me`
- Shared role enum/constants matching backend role values exactly
- Shared subscription-blocking reason/type constants
- Shared paginated list response parser supporting:
  - response `data`
  - `X-Total-Count`
  - list metadata normalization
- Shared upload/download helper interfaces:
  - `UploadFileInput`
  - `DownloadableResource`
  - `OpenSharedFileResult`
- Shared i18n key type sourced from extracted dictionaries
- Shared backend error-code constants where mobile routing depends on them, especially:
  - auth failures
  - subscription blocked
  - permission denied
  - validation errors
- Device capability interfaces:
  - `SecureStorageDriver`
  - `QrScannerDriver`
  - `FilePickerDriver`
  - `FileShareDriver`

### Backend contract checks

Validate and, if needed, normalize:

- `/auth/login`
- `/auth/refresh`
- `/auth/me`
- profile update endpoints
- upload endpoints
- export/download endpoints
- QR validation endpoints
- attendance endpoints
- chat endpoints
- support endpoints
- heavy admin lists for pagination consistency

Contract issues to resolve before feature expansion:

- envelope consistency
- file download conventions
- auth refresh failure behavior
- error payload shape
- pagination headers
- role/permission error codes
- any web-only assumptions in endpoint behavior

## Delivery Phases

### Phase 0: Replace architectural direction

Artifacts:

- supersede [FLUTTER-FULL-PARITY-PLAN.md](/c:/Users/user/gym-erp/FLUTTER-FULL-PARITY-PLAN.md)
- add a new React Native mobile plan document, or rewrite the existing file to reflect the new stack
- mark `flutter_app/` as deprecated in planning docs unless it is intentionally retained for reference only
- document role/device matrix and parity rules explicitly

### Phase 1: Contract and shared foundation

Work:

- inventory current frontend routes and backend endpoints by domain and role
- create shared contracts package
- extract reusable i18n dictionaries/types
- define mobile API client, token lifecycle, error handling, and query conventions
- define capability interfaces for QR, storage, uploads, downloads
- produce a parity matrix by route, endpoint, role, device type, and complexity

Exit criteria:

- no unresolved contract ambiguity for auth, pagination, uploads, downloads, and QR
- implementer can build features without inventing response shapes

### Phase 2: Expo app foundation

Work:

- initialize Expo TypeScript app
- configure `expo-router`
- configure NativeWind
- configure TanStack Query
- add auth bootstrap flow
- add locale + RTL infrastructure
- add session guards and role-aware routing
- create shared shell components:
  - loading
  - empty
  - error
  - pull-to-refresh
  - pagination footer
  - confirmation UI
- add device-size breakpoints and tablet layout primitives

Exit criteria:

- login works end-to-end on device
- locale switching works
- RTL verified
- app restores session correctly
- blocked subscription routing works

### Phase 3: Phone-first member and staff flows

Work:

- customer dashboard and subscription
- QR generation and validation UX
- workout and diet views
- progress and feedback
- attendance clock-in/out
- support and chat
- profile management
- lost & found
- reception/cashier/staff operational screens as allowed

Exit criteria:

- customer and staff daily-use flows are production-viable on phone
- QR, secure storage, uploads, and chat basics validated on iPhone and Android

### Phase 4: Coach parity

Work:

- coach dashboard
- member assignment workflows
- workout plan creation/editing
- diet plan creation/editing
- library management
- feedback review
- leaves
- chat
- profile
- QR/lost & found

Tablet enhancement:

- richer plan editing and member-management layouts on iPad/tablet

Exit criteria:

- coach can fully operate from phone
- tablet gives optimized dense workflow support

### Phase 5: Admin tablet parity plus phone fallback

Work:

- admin dashboard
- finance
- payroll
- staff and attendance
- members
- POS
- inventory
- notifications
- support
- audit
- entrance QR
- chat
- profile
- lost & found

Phone fallback rules:

- every critical admin action must remain accessible
- dense tables become filtered record lists with detail screens
- exports may remain delegated to web when native file/report UX is materially inferior, but feature access itself must still exist

Exit criteria:

- tablet admin reaches full parity
- phone admin covers usable operational scenarios without blocking urgent work

### Phase 6: Production hardening

Work:

- offline-tolerant behavior where required for access control
- push notifications if included in scope later
- crash/error monitoring
- performance profiling
- build/signing/release automation via EAS
- App Store / Play Store readiness

## Testing and Acceptance

### Test cases and scenarios

#### Contract tests

- login returns expected token envelope
- refresh rotates or preserves tokens correctly
- `/auth/me` returns role/subscription fields mobile depends on
- paginated endpoints expose count and stable shapes
- upload and download endpoints behave consistently across domains
- QR verify responses are stable and low-latency

#### Shared package tests

- role guards map backend roles correctly
- subscription-block logic routes correctly
- locale key lookup and fallback work for `en` and `ar`
- pagination parser handles header/no-header/error variants
- error-code mapping is deterministic

#### Mobile integration tests

- cold boot with valid tokens
- cold boot with expired access token and valid refresh token
- cold boot with invalid refresh token
- blocked customer routing to subscription screen
- logout clears secure state
- locale switch persists
- RTL layout renders correctly on major screen types
- upload flow works for profile/media attachments where applicable
- download/share flow works for supported exports/files
- QR scan flow behaves correctly under rapid repeated scans

#### Role/device acceptance scenarios

- customer completes full journey on phone
- staff clocks in/out on phone
- receptionist handles member lookup and registration on phone
- coach edits and assigns plans on phone
- coach manages dense planning workflows on tablet
- admin reviews finance/payroll/inventory on tablet
- admin performs emergency operational actions on phone

#### Performance scenarios

- heavy member/inventory/ledger/chat lists remain responsive with pagination
- FlashList-backed screens avoid visible re-render stalls
- QR scan path remains lightweight and debounced
- image/media loading does not block main interaction paths

## Rollout and Operational Notes

- Use **Expo Go** for early native validation where possible
- Use **EAS Build** for distributable iOS builds without local macOS
- Keep web live as the desktop-optimized surface during rollout
- Do not remove existing web functionality during mobile build-out
- Prefer domain-by-domain rollout with explicit parity signoff per role/device

## Assumptions and Defaults

- The current FastAPI backend remains the only system of record
- Existing Next.js remains in place and continues serving desktop-heavy workflows
- The repo will accept a new `mobile/` app and small shared workspace packages
- Shared code will be limited to contracts, enums, i18n, and platform-neutral utilities
- Admin phone support is required for usability, not dense-layout optimization
- Admin tablet support must reach full parity
- Coach must have full parity on both phone and tablet
- No Flutter-web validation track will be pursued
- Flutter artifacts are considered superseded unless explicitly retained as archive/reference
