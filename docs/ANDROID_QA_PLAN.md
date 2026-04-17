# Android QA Plan

Status: planned for Phase 5 release hardening

## Goal

Verify the Android build without requiring local Android SDK setup immediately. Use cloud builds and cloud/borrowed devices first, then add local emulator or physical-device QA when release risk justifies it.

## Current Constraint

- No Android SDK installed locally.
- No Android physical device currently available.
- Local Expo development can still cover TypeScript/runtime logic, but it cannot prove Android permissions, camera behavior, native build compatibility, or device-specific layout.

## Minimum Confidence Before Android Device QA

Run these from the repo root:

```bash
npm run typecheck:mobile
.venv/bin/pytest tests/test_phase3_4.py
npm run typecheck:web
npm run lint:web
```

Run Expo health checks from `apps/mobile`:

```bash
npx expo-doctor
```

Acceptance:

- Mobile typecheck passes.
- Focused backend tests pass.
- Expo doctor has no release-blocking dependency/config issues.
- Web typecheck passes.
- Web lint has no new errors.

## Cloud Android Build

Use EAS cloud builds so Android SDK is not required locally.

From `apps/mobile`:

```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

Preferred preview build:

- APK for manual install/testing.
- AAB only for store/internal track submission later.

If `eas.json` is missing, add a preview profile:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

## API Base URL Rule

Do not ship/test Android builds pointed at `127.0.0.1`.

On Android devices, `127.0.0.1` means the device itself, not the Mac or Docker host.

Use one of:

- Public staging backend.
- Temporary tunnel to local backend, such as ngrok or cloudflared.
- Same Wi-Fi physical-device URL using the Mac LAN IP.

Example build command:

```bash
EXPO_PUBLIC_API_BASE_URL=https://YOUR_PUBLIC_BACKEND/api/v1 npx eas-cli build --platform android --profile preview
```

For a future physical device on the same Wi-Fi:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:8000/api/v1 npm run android:mobile
```

## Cloud Device Testing Options

Use one of these when there is no local Android device:

- BrowserStack App Live for manual smoke testing.
- Firebase Test Lab for automated launch/smoke checks.
- Sauce Labs Real Device Cloud.
- AWS Device Farm.

Recommended first pass:

- Build APK with EAS.
- Upload APK to BrowserStack App Live.
- Manually run the smoke checklist below on at least one mid-range Android phone profile.

## Android Smoke Checklist

Use seeded demo accounts:

```text
admin.demo@gym-erp.com / DemoPass123!
alice@client.com / GymPass123!
```

Check:

- App installs.
- App launches without native crash.
- Login works for admin and customer.
- Session restore works after app close/reopen.
- Admin tabs render: Home, People, Operations, Finance, More.
- Phase 4 admin summaries load real data.
- Manager account, when available, does not see audit summary.
- Customer tabs render: Home, Scan, Plans, Progress, More.
- QR/camera permission prompt appears and does not crash.
- Denied camera permission renders a recoverable state.
- More/Profile/Notifications open without red error cards.
- RTL/language toggle does not break text layout.
- Theme toggle does not hide text or controls.
- Sign out returns to login.

## Later Local Android Setup

When Android work becomes regular, set up one of:

- Android Studio emulator.
- Cheap physical Android test phone.

Recommended physical-device target:

- Low-to-mid Android phone.
- Android version close to the minimum supported release.
- Real camera available for QR scan testing.

Why physical device matters:

- Camera permission behavior.
- QR scanner reliability.
- Keyboard and input behavior.
- App resume/session restore.
- Performance on lower-end hardware.
- Safe-area and navigation bar differences.

## Phase 5 Acceptance

- [ ] `npm run typecheck:mobile` passes.
- [ ] `npx expo-doctor` has no release blockers.
- [ ] EAS Android preview APK builds successfully.
- [ ] APK launches on at least one cloud Android device.
- [ ] Admin/customer smoke checklist passes.
- [ ] Android API base URL points to reachable backend, not `127.0.0.1`.
- [ ] Any Android-only issues found are tracked before release.
