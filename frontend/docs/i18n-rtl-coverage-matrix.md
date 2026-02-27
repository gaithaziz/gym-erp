# EN/AR + RTL Coverage Matrix

This matrix is the source of truth for localization + directionality verification.

## Required Roles
- ADMIN
- COACH
- CUSTOMER
- EMPLOYEE
- CASHIER
- RECEPTION
- FRONT_DESK

## Required States (per route unless marked N/A)
- `default`
- `loading`
- `empty`
- `error`
- `modal_open`
- `table_with_rows`
- `form_validation`

## Global Routes
| Route | Roles | Required States |
|---|---|---|
| `/` | All | default |
| `/login` | Public | default, form_validation, error |
| `/members` | ADMIN/RECEPTION/FRONT_DESK/COACH | default, loading, empty, table_with_rows |

## Dashboard Shell + Account Routes
| Route | Roles | Required States |
|---|---|---|
| `/dashboard` | All authenticated | default, loading, error |
| `/dashboard/blocked` | CUSTOMER (blocked) | default |
| `/dashboard/chat` | ADMIN/COACH/CUSTOMER | default, loading, empty, error, form_validation |
| `/dashboard/leaves` | ADMIN/COACH/EMPLOYEE/CASHIER/RECEPTION/FRONT_DESK | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/lost-found` | ADMIN/MANAGER/FRONT_DESK/RECEPTION/COACH/EMPLOYEE/CASHIER/CUSTOMER | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/profile` | All authenticated | default, loading, error, form_validation |
| `/dashboard/qr` | ADMIN/COACH/CUSTOMER/EMPLOYEE/CASHIER/RECEPTION/FRONT_DESK | default, loading, error |
| `/dashboard/subscription` | CUSTOMER | default, loading, error |
| `/dashboard/support` | CUSTOMER | default, loading, empty, error, modal_open, form_validation, table_with_rows |

## Admin Routes
| Route | Roles | Required States |
|---|---|---|
| `/dashboard/admin/audit` | ADMIN | default, loading, empty, error, table_with_rows |
| `/dashboard/admin/entrance-qr` | ADMIN | default, loading, error |
| `/dashboard/admin/finance` | ADMIN | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/admin/inventory` | ADMIN | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/admin/leaves` | ADMIN | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/admin/members` | ADMIN/RECEPTION/FRONT_DESK/COACH | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/admin/notifications` | ADMIN/RECEPTION/FRONT_DESK | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/admin/pos` | ADMIN/CASHIER/EMPLOYEE | default, loading, empty, error, form_validation |
| `/dashboard/admin/staff` | ADMIN | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/admin/staff/attendance` | ADMIN | default, loading, empty, error, table_with_rows |
| `/dashboard/admin/staff/[id]` | ADMIN | default, loading, empty, error, table_with_rows |
| `/dashboard/admin/support` | ADMIN/RECEPTION | default, loading, empty, error, modal_open, form_validation, table_with_rows |

## Coach Routes
| Route | Roles | Required States |
|---|---|---|
| `/dashboard/coach/diets` | ADMIN/COACH | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/coach/feedback` | ADMIN/COACH | default, loading, empty, error, table_with_rows |
| `/dashboard/coach/library` | ADMIN/COACH | default, loading, empty, error, modal_open, form_validation, table_with_rows |
| `/dashboard/coach/plans` | ADMIN/COACH | default, loading, empty, error, modal_open, form_validation, table_with_rows |

## Member Routes
| Route | Roles | Required States |
|---|---|---|
| `/dashboard/member/achievements` | CUSTOMER | default, loading, empty, error, table_with_rows |
| `/dashboard/member/diets` | CUSTOMER | default, loading, empty, error |
| `/dashboard/member/feedback` | CUSTOMER | default, loading, empty, error, modal_open, form_validation |
| `/dashboard/member/history` | CUSTOMER | default, loading, empty, error, table_with_rows |
| `/dashboard/member/plans` | CUSTOMER | default, loading, empty, error, modal_open, table_with_rows |
| `/dashboard/member/progress` | CUSTOMER | default, loading, empty, error, table_with_rows |

## Snapshot Naming
`<role>__<route_slug>__<state>__<dir>.png`

Example:
`admin__dashboard-admin-finance__table_with_rows__rtl.png`
