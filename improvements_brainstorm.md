# Gym ERP - V1.1 Improvement Brainstorm

Here are some high-impact improvements we could make to the **existing** V1 features without expanding the scope too much:

## 1. Access Control (Kiosk & QR)
* **Offline Mode (NFR-04)**: The PRD mentions offline resilience. We could update the frontend Kiosk app to cache the list of active members (from `/api/v1/access/members`). If the internet goes down, the kiosk can still validate QR codes locally and push the access logs to the backend once the connection is restored.
* **Auto-refreshing QR Component**: Ensure the frontend React component for the Customer QR code has a strict visual timer that automatically re-fetches a new token every 30 seconds to prevent screenshots (FR-01).

## 2. Fitness Management (Coaching)
* **Workout Plan Templates**: Right now, coaches build plans from scratch. We could add a "Save as Template" button so coaches can create generic plans (e.g., "Beginner Hypertrophy", "3-Day Split") and instantly assign them to multiple customers, saving them hours of data entry.
* **Progress Tracking Charts**: When customers log their workouts and add feedback, we could aggregate that data into a simple line chart on the Customer Dashboard showing consistency (e.g., "Workouts per week") or weight lifted.

## 3. HR & Payroll
* **Downloadable Pay Slips**: Add a feature for employees and coaches to export a clean PDF "Pay Slip" of their monthly payroll calculation to keep for their personal records.
* **Absence/Leave Tracking**: Enhance the attendance system by allowing admins to log "Sick Days" or "Vacation Days" which can automatically adjust the hybrid/variable payroll calculations.

## 4. Financial Dashboard & POS
* **Automated Low-Stock Alerts**: Enhance the POS side by showing a red banner or sending an alert to the Admin dashboard when a product's `stock_quantity` drops below its `low_stock_threshold`.
* **Receipt Generation**: Add a button in the POS and Subscription menus to instantly generate a printable receipt or send an email confirmation to the customer after a purchase.

## 5. General Polish
* **Audit Logging**: Add a simple system logger that tracks *who* did *what* (e.g., "Admin X updated Contract for Coach Y", "Employee Z processed POS Sale"). This provides security and accountability for the owner.
* **Dark Mode & Theming**: Make the frontend UI highly polished with a toggleable Dark Mode, smooth micro-animations, and vibrant, premium styling.
