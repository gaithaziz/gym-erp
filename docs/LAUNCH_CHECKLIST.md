# Final Launch Checklist: Gym ERP Mobile

This checklist covers the manual verification and administrative steps required to move from the current **Release Candidate** to a live production launch.

## 📱 1. Physical Device Verification (Smoke Test)
Since the app has been verified in simulated environments, a final hardware check is required:
- [ ] **QR Scanner**: Open the "Scan" tab on a physical device and verify the camera focuses and parses kiosk/member codes correctly.
- [ ] **Push Notifications**: Tap "Send Test Notification" in the Profile tab on a real device to ensure the token is correctly registered and the Expo service can reach the hardware.

## 🌎 2. Production Environment Configuration
- [ ] **API URL**: Update `apps/mobile/.env` or your CI/CD secrets.
    - Change `EXPO_PUBLIC_API_BASE_URL` from `localhost` to your production domain (e.g., `https://api.gym-erp.com/api/v1`).
- [ ] **Push Credentials**: 
    - Log in to [Expo Dashboard](https://expo.dev).
    - Upload/Configure your **FCM Server Key** (Android) and **APNs Certificate** (iOS).
- [ ] **App Versioning**: Ensure `version` and `buildNumber` in `app.json` are incremented for the store submission.

## 📝 3. Store Compliance & Assets
- [ ] **Privacy Policy**: Host the [Privacy Policy Draft](../.gemini/antigravity/brain/e4f5028b-0e75-4182-81bd-38800640d822/privacy_policy.md) at a public URL (e.g., `gym-erp.com/privacy`).
- [ ] **Reviewer Accounts**: Provide the [Reviewer Credentials](../.gemini/antigravity/brain/e4f5028b-0e75-4182-81bd-38800640d822/submission_notes.md) to Apple and Google in the "App Review Information" section.
- [ ] **App Assets**: Run `npx expo-assets` or manually verify:
    - `icon.png` (1024x1024)
    - `adaptive-icon.png` (Android)
    - `splash.png` (Splash screen)
- [ ] **Screenshots**: Capture 3–5 high-quality screenshots for the store listing, showing the Home Dashboard, Scan flow, and Workout Tracker.

## 🚀 4. Submission
- [ ] **Build**: Run `eas build --platform all`.
- [ ] **Submit**: Run `eas submit` or manually upload the generated binary to App Store Connect / Google Play Console.
- [ ] **Review Notes**: Paste the content of `submission_notes.md` into the "Reviewer Notes" field.

---
**Technical implementation for Phase 5 is 100% complete.**
**Build Status**: `PASS`
**Type Check**: `0 Errors`
