# Mobile App Store Policies & React Native Guide (2026)

A comprehensive overview of the current publishing requirements for the Google Play Store and Apple App Store, specifically tailored for React Native and Expo applications.

---

## 1. Google Play Store Production Policy

Google's primary focus for new developers is filtering out spam and low-effort apps through a mandatory closed testing phase.

### The "12 Testers for 14 Days" Rule
* **Target Audience:** Applies exclusively to personal Google Play Developer accounts created after November 13, 2023. Older accounts and Organization accounts are exempt.
* **Closed Testing Track:** You must deploy your app to the closed testing track in the Google Play Console.
* **Tester Quota:** You must recruit at least 12 distinct users to opt-in to the test. (Reduced from 20 testers in December 2024).
* **Time Requirement:** Testers must keep the app installed and actively engage with it for 14 continuous days.

### Production Access Application
Completing the 14 days does not automatically publish the app. You must submit a detailed questionnaire to Google explaining:
1.  How you recruited your testers.
2.  The specific feedback you received.
3.  The improvements, bug fixes, or changes you made based on that feedback.

### Pro-Tips for Play Store Approval
* **Recruit a Buffer:** Aim for 15-20 testers in case someone uninstalls early and breaks your 14-day streak.
* **Push Updates:** Release 2-3 minor updates during the testing window to prove active development.
* **Write Detailed Answers:** Provide thorough responses (250+ characters) in the final production application.

---

## 2. Apple App Store Policies

Apple does not require a specific number of testers. Their review process relies heavily on human reviewers and strict technical standards.

### Key Requirements (As of Early 2026)
* **The Xcode 26 Mandate:** Starting April 28, 2026, all new apps and updates must be built using Xcode 26 and target the iOS 26 SDK. This requires developing on a modern Mac running the latest macOS.
* **Age Verification:** Stricter "Adult Confirmation" processes for apps rated 17+ or 18+, alongside new APIs for declaring age ranges for minors.
* **AI Transparency:** Apps using Generative AI must explicitly disclose this in privacy labels and obtain user consent before sending data to third-party models.
* **EU Digital Markets Act (DMA):** Developers in the EU can use alternative marketplaces and payment systems, though they may be subject to a "Core Technology Fee" (typically €0.50 per first annual install over 1 million).

### Common Apple Rejection Reasons
* **Web Wrappers:** Apps that simply load a website URL inside a mobile screen (Guideline 4.2 - Minimum Functionality).
* **Missing Apple Login:** If you offer third-party logins (Google, Facebook), you must also offer *Sign in with Apple*.
* **Hidden Features / Broken Demos:** Providing incomplete demo accounts or hiding undisclosed features in the code.

---

## 3. Impact on React Native & Expo Applications

React Native and Expo are highly compatible with both stores, provided you follow proper build and deployment practices. 

### Apple App Store (iOS) Compatibility
* **Not a Web Wrapper:** React Native translates JavaScript (`<View>`, `<Text>`) into authentic native iOS UI components (`UIView`, `UILabel`). It is recognized as a native app, not a website.
* **Expo Go vs. Production:** You cannot publish the "Expo Go" sandbox environment. You must use Expo Application Services (EAS) to compile a standalone, production-ready `.ipa` binary file.
* **UI/UX Standards:** To pass human review, the app must feel native. It needs standard mobile navigation, offline state handling, and mobile-specific utility (e.g., push notifications, camera use) to avoid being flagged as a static webpage.

### Google Play Store (Android) Compatibility
* **Not a Web Wrapper:** Like Apple, Android recognizes React Native builds as genuine native applications.
* **Automated Scanning:** Google heavily utilizes AI and the "Firebase Test Lab" to scan your `.aab` (Android App Bundle). If your Expo build has memory leaks, broken dependencies, or crashes on launch, it will be automatically rejected.
* **Strict Permissions:** You must explicitly justify any permissions requested (e.g., camera or gallery access) in the Play Console. Unjustified requests will cause rejections.
* **API Target Compliance:** Expo simplifies compliance by automatically targeting the correct Android SDK levels (e.g., Android 14/15) when you run your `eas build` commands.