# Customer I18N + RTL Coverage Matrix

Status legend:
- `Pending`: not reviewed yet.
- `In Progress`: currently being refactored/verified.
- `Done`: text + RTL + visual checks completed.

## Routes

| Route | States | Text | RTL | Visual | Notes |
|---|---|---|---|---|---|
| `/dashboard/blocked` | default, locked-actions | In Progress | In Progress | In Progress | Locked-actions EN/LTR + AR/RTL snapshots locked in `customer-state-visual`; blocked page now uses localized subscription status labels and locale date formatting. |
| `/dashboard/chat` | default, empty, loading, media, error | In Progress | In Progress | Pending | Chat toasts, voice/audio controls, and message timestamps now use localized labels and locale-aware date formatting. |
| `/dashboard/profile` | default, success, validation, upload, error | In Progress | In Progress | In Progress | Default customer snapshot added; profile role labels are now localized and the emergency contact placeholder is localized for Arabic. |
| `/dashboard/qr` | default, camera-error, manual, success, denied | In Progress | In Progress | Pending | Camera errors, attendance permission messages, result status labels, and manual QR flows are now localized. |
| `/dashboard/subscription` | default, active, frozen, expired, none, locked-actions | In Progress | In Progress | In Progress | Locked-actions EN/LTR + AR/RTL snapshots locked in `customer-state-visual`; status badge now uses localized labels and locale date formatting. |
| `/dashboard/support` | default, empty, loading, modal, detail, reply, error | In Progress | In Progress | In Progress | `empty`, `loading`, `error`, modal-open, and prefilled-subscription-modal snapshots locked; attachment image alt moved to localized key (`support.customer.attachmentAlt`). |
| `/dashboard/member/achievements` | default, empty, loading, error | In Progress | In Progress | Pending | Badge catalog and earned-date rendering now show localized names/descriptions with locale-aware dates. |
| `/dashboard/member/diets` | default, empty, loading, error | In Progress | In Progress | In Progress | Empty-state customer snapshot added for deterministic EN/LTR + AR/RTL coverage. |
| `/dashboard/member/feedback` | default, empty, loading, error | In Progress | In Progress | In Progress | Default snapshot added with deterministic empty diet-plan dependency. |
| `/dashboard/member/history` | default, empty, loading, error | In Progress | In Progress | Pending | Access/payment timestamps now use locale helpers and payment method labels are localized. |
| `/dashboard/member/plans` | default, empty, loading, error | In Progress | In Progress | In Progress | Empty-state customer snapshot added for deterministic EN/LTR + AR/RTL coverage. |
| `/dashboard/member/progress` | default, empty, loading, form, error | In Progress | In Progress | Pending | Chart tooltip and label dates now use locale-aware formatting across EN/AR. |

## Required State Checklist

- `default`
- `loading`
- `empty`
- `error`
- `form validation` where applicable
- `modal/drawer open` where applicable
- `success` where applicable
