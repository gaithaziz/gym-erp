# React Native Mobile App Plan: Phased Roadmap

## Summary

Build one React Native app for all users with a single sign-in flow, single codebase, and capability-gated navigation. The app is a universal gym app with per-gym branding, supports iPhone and Android as first-release targets, remains iPad-friendly for staff/admin use, and uses native mobile capabilities heavily from day one.

Product direction:
- All roles are included in the overall roadmap: `CUSTOMER`, `COACH`, `RECEPTION`, `FRONT_DESK`, `CASHIER`, `EMPLOYEE`, `ADMIN`, `MANAGER`
- Customers get an expanded self-serve experience with nearly all user-facing value, including payments
- Staff/admin domains remain accessible where appropriate, but sensitive global operations stay restricted by capability
- The app is not a web clone; it is a mobile-first "super-app lite" with role-aware surfaces

## Phase 1: Foundation and Universal App Shell

Goal:
- Establish the technical base, role/capability model, universal navigation shell, and bootstrap contracts needed by every role

Scope:
- React Native + Expo + TypeScript
- Expo Router for navigation
- TanStack Query for server state
- SecureStore for tokens
- Zustand or a lightweight app store for session, gym theme, capability map, and app preferences
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

Public flow:
- Splash / bootstrap
- Login
- Optional gym selection or gym lookup only if backend requires it later
- Session restore / token refresh
- Forced update / maintenance screen support in architecture

Role and capability model:
- Keep backend roles as-is, but mobile should operate primarily on a capability model derived from role
- Required bootstrap shape:
  - `authenticated user`
  - `current role`
  - `subscription state`
  - `gym branding`
  - `capability list`
  - `enabled modules`
  - `notification preferences snapshot`
- Capability examples:
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

Required API/interface additions:
- Add a bootstrap endpoint, either `/mobile/bootstrap` or an expanded `/auth/me` companion response
- Bootstrap response must include:
  - `user`
  - `role`
  - `subscription`
  - `gym`
  - `capabilities`
  - `enabled_modules`
  - `notification_settings`
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

Phase acceptance:
- Login succeeds and session restores after app relaunch
- Token refresh works without forcing a logout
- Each role lands on the correct role-aware home screen
- Navigation only shows modules allowed by capabilities
- Gym branding changes app identity correctly after bootstrap

## Phase 2: Customer Self-Serve MVP

Goal:
- Deliver the core member experience so customers can handle nearly all day-to-day gym interactions inside the app

Customer policy:
- Customers get all personal/member flows
- Customers also get shared non-sensitive flows such as support, chat, lost & found, receipts, renewal/payment, profile, and notifications
- Customers do not get staff management, payroll, inventory control, global finance management, audit logs, or admin-only system controls

Payment policy:
- Gym memberships, renewals, and other gym services consumed in the physical gym are treated as external payment flows, not Apple In-App Purchase or Google Play Billing flows
- Renewal is a manual request-and-approval workflow: the customer submits a renewal request in the app, pays the gym offline in cash, and waits for gym staff to approve and activate the renewal
- The customer app must not imply instant in-app payment completion for renewal flows unless the business process changes later
- The app must not present digital-only entitlements in a way that would trigger Apple In-App Purchase or Google Play Billing requirements unless those flows are explicitly redesigned for store billing
- POS flows remain gym-side operational workflows handled by staff; customer mobile does not perform POS checkout

Customer tabs:
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
- Renewal request status
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

Required API/interface additions:
- Add payment/renewal mobile-safe endpoints:
  - list renewal offers / request options
  - create renewal request
  - read renewal request status
  - list receipts / receipt detail
- Stabilize chat/support unread counts for mobile badge use
- Add a notifications feed endpoint if one does not exist

Type additions:
- `MobileNotificationItem`
- `PaymentIntentSummary`
- `ReceiptSummary`

Phase acceptance:
- Customer can access nearly all self-serve flows without seeing restricted staff/admin controls
- Blocked customer is restricted only where business rules require it
- Customer can view QR, plans, diets, progress, history, support, chat, lost & found, subscription, receipts, and submit/track renewal requests

## Phase 3: Staff Operations MVP

Goal:
- Enable the primary daily workflows for coach, reception/front desk, cashier, and employee roles

Shared rules:
- Shared screen components should exist where the same domain appears across roles
- Each role gets a tailored home screen with the top 3-5 highest-frequency actions

Coach tabs:
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

Reception / Front Desk tabs:
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

Cashier tabs:
- Home
- POS
- Transactions
- More

Cashier screens:
- Sales summary
- POS-lite operations
- Product search / cart
- Transaction history
- Receipt detail/share
- QR if applicable
- Leaves
- Profile
- Notifications

Employee tabs:
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

Required API/interface additions:
- Add device registration endpoints for push:
  - register device token
  - unregister device token
  - update notification preferences
- Stabilize member lookup and check-in contracts for reception/front desk mobile use

Phase acceptance:
- Coach can view assigned members and manage plans/diets/feedback
- Reception/front desk can scan, search, and process member check-in flows
- Cashier can complete gym-side POS and receipt flows
- Employee can use personal operational flows allowed by capability

## Phase 4: Admin and Manager Mobile Control Center

Goal:
- Deliver a mobile-appropriate summary and drill-down experience for admin and manager roles without trying to replicate spreadsheet-heavy web workflows

Admin / Manager tabs:
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
- Complex table-heavy admin workflows remain summary + drill-down on mobile, not full spreadsheet parity in v1

Phase acceptance:
- Admin can view mobile summaries for people, finance, operations, support, and audit

## Phase 5: Native Features, Offline Support, and Release Hardening

Goal:
- Finish the mobile-native experience, improve reliability, and verify launch readiness across platforms and roles

Native capability plan:
- Secure token storage
- Camera QR scanning
- Push notifications
- Share/download for receipts and exported files where already supported
- Biometric unlock guard for reopening the app after idle, if straightforward
- Deep link routing for support/chat/payment/notification targets

Offline behavior:
- Read/cache only
- Cache recent dashboards, member profile, plans, receipts list, and notifications
- Block sensitive mutations when offline
- Show explicit retry/reconnect states
- No queued mutation sync in v1

Push scope:
- Full push rollout in plan
- Customer: payment due, subscription expiring, plan assigned, support reply, chat message
- Coach: member assignment, feedback request, chat message
- Reception/front desk: support queue events, check-in issues, important announcements
- Cashier: payment/receipt events if useful
- Admin: critical alerts, support escalation, finance/inventory flags

Release quality gates:
- Type-safe API contracts for bootstrap, auth, payments, notifications, and check-in
- Role/capability navigation snapshot tests
- Query/cache tests for offline-read behavior
- E2E smoke coverage for at least customer, coach, reception, cashier, and admin
- iOS simulator and Android emulator/device acceptance for first-release flows

Review readiness:
- App Review / Play review must be given working demo accounts for every major role included in release scope
- Review notes must include sample QR codes, sample member states, and any required walkthrough steps for gated flows
- Backend services used in review must be live and reachable during the submission/review window
- Submission notes must clearly explain payment handling, restricted capabilities, and any non-obvious role-aware behavior

Native/device acceptance:
- QR scan works with camera permissions granted
- Manual member lookup works when scanning fails
- Push registration succeeds and notifications route to the correct screen
- Receipt/share flow works on iOS and Android
- Cached screens render offline with correct stale-state messaging
- Offline mutation attempts fail safely and clearly

## Store Compliance

Privacy and account rules:
- Publish a clear privacy policy covering profile data, attendance, chat/support content, payment records, notifications, and fitness-related data
- Complete Apple privacy disclosures and Google Play Data safety declarations before launch
- If account creation is supported in the app, account deletion must also be supported in-app
- Permission prompts must be contextual, purpose-specific, and never force unnecessary consent to access core functionality where an alternative path is reasonable

User-generated content rules:
- Chat, support, feedback, and any other user-submitted content must include reporting flows, moderation/admin handling, and abuse-response tooling
- The app must support blocking, restriction, or equivalent anti-abuse controls where user-to-user interaction exists
- Contact/support information must be visible so review teams and users can identify the operator of the service

Health and fitness data rules:
- Workout plans, diet plans, progress metrics, attendance-derived fitness context, and related member fitness data must not be used for advertising, profiling, or data-mining purposes
- Health and fitness data sharing with third parties must be limited to explicitly disclosed product needs and user-authorized cases
- Product, analytics, and marketing implementation must treat health/fitness data as sensitive by default
- The app must avoid presenting medical diagnosis or treatment claims unless the feature is intentionally built to satisfy the higher-review regulatory standard

## Assumptions and Defaults

- Single account has one active backend role in v1
- iPhone and Android ship together; iPad is supported with adaptive layouts, not a separate tablet app
- The app is universal and gym-themed, not separate per-gym binaries in v1
- Customers receive expanded self-serve access, but not sensitive staff-management or global admin controls
- Heavy native usage is planned from the start, especially QR, push, secure storage, and file share/payment flows
- Offline support is read/cache only in v1
- Web remains the source of truth for highly complex admin workflows not well-suited to phone UX
