# Product Requirements Document (PRD): Gym Management & ERP System

| **Project Name** | Gym ERP (Project Name TBD) |
| :--- | :--- |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | February 17, 2026 |
| **Author** | Gaith |

---

## 1. Executive Summary

**Product Vision:** To build a centralized, all-in-one Gym Management & ERP System tailored for the local Jordanian market. This system unifies business operations (HR, Finance, Access Control) with fitness product delivery (Workouts, Diets, Coaching), replacing fragmented tools like Excel, WhatsApp, and paper logs.

**Core Value Proposition:**
1.  **For Owners:** A "truth-telling" financial dashboard that tracks every dinar (salaries, bills, revenue) to show real profitability.
2.  **For Coaches:** A streamlined tool to manage multiple trainees and track performance manually, without relying on third-party wearables.
3.  **For Customers:** A clear, video-guided path to fitness goals with seamless, secure gym access.

---

## 2. User Roles & Permissions

| Role | Description | Key Permissions |
| :--- | :--- | :--- |
| **Admin (Owner)** | The Super User with full oversight. | • View/Edit All Financials (Revenue, Bills, Profit).<br>• Manage All Staff (Contracts, Salaries).<br>• Override Access Control.<br>• View Global Analytics. |
| **Coach** | Fitness Professional managing clients. | • Create/Edit Workout & Diet Plans.<br>• View *Assigned* Customers only.<br>• Monitor Trainee Performance (Manual Logs/Feedback).<br>• View Own Salary/Contract/Attendance. |
| **Employee (Cleaner/Staff)** | Operational Staff. | • Clock In/Clock Out (Attendance).<br>• View Own Contract/Salary Stats.<br>• (Optional) View assigned tasks/cleaning schedule. |
| **Customer** | The End User (Trainee). | • Generate Access QR Code.<br>• View Assigned Workout/Diet Plan.<br>• Log Workout Completion/Feedback.<br>• View Subscription Status. |

---

## 3. Functional Requirements

### 3.1 Authentication & Access Control (The Gatekeeper)
**Objective:** Ensure only active, paying members enter the facility via a secure, non-shareable method.

* **FR-01: Dynamic QR Code Entry**
    * The Customer App shall generate a unique QR code upon login.
    * **Security Constraint:** The QR code must auto-refresh every 30-60 seconds to prevent screenshots/sharing.
* **FR-02: Eligibility Logic**
    * When the QR is scanned (by a Kiosk or Admin device), the system queries the database:
        * `IF (Subscription_Status == Active) AND (Current_Date <= Expiry_Date)` → **ALLOW ACCESS (Green Light)**.
        * `ELSE` → **DENY ACCESS (Red Light)** with a specific error message (e.g., "Membership Expired", "Payment Pending").
* **FR-03: Staff Check-In**
    * Employees (Coaches/Cleaners) must scan in/out to log work hours. This data feeds directly into the Payroll System.

### 3.2 HR & Payroll Management System
**Objective:** Automate the calculation of variable and fixed salaries based on accurate contracts and attendance.

* **FR-04: Contract Management**
    * Admin must be able to create/edit digital contracts for each employee.
    * **Required Fields:** Job Title, Base Salary (Monthly), Hourly Rate (for PT/Overtime), Shift Schedule.
* **FR-05: Automated Salary Calculation**
    * System must calculate salary based on contract type:
        * *Fixed:* Monthly flat rate.
        * *Variable:* (Hours Worked × Hourly Rate).
        * *Hybrid:* Base + Commission (e.g., per Personal Training session).
* **FR-06: Attendance Logs**
    * Dashboard must show a timesheet for all employees (Clock-In Time, Clock-Out Time, Total Hours).
    * Admin must have the ability to manually correct attendance errors.

### 3.3 Fitness Management (The Core Product)
**Objective:** Provide high-quality, video-guided coaching and manual performance tracking.

* **FR-07: Plan Builder (Diet & Workout)**
    * Coaches can assign specific plans to customers.
    * **Workout Structure:** Day → Exercises → Sets/Reps/Rest → **Video Link**.
    * **Diet Structure:** Meal → Ingredients → Macros (Calories/Protein/Carb/Fat).
* **FR-08: Exercise Video Library**
    * System allows uploading videos or embedding links (YouTube/Vimeo) for exercises.
    * Customer interface must display a "Watch Video" button next to every exercise.
* **FR-09: Manual Performance Tracking**
    * **Customer Input:** Customers can mark workouts as "Complete" and add subjective feedback (e.g., "Too Heavy," "Easy," "Pain in shoulder").
    * **Coach Review:** Coaches receive a summary of trainee feedback to adjust future plans.

### 3.4 Financial Dashboard (The Storyteller)
**Objective:** Provide a real-time view of business health and profitability.

* **FR-10: Expense Tracking**
    * **Auto-Logged:** Employee Salaries (derived from HR module).
    * **Manually Logged:** Recurring Bills (Water, Electricity, Rent, Maintenance, Equipment).
* **FR-11: Revenue Tracking**
    * Logs all incoming payments from Subscriptions and POS (Water/Supplements).
    * Supports "Cash" and "Card" payment types.
* **FR-12: Profit/Loss Visualization**
    * Dashboard must display a clear "Net Profit" calculation: `Total Revenue - (Salaries + Bills)`.
    * **Visuals:** Line graph showing cash flow trends (Month-over-Month).

---

## 4. Non-Functional Requirements

### 4.1 Security & Data Integrity
* **NFR-01: Role-Based Access Control (RBAC)**
    * Strict enforcement required. A "Coach" API token must never be able to query the `Admin_Financials` table.
* **NFR-02: Data Privacy**
    * Customer diet/health data must be private to the Customer and their assigned Coach only.

### 4.2 Performance & Reliability
* **NFR-03: QR Scan Speed**
    * The handshake between Scanner and Server to verify a user must take less than **1 second**.
* **NFR-04: Offline Resilience**
    * The Access Control system should cache active member lists locally (on the Admin device/Kiosk) to function during temporary internet outages.

---

## 5. Technical Assumptions (Database Entities)
*To be expanded in the System Design Phase.*

1.  **Users:** `ID, Name, Role (Enum), Phone, PasswordHash`
2.  **Contracts:** `UserID, Type (Fixed/Hourly), Rate, StartDate`
3.  **Attendance:** `UserID, ClockIn_Timestamp, ClockOut_Timestamp`
4.  **Subscriptions:** `UserID, PlanID, StartDate, EndDate, Status`
5.  **Exercises:** `ID, Name, VideoURL, MuscleGroup`
6.  **Workouts:** `ID, CoachID, CustomerID, DateAssigned, JSON_PlanData`
7.  **Ledger:** `ID, Type (Credit/Debit), Amount, Category (Salary/Bill/Sub), Date`

---

## 6. Success Metrics (KPIs)

* **System Reliability:** 99.9% uptime for the Access Control system.
* **Coach Efficiency:** Reduction in time spent creating plans by using templates.
* **Financial Accuracy:** 100% match between "System Calculated Salary" and "Actual Payout."

---

## 7. Exclusions (Out of Scope for V1)

* **Wearables:** No integration with Apple Health, Garmin, or Fitbit.
* **Automated Payment Gateway:** Online payments are manual entry for V1; focus is on Cash/POS logging.
* **AI Generation:** No AI-generated workout plans; all plans are human-created by Coaches.