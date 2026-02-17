# SEED_SPEC.md
Version: 1.0
Scope: Initial Database Population (Development & Staging)

---

## 1. Objective
To populate the database with a realistic, deterministic dataset that covers all User Roles, Subscription States, and Contract Types. This allows immediate testing of RBAC, Access Control, and Payroll logic without manual data entry.

**Default Password for ALL Users:** `GymPass123!`

---

## 2. User Accounts

### 2.1 Admin (The Owner)
* **Email:** `admin@gym-erp.com`
* **Name:** "System Administrator"
* **Role:** `ADMIN`
* **Context:** Used to view dashboards and process payroll.

### 2.2 Coaches (The Staff)
* **User A:**
    * **Email:** `coach.mike@gym-erp.com`
    * **Name:** "Coach Mike"
    * **Role:** `COACH`
* **User B:**
    * **Email:** `coach.sara@gym-erp.com`
    * **Name:** "Coach Sara"
    * **Role:** `COACH`

### 2.3 Operational Staff
* **User C:**
    * **Email:** `cleaner.john@gym-erp.com`
    * **Name:** "John Cleaner"
    * **Role:** `EMPLOYEE`

### 2.4 Customers (The Trainees)
* **Customer 1:** `alice@client.com` (Assigned to Coach Mike)
* **Customer 2:** `bob@client.com` (Assigned to Coach Mike)
* **Customer 3:** `charlie@client.com` (Assigned to Coach Sara)
* **Customer 4:** `dana@client.com` (Unassigned)
* **Customer 5:** `expired.eddy@client.com` (Assigned to Coach Sara)

---

## 3. Subscription States (Access Control Testing)

### 3.1 Active Subscription (Green Light)
* **User:** `alice@client.com`
* **Plan:** "Gold Membership"
* **Start Date:** 30 Days Ago
* **End Date:** 30 Days from Now
* **Status:** `ACTIVE`
* **Expected Behavior:** QR Scan returns `GRANTED`.

### 3.2 Expired Subscription (Red Light)
* **User:** `expired.eddy@client.com`
* **Plan:** "Student Plan"
* **Start Date:** 60 Days Ago
* **End Date:** Yesterday
* **Status:** `EXPIRED`
* **Expected Behavior:** QR Scan returns `DENIED` (Reason: Expired).

### 3.3 Frozen Subscription (Edge Case)
* **User:** `bob@client.com`
* **Plan:** "Standard"
* **Status:** `FROZEN`
* **Expected Behavior:** QR Scan returns `DENIED` (Reason: Frozen).

---

## 4. HR & Contracts (Payroll Testing)

### 4.1 Fixed Contract (Salaried)
* **User:** `coach.mike@gym-erp.com`
* **Type:** `FIXED`
* **Amount:** 500.00 JOD / Month
* **Schedule:** Mon-Fri, 9am-5pm

### 4.2 Hourly Contract (Wage)
* **User:** `cleaner.john@gym-erp.com`
* **Type:** `HOURLY`
* **Amount:** 3.50 JOD / Hour
* **Schedule:** Shift based

### 4.3 Hybrid Contract (Commission)
* **User:** `coach.sara@gym-erp.com`
* **Type:** `HYBRID`
* **Base Salary:** 300.00 JOD
* **Hourly Rate:** 5.00 JOD (For Personal Training sessions)

---

## 5. Attendance Data (Payroll Calculation Test)
*Populate `attendance_logs` for the **Current Month** to allow immediate payroll preview.*

* **Employee:** `cleaner.john@gym-erp.com`
    * **Log 1:** Check-In: 08:00, Check-Out: 16:00 (8 Hours)
    * **Log 2:** Check-In: 08:00, Check-Out: 12:00 (4 Hours)
    * **Log 3:** Check-In: 08:00, Check-Out: NULL (Currently Working)

---

## 6. Financial Ledger (Dashboard Test)
* **Income:**
    * Type: `INCOME`, Category: `MEMBERSHIP`, Amount: 50.00 JOD, User: Alice
    * Type: `INCOME`, Category: `POS_SALE`, Amount: 1.50 JOD, Desc: "Water"
* **Expense:**
    * Type: `EXPENSE`, Category: `UTILITY`, Amount: 120.00 JOD, Desc: "Electricity Bill"

---

## 7. Fitness Data
* **Exercise:** "Barbell Squat", Video URL: "https://youtube.com/..."
* **Plan:** "Beginner Strength", Assigned to `alice@client.com` by `coach.mike`.
* **Feedback:** Alice logged "Difficulty: 4/5" yesterday.