# Gym ERP Master Architecture & Business Plan

## 1. The Core Architecture & Tech Stack
* **The Paradigm:** A Multi-Tenant SaaS. One massive database, one backend, one web dashboard, and one mobile codebase serving all gyms.
* **Backend:** Python 3.12, FastAPI, Uvicorn, SQLAlchemy, Alembic.
* **Frontend (Web):** Next.js 16, React 19, Tailwind CSS 4.
* **Mobile App:** React Native + Expo (standardized on TypeScript/JavaScript to simplify cross-platform building).
* **Database:** PostgreSQL. Every single table uses a `gym_id` column to strictly isolate client data (Row-Level Multi-Tenancy).
* **UI/Design:** The "Modern Tech" font stack (English: *Inter*, Arabic: *IBM Plex Sans Arabic*).
* **Hardware Integration:** Upgrading from basic QR scanners to **ZKTeco Biometric Fingerprint Scanners**. The scanner connects to Wi-Fi and pushes HTTP `POST` requests directly to the FastAPI backend.

## 2. The Product & Feature Roadmap
### Phase 1 & 2 Core (The MVP)
* QR access control (with fallback for broken phones/forgotten passes).
* Admin Web Dashboard (financials, POS, access logs).
* Basic Biometrics & Progress Tracking (weight, body fat).
* **Payroll Logic:** Automatic cutoff date + the ability for the admin to add manual deduction line items before printing pay slips.

### Premium/Future Features (The "Upsells")
* **Revenue Generators:** Class booking with automated waitlists; In-app subscription renewals using CliQ; Automated churn warnings (flagging members who haven't scanned in 12 days).
* **Retention Drivers:** Gamification (workout streak counters); "Bring a Friend" one-time guest pass QR codes sent via WhatsApp (to capture lead data).
* **Coaching Tools:** Built-in rest timers during active workouts; Nutrition and macro templates (e.g., Target: 2500 cal, 150g protein).
* **Cost Saver:** Dropping heavy media (voice notes/video uploads) for Phase 1 to keep Google Cloud storage costs effectively at $0.00.

## 3. Business Model & Pricing Strategy
**The "Universal App" Strategy:** To bypass Apple's strict spam rules (Guideline 4.3), publish one app (e.g., "Codevex Fitness"). When a member types in their phone number, the app reads their `gym_id` and dynamically themes itself with their specific gym's logo and colors.

### Jordan Pricing (Amman & Irbid)
* **Tier 1 (Universal App):** 1,000 JOD Upfront (License + Tablet/Hardware setup) + 40 JOD/month (Maintenance).
* **Tier 2 (White-Label VIP):** 2,500 - 4,000 JOD Upfront + 100 - 150 JOD/month. (They get their own standalone app in the App Store, paid for under their own Apple Developer Account).

### Saudi Arabia Pricing (Vision 2030 Scale)
* **Tier 1 (Universal):** 5,000 - 7,500 SAR Upfront + 250 - 350 SAR/month.
* **Tier 2 (White-Label VIP):** 18,000 - 25,000 SAR Upfront + 700 - 1,000 SAR/month.

## 4. Corporate Structure & Team Compensation
**The Solo Founder:** Operates as the sole CEO and Lead Architect.

* **The Mobile Developer (Contractor):** Do not give away 50% equity for a React Native UI wrapper. Compensation is either a **Revenue Share** (e.g., 100 JOD per gym sold up to a cap) or a small **5% - 10% Equity Stake on a 4-year vesting schedule** (meaning he must stay to fix bugs, or he gets nothing).
* **The Sales Guy (Contractor):** Do not use a "Net Price / Overage" model; it will ruin local reputation. Offer a strict, highly motivating **30% flat commission** (300 JOD) on every 1,000 JOD deal closed.
* **Legal Protections:** 1. Secure an **IP Transfer Agreement** from the mobile developer immediately so the code is 100% owned by the company.
  2. Register as a **Sole Proprietorship (مؤسسة فردية)** when closing the first official paying gyms to issue tax invoices.
  3. Gym SLAs must explicitly state that the 40 JOD monthly fee covers *cloud hosting and bug fixes*, NOT building custom features for free.

## 5. Infrastructure & Sysadmin Strategy
* **Hosting:** Google Cloud Platform (GCP).
  * *Next.js & FastAPI:* Google Cloud Run (Serverless, scales to zero at night, handles rush hour automatically).
  * *Database:* Google Cloud SQL (Dedicated PostgreSQL instance with automated backups).
  * *Mobile Build Factory:* Expo Application Services (EAS).
* **Estimated Monthly Burn Rate (at 15 Gyms / 2,250 Users):** ~61 JOD/month total (Cloud SQL, Cloud Run, Cloud Storage, and Expo EAS Production Tier).
* **Monitoring (The "No Chaos" Rule):**
  * GCP Cloud Logging & Error Reporting (flags backend crashes automatically).
  * GCP Cloud SQL Insights (finds slow database queries).
  * Sentry or Firebase Crashlytics (tracks mobile app crashes on users' phones).
* **Deployment Rules:** * Never push code on a Friday.
  * Always use a **Staging Environment** to test code before it goes live.
  * Use **Canary Releases** (push a new update to one friendly beta-tester gym first before pushing to all).

## 6. Founder Lifestyle & Time Management
* **Development Speed:** Use AI coding agents as an "Architecture Director" to write boilerplate, cutting dev time by 75%.
* **The Workload Split:** * *Phase 1 (Building):* 15–25 hours a week for ~4 weeks. Fits around university classes and gym time.
  * *Phase 3 (Coasting):* ~45 minutes a day reviewing logs. Let Google's automated infrastructure act as the sysadmin.
* **Sales Strategy:** Leverage known local Irbid gym locations. Pitch the system at a heavy discount (e.g., 400 JOD) to secure the first live beta-tester and a video testimonial.