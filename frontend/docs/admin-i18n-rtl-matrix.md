# Admin I18N + RTL Coverage Matrix

Status legend:
- `Pending`: not reviewed yet.
- `In Progress`: currently being refactored/verified.
- `Done`: text + RTL + visual checks completed.

## Routes

| Route | States | Text | RTL | Visual | Notes |
|---|---|---|---|---|---|
| `/dashboard/admin/audit` | default, loading, empty, error | Done | Done | Done | Default plus `loading` and `empty` snapshots locked in `admin-state-visual`; no visible in-page error UI exists in current screen. |
| `/dashboard/admin/entrance-qr` | default, loading, empty, error | Done | Done | Done | Default plus invalid-input/form-validation snapshot locked in `admin-state-visual`. |
| `/dashboard/admin/finance` | default, loading, empty, table, modal, error | Done | Done | Done | Default plus transaction modal snapshot locked in `admin-state-visual`. |
| `/dashboard/admin/inventory` | default, loading, empty, table, modal, error | Done | Done | Done | Default plus `empty`, create-modal, and disabled-submit validation snapshots locked in `admin-state-visual`. |
| `/dashboard/admin/leaves` | default, loading, empty, table, modal, error | Done | Done | Done | Default plus `empty`, `loading`, and visible error snapshots locked in `admin-state-visual`. |
| `/dashboard/admin/members` | default, loading, empty, table, modal, profile, error | Done | Done | Done | Default visual baseline locked; text/RTL pass complete. |
| `/dashboard/admin/notifications` | default, loading, empty, table, modal, error | Done | Done | Done | Default plus empty-log state snapshot locked in `admin-state-visual`; locale-aware helper examples patched. |
| `/dashboard/admin/pos` | default, loading, empty, cart, checkout, error | Done | Done | Done | Category enum labels normalized to localized names; EN/LTR + AR/RTL default snapshots locked via `@admin`. |
| `/dashboard/admin/staff` | default, loading, empty, table, modal, error | Done | Done | Done | Default plus `empty`, add modal, edit modal, and payroll modal snapshots locked in `admin-state-visual`. |
| `/dashboard/admin/staff/attendance` | default, loading, empty, table, export, error | Done | Done | Done | Default plus `empty` and `loading` snapshots locked in `admin-state-visual`. |
| `/dashboard/admin/staff/[id]` | default, loading, empty, table, modal, error | Done | Done | Done | Localized leave status/type + locale date formatting; default plus empty-summary and error snapshots locked in `admin-state-visual`. |
| `/dashboard/admin/support` | default, loading, empty, ticket, reply, error | Done | Done | Done | Default plus `empty`, `loading`, and visible error snapshots locked in `admin-state-visual`. |

## Required State Checklist (per route)

- `default`
- `loading`
- `empty`
- `error`
- `table/list populated` (where applicable)
- `form validation` (where applicable)
- `modal/drawer open` (where applicable)
