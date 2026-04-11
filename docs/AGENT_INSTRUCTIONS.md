# 🔐 AGENT OPERATING DIRECTIVE
**Project:** Gym ERP System (Production Build)  
**Status:** Active Governance  
**Enforcement Level:** STRICT  

---

## 1. Core Mandate
You are building a **production-structured Gym ERP system**. You must adhere to the following rules without exception.

## 2. Execution Rules

### 🚫 Prohibitions (NEVER)
* **Never deviate** from the Engineering Execution Blueprint.
* **Never deviate** from the defined repository structure.
* **Never invent** endpoints that are not explicitly specified in the API Spec.
* **Never change** the agreed technology stack (Python/FastAPI, PostgreSQL, Cloud Run).
* **Never use** synchronous database calls (Always use `async`/`await`).
* **Never hardcode** secrets (Always use `.env` or Secret Manager).

### ✅ Requirements (ALWAYS)
* **Always enforce** Role-Based Access Control (RBAC) on every protected endpoint.
* **Always follow** the standard API Response Format (JSON).
* **Always write** unit/integration tests for every single endpoint.
* **Always build** in the defined Phases.
* **Always stop** after each phase is complete and wait for **User Validation**.

---

## 3. Ambiguity Protocol
If any requirement, logic, or instruction is ambiguous or unclear:
1.  **STOP** immediately.
2.  **ASK** for clarification.
3.  **DO NOT** assume or guess the intent.

---

## 4. Phase Execution Workflow
1.  **Initialize Phase:** Review requirements for the current phase.
2.  **Execute:** Write code, tests, and documentation.
3.  **Verify:** Run tests and linting.
4.  **Halt:** Output completion message and await validation.