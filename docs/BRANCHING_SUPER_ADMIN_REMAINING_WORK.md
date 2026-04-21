# Branching & Super-Admin Remaining Work (6 Areas)

## 1) Complete Branch Wiring in Remaining Modules
Status: Completed
- Audit `Classes` frontend and backend flows for `branch_id` propagation from `BranchContext`.
- Audit `Gamification` frontend and backend flows for `branch_id` propagation from `BranchContext`.
- Re-check `Finance` and `Inventory` edge paths (modals, refreshes, exports/prints).
- Ensure every list/summary/report endpoint respects selected branch scope.

## 2) Add Reusable Branch Param Helper (Frontend)
Status: Completed
- Create a shared utility like `getBranchParams(selectedBranchId)`.
- Replace duplicated per-page branch param building with the shared helper.
- Optionally evaluate a safe Axios strategy for automatic branch query injection where applicable.
- Goal: reduce missed `branch_id` wiring in future modules.

## 3) Implement Super-Admin Global Aggregated View
Status: Completed
- Add explicit global mode when `selectedBranchId === 'all'`.
- Show platform-wide KPIs (health, revenue/expense rollups, attendance rollups).
- Add branch comparison widgets (top/bottom branches, trend deltas, ranking cards).
- Keep branch-specific mode for drill-down detail.

## 4) Finalize Cross-Branch Identity Rules
Status: Completed
- Define behavior for users with global branch access vs users with a single `home_branch_id`.
- Decide analytics attribution rules for members/staff across branches.
- Document clear precedence rules and edge-case behavior.
- Enforce these rules consistently in analytics and access services.
- Reference implementation doc: `docs/CROSS_BRANCH_IDENTITY_RULES.md`.

## 5) UI Consistency Pass for Branch Selector
Status: Completed
- Ensure `BranchSelector` appears on all management pages that support branch-scoped data.
- Standardize placement (header/right controls area), spacing, and interaction behavior.
- Ensure branch selection persistence is consistent across routes.
- Verify consistent loading/empty/error states after branch changes.

## 6) Add Regression Safety Tests
Status: Completed
- Backend tests: `branch_id` filtering, cross-branch access denial, and "all branches" behavior.
- Frontend/integration tests: changing branch updates API params and rendered data.
- Add coverage for print/export flows where branch filtering is expected.
- Add at least one end-to-end happy path for Super-Admin global vs branch-specific mode.

## Suggested Execution Order
1. Finish module wiring audits (Item 1).
2. Add shared frontend helper (Item 2).
3. Ship Super-Admin global view (Item 3).
4. Lock identity/analytics rules (Item 4).
5. Do UI consistency pass (Item 5).
6. Add regression tests and finalize (Item 6).
