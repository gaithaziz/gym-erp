import { z } from "zod";

import {
  authUserSchema,
  roleSchema,
  subscriptionBlockReasonSchema,
  subscriptionStatusSchema,
} from "./auth";

export const CAPABILITY_VALUES = [
  "view_personal_qr",
  "scan_gym_qr",
  "scan_member_qr",
  "lookup_members",
  "manage_member_plans",
  "manage_member_diets",
  "view_finance_summary",
  "use_pos",
  "manage_inventory",
  "handle_support_queue",
  "view_audit_summary",
  "renew_subscription",
  "view_receipts",
  "view_profile",
  "view_notifications",
  "view_chat",
  "view_support",
] as const;

export const ENABLED_MODULE_VALUES = [
  "home",
  "qr",
  "members",
  "plans",
  "progress",
  "support",
  "chat",
  "profile",
  "notifications",
  "operations",
  "finance",
  "inventory",
  "audit",
] as const;

export const capabilitySchema = z.enum(CAPABILITY_VALUES);
export const enabledModuleSchema = z.enum(ENABLED_MODULE_VALUES);

export const subscriptionSnapshotSchema = z.object({
  status: subscriptionStatusSchema,
  end_date: z.string().nullable().optional(),
  plan_name: z.string().nullable().optional(),
  is_blocked: z.boolean(),
  block_reason: subscriptionBlockReasonSchema.nullable().optional(),
});

export const gymBrandingSchema = z.object({
  gym_name: z.string().min(1),
  logo_url: z.string().nullable().optional(),
  primary_color: z.string().min(1),
  secondary_color: z.string().min(1),
  support_email: z.string().email().nullable().optional(),
  support_phone: z.string().nullable().optional(),
});

export const notificationPreferenceSchema = z.object({
  push_enabled: z.boolean(),
  chat_enabled: z.boolean(),
  support_enabled: z.boolean(),
  billing_enabled: z.boolean(),
  announcements_enabled: z.boolean(),
});

export const branchSummarySchema = z.object({
  id: z.string().uuid(),
  gym_id: z.string().uuid(),
  name: z.string().min(1),
  display_name: z.string().nullable().optional(),
  code: z.string().min(1),
  slug: z.string().min(1),
  timezone: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

const rawMobileBootstrapSchema = z.object({
  user: authUserSchema,
  role: roleSchema,
  subscription: subscriptionSnapshotSchema,
  gym: gymBrandingSchema,
  home_branch: branchSummarySchema.nullable().optional(),
  accessible_branches: z.array(branchSummarySchema).default([]),
  capabilities: z.array(z.string()),
  enabled_modules: z.array(enabledModuleSchema),
  notification_settings: notificationPreferenceSchema,
});

export const mobileBootstrapSchema = rawMobileBootstrapSchema.transform((payload) => {
  const nextCapabilities = payload.capabilities.filter((capability): capability is Capability =>
    CAPABILITY_VALUES.includes(capability as Capability),
  );

  if (payload.role === "CUSTOMER") {
    const customerCapabilities = nextCapabilities.filter((capability) => capability !== "view_personal_qr");
    if (!customerCapabilities.includes("scan_gym_qr")) {
      customerCapabilities.unshift("scan_gym_qr");
    }
    return { ...payload, capabilities: customerCapabilities };
  }

  return { ...payload, capabilities: nextCapabilities };
});

export const mobileReceiptSummarySchema = z.object({
  id: z.string().uuid(),
  receipt_no: z.string(),
  date: z.string(),
  amount: z.number(),
  type: z.string(),
  category: z.string(),
  payment_method: z.string(),
  description: z.string(),
  gym_name: z.string(),
});

export const mobileCustomerHomeSchema = z.object({
  subscription: subscriptionSnapshotSchema,
  quick_stats: z.object({
    active_workout_plans: z.number().int(),
    active_diet_plans: z.number().int(),
    recent_check_ins: z.number().int(),
    open_support_tickets: z.number().int(),
    unread_chat_messages: z.number().int(),
  }),
  latest_biometric: z
    .object({
      id: z.string().uuid(),
      date: z.string(),
      weight_kg: z.number().nullable().optional(),
      height_cm: z.number().nullable().optional(),
      body_fat_pct: z.number().nullable().optional(),
      muscle_mass_kg: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  recent_receipts: z.array(mobileReceiptSummarySchema),
});

export const mobileCustomerBillingSchema = z.object({
  subscription: subscriptionSnapshotSchema,
  renewal_offers: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      description: z.string(),
      duration_days: z.number().int(),
      amount: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
    }),
  ),
  renewal_requests: z.array(
    z.object({
      id: z.string().uuid(),
      offer_code: z.string(),
      plan_name: z.string(),
      duration_days: z.number().int(),
      status: z.string(),
      customer_note: z.string().nullable().optional(),
      requested_at: z.string(),
      reviewed_at: z.string().nullable().optional(),
      reviewer_note: z.string().nullable().optional(),
      payment_method: z.literal("CASH"),
      payment_status: z.string(),
    }),
  ),
  payable_items: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      description: z.string(),
      amount_due: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
    }),
  ),
  receipts: z.array(mobileReceiptSummarySchema),
  payment_policy: z.object({
    provider: z.string(),
    store_billing_used: z.boolean(),
    notes: z.string(),
  }),
});

export const mobileCustomerPlansSchema = z.object({
  workout_plans: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      description: z.string().nullable().optional(),
      status: z.string(),
      version: z.number().int(),
      expected_sessions_per_30d: z.number().int(),
      published_at: z.string().nullable().optional(),
    }),
  ),
  diet_plans: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      description: z.string().nullable().optional(),
      status: z.string(),
      version: z.number().int(),
      published_at: z.string().nullable().optional(),
    }),
  ),
});

export const mobileCustomerProgressSchema = z.object({
  biometrics: z.array(
    z.object({
      id: z.string().uuid(),
      date: z.string(),
      weight_kg: z.number().nullable().optional(),
      height_cm: z.number().nullable().optional(),
      body_fat_pct: z.number().nullable().optional(),
      muscle_mass_kg: z.number().nullable().optional(),
    }),
  ),
  attendance_history: z.array(
    z.object({
      id: z.string().uuid(),
      scan_time: z.string(),
      status: z.string(),
      reason: z.string().nullable().optional(),
      kiosk_id: z.string().nullable().optional(),
    }),
  ),
  recent_workout_sessions: z.array(
    z.object({
      id: z.string().uuid(),
      plan_id: z.string().uuid(),
      performed_at: z.string(),
      duration_minutes: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  ),
  workout_stats: z.array(
    z.object({
      date: z.string(),
      workouts: z.number().int(),
    }),
  ),
  personal_records: z.array(
    z.object({
      id: z.string().uuid(),
      session_id: z.string().uuid(),
      plan_id: z.string().uuid(),
      plan_name: z.string().nullable().optional(),
      exercise_name: z.string().nullable().optional(),
      pr_type: z.string().nullable().optional(),
      pr_value: z.string().nullable().optional(),
      pr_notes: z.string().nullable().optional(),
      weight_kg: z.number().nullable().optional(),
      sets_completed: z.number().int(),
      reps_completed: z.number().int(),
      performed_at: z.string(),
    }),
  ).default([]),
});

export const mobileCustomerNotificationsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      body: z.string(),
      event_type: z.string(),
      status: z.string(),
      created_at: z.string().nullable().optional(),
    }),
  ),
});

export const mobileStaffMemberSummarySchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().nullable().optional(),
  email: z.string().email(),
  phone_number: z.string().nullable().optional(),
  profile_picture_url: z.string().nullable().optional(),
  subscription: z.object({
    status: z.string(),
    end_date: z.string().nullable().optional(),
    plan_name: z.string().nullable().optional(),
  }),
  latest_biometric_date: z.string().nullable().optional(),
});

export const mobileStaffMemberRegistrationRequestSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone_number: z.string().nullable().optional(),
  password: z.string().min(6).max(128),
});

export const mobileStaffMemberRegistrationResultSchema = z.object({
  member: mobileStaffMemberSummarySchema,
});

export const mobileStaffMemberDetailSchema = z.object({
  member: authUserSchema,
  subscription: z.object({
    status: z.string(),
    end_date: z.string().nullable().optional(),
    plan_name: z.string().nullable().optional(),
  }),
  active_workout_plans: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      status: z.string(),
      creator_id: z.string().uuid(),
      published_at: z.string().nullable().optional(),
    }),
  ),
  active_diet_plans: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      status: z.string(),
      creator_id: z.string().uuid(),
      published_at: z.string().nullable().optional(),
    }),
  ),
  latest_biometric: z
    .object({
      id: z.string().uuid(),
      date: z.string(),
      weight_kg: z.number().nullable().optional(),
      height_cm: z.number().nullable().optional(),
      body_fat_pct: z.number().nullable().optional(),
      muscle_mass_kg: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  recent_attendance: z.array(
    z.object({
      id: z.string().uuid(),
      scan_time: z.string(),
      status: z.string(),
      reason: z.string().nullable().optional(),
      kiosk_id: z.string().nullable().optional(),
    }),
  ),
  biometrics: z.array(
    z.object({
      id: z.string().uuid(),
      date: z.string(),
      weight_kg: z.number().nullable().optional(),
      height_cm: z.number().nullable().optional(),
      body_fat_pct: z.number().nullable().optional(),
      muscle_mass_kg: z.number().nullable().optional(),
    }),
  ).default([]),
  recent_workout_sessions: z.array(
    z.object({
      id: z.string().uuid(),
      plan_id: z.string().uuid(),
      plan_name: z.string().nullable().optional(),
      performed_at: z.string(),
      duration_minutes: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  ).default([]),
  workout_feedback: z.array(
    z.object({
      id: z.string().uuid(),
      plan_id: z.string().uuid(),
      plan_name: z.string().nullable().optional(),
      date: z.string(),
      completed: z.boolean(),
      difficulty_rating: z.number().int().nullable().optional(),
      comment: z.string().nullable().optional(),
    }),
  ).default([]),
  diet_feedback: z.array(
    z.object({
      id: z.string().uuid(),
      member_id: z.string().uuid().optional(),
      member_name: z.string().nullable().optional(),
      diet_plan_id: z.string().uuid(),
      diet_plan_name: z.string().nullable().optional(),
      rating: z.number().int(),
      comment: z.string().nullable().optional(),
      created_at: z.string(),
    }),
  ).default([]),
  gym_feedback: z.array(
    z.object({
      id: z.string().uuid(),
      member_id: z.string().uuid().optional(),
      member_name: z.string().nullable().optional(),
      category: z.string(),
      rating: z.number().int(),
      comment: z.string().nullable().optional(),
      created_at: z.string(),
    }),
  ).default([]),
});

export const mobileCheckInLookupResultSchema = z.object({
  query: z.string(),
  items: z.array(mobileStaffMemberSummarySchema),
});

export const mobileCheckInResultSchema = z.object({
  member_id: z.string().uuid(),
  member_name: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  kiosk_id: z.string().nullable().optional(),
  scan_time: z.string().nullable().optional(),
});

export const mobileStaffTransactionSummarySchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  amount: z.number(),
  category: z.string(),
  payment_method: z.string(),
  description: z.string(),
  member_name: z.string().nullable().optional(),
  receipt_url: z.string().optional(),
  receipt_print_url: z.string().optional(),
  receipt_export_url: z.string().optional(),
  receipt_export_pdf_url: z.string().optional(),
});

export const mobilePosCheckoutSchema = z.object({
  transaction_id: z.string().uuid(),
  date: z.string(),
  total: z.number(),
  payment_method: z.string(),
  member_name: z.string().nullable().optional(),
  line_items: z.array(
    z.object({
      product_id: z.string().uuid().nullable().optional(),
      product_name: z.string(),
      unit_price: z.number(),
      quantity: z.number().int(),
      line_total: z.number(),
    }),
  ),
  remaining_stock: z.array(
    z.object({
      product_id: z.string().uuid(),
      product_name: z.string(),
      remaining_stock: z.number().int(),
    }),
  ),
  receipt_url: z.string(),
  receipt_print_url: z.string(),
  receipt_export_url: z.string(),
  receipt_export_pdf_url: z.string(),
});

export const mobilePosSummarySchema = z.object({
  today_sales_total: z.number(),
  today_sales_count: z.number().int(),
  low_stock_count: z.number().int(),
  recent_transactions: z.array(mobileStaffTransactionSummarySchema),
});

const mobileWorkoutSessionSummarySchema = z.object({
  id: z.string().uuid(),
  member_id: z.string().uuid().optional(),
  member_name: z.string().nullable().optional(),
  plan_id: z.string().uuid(),
  plan_name: z.string().nullable().optional(),
  performed_at: z.string(),
  duration_minutes: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  rpe: z.number().int().nullable().optional(),
  pain_level: z.number().int().nullable().optional(),
  effort_feedback: z.string().nullable().optional(),
  attachment_url: z.string().nullable().optional(),
  attachment_mime: z.string().nullable().optional(),
  attachment_size_bytes: z.number().int().nullable().optional(),
  review_status: z.string().default("UNREVIEWED"),
  reviewed_at: z.string().nullable().optional(),
  reviewed_by_user_id: z.string().uuid().nullable().optional(),
  reviewer_note: z.string().nullable().optional(),
  skipped_count: z.number().int().default(0),
  pr_count: z.number().int().default(0),
  entries: z.array(
    z.object({
      id: z.string().uuid().optional(),
      exercise_name: z.string().nullable().optional(),
      sets_completed: z.number().int(),
      reps_completed: z.number().int(),
      weight_kg: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      is_pr: z.boolean().optional(),
      skipped: z.boolean().optional(),
      set_details: z.array(z.record(z.string(), z.unknown())).default([]),
      order: z.number().int().optional(),
    }),
  ).default([]),
});

export const mobileCoachFeedbackSchema = z.object({
  stats: z.record(z.string(), z.number().int()),
  flagged_sessions: z.array(mobileWorkoutSessionSummarySchema).default([]),
  workout_feedback: z.array(
    z.object({
      id: z.string().uuid(),
      member_id: z.string().uuid().optional(),
      member_name: z.string().nullable().optional(),
      plan_id: z.string().uuid(),
      plan_name: z.string().nullable().optional(),
      date: z.string(),
      completed: z.boolean(),
      difficulty_rating: z.number().int().nullable().optional(),
      comment: z.string().nullable().optional(),
    }),
  ),
  diet_feedback: mobileStaffMemberDetailSchema.shape.diet_feedback,
  gym_feedback: mobileStaffMemberDetailSchema.shape.gym_feedback,
});

export const mobileCoachPlansSchema = z.object({
  workouts: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      description: z.string().nullable().optional(),
      status: z.string(),
      member_id: z.string().uuid().nullable().optional(),
      member_name: z.string().nullable().optional(),
      is_template: z.boolean(),
      expected_sessions_per_30d: z.number().int().nullable().optional(),
      published_at: z.string().nullable().optional(),
      archived_at: z.string().nullable().optional(),
      exercises: z.array(
        z.object({
          id: z.string().uuid(),
          section_name: z.string().nullable().optional(),
          exercise_name: z.string().nullable().optional(),
          sets: z.number().int(),
          reps: z.number().int(),
          order: z.number().int().nullable().optional(),
        }),
      ).default([]),
    }),
  ),
  diets: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      description: z.string().nullable().optional(),
      content: z.string().nullable().optional(),
      status: z.string(),
      member_id: z.string().uuid().nullable().optional(),
      member_name: z.string().nullable().optional(),
      is_template: z.boolean(),
      published_at: z.string().nullable().optional(),
      archived_at: z.string().nullable().optional(),
      content_structured: z.union([z.array(z.any()), z.record(z.string(), z.any())]).nullable().optional(),
    }),
  ),
});

export const mobileStaffHomeSchema = z.object({
  role: roleSchema,
  headline: z.string(),
  stats: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  quick_actions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      route: z.string().nullable().optional(),
    }),
  ),
  items: z.array(z.record(z.string(), z.any())),
});

export const mobileAdminMetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  tone: z.string().default("neutral"),
});

export const mobileAdminAlertSchema = z.object({
  id: z.string(),
  severity: z.string(),
  title: z.string(),
  body: z.string(),
  route: z.string().nullable().optional(),
  count: z.number().int().default(0),
});

export const mobileAdminApprovalSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  count: z.number().int().default(0),
  route: z.string().nullable().optional(),
});

export const mobileAdminActivityItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
});

export const mobileAdminHomeSchema = z.object({
  headline: z.string(),
  metrics: z.array(mobileAdminMetricSchema),
  alerts: z.array(mobileAdminAlertSchema),
  approvals: z.array(mobileAdminApprovalSchema),
  recent_activity: z.array(mobileAdminActivityItemSchema),
});

export const mobileCountMetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().int(),
});

export const mobileAdminRecentMemberSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().nullable().optional(),
  email: z.string().email(),
  phone_number: z.string().nullable().optional(),
  profile_picture_url: z.string().nullable().optional(),
});

export const mobileAdminPeopleSummarySchema = z.object({
  members: z.object({
    total: z.number().int(),
    active: z.number().int(),
    blocked_or_inactive: z.number().int(),
  }),
  staff: z.object({
    total: z.number().int(),
    by_role: z.array(mobileCountMetricSchema),
  }),
  attendance: z.object({
    staff_checked_in_today: z.number().int(),
    member_scans_today: z.number().int(),
  }),
  recent_members: z.array(mobileAdminRecentMemberSchema),
});

export const mobileAdminSupportTicketSchema = z.object({
  id: z.string().uuid(),
  subject: z.string(),
  status: z.string(),
  category: z.string(),
  customer_name: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const mobileAdminOperationsSummarySchema = z.object({
  attendance: z.object({
    checkins_today: z.number().int(),
    denied_today: z.number().int(),
  }),
  support: z.object({
    open_tickets: z.number().int(),
    lost_found_open: z.number().int(),
  }),
  inventory: z.object({
    low_stock_count: z.number().int(),
    out_of_stock_count: z.number().int(),
  }),
  notifications: z.object({
    queued_push: z.number().int(),
    failed_push: z.number().int(),
    enabled_automation_rules: z.number().int(),
  }),
  approvals: z.object({
    pending_renewals: z.number().int(),
    pending_leaves: z.number().int(),
  }),
  staff: z.object({
    attendance_rate: z.number(),
    monthly_payroll_total: z.number(),
    upcoming_leaves_count: z.number().int(),
  }),
  recent_support_tickets: z.array(mobileAdminSupportTicketSchema),
});

export const mobileAdminTransactionSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  amount: z.number(),
  type: z.string(),
  category: z.string(),
  payment_method: z.string(),
  description: z.string(),
  member_name: z.string().nullable().optional(),
});

export const mobileAdminFinanceSummarySchema = z.object({
  today: z.object({
    revenue: z.number(),
    expenses: z.number(),
    net: z.number(),
  }),
  month: z.object({
    revenue: z.number(),
    expenses: z.number(),
    net: z.number(),
  }),
  low_stock_count: z.number().int(),
  recent_transactions: z.array(mobileAdminTransactionSchema),
});

export const mobileAuditEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  actor_name: z.string().nullable().optional(),
  target_id: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
});

export const mobileAdminAuditSummarySchema = z.object({
  total_events: z.number().int(),
  action_counts: z.array(mobileCountMetricSchema),
  recent_events: z.array(mobileAuditEventSchema),
  security: z.object({
    status: z.string(),
    summary: z.string(),
  }),
});

export const mobileInventoryRiskItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  category: z.string(),
  stock_quantity: z.number().int(),
  low_stock_threshold: z.number().int(),
});

export const mobileAdminInventorySummarySchema = z.object({
  total_active_products: z.number().int(),
  low_stock_count: z.number().int(),
  out_of_stock_count: z.number().int(),
  low_stock_products: z.array(mobileInventoryRiskItemSchema),
});

export const mobileRenewalApprovalItemSchema = z.object({
  id: z.string().uuid(),
  member_id: z.string().uuid(),
  member_name: z.string().nullable().optional(),
  member_email: z.string(),
  offer_code: z.string(),
  plan_name: z.string(),
  duration_days: z.number().int(),
  status: z.string(),
  customer_note: z.string().nullable().optional(),
  requested_at: z.string().nullable().optional(),
});

export const mobileLeaveApprovalItemSchema = z.object({
  id: z.string().uuid(),
  staff_id: z.string().uuid(),
  staff_name: z.string().nullable().optional(),
  staff_email: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  leave_type: z.string(),
  status: z.string(),
  reason: z.string().nullable().optional(),
});

export const mobileAdminClassApprovalItemSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  member_id: z.string().uuid(),
  member_name: z.string().nullable().optional(),
  class_name: z.string(),
  starts_at: z.string(),
  status: z.string(),
  reserved_at: z.string().nullable().optional(),
});

export const mobileAdminApprovalsSchema = z.object({
  renewals: z.array(mobileRenewalApprovalItemSchema),
  leaves: z.array(mobileLeaveApprovalItemSchema),
  classes: z.array(mobileAdminClassApprovalItemSchema),
});

export const mobileApprovalActionResultSchema = z.object({
  status: z.string(),
  request_id: z.string().uuid(),
  subscription_id: z.string().uuid().nullable().optional(),
  transaction_id: z.string().uuid().nullable().optional(),
});

export const mobileInventoryProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  category: z.string(),
  price: z.number(),
  cost_price: z.number().nullable().optional(),
  stock_quantity: z.number().int(),
  low_stock_threshold: z.number().int(),
  low_stock_restock_target: z.number().int().nullable().optional(),
  low_stock_acknowledged_at: z.string().nullable().optional(),
  low_stock_snoozed_until: z.string().nullable().optional(),
  is_active: z.boolean(),
  image_url: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const mobileInventoryProductsSchema = z.object({
  items: z.array(mobileInventoryProductSchema),
});

export const mobileInventoryProductCreateSchema = z.object({
  name: z.string().min(1),
  sku: z.string().nullable().optional(),
  category: z.string(),
  price: z.number(),
  cost_price: z.number().nullable().optional(),
  stock_quantity: z.number().int(),
  low_stock_threshold: z.number().int(),
  low_stock_restock_target: z.number().int().nullable().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const mobileInventoryProductUpdateSchema = mobileInventoryProductCreateSchema.partial();

export const mobileSupportTicketStatusUpdateSchema = z.object({
  status: z.string(),
});

export const mobileAdminStaffContractSchema = z
  .object({
    type: z.string(),
    base_salary: z.number(),
    commission_rate: z.number().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    standard_hours: z.number().int().nullable().optional(),
  })
  .nullable();

export const mobileAdminStaffPayrollItemSchema = z
  .object({
    id: z.string().uuid(),
    month: z.number().int(),
    year: z.number().int(),
    base_pay: z.number(),
    overtime_pay: z.number(),
    deductions: z.number(),
    total_pay: z.number(),
    status: z.string(),
    paid_at: z.string().nullable().optional(),
  })
  .nullable();

export const mobileAdminStaffAttendanceItemSchema = z.object({
  id: z.string().uuid(),
  check_in_time: z.string().nullable().optional(),
  check_out_time: z.string().nullable().optional(),
  hours_worked: z.number(),
});

export const mobileAdminStaffLeaveItemSchema = z.object({
  id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string(),
  leave_type: z.string(),
  status: z.string(),
  reason: z.string().nullable().optional(),
});

export const mobileAdminStaffListItemSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().nullable().optional(),
  email: z.string().email(),
  phone_number: z.string().nullable().optional(),
  profile_picture_url: z.string().nullable().optional(),
  role: z.string(),
  is_active: z.boolean(),
  contract: mobileAdminStaffContractSchema,
  today_attendance: z.object({
    clocked_in: z.boolean(),
    check_in_time: z.string().nullable().optional(),
  }),
  pending_leave_requests: z.number().int(),
  latest_payroll: mobileAdminStaffPayrollItemSchema,
});

export const mobileAdminStaffListSchema = z.object({
  items: z.array(mobileAdminStaffListItemSchema),
});

export const mobileAdminStaffDetailSchema = z.object({
  staff: z.object({
    id: z.string().uuid(),
    full_name: z.string().nullable().optional(),
    email: z.string().email(),
    phone_number: z.string().nullable().optional(),
    profile_picture_url: z.string().nullable().optional(),
    role: z.string(),
    is_active: z.boolean(),
  }),
  contract: mobileAdminStaffContractSchema,
  attendance_summary: z.object({
    clocked_in: z.boolean(),
    today_check_in_time: z.string().nullable().optional(),
    month_days_present: z.number().int(),
    month_hours: z.number(),
  }),
  leave_summary: z.object({
    total_recent: z.number().int(),
    pending: z.number().int(),
    approved: z.number().int(),
    denied: z.number().int(),
  }),
  payroll_summary: mobileAdminStaffPayrollItemSchema,
  recent_attendance: z.array(mobileAdminStaffAttendanceItemSchema),
  recent_leaves: z.array(mobileAdminStaffLeaveItemSchema),
  recent_payrolls: z.array(mobileAdminStaffPayrollItemSchema.unwrap()),
});

export const mobileDeviceRegistrationSchema = z.object({
  device_token: z.string(),
  platform: z.string(),
  device_name: z.string().nullable().optional(),
  registered: z.boolean(),
});

export const mobileRenewalRequestSchema = z.object({
  id: z.string().uuid(),
  offer_code: z.string(),
  plan_name: z.string(),
  duration_days: z.number().int(),
  status: z.string(),
  customer_note: z.string().nullable().optional(),
  requested_at: z.string(),
  reviewed_at: z.string().nullable().optional(),
  reviewer_note: z.string().nullable().optional(),
  payment_method: z.literal("CASH"),
  payment_status: z.string(),
});

export const mobileRenewalRequestListSchema = z.object({
  items: z.array(mobileRenewalRequestSchema),
});

export type Capability = z.infer<typeof capabilitySchema>;
export type EnabledModule = z.infer<typeof enabledModuleSchema>;
export type SubscriptionSnapshot = z.infer<typeof subscriptionSnapshotSchema>;
export type GymBranding = z.infer<typeof gymBrandingSchema>;
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;
export type MobileBootstrap = z.infer<typeof mobileBootstrapSchema>;
export type MobileReceiptSummary = z.infer<typeof mobileReceiptSummarySchema>;
export type MobileCustomerHome = z.infer<typeof mobileCustomerHomeSchema>;
export type MobileCustomerBilling = z.infer<typeof mobileCustomerBillingSchema>;
export type MobileCustomerPlans = z.infer<typeof mobileCustomerPlansSchema>;
export type MobileCustomerProgress = z.infer<typeof mobileCustomerProgressSchema>;
export type MobileCustomerNotifications = z.infer<typeof mobileCustomerNotificationsSchema>;
export type MobileStaffMemberSummary = z.infer<typeof mobileStaffMemberSummarySchema>;
export type MobileStaffMemberRegistrationRequest = z.infer<typeof mobileStaffMemberRegistrationRequestSchema>;
export type MobileStaffMemberRegistrationResult = z.infer<typeof mobileStaffMemberRegistrationResultSchema>;
export type MobileStaffMemberDetail = z.infer<typeof mobileStaffMemberDetailSchema>;
export type MobileCheckInLookupResult = z.infer<typeof mobileCheckInLookupResultSchema>;
export type MobileCheckInResult = z.infer<typeof mobileCheckInResultSchema>;
export type MobileStaffTransactionSummary = z.infer<typeof mobileStaffTransactionSummarySchema>;
export type MobilePosSummary = z.infer<typeof mobilePosSummarySchema>;
export type MobilePosCheckout = z.infer<typeof mobilePosCheckoutSchema>;
export type MobileCoachFeedback = z.infer<typeof mobileCoachFeedbackSchema>;
export type MobileCoachPlans = z.infer<typeof mobileCoachPlansSchema>;
export type MobileStaffHome = z.infer<typeof mobileStaffHomeSchema>;
export type MobileAdminMetric = z.infer<typeof mobileAdminMetricSchema>;
export type MobileAlertItem = z.infer<typeof mobileAdminAlertSchema>;
export type MobileApprovalItem = z.infer<typeof mobileAdminApprovalSchema>;
export type MobileRecentActivityItem = z.infer<typeof mobileAdminActivityItemSchema>;
export type MobileCountMetric = z.infer<typeof mobileCountMetricSchema>;
export type MobileAdminHome = z.infer<typeof mobileAdminHomeSchema>;
export type MobileAdminPeopleSummary = z.infer<typeof mobileAdminPeopleSummarySchema>;
export type MobileAdminOperationsSummary = z.infer<typeof mobileAdminOperationsSummarySchema>;
export type MobileAdminFinanceSummary = z.infer<typeof mobileAdminFinanceSummarySchema>;
export type MobileAuditEvent = z.infer<typeof mobileAuditEventSchema>;
export type MobileAdminAuditSummary = z.infer<typeof mobileAdminAuditSummarySchema>;
export type MobileInventoryRiskItem = z.infer<typeof mobileInventoryRiskItemSchema>;
export type MobileAdminInventorySummary = z.infer<typeof mobileAdminInventorySummarySchema>;
export type MobileRenewalApprovalItem = z.infer<typeof mobileRenewalApprovalItemSchema>;
export type MobileLeaveApprovalItem = z.infer<typeof mobileLeaveApprovalItemSchema>;
export type MobileAdminClassApprovalItem = z.infer<typeof mobileAdminClassApprovalItemSchema>;
export type MobileAdminApprovals = z.infer<typeof mobileAdminApprovalsSchema>;
export type MobileApprovalActionResult = z.infer<typeof mobileApprovalActionResultSchema>;
export type MobileInventoryProduct = z.infer<typeof mobileInventoryProductSchema>;
export type MobileInventoryProducts = z.infer<typeof mobileInventoryProductsSchema>;
export type MobileInventoryProductCreate = z.infer<typeof mobileInventoryProductCreateSchema>;
export type MobileInventoryProductUpdate = z.infer<typeof mobileInventoryProductUpdateSchema>;
export type MobileSupportTicketStatusUpdate = z.infer<typeof mobileSupportTicketStatusUpdateSchema>;
export type MobileAdminStaffList = z.infer<typeof mobileAdminStaffListSchema>;
export type MobileAdminStaffListItem = z.infer<typeof mobileAdminStaffListItemSchema>;
export type MobileAdminStaffDetail = z.infer<typeof mobileAdminStaffDetailSchema>;
export type MobileAdminStaffAttendanceItem = z.infer<typeof mobileAdminStaffAttendanceItemSchema>;
export type MobileAdminStaffLeaveItem = z.infer<typeof mobileAdminStaffLeaveItemSchema>;
export type MobileAdminStaffPayrollItem = z.infer<typeof mobileAdminStaffPayrollItemSchema>;
export type MobileDeviceRegistration = z.infer<typeof mobileDeviceRegistrationSchema>;
export type MobileRenewalRequest = z.infer<typeof mobileRenewalRequestSchema>;
export type MobileRenewalRequestList = z.infer<typeof mobileRenewalRequestListSchema>;

export function parseMobileBootstrap(input: unknown): MobileBootstrap {
  return mobileBootstrapSchema.parse(input);
}

export function parseMobileCustomerHome(input: unknown): MobileCustomerHome {
  return mobileCustomerHomeSchema.parse(input);
}

export function parseMobileCustomerBilling(input: unknown): MobileCustomerBilling {
  return mobileCustomerBillingSchema.parse(input);
}

export function parseMobileCustomerPlans(input: unknown): MobileCustomerPlans {
  return mobileCustomerPlansSchema.parse(input);
}

export function parseMobileCustomerProgress(input: unknown): MobileCustomerProgress {
  return mobileCustomerProgressSchema.parse(input);
}

export function parseMobileCustomerNotifications(input: unknown): MobileCustomerNotifications {
  return mobileCustomerNotificationsSchema.parse(input);
}

export function parseMobileStaffMemberSummary(input: unknown): MobileStaffMemberSummary {
  return mobileStaffMemberSummarySchema.parse(input);
}

export function parseMobileStaffMemberRegistrationResult(input: unknown): MobileStaffMemberRegistrationResult {
  return mobileStaffMemberRegistrationResultSchema.parse(input);
}

export function parseMobileStaffMemberDetail(input: unknown): MobileStaffMemberDetail {
  return mobileStaffMemberDetailSchema.parse(input);
}

export function parseMobileCheckInLookupResult(input: unknown): MobileCheckInLookupResult {
  return mobileCheckInLookupResultSchema.parse(input);
}

export function parseMobileCheckInResult(input: unknown): MobileCheckInResult {
  return mobileCheckInResultSchema.parse(input);
}

export function parseMobileCoachFeedback(input: unknown): MobileCoachFeedback {
  return mobileCoachFeedbackSchema.parse(input);
}

export function parseMobileCoachPlans(input: unknown): MobileCoachPlans {
  return mobileCoachPlansSchema.parse(input);
}

export function parseMobileStaffTransactionSummary(input: unknown): MobileStaffTransactionSummary {
  return mobileStaffTransactionSummarySchema.parse(input);
}

export function parseMobilePosSummary(input: unknown): MobilePosSummary {
  return mobilePosSummarySchema.parse(input);
}

export function parseMobilePosCheckout(input: unknown): MobilePosCheckout {
  return mobilePosCheckoutSchema.parse(input);
}

export function parseMobileStaffHome(input: unknown): MobileStaffHome {
  return mobileStaffHomeSchema.parse(input);
}

export function parseMobileAdminHome(input: unknown): MobileAdminHome {
  return mobileAdminHomeSchema.parse(input);
}

export function parseMobileAdminPeopleSummary(input: unknown): MobileAdminPeopleSummary {
  return mobileAdminPeopleSummarySchema.parse(input);
}

export function parseMobileAdminOperationsSummary(input: unknown): MobileAdminOperationsSummary {
  return mobileAdminOperationsSummarySchema.parse(input);
}

export function parseMobileAdminFinanceSummary(input: unknown): MobileAdminFinanceSummary {
  return mobileAdminFinanceSummarySchema.parse(input);
}

export function parseMobileAdminAuditSummary(input: unknown): MobileAdminAuditSummary {
  return mobileAdminAuditSummarySchema.parse(input);
}

export function parseMobileAdminInventorySummary(input: unknown): MobileAdminInventorySummary {
  return mobileAdminInventorySummarySchema.parse(input);
}

export function parseMobileAdminApprovals(input: unknown): MobileAdminApprovals {
  return mobileAdminApprovalsSchema.parse(input);
}

export function parseMobileApprovalActionResult(input: unknown): MobileApprovalActionResult {
  return mobileApprovalActionResultSchema.parse(input);
}

export function parseMobileInventoryProduct(input: unknown): MobileInventoryProduct {
  return mobileInventoryProductSchema.parse(input);
}

export function parseMobileInventoryProducts(input: unknown): MobileInventoryProducts {
  return mobileInventoryProductsSchema.parse(input);
}

export function parseMobileSupportTicketStatusUpdate(input: unknown): MobileSupportTicketStatusUpdate {
  return mobileSupportTicketStatusUpdateSchema.parse(input);
}

export function parseMobileAdminStaffList(input: unknown): MobileAdminStaffList {
  return mobileAdminStaffListSchema.parse(input);
}

export function parseMobileAdminStaffDetail(input: unknown): MobileAdminStaffDetail {
  return mobileAdminStaffDetailSchema.parse(input);
}

export function parseMobileDeviceRegistration(input: unknown): MobileDeviceRegistration {
  return mobileDeviceRegistrationSchema.parse(input);
}

export function parseMobileRenewalRequest(input: unknown): MobileRenewalRequest {
  return mobileRenewalRequestSchema.parse(input);
}

export function parseMobileRenewalRequestList(input: unknown): MobileRenewalRequestList {
  return mobileRenewalRequestListSchema.parse(input);
}
