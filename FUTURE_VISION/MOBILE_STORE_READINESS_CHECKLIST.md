# Mobile Store Readiness Checklist (iOS + Android)

Use this before submitting the mobile app to both Apple App Store and Google Play.

## 1) Build and Release Configuration

- [ ] `mobile/app.json` has production identifiers:
  - [ ] `ios.bundleIdentifier` (example: `com.yourcompany.gymerp`)
  - [ ] `android.package` (example: `com.yourcompany.gymerp`)
  - [ ] `ios.buildNumber` increments each iOS release
  - [ ] `android.versionCode` increments each Android release
- [ ] `mobile/eas.json` exists with `preview` and `production` build profiles.
- [ ] Release signing is configured:
  - [ ] iOS certificates/provisioning
  - [ ] Android keystore
- [ ] Production API URL/env values are set for release builds (not localhost).

## 2) Policy and Legal

- [ ] Public Privacy Policy URL is ready.
- [ ] Terms of Service URL is ready.
- [ ] Data deletion/account deletion process is documented and accessible.
- [ ] Support URL and support email are ready for store listings.

## 3) Account and Authentication Rules

- [ ] If any third-party auth is offered (Google/Facebook/etc), add Sign in with Apple on iOS.
- [ ] User can log out reliably.
- [ ] Account deletion request flow exists (in-app or clear linked flow).

## 4) Permissions and Privacy Declarations

- [ ] Request only needed device permissions.
- [ ] Every requested permission has a clear in-app reason.
- [ ] iOS usage descriptions are complete for any sensitive access (camera/photos/location/etc).
- [ ] Play Console Data Safety form matches actual data handling.
- [ ] App Store privacy nutrition labels match actual data handling.

## 5) Quality, UX, and Stability

- [ ] App is not a web wrapper; core flows are native-quality.
- [ ] No crashes on fresh install, login, and primary user journey.
- [ ] Handles offline/poor-network states gracefully.
- [ ] Loading/error/empty states are present on key screens.
- [ ] UI works on common screen sizes and orientations used by your audience.

## 6) Security Baseline

- [ ] Sensitive tokens are stored securely (SecureStore/Keychain/Keystore).
- [ ] No secrets embedded in client bundle.
- [ ] TLS is enforced for production API calls.
- [ ] Basic abuse controls exist server-side (rate limiting, auth hardening).

## 7) Store Listing Assets

- [ ] App name/subtitle/short description finalized.
- [ ] App icon and launch assets finalized.
- [ ] Screenshots for required device classes are prepared.
- [ ] Category, age rating, and content disclosures completed.
- [ ] Release notes written for first production version.

## 8) Testing Before Submission

- [ ] Internal QA pass complete (critical flows).
- [ ] Beta distribution complete:
  - [ ] TestFlight group tested
  - [ ] Play internal/closed testing tested
- [ ] Real-device testing done (not emulator-only).
- [ ] Crash/error monitoring configured (for example Sentry/Crashlytics).

## 9) Submission and Rollout

- [ ] iOS build uploaded and passes App Store Connect validation.
- [ ] Android build uploaded and passes Play Console checks.
- [ ] Staged rollout plan defined (especially on Play Store).
- [ ] Rollback plan prepared for bad release.

---

## Repo-Specific Immediate Gaps To Close

- [ ] Add missing iOS/Android identifiers and version codes in `mobile/app.json`.
- [ ] Create `mobile/eas.json` for repeatable release builds.
- [ ] Add privacy policy/terms links in store metadata.
- [ ] Implement or expose account deletion flow for mobile users.
