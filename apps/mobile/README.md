# Gym ERP Mobile

Expo Router mobile app scaffold for the Gym ERP customer experience.

## Run

From the repo root:

```bash
npm install
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1 npm run dev:mobile
```

Or from this folder:

```bash
npm install
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1 npm run start
```

If you are testing on a physical device, replace `127.0.0.1` with your computer's LAN IP.

## Current Scope

- customer login
- secure token storage
- bootstrap fetch
- customer Phase 2 tabs:
  - Home
  - QR
  - Plans
  - Progress
  - More
- customer detail screens:
  - billing
  - notifications
  - support
  - chat
  - lost & found
  - profile
  - feedback history

## Notes

- The mobile app consumes the shared `@gym-erp/contracts` package where possible.
- This is the first Expo app scaffold in the repo; staff/admin role-aware UI still belongs to later phases.
