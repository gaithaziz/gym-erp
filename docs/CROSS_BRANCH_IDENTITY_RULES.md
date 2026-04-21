# Cross-Branch Identity & Attribution Rules

This document defines how branch identity is resolved when a user can access multiple branches.

## Scope

- Access logs (`access_logs`)
- Staff attendance logs (`attendance_logs`)
- Analytics rollups that filter by branch
- User-linked analytics entities (subscriptions, payroll, leaves, renewal requests)

## Canonical Branch Attribution

When an event needs a single branch for attribution, use this precedence:

1. `users.home_branch_id` if it exists and belongs to the same gym and is active.
2. Earliest active `user_branch_access` assignment for that user in the same gym.
3. `null` (unattributed) when neither is available.

This rule is implemented by `TenancyService.resolve_user_attribution_branch_id(...)`.

## Branch-Scoped Analytics Rules

When analytics are filtered to branch scope:

1. Include records with explicit branch FK inside the selected branch set.
2. For user-linked records without direct branch FK, include the user when either:
   - `home_branch_id` is in the selected branch set, or
   - user has `user_branch_access` to at least one selected branch.
3. If selected branch scope resolves to empty, return no data.

## Global vs Branch-Specific Mode

- Global mode (`selectedBranchId = all`) uses all authorized branches for the caller.
- Branch-specific mode uses exactly the selected branch (after access validation).

## Edge Cases

- If a user has global branch access and no `home_branch_id`, events still attribute via earliest active branch assignment.
- If assigned branch is inactive, attribution falls back to the next valid precedence step.
- If no valid branch can be resolved, event branch remains `null` and branch-filtered analytics do not include it.

