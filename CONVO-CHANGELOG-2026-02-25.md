# Conversation Changelog (2026-02-25)

## 1) Workout Plans UX (Coach)
- Improved workout template/assigned-plan readability and grouping.
- Added status-based template filters (`All`, `Published`, `Draft`, `Archived`) aligned to the left.
- Improved mobile-friendly spacing and action layout.
- File: `frontend/src/app/dashboard/coach/plans/page.tsx`

## 2) Admin Assign Modal Improvements
- Added workout status filter chips in assign flow.
- Filtered workout plan dropdown by selected status.
- Kept assign preview, warnings, and archived-plan assignment guardrails.
- File: `frontend/src/app/dashboard/admin/members/page.tsx`

## 3) New Sidebar Hub: Workout & Diet Library
- Added new Coaching nav item for `ADMIN` and `COACH`:
  - Route: `/dashboard/coach/library`
  - Label: `Workout & Diet Library`
- New page includes:
  - Tabs: `Workout Library`, `Diet Library`
  - Shared filters: scope (`all/global/mine`) + search
  - Add/edit/delete for both library types
  - Diet template `To Plan` action
- Files:
  - `frontend/src/app/dashboard/layout.tsx`
  - `frontend/src/app/dashboard/coach/library/page.tsx`

## 4) Backend: Workout Library CRUD Expansion
- Added:
  - `PUT /fitness/exercise-library/{item_id}`
  - `DELETE /fitness/exercise-library/{item_id}`
- Added ownership/global authorization rules:
  - Admin can manage global and own items
  - Coach can manage own non-global items
- File: `app/routers/fitness.py`

## 5) Backend: Diet Library (New)
- Added new model/table: `diet_library_items`
  - Fields: `id, name, description, content, is_global, owner_coach_id, created_at, updated_at`
- Added endpoints:
  - `GET /fitness/diet-library`
  - `POST /fitness/diet-library`
  - `PUT /fitness/diet-library/{item_id}`
  - `DELETE /fitness/diet-library/{item_id}`
  - `POST /fitness/diet-library/{item_id}/to-plan`
- Files:
  - `app/models/fitness.py`
  - `app/routers/fitness.py`
  - `alembic/versions/6a9f21b7c3d4_add_diet_library_items.py`

## 6) Integrations/Navigation Shortcuts
- Added helper link from workout plan builder to library page.
- Added `Open Library` shortcut button on diet plans page.
- Files:
  - `frontend/src/app/dashboard/coach/plans/page.tsx`
  - `frontend/src/app/dashboard/coach/diets/page.tsx`

## 7) Copy/Text Cleanup
- Replaced confusing message mentioning `Save reusable` on library page with neutral guidance.
- File: `frontend/src/app/dashboard/coach/library/page.tsx`

## 8) Tests Added/Updated
- Added tests for:
  - Workout library update/delete authorization
  - Diet library CRUD and `to-plan` conversion
- File: `tests/test_fitness.py`

## 9) Validation Performed
- `python -m py_compile app/routers/fitness.py app/models/fitness.py` passed.
- `npx tsc --noEmit` (frontend) passed.
- `pytest -q tests/test_fitness.py` passed (`13 passed`).

## 10) Migration Note
- Apply DB changes with:
  - `alembic upgrade head`
  - then rebuild services if needed:
    - `docker compose up -d --build backend frontend`
