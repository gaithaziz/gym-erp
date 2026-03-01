# Mobile Status Handoff

## Purpose

This document records:

- what has already been implemented from [MobilePlan.md](/c:/Users/user/gym-erp/MobilePlan.md)
- what still needs to be done next
- how to run and test the current mobile app
- the recommended implementation order from this point forward

This is the operational handoff for the current React Native + Expo mobile track.

## Current State

The mobile direction has been switched from Flutter to React Native + Expo.

Implemented foundation work:

- root `npm` workspace added
- shared packages created:
  - [packages/contracts/](/c:/Users/user/gym-erp/packages/contracts)
  - [packages/i18n/](/c:/Users/user/gym-erp/packages/i18n)
- Expo mobile app created in [mobile/](/c:/Users/user/gym-erp/mobile)
- Flutter app artifacts removed from active implementation
- frontend moved to consume shared auth/i18n foundations where low-risk
- mobile auth/session bootstrap implemented
- mobile locale persistence and RTL support implemented
- role-aware authenticated shell implemented
- blocked subscription route implemented
- basic mobile tab shell implemented

This means the app is no longer just a plan. It is now a working foundation that can authenticate, route, persist session state, and serve as the base for real product screens.

## What Was Implemented

### Workspace and shared packages

Implemented:

- root workspace config in [package.json](/c:/Users/user/gym-erp/package.json)
- root lockfile in [package-lock.json](/c:/Users/user/gym-erp/package-lock.json)
- shared contracts in [packages/contracts/src/index.ts](/c:/Users/user/gym-erp/packages/contracts/src/index.ts)
- shared i18n in [packages/i18n/src/index.ts](/c:/Users/user/gym-erp/packages/i18n/src/index.ts)

Shared contracts currently cover:

- roles
- subscription status
- subscription block reasons
- auth user shape
- token pair shape
- standard API envelope parsing
- paginated list parsing
- capability interfaces

Shared i18n currently covers:

- `en` and `ar`
- translation keys
- locale/direction helpers
- formatting helpers

### Web alignment

Implemented:

- frontend uses shared i18n exports
- frontend auth user type moved to shared contracts
- Next config transpiles workspace packages

Relevant files:

- [frontend/next.config.ts](/c:/Users/user/gym-erp/frontend/next.config.ts)
- [frontend/src/context/AuthContext.tsx](/c:/Users/user/gym-erp/frontend/src/context/AuthContext.tsx)
- [frontend/src/lib/i18n/index.ts](/c:/Users/user/gym-erp/frontend/src/lib/i18n/index.ts)

### Mobile app foundation

Implemented:

- Expo app bootstrapped in [mobile/](/c:/Users/user/gym-erp/mobile)
- Expo Router routing
- TanStack Query provider
- auth/session provider
- API client with token injection and refresh handling
- secure storage on native, browser storage fallback on web
- locale provider and persistence
- RTL-aware foundation behavior

Relevant files:

- [mobile/app/_layout.tsx](/c:/Users/user/gym-erp/mobile/app/_layout.tsx)
- [mobile/src/core/api/client.ts](/c:/Users/user/gym-erp/mobile/src/core/api/client.ts)
- [mobile/src/core/auth/session-provider.tsx](/c:/Users/user/gym-erp/mobile/src/core/auth/session-provider.tsx)
- [mobile/src/core/i18n/locale-provider.tsx](/c:/Users/user/gym-erp/mobile/src/core/i18n/locale-provider.tsx)
- [mobile/src/core/storage/secure-storage.ts](/c:/Users/user/gym-erp/mobile/src/core/storage/secure-storage.ts)

### Mobile navigation and shell

Implemented:

- public login route
- authenticated route group
- tab shell for:
  - Home
  - QR
  - Profile
  - More
- subscription-blocked route for blocked customers

Relevant files:

- [mobile/app/(public)/login.tsx](/c:/Users/user/gym-erp/mobile/app/%28public%29/login.tsx)
- [mobile/app/(authenticated)/_layout.tsx](/c:/Users/user/gym-erp/mobile/app/%28authenticated%29/_layout.tsx)
- [mobile/app/(authenticated)/(tabs)/_layout.tsx](/c:/Users/user/gym-erp/mobile/app/%28authenticated%29/%28tabs%29/_layout.tsx)
- [mobile/app/(authenticated)/subscription.tsx](/c:/Users/user/gym-erp/mobile/app/%28authenticated%29/subscription.tsx)

### Mobile screens currently available

Implemented foundation screens:

- login screen
- home shell screen
- QR placeholder screen
- profile shell screen
- more screen
- blocked subscription screen

Relevant files:

- [mobile/src/features/auth/login-screen.tsx](/c:/Users/user/gym-erp/mobile/src/features/auth/login-screen.tsx)
- [mobile/src/features/shell/home-screen.tsx](/c:/Users/user/gym-erp/mobile/src/features/shell/home-screen.tsx)
- [mobile/src/features/shell/qr-screen.tsx](/c:/Users/user/gym-erp/mobile/src/features/shell/qr-screen.tsx)
- [mobile/src/features/shell/profile-screen.tsx](/c:/Users/user/gym-erp/mobile/src/features/shell/profile-screen.tsx)
- [mobile/src/features/shell/more-screen.tsx](/c:/Users/user/gym-erp/mobile/src/features/shell/more-screen.tsx)
- [mobile/src/features/subscription/subscription-blocked-screen.tsx](/c:/Users/user/gym-erp/mobile/src/features/subscription/subscription-blocked-screen.tsx)

### Flutter retirement

Implemented:

- `flutter_app/` removed from active implementation
- old Flutter planning docs retired or redirected

Relevant files:

- [FLUTTER-FULL-PARITY-PLAN.md](/c:/Users/user/gym-erp/FLUTTER-FULL-PARITY-PLAN.md)
- [PLAN.md](/c:/Users/user/gym-erp/PLAN.md)

## What Is Not Implemented Yet

The following are still pending from [MobilePlan.md](/c:/Users/user/gym-erp/MobilePlan.md).

### Phase 1 items still incomplete

Not fully complete yet:

- parity matrix artifacts for every route/domain/role/device in reusable implementation format
- contract verification across all target endpoints beyond the auth foundation
- upload/download abstractions wired to real user flows
- QR scanner native implementation
- file picker/share native implementations
- tablet-specific responsive admin layouts

### Phase 2 and later items not started in product terms

Not implemented yet:

- customer dashboard flows
- customer QR flow
- customer subscription management UI
- customer workout/diet/progress/history/achievements flows
- customer support/chat product screens
- coach workflows
- staff/reception/cashier operational workflows
- admin tablet parity workflows
- native uploads/downloads in real screens
- monitoring, release automation, store packaging

## Recommended Next Work

According to the sequence implied by [MobilePlan.md](/c:/Users/user/gym-erp/MobilePlan.md), the next execution should be:

### 1. Finish the reusable shell and navigation foundation

Next:

- add a proper shared header pattern
- add consistent loading, empty, and error wrappers per screen
- add role-aware tab visibility if needed by role
- add a reusable screen composition model for phone/tablet

Why:

- this prevents rework when real feature screens are added

### 2. Implement the first real feature slice

Recommended first slice:

- customer core

Implement next:

- real profile screen backed by `/auth/me` and `/auth/me`
- profile update flow
- profile picture upload flow
- real subscription screen
- real personal QR screen

Why this first:

- it exercises auth, session, profile, subscription gating, and mobile UI patterns without starting the most complex admin workflows

### 3. Then implement the first staff-operational slice

Recommended after customer core:

- attendance
- member lookup
- reception/cashier shell entry points

### 4. Then move to coach and admin parity

After the customer/staff patterns are proven:

- coach plan and diet flows
- admin tablet-first workflows

## Recommended Build Order From Here

Use this order:

1. Shared shell polish
2. Customer profile
3. Customer subscription
4. Customer QR
5. Customer support/chat entry
6. Staff attendance
7. Reception member lookup/registration
8. Coach dashboard and plan shells
9. Admin tablet shell and dense list patterns

## How To Run The Current Mobile App

## Backend

From repo root:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

This makes the backend reachable from the local network for Expo Go.

## Seed data

If the database is empty, seed it first.

Basic seed:

```powershell
.\.venv\Scripts\python.exe app\initial_data.py
```

Optional richer demo seed:

```powershell
.\.venv\Scripts\python.exe app\seed_demo_data.py
```

## Mobile app

From:

- [mobile/](/c:/Users/user/gym-erp/mobile)

Run:

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.1.228:8000"
npx expo start -c
```

Replace `192.168.1.228` with the current LAN IP of the development machine if it changes.

## iPhone with Expo Go

Requirements:

- iPhone and dev machine on the same Wi-Fi
- Expo Go installed
- backend running

Steps:

1. start backend
2. start Expo with `EXPO_PUBLIC_API_URL`
3. scan the Expo QR code in Expo Go
4. sign in with seeded credentials

## Web

From:

- [mobile/](/c:/Users/user/gym-erp/mobile)

Run:

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.1.228:8000"
npx expo start
```

Then open the Expo web target from the terminal.

## Test Credentials

If `app\initial_data.py` was seeded:

- `admin@gym-erp.com` / `GymPass123!`
- `coach.mike@gym-erp.com` / `GymPass123!`
- `alice@client.com` / `GymPass123!`
- `bob@client.com` / `GymPass123!`

If `app\seed_demo_data.py` was seeded:

- `admin.demo@gym-erp.com` / `DemoPass123!`
- `coach.demo@gym-erp.com` / `DemoPass123!`
- `member.anna.demo@gym-erp.com` / `DemoPass123!`
- `member.maya.demo@gym-erp.com` / `DemoPass123!`
- `member.noah.demo@gym-erp.com` / `DemoPass123!`

## How To Test The Current Foundation

These are the current acceptance checks for the implemented foundation.

### Login

Test:

- sign in with `admin@gym-erp.com` / `GymPass123!`

Expected:

- app opens the authenticated shell
- tabs are visible

### Session restore

Test:

- after signing in, reload the app in Expo Go or web

Expected:

- user remains authenticated

### Locale switch

Test:

- switch language on login or in `More`

Expected:

- text switches between English and Arabic
- layout direction updates accordingly

### Blocked customer routing

Test:

- sign in as a blocked/frozen/expired customer, for example:
  - `bob@client.com`
  - or `member.maya.demo@gym-erp.com`
  - or `member.noah.demo@gym-erp.com`

Expected:

- app routes to the subscription-blocked screen

### Logout

Test:

- logout from `Home` or `More`

Expected:

- session is cleared
- app returns to login

### Tab shell

Test:

- navigate through:
  - Home
  - QR
  - Profile
  - More

Expected:

- all screens load without crashing
- session remains active

## Commands Used For Validation

These should be rerun after major mobile changes:

```powershell
npm run typecheck --workspace mobile
npm run typecheck --workspace frontend
```

Optional web bundle verification for the mobile app:

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.1.228:8000"
npx expo export --platform web
```

## Known Limitations

Current limitations:

- mobile shell is foundation-only, not parity-complete
- no real product QR scanner yet
- no real profile editing yet
- no customer/staff/admin production workflows yet
- web support for Expo is mainly for development verification, not production deployment
- tablet-specific layouts are not implemented yet

## Definition Of Done For The Next Step

The next step should be considered complete only when:

- at least one real domain flow replaces a placeholder shell screen
- that flow uses live backend data
- loading, empty, and error states are handled
- both `en` and `ar` are verified
- session and blocked routing still behave correctly

## Suggested Next Ticket

Suggested next implementation ticket:

**Build customer profile + subscription + QR as the first real mobile feature slice on top of the existing shell.**

That ticket should include:

- profile read/update
- profile picture upload
- subscription details and blocked explanation
- personal QR rendering
- foundation-level testing on iPhone and web
