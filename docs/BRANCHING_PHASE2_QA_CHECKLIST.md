# Branching Phase 2 QA Checklist

## 1) Mobile branch awareness
- Login as `MANAGER` with access to 2+ branches.
- Verify header shows current branch chip.
- Switch branch and confirm choice persists after app restart.
- Confirm selected branch is applied to:
  - Support ticket list
  - Lost & Found list
  - Lost & Found create flow
  - Staff members list
  - Staff member detail view

## 2) Branch-scoped push
- Create support ticket in Branch A and verify only Branch A-eligible staff receive push.
- Create Lost & Found item in Branch B and verify Branch A-only staff do not receive push.
- Trigger Lost & Found status/assignment updates and verify branch-scoped delivery.
- Check push logs and confirm skipped recipients include explicit branch mismatch reason.

## 3) Roaming access
- At Branch B, perform check-in for member whose home branch is Branch A.
- Confirm roaming grant is created/refreshed with 12-hour expiry.
- Before grant, verify member sensitive detail read is denied for non-home branch.
- After grant, verify detail read is allowed.
- After expiry (or forced expiry), verify detail read is denied again.
- Verify roaming is read-only (no temporary write permissions).

## 4) RLS safety layer
- Run metadata verification for `support_tickets` and `audit_logs`:
  - `relrowsecurity = true`
  - `relforcerowsecurity = true`
  - `pg_policy` count > 0
- Run behavioral RLS tests to confirm cross-tenant denial remains enforced.

## 5) Super-Admin onboarding hardening
- Create a new gym via onboarding and verify all records are created atomically:
  - gym
  - first branch
  - admin user
  - `home_branch_id`
  - matching `user_branch_access`
  - audit record
- Validate conflict handling:
  - gym slug conflict => `409`
  - admin email conflict => `409`
  - invalid plan tier => `422`
- Confirm no partial writes are left on failed onboarding attempts.

