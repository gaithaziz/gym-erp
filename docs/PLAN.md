# React Native Mobile App Plan: Universal Multi-Role App

## Summary

Build one React Native app for all users with a single sign-in flow, single codebase, and capability-gated navigation. The app is a universal gym app with per-gym branding, supports iPhone and Android as first-release targets, remains iPad-friendly for staff/admin use, and uses native mobile capabilities heavily from day one.

Product direction:
- All roles are included in v1: `CUSTOMER`, `COACH`, `RECEPTION`, `FRONT_DESK`, `CASHIER`, `EMPLOYEE`, `ADMIN`, `MANAGER`
- Customers get an expanded self-serve experience with nearly all user-facing value, including payments
- Staff/admin domains remain accessible where appropriate, but sensitive global operations stay restricted by capability
- The app is not a web clone; it is a mobile-first “super-app lite” with role-aware surfaces

## Key Implementation Changes

### 1. App architecture and platform stack

Use:
- React Native + Expo + TypeScript
- Expo Router for navigation
- TanStack Query for server state
- SecureStore for tokens
- Expo Notifications for push
- Expo Camera / barcode scanning for QR flows
- Zustand or lightweight app store for session, gym theme, capability map, and app preferences

App shell:
- One universal shell after login
- Navigation built from capability flags, not hardcoded role-only trees
- Bottom tabs for frequent user actions
- Nested stacks for detail and workflow screens
- iPhone-first layout, with tablet-adaptive side panels/cards for iPad staff/admin views
- No multi-role switching in v1; one backend role per account

Branding:
- Single binary
- Per-gym theme loaded at bootstrap
- Theme includes name, logo, colors, support contact, and optional feature flags
- White-label-ready architecture, but no separate branded binaries in v1

### 2. Role and capability model

Keep backend roles as-is, but mobile should operate primarily on a capability model derived from role.

Required bootstrap shape:
- authenticated user
- current role
- subscription state
- gym branding
- capability list
- enabled modules
- notification preferences snapshot

Capability examples:
- `view_personal_qr`
- `scan_member_qr`
- `lookup_members`
- `manage_member_plans`
- `manage_member_diets`
- `view_finance_summary`
- `use_pos`
- `manage_inventory`
- `handle_support_queue`
- `view_audit_summary`
- `renew_subscription`
- `pay_invoice`
- `view_receipts`

Customer policy:
- Customers get all personal/member flows
- Customers also get shared non-sensitive flows such as support, chat, lost & found, receipts, renewal/payment, profile, notifications
- Customers do not get staff management, payroll, inventory control, global finance management, audit logs, or admin-only system controls

### 3. Navigation and screen map

#### Public flow
- Splash / bootstrap
- Login
- Optional gym selection or gym lookup only if backend requires it later
- Session restore / token refresh
- Forced update / maintenance screen support in architecture

#### Customer tabs
- Home
- QR
- Plans
- Progress
- More

Customer screens:
- Home dashboard
- Personal QR and entrance status
- Subscription status
- Renew subscription
- In-app payment checkout
- Payment history and receipts
- Workout plans
- Diet plans
- Feedback history
- Progress metrics
- Attendance/history
- Support tickets
- Chat
- Lost & found
- Profile and settings
- Notifications inbox

#### Coach tabs
- Home
- Members
- Plans
- Chat
- More

Coach screens:
- Today overview
- Assigned members
- Member detail
- Assign/edit workout plan
- Assign/edit diet plan
- Feedback review
- Chat
- QR
- Leaves
- Profile
- Notifications

#### Reception / Front Desk tabs
- Home
- Check-in
- Members
- Support
- More

Reception screens:
- Front-desk overview
- Camera QR scan
- Manual member lookup
- Check-in result / eligibility state
- Quick member registration
- Membership/subscription lookup
- Notifications / announcements
- Support queue
- Lost & found
- Leaves
- Profile

#### Cashier tabs
- Home
- POS
- Transactions
- More

Cashier screens:
- Sales summary
- POS-lite checkout
- Product search / cart
- Transaction history
- Receipt detail/share
- QR if applicable
- Leaves
- Profile
- Notifications

#### Employee tabs
- Home
- QR
- Tasks or quick actions
- More

Employee screens:
- Personal dashboard
- QR
- Leaves
- Lost & found if permitted
- Profile
- Notifications

#### Admin / Manager tabs
- Home
- People
- Operations
- Finance
- More

Admin screens:
- Executive dashboard
- Alerts and approvals
- Member summary/search
- Staff summary
- Attendance snapshot
- Finance snapshot
- Inventory snapshot
- Support queue
- Notifications/automation snapshot
- Audit summary
- Profile
- Chat if permitted

Rules:
- Shared screen components should exist where the same domain appears across roles
- Each role gets a tailored home screen with the top 3-5 highest-frequency actions
- Complex table-heavy admin workflows remain summary + drill-down on mobile, not full spreadsheet parity in v1

### 4. Native capability plan

Include in v1:
- secure token storage
- camera QR scanning
- push notifications
- share/download for receipts and exported files where already supported
- biometric unlock guard for reopening the app after idle, if straightforward
- deep link routing for support/chat/payment/notification targets

Offline behavior:
- read/cache only
- cache recent dashboards, member profile, plans, receipts list, and notifications
- block sensitive mutations when offline
- show explicit retry/reconnect states
- no queued mutation sync in v1

Push scope:
- full push rollout in plan
- customer: payment due, subscription expiring, plan assigned, support reply, chat message
- coach: member assignment, feedback request, chat message
- reception/front desk: support queue events, check-in issues, important announcements
- cashier: payment/receipt events if useful
- admin: critical alerts, support escalation, finance/inventory flags

### 5. Backend/API/interface additions

Do not redesign the whole backend; add mobile-focused contracts and normalize existing ones.

Required public API/interface changes:
- Add a bootstrap endpoint, either `/mobile/bootstrap` or an expanded `/auth/me` companion response
- Bootstrap response must include:
  - `user`
  - `role`
  - `subscription`
  - `gym`
  - `capabilities`
  - `enabled_modules`
  - `notification_settings`
- Add device registration endpoints for push:
  - register device token
  - unregister device token
  - update notification preferences
- Add payment/renewal mobile-safe endpoints:
  - list payable items / renewal offers
  - create payment intent / checkout session
  - confirm payment result
  - list receipts / receipt detail
- Stabilize member lookup and check-in contracts for reception/front desk mobile use
- Stabilize chat/support unread counts for mobile badge use
- Add a notifications feed endpoint if one does not exist
- Add gym branding payload:
  - `gym_name`
  - `logo_url`
  - `primary_color`
  - `secondary_color`
  - optional contact/support metadata

Type additions:
- `MobileBootstrap`
- `Capability`
- `GymBranding`
- `NotificationPreference`
- `MobileNotificationItem`
- `PaymentIntentSummary`
- `ReceiptSummary`

## Test Plan

### Core acceptance scenarios
- Login succeeds and session restores after app relaunch
- Token refresh works without forcing a logout
- Each role lands on the correct role-aware home screen
- Navigation only shows modules allowed by capabilities
- Customer can access nearly all self-serve flows without seeing restricted staff/admin controls
- Blocked customer is restricted only where business rules require it
- Gym branding changes app identity correctly after bootstrap

### Native/device scenarios
- QR scan works with camera permissions granted
- Manual member lookup works when scanning fails
- Push registration succeeds and notifications route to the correct screen
- Receipt/share flow works on iOS and Android
- Cached screens render offline with correct stale-state messaging
- Offline mutation attempts fail safely and clearly

### Domain scenarios
- Customer can view QR, plans, diets, progress, history, support, chat, lost & found, subscription, receipts, and complete payment flow
- Coach can view assigned members and manage plans/diets/feedback
- Reception/front desk can scan, search, and process member check-in flows
- Cashier can complete POS-lite and receipt flows
- Admin can view mobile summaries for people, finance, operations, support, and audit

### Quality gates
- Type-safe API contracts for bootstrap, auth, payments, notifications, and check-in
- Role/capability navigation snapshot tests
- Query/cache tests for offline-read behavior
- E2E smoke coverage for at least customer, coach, reception, cashier, and admin
- iOS simulator and Android emulator/device acceptance for first-release flows

## Assumptions and defaults

- Single account has one active backend role in v1
- iPhone and Android ship together; iPad is supported with adaptive layouts, not a separate tablet app
- The app is universal and gym-themed, not separate per-gym binaries in v1
- Customers receive expanded self-serve access, but not sensitive staff-management or global admin controls
- Heavy native usage is planned from the start, especially QR, push, secure storage, and file share/payment flows
- Offline support is read/cache only in v1
- Web remains the source of truth for highly complex admin workflows not well-suited to phone UX
