# Gym ERP System: UI/UX Wireframes & Infrastructure Plan

**Version:** 1.0

------------------------------------------------------------------------

# Topic 3: UI/UX Wireframes (The "Visual Plan")

Since we are not drawing actual wireframes, this document visualizes the
layouts and components to guide frontend implementation.

------------------------------------------------------------------------

## Screen 1: Admin Dashboard (Web)

**Layout:**\
Sidebar Navigation (Left)\
Main Content Area (Right)

### Top Row (KPI Cards)

-   **Live Headcount**\
    Number of people currently inside the gym\
    *(Calculated from Check-ins vs Check-outs)*

-   **Today's Revenue**\
    Total JOD collected today

-   **Pending Salaries**\
    Total amount owed to staff for the current month

------------------------------------------------------------------------

### Middle Section (Analytics Charts)

-   **Left:** Bar Chart\
    **"Visits by Hour"**\
    Used to analyze peak gym hours

-   **Right:** Line Chart\
    **"Revenue vs. Expenses"**\
    Display data for the last 30 days

------------------------------------------------------------------------

### Bottom Section

-   **Recent Activity Log** Examples:
    -   "Ahmad renewed subscription"
    -   "Coach Sara clocked in"
    -   "Electricity bill added"

------------------------------------------------------------------------

## Screen 2: Coach App (Mobile)

### Tab 1: My Trainees (List View)

-   List of active clients
-   Status Indicator:
    -   🟢 Green → Worked out today
    -   🔴 Red → Absent for more than 3 days

------------------------------------------------------------------------

### Tab 2: Plan Builder (Form View)

-   Dropdown: **Select Exercise**
-   Input Fields:
    -   Sets
    -   Reps
-   Button:
    -   Add Video Link
-   Action Button:
    -   Save / Assign Plan

------------------------------------------------------------------------

### Tab 3: Inbox

-   Direct feedback from clients
-   Example:
    -   "Video: My squat form"
    -   "This workout was too intense"

------------------------------------------------------------------------

## Screen 3: Customer App (Mobile)

### Home Screen

-   **Large Center Button:**\
    "Show QR Code"\
    *(Generates secure, time-limited token)*

-   Below QR Button:

    -   "Subscription Expires in: 12 Days"

------------------------------------------------------------------------

### Workout Tab

-   Header:
    -   "Today's Plan: Leg Day"
-   Exercise List:
    -   Exercise Name
    -   Sets/Reps
    -   "Watch Video" button

------------------------------------------------------------------------

# Infrastructure Plan

## 1. Fully Cloud-Native Architecture (Google Cloud Run)

### Hosting Strategy

-   Backend: FastAPI
-   Database: PostgreSQL
-   Hosting Platform: Google Cloud Run

### Why Cloud Run?

-   Automatically scales to zero when idle (cost efficient)
-   Instantly scales up when QR scans or requests occur
-   No server management required

------------------------------------------------------------------------

### Offline Strategy

Since this is a V1 MVP:

-   The system requires an active internet connection.
-   If internet is unavailable:
    -   The scanner displays: "Connection Error"
    -   Access is temporarily blocked

This is acceptable for the first release.

------------------------------------------------------------------------

# Revised HR Logic (Pure Hourly Model)

## Previous Rule (Removed)

-   Deduct pay if late

## New Rule (Simplified & Fair)

-   Employees are paid strictly for the time they are clocked in.
-   No penalties
-   No deductions
-   No fines

------------------------------------------------------------------------

### Payroll Formula

Daily_Pay = (Clock_Out_Time - Clock_In_Time) × Hourly_Rate

Example:

If a coach clocks in at 9:15 instead of 9:00: - They are simply paid
from 9:15 onward. - No disciplinary deduction.

------------------------------------------------------------------------

# The "Green Light" Checklist

You now have everything required to begin implementation:

### 1. The Blueprint

-   Complete Master Design Document
-   Database Schema
-   API Specification

### 2. The Technology Stack

-   Backend: Python (FastAPI)
-   Database: PostgreSQL
-   Mobile App: Flutter
-   Web Dashboard: React
-   Hosting: Google Cloud Run

### 3. Core Logic Defined

-   Secure QR-based access control
-   Pure hourly payroll model
-   Cloud-native scalable infrastructure

------------------------------------------------------------------------

This document completes the planning phase and transitions the project
into development readiness.
