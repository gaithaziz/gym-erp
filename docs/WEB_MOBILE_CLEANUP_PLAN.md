# Web + Mobile Cleanup Plan

## Summary
We’ll tighten the highest-value shared logic first, then split the biggest screens/components so web and mobile stay aligned and easier to maintain. The goal is to reduce drift in branch-sensitive behavior, simplify auth/session handling, and make the UI code less monolithic without changing product behavior.

## Key Changes
- **Shared branch/contact policy**
  - Centralize chat contact visibility into one backend helper used by web and mobile.
  - Keep branch-safe delivery rules consistent for chat and branch-scoped notifications.
- **Branch resolution cleanup**
  - Add a single helper for “effective branch” resolution so `home_branch_id`, `accessible_branches`, and attribution fallbacks are handled consistently.
  - Reuse it across chat, bootstrap, access, analytics, and staff-facing routes where appropriate.
- **Analytics caching**
  - Add a short-lived cache/invalidation path for branch-scoped dashboard analytics so repeated requests don’t re-aggregate the same data.
  - Invalidate or refresh the cache on writes that materially change the dashboard numbers.
- **Mobile auth/session simplification**
  - Split `apps/mobile/src/lib/session.tsx` into smaller responsibilities: token lifecycle, bootstrap/branch selection, and device registration.
  - Preserve existing behavior; this is a refactor, not a flow change.
- **Screen/component decomposition**
  - Break the mobile chat screen into smaller pieces: contacts, thread list, composer, and media/voice helpers.
  - Extract shared progress card/rendering primitives for web and mobile so charts/cards stay visually consistent.
- **Regression coverage**
  - Add focused tests around:
    - chat contact visibility
    - branch-scoped push delivery
    - branch resolution/effective branch helper
    - analytics cache invalidation
    - mobile session/bootstrap branch selection
    - progress card formatting/shared render behavior

## Test Plan
- Backend unit/integration tests for the shared branch helper and chat/push branch rules.
- Analytics cache tests that verify:
  - cache hit on repeated reads
  - invalidation after a write
  - correct branch filtering in cached and uncached paths
- Mobile tests for session/bootstrap behavior and the refactored chat screen behavior.
- Web/mobile typecheck after refactors.
- Targeted smoke checks for:
  - chat contacts
  - branch selection
  - progress dashboard cards
  - branch-scoped analytics screens

## Assumptions
- We keep the current public API surface stable unless a helper extraction clearly warrants an internal-only contract change.
- No database migrations are required for the first pass.
- Behavior should remain unchanged except for the branch-safety and maintainability improvements already identified.
- We’ll preserve existing UX and only refactor structure unless a test reveals a real bug.
