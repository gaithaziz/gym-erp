# Gym Membership ERP Roadmap

## Purpose

This document turns the product discussion into a phased implementation roadmap for the gym ERP system.

### Platform Legend

- `web` means web only
- `mobile` means mobile only
- `web + mobile` means both platforms

The goal is to build a flexible membership platform that supports:

- bundle templates and custom per-customer deals
- perk tracking with monthly and contract-based expiry
- mandatory contract signing before payment completion
- admin policy pages and digital agreements
- announcements with push notifications
- machine accessories notes and maintenance summaries
- employee monthly debt tracking
- admin-editable gym hours and uptime sections
- private coaching subscriptions with shared class counters
- subscriber counters and filtering across all members and within each bundle

## Status Checklist

### Done

- subscriber dashboard with global counters `web`
- bundle filters and saved filter state `web`
- contract and policy pages with typed consent flow `web`
- perk tracking and usage ledger `web + mobile`
- private coaching packages and counters `web + mobile`
- announcements feed, admin composer, and branch targeting `web + mobile`
- mobile customer home quick actions and preview cards `mobile`
- fully polished contract signing screens `mobile`
- perk usage and remaining balance screens `mobile`
- machine notes and gym uptime sections `web`
- employee monthly debt tracking `web`
- reporting, exports, and dashboard summaries `web`
- admin adjustment change logs for locked custom bundles `web`
- deeper reporting polish and audit detail `web`
- more bundle and subscriber analytics `web`
- customer-first quick access views for subscription status and policy `mobile`
- private coaching quick actions and session check-ins `mobile`
- announcement push delivery and mobile notification handling `mobile`

## Product Principles

1. Keep bundle definitions flexible.
2. Store actual customer subscription terms separately from the template.
3. Track every benefit as a ledgered usage item, not a hardcoded field.
4. Treat contract signing as a required step in the subscription flow.
5. Make admin controls versioned and auditable.
6. Build dashboards around counters, filters, and visibility, not only raw lists.

## Core Modules

### 1. Memberships

- bundle templates `web`
- custom customer bundles `web`
- subscription lifecycle `web`
- perk allocation and usage `web + mobile`
- class counters for private coaching subscriptions `web + mobile`
- subscriber counts and filters `web`
- saved filters and report shortcuts `web`

### 2. Contracts and Policies

- gym policy page `web + mobile`
- contract templates `web`
- typed consent `web + mobile`
- version history `web`
- signing required before payment completion `web + mobile`

### 3. Operations

- machine accessories summary `web`
- machine notes per item `web`
- gym hours / uptime sections `web`
- admin-editable facility information `web`

### 4. Communication

- announcements page with branch targeting `web + mobile`
- push notifications `mobile`

### 5. Staff Finance

- monthly employee debt `web`
- deductions and advances `web`
- payment history and balances `web`

## Data Concepts

### Subscription Template

Used as the default base for bundles created by the admin.

Suggested fields:

- template name
- duration
- base price
- included perks
- default class count
- default coach assignment rules
- notes

### Customer Subscription

The actual agreement for one subscriber. This may follow a template or be customized.

Suggested fields:

- customer ID
- template ID, if based on one
- final agreed price
- start and end dates
- contract status
- payment status
- assigned coach
- custom overrides
- active status

### Perk Record

Each perk should be tracked as a typed benefit entry.

Suggested fields:

- perk type
- source subscription
- period type: monthly or contract
- total allowance
- used amount
- remaining amount
- reset date, if monthly
- usage history

Examples:

- guest visits
- InBody tests
- private training sessions
- any future admin-defined perk

### Contract Record

The contract should be stored independently from the payment record.

Suggested fields:

- contract version
- contract text snapshot
- customer ID
- subscription ID
- signed timestamp
- signature data
- acceptance channel: web or mobile
- status

### Announcement Record

Announcements are informational only, but they should still be structured.

Suggested fields:

- title
- body
- audience
- publish date
- active status
- push notification flag

### Machine Record

Each machine can carry admin-maintained notes.

Suggested fields:

- machine name
- accessories summary
- condition notes
- maintenance notes
- last updated by
- last updated at

### Employee Debt Record

Tracks monthly staff balances and any adjustments.

Suggested fields:

- employee ID
- month
- opening balance
- additions
- deductions
- payments made
- closing balance
- notes

## Phased Implementation Plan

### Phase 1: Membership Foundation

Goal: establish the subscription model and admin visibility.

Scope:

- create bundle templates `web`
- allow custom customer bundles `web`
- store actual subscription terms separately from template defaults `web`
- build all-subscriber counter `web`
- build subscriber filters `web`
- build bundle-specific filters `web`
- show bundle-level subscriber counts `web`

Deliverables:

- subscriber dashboard with global counters
- bundle detail pages
- searchable and filterable member list
- subscription status labels

### Phase 2: Contracting and Policy

Goal: make signup legally and operationally complete before payment.

Scope:

- gym policy page/tab on web and mobile `web + mobile`
- digital contract templates `web`
- mandatory contract signing before payment completion `web + mobile`
- store contract version and acceptance history `web`
- require agreement during subscription onboarding `web + mobile`

Deliverables:

- policy content editor for admin
- contract signing flow in app/web
- contract status tracking
- audit trail for acceptance

### Phase 3: Perks and Usage Tracking

Goal: support flexible benefits for subscriptions.

Scope:

- monthly perks `web + mobile`
- contract-based perks `web + mobile`
- custom perk allocation per customer `web`
- guest visit tracking `web + mobile`
- InBody test tracking `web + mobile`
- any admin-defined perk type `web`
- usage history and remaining balance `web + mobile`

Deliverables:

- perk ledger
- remaining usage counters
- perk usage screens for admin and customer
- expiration and reset logic

### Phase 4: Private Coaching Packages

Goal: support coach-linked subscriptions with shared visibility.

Scope:

- private subscriptions tied to specific coaches `web + mobile`
- class/session counter for customer, coach, and admin `web + mobile`
- remaining session visibility across roles `web + mobile`
- manual adjustments by admin `web`

Deliverables:

- coach dashboard showing assigned clients
- session counter views
- attendance/session consumption log

### Phase 5: Announcements and Notifications

Goal: give the gym a simple communication channel.

Scope:

- announcements page `web + mobile`
- informational-only posts `web`
- push notifications on publish `mobile`
- audience targeting `web`

Deliverables:

- admin announcement composer
- announcement feed in app/web
- notification delivery integration

### Phase 6: Operations and Facility Notes

Goal: centralize facility metadata and maintenance notes.

Scope:

- machine accessories summary `web`
- machine-specific notes `web`
- gym uptime / opening hour sections editable by admin `web`
- facility content management `web`

Deliverables:

- admin operations page
- machine detail pages
- gym info editor

### Phase 7: Staff Finance

Goal: track employee debt clearly and consistently.

Scope:

- monthly employee debt balances `web`
- deductions and advances `web`
- repayment or settlement logs `web`
- balance history `web`

Deliverables:

- employee finance summary page
- monthly balance tracker
- admin adjustment tools

### Phase 8: Reporting and Refinement

Goal: make the system easier to run every day.

Scope:

- dashboard summaries
- bundle-level analytics
- perk consumption reports
- expiring subscription filters
- overdue payment or debt reports
- admin notes and audit improvements

Deliverables:

- management dashboard
- exportable reports
- saved filter presets, if needed

## Suggested UI Structure

### Admin

- dashboard `web`
- subscribers `web`
- bundles `web`
- contracts and policies `web`
- announcements `web`
- machines and facility notes `web`
- employees and debt `web`
- analytics `web`

### Customer

- subscription status `web + mobile`
- contract signing `web + mobile`
- perks remaining `web + mobile`
- private coaching sessions `web + mobile`
- announcements `web + mobile`
- policy page `web + mobile`

### Coach

- assigned customers `web + mobile`
- private session counts `web + mobile`
- customer subscription status `web + mobile`
- announcements `web + mobile`

## Platform Split

### Web Only

Best for admin-heavy workflows where speed, data density, and editing matter most.

- subscriber management dashboard `web`
- bundle creation and editing `web`
- custom bundles locked after activation, with admin adjustments logged `web`
- contract template editing `web`
- policy management `web`
- machine accessories and notes `web`
- employee monthly debt management `web`
- reporting and analytics `web`
- saved filters and exports `web`

### Web and Mobile

Features that should be available in both form factors because customers and coaches may need them on the go.

- contract signing with typed consent `web + mobile`
- subscription status `web + mobile`
- perks remaining `web + mobile`
- private coaching session counters `web + mobile`
- announcements feed `web + mobile`
- gym policy viewing `web + mobile`
- customer-facing subscription details `web + mobile`

### Mobile First, Optional Web

Features that benefit from quick access on phones but can still exist on web later.

- push notifications `mobile`
- customer onboarding reminders `mobile`
- coach check-ins for private subscriptions `mobile`
- QR or quick-access customer utilities, if added later `mobile`

### Admin Web With Mobile Companion

Some admin features can be mobile-accessible, but the main control surface should remain web.

- announcement posting `web`
- quick subscriber lookup `web`
- simple contract approval review `web`
- limited operational notes viewing `web`

## Filter Requirements

### Global Subscriber Filters

- active `web`
- expired `web`
- pending contract `web`
- pending payment `web`
- bundle `web`
- coach `web`
- branch `web`
- start date `web`
- end date `web`
- expiring soon `web`
- debt status `web`

### Bundle Filters

- subscribers in bundle `web`
- remaining guest visits `web + mobile`
- remaining InBody tests `web + mobile`
- remaining classes `web + mobile`
- assigned coach `web`
- custom override exists `web`
- contract status `web`
- renewal window `web`

## Notes on Scope

- Announcements are informational only, so acknowledgment tracking is not required in the first version.
- Bundle templates and custom customer bundles should coexist.
- Perks should support both monthly and contract-based expiration.
- Contract signing should be mandatory before payment completion.
- Counters and filters should be designed as first-class admin tools, not added later as an afterthought.
- Saved filters are part of the first release.
- Contract signing uses typed consent for the initial release.
- Announcements can target a selected branch or all branches.
- Custom bundles are locked after activation, with admin adjustments recorded in a change log.

## Recommended MVP Order

1. Subscription templates and custom bundles
2. Subscriber counters and filters
3. Contract signing and policy pages
4. Perk tracking and usage ledger
5. Private coaching counters
6. Announcements and push notifications
7. Machine notes and gym uptime content
8. Employee monthly debt tracking
9. Reporting and analytics polish

## Mobile Priority Order

- [x] Contract signing flow `mobile`
- [x] Subscription status and policy views `mobile`
- [x] Perk balances and usage `mobile`
- [x] Private coaching counters and quick actions `mobile`
- [x] Announcement push handling `mobile`
- [x] Customer quick-access utilities `mobile`

## Finalized Decisions

- saved filters are part of the first release
- contract signing uses typed consent for the initial release
- announcements target a selected branch or all branches
- custom bundles are locked after activation, with admin adjustments recorded in a change log
