/**
 * mobile-role.test.ts — Navigation capability snapshot tests.
 *
 * Verifies that capability/module gating returns the expected result for each
 * major role so navigation regressions are caught early.
 *
 * These tests use fabricated MobileBootstrap objects that match the shape
 * returned by parseMobileBootstrap. Keeping the shape explicit here is
 * intentional — it documents the exact contract the navigation layer depends on.
 */
import { describe, expect, it } from "vitest";

import { getCurrentRole, hasCapability, hasModule, isAdminControlRole, isCustomerRole, isStaffRole } from "./mobile-role";
import type { MobileBootstrap } from "@gym-erp/contracts";

// ─── Fixture helpers ───────────────────────────────────────────────────────

function makeBootstrap(override: Partial<MobileBootstrap>): MobileBootstrap {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "test@example.com",
      gym_id: "00000000-0000-4000-8000-000000000010",
      full_name: "Test User",
      phone_number: null,
      profile_picture_url: null,
      role: "CUSTOMER",
      date_of_birth: null,
      emergency_contact: null,
      bio: null,
      subscription_status: "ACTIVE",
      subscription_end_date: null,
      subscription_plan_name: "Monthly",
      is_subscription_blocked: false,
      block_reason: null,
      is_impersonated: false,
    },
    role: "CUSTOMER",
    subscription: {
      status: "ACTIVE",
      end_date: null,
      plan_name: "Monthly",
      is_blocked: false,
      block_reason: null,
    },
    gym: {
      gym_name: "Demo Gym",
      logo_url: null,
      primary_color: "#208AEF",
      secondary_color: "#F97316",
      support_email: null,
      support_phone: null,
    },
    home_branch: null,
    accessible_branches: [],
    capabilities: [],
    enabled_modules: [],
    notification_settings: {
      push_enabled: true,
      chat_enabled: true,
      support_enabled: true,
      billing_enabled: true,
      announcements_enabled: true,
    },
    ...override,
  };
}

const CUSTOMER_BOOTSTRAP = makeBootstrap({
  role: "CUSTOMER",
  capabilities: ["scan_gym_qr", "renew_subscription", "view_receipts", "view_profile", "view_notifications", "view_support"],
  enabled_modules: ["home", "qr", "plans", "progress", "notifications", "profile"],
});

const ADMIN_BOOTSTRAP = makeBootstrap({
  role: "ADMIN",
  capabilities: [
    "lookup_members",
    "manage_member_plans",
    "view_finance_summary",
    "manage_inventory",
    "handle_support_queue",
    "view_audit_summary",
    "view_profile",
    "view_notifications",
  ],
  enabled_modules: ["home", "members", "finance", "operations", "notifications", "profile", "audit"],
});

const COACH_BOOTSTRAP = makeBootstrap({
  role: "COACH",
  capabilities: ["lookup_members", "manage_member_plans", "manage_member_diets", "view_profile", "view_chat", "view_notifications"],
  enabled_modules: ["home", "qr", "members", "plans", "notifications", "profile"],
});

const RECEPTION_BOOTSTRAP = makeBootstrap({
  role: "RECEPTION",
  capabilities: ["scan_member_qr", "lookup_members", "handle_support_queue", "view_profile", "view_notifications"],
  enabled_modules: ["home", "qr", "members", "support", "notifications", "profile"],
});

const CASHIER_BOOTSTRAP = makeBootstrap({
  role: "CASHIER",
  capabilities: ["use_pos", "view_finance_summary", "view_profile", "view_notifications"],
  enabled_modules: ["home", "finance", "operations", "notifications", "profile"],
});

// ─── Role classification ────────────────────────────────────────────────────

describe("role classification", () => {
  it("identifies customer role", () => {
    expect(isCustomerRole(getCurrentRole(CUSTOMER_BOOTSTRAP))).toBe(true);
    expect(isCustomerRole(getCurrentRole(ADMIN_BOOTSTRAP))).toBe(false);
  });

  it("identifies admin control roles", () => {
    expect(isAdminControlRole("ADMIN")).toBe(true);
    expect(isAdminControlRole("MANAGER")).toBe(true);
    expect(isAdminControlRole("COACH")).toBe(false);
    expect(isAdminControlRole("CUSTOMER")).toBe(false);
  });

  it("identifies staff roles", () => {
    expect(isStaffRole("COACH")).toBe(true);
    expect(isStaffRole("RECEPTION")).toBe(true);
    expect(isStaffRole("CASHIER")).toBe(true);
    expect(isStaffRole("CUSTOMER")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});

// ─── Customer capability snapshot ──────────────────────────────────────────

describe("customer capability snapshot", () => {
  it("has self-serve capabilities", () => {
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "scan_gym_qr")).toBe(true);
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "renew_subscription")).toBe(true);
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "view_receipts")).toBe(true);
  });

  it("does NOT have staff capabilities", () => {
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "lookup_members")).toBe(false);
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "manage_member_plans")).toBe(false);
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "view_finance_summary")).toBe(false);
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "use_pos")).toBe(false);
    expect(hasCapability(CUSTOMER_BOOTSTRAP, "view_audit_summary")).toBe(false);
  });

  it("has correct enabled modules", () => {
    expect(hasModule(CUSTOMER_BOOTSTRAP, "home")).toBe(true);
    expect(hasModule(CUSTOMER_BOOTSTRAP, "qr")).toBe(true);
    expect(hasModule(CUSTOMER_BOOTSTRAP, "plans")).toBe(true);
    expect(hasModule(CUSTOMER_BOOTSTRAP, "progress")).toBe(true);
    expect(hasModule(CUSTOMER_BOOTSTRAP, "members")).toBe(false);
    expect(hasModule(CUSTOMER_BOOTSTRAP, "finance")).toBe(false);
    expect(hasModule(CUSTOMER_BOOTSTRAP, "operations")).toBe(false);
    expect(hasModule(CUSTOMER_BOOTSTRAP, "audit")).toBe(false);
  });
});

// ─── Admin capability snapshot ─────────────────────────────────────────────

describe("admin capability snapshot", () => {
  it("has management capabilities", () => {
    expect(hasCapability(ADMIN_BOOTSTRAP, "lookup_members")).toBe(true);
    expect(hasCapability(ADMIN_BOOTSTRAP, "view_finance_summary")).toBe(true);
    expect(hasCapability(ADMIN_BOOTSTRAP, "view_audit_summary")).toBe(true);
    expect(hasCapability(ADMIN_BOOTSTRAP, "manage_inventory")).toBe(true);
  });

  it("does NOT have customer-only capabilities", () => {
    expect(hasCapability(ADMIN_BOOTSTRAP, "scan_gym_qr")).toBe(false);
    expect(hasCapability(ADMIN_BOOTSTRAP, "renew_subscription")).toBe(false);
  });

  it("has correct enabled modules", () => {
    expect(hasModule(ADMIN_BOOTSTRAP, "home")).toBe(true);
    expect(hasModule(ADMIN_BOOTSTRAP, "members")).toBe(true);
    expect(hasModule(ADMIN_BOOTSTRAP, "finance")).toBe(true);
    expect(hasModule(ADMIN_BOOTSTRAP, "operations")).toBe(true);
    expect(hasModule(ADMIN_BOOTSTRAP, "audit")).toBe(true);
    // Not customer modules
    expect(hasModule(ADMIN_BOOTSTRAP, "progress")).toBe(false);
    expect(hasModule(ADMIN_BOOTSTRAP, "plans")).toBe(false);
  });
});

// ─── Coach capability snapshot ─────────────────────────────────────────────

describe("coach capability snapshot", () => {
  it("has member plan management capabilities", () => {
    expect(hasCapability(COACH_BOOTSTRAP, "manage_member_plans")).toBe(true);
    expect(hasCapability(COACH_BOOTSTRAP, "manage_member_diets")).toBe(true);
    expect(hasCapability(COACH_BOOTSTRAP, "lookup_members")).toBe(true);
  });

  it("does NOT have financial or POS capabilities", () => {
    expect(hasCapability(COACH_BOOTSTRAP, "view_finance_summary")).toBe(false);
    expect(hasCapability(COACH_BOOTSTRAP, "use_pos")).toBe(false);
    expect(hasCapability(COACH_BOOTSTRAP, "view_audit_summary")).toBe(false);
  });

  it("has correct enabled modules", () => {
    expect(hasModule(COACH_BOOTSTRAP, "home")).toBe(true);
    expect(hasModule(COACH_BOOTSTRAP, "members")).toBe(true);
    expect(hasModule(COACH_BOOTSTRAP, "plans")).toBe(true);
    expect(hasModule(COACH_BOOTSTRAP, "qr")).toBe(true);
    expect(hasModule(COACH_BOOTSTRAP, "progress")).toBe(false);
    expect(hasModule(COACH_BOOTSTRAP, "finance")).toBe(false);
  });
});

// ─── Reception capability snapshot ─────────────────────────────────────────

describe("reception capability snapshot", () => {
  it("has check-in capabilities", () => {
    expect(hasCapability(RECEPTION_BOOTSTRAP, "scan_member_qr")).toBe(true);
    expect(hasCapability(RECEPTION_BOOTSTRAP, "lookup_members")).toBe(true);
    expect(hasCapability(RECEPTION_BOOTSTRAP, "handle_support_queue")).toBe(true);
  });

  it("does NOT have finance or diet capabilities", () => {
    expect(hasCapability(RECEPTION_BOOTSTRAP, "view_finance_summary")).toBe(false);
    expect(hasCapability(RECEPTION_BOOTSTRAP, "manage_member_diets")).toBe(false);
  });
});

// ─── Cashier capability snapshot ───────────────────────────────────────────

describe("cashier capability snapshot", () => {
  it("has POS and finance capabilities", () => {
    expect(hasCapability(CASHIER_BOOTSTRAP, "use_pos")).toBe(true);
    expect(hasCapability(CASHIER_BOOTSTRAP, "view_finance_summary")).toBe(true);
  });

  it("does NOT have member management capabilities", () => {
    expect(hasCapability(CASHIER_BOOTSTRAP, "lookup_members")).toBe(false);
    expect(hasCapability(CASHIER_BOOTSTRAP, "manage_member_plans")).toBe(false);
    expect(hasCapability(CASHIER_BOOTSTRAP, "view_audit_summary")).toBe(false);
  });

  it("has correct enabled modules", () => {
    expect(hasModule(CASHIER_BOOTSTRAP, "finance")).toBe(true);
    expect(hasModule(CASHIER_BOOTSTRAP, "operations")).toBe(true);
    expect(hasModule(CASHIER_BOOTSTRAP, "members")).toBe(false);
    expect(hasModule(CASHIER_BOOTSTRAP, "progress")).toBe(false);
  });
});

// ─── Null/empty bootstrap ─────────────────────────────────────────────────

describe("null bootstrap safety", () => {
  it("returns safe defaults for null bootstrap", () => {
    expect(getCurrentRole(null)).toBeNull();
    expect(hasCapability(null, "scan_gym_qr")).toBe(false);
    expect(hasModule(null, "home")).toBe(false);
    expect(isCustomerRole(null)).toBe(false);
    expect(isAdminControlRole(null)).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});
