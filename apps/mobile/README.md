# Gym ERP Mobile

Expo Router mobile app scaffold for the Gym ERP customer experience.

## Run

From the repo root:

```bash
npm install
npm run dev:mobile
```

Or from this folder:

```bash
npm install
npm run start
```

The default API URL is platform-aware:

- iOS Simulator and web: `http://localhost:8000/api/v1`
- Android Emulator: `http://10.0.2.2:8000/api/v1`

If you are testing on a physical device, use your computer's LAN IP:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:8000/api/v1 npm run dev:mobile
```

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
