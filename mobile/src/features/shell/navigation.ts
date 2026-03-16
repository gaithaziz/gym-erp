import type { Role } from "@gym-erp/contracts";
import type { TranslationKey } from "@gym-erp/i18n";

export type MobileDrawerSectionKey = "operations" | "people" | "finance" | "coaching" | "account";
export type MobileDrawerRoute = "/" | "/qr" | "/profile" | "/subscription";
export type MobileDrawerIconName =
  | "LayoutDashboard"
  | "Package"
  | "ShoppingCart"
  | "MessageSquare"
  | "QrCode"
  | "LifeBuoy"
  | "ShieldAlert"
  | "UserCheck"
  | "Users"
  | "ClipboardList"
  | "Wallet"
  | "Dumbbell"
  | "Utensils"
  | "Activity"
  | "Trophy";

export type MobileDrawerSection = {
  key: MobileDrawerSectionKey;
  labelKey: TranslationKey;
};

export type MobileDrawerItem = {
  webHref: string;
  mobileRoute: MobileDrawerRoute | null;
  labelKey: TranslationKey;
  icon: MobileDrawerIconName;
  roles: Role[];
  section: MobileDrawerSectionKey;
};

const blockedAllowedWebHrefs = [
  "/dashboard/subscription",
  "/dashboard/blocked",
  "/dashboard/support",
  "/dashboard/lost-found",
] as const;

export const mobileDrawerSections: MobileDrawerSection[] = [
  { key: "operations", labelKey: "dashboard.sections.operations" },
  { key: "people", labelKey: "dashboard.sections.people" },
  { key: "finance", labelKey: "dashboard.sections.finance" },
  { key: "coaching", labelKey: "dashboard.sections.coaching" },
  { key: "account", labelKey: "dashboard.sections.account" },
];

export const mobileDrawerItems: MobileDrawerItem[] = [
  {
    webHref: "/dashboard",
    mobileRoute: "/",
    labelKey: "dashboard.nav.dashboard",
    icon: "LayoutDashboard",
    roles: ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"],
    section: "operations",
  },
  {
    webHref: "/dashboard/admin/inventory",
    mobileRoute: null,
    labelKey: "dashboard.nav.inventory",
    icon: "Package",
    roles: ["ADMIN"],
    section: "operations",
  },
  {
    webHref: "/dashboard/admin/pos",
    mobileRoute: null,
    labelKey: "dashboard.nav.cashierPos",
    icon: "ShoppingCart",
    roles: ["ADMIN", "CASHIER", "EMPLOYEE"],
    section: "operations",
  },
  {
    webHref: "/dashboard/admin/notifications",
    mobileRoute: null,
    labelKey: "dashboard.nav.whatsappAutomation",
    icon: "MessageSquare",
    roles: ["ADMIN", "RECEPTION", "FRONT_DESK"],
    section: "operations",
  },
  {
    webHref: "/dashboard/admin/entrance-qr",
    mobileRoute: null,
    labelKey: "dashboard.nav.entranceQr",
    icon: "QrCode",
    roles: ["ADMIN"],
    section: "operations",
  },
  {
    webHref: "/dashboard/admin/support",
    mobileRoute: null,
    labelKey: "dashboard.nav.supportDesk",
    icon: "LifeBuoy",
    roles: ["ADMIN", "RECEPTION"],
    section: "operations",
  },
  {
    webHref: "/dashboard/lost-found",
    mobileRoute: null,
    labelKey: "dashboard.nav.lostFound",
    icon: "MessageSquare",
    roles: ["ADMIN", "MANAGER", "FRONT_DESK", "RECEPTION", "COACH", "EMPLOYEE", "CASHIER", "CUSTOMER"],
    section: "operations",
  },
  {
    webHref: "/dashboard/admin/audit",
    mobileRoute: null,
    labelKey: "dashboard.nav.auditLogs",
    icon: "ShieldAlert",
    roles: ["ADMIN"],
    section: "operations",
  },
  {
    webHref: "/dashboard/admin/members",
    mobileRoute: null,
    labelKey: "dashboard.nav.receptionRegistration",
    icon: "UserCheck",
    roles: ["ADMIN", "COACH", "RECEPTION", "FRONT_DESK"],
    section: "people",
  },
  {
    webHref: "/dashboard/admin/staff",
    mobileRoute: null,
    labelKey: "dashboard.nav.staff",
    icon: "Users",
    roles: ["ADMIN"],
    section: "people",
  },
  {
    webHref: "/dashboard/admin/staff/attendance",
    mobileRoute: null,
    labelKey: "dashboard.nav.attendance",
    icon: "ClipboardList",
    roles: ["ADMIN"],
    section: "people",
  },
  {
    webHref: "/dashboard/admin/leaves",
    mobileRoute: null,
    labelKey: "dashboard.nav.hrLeaves",
    icon: "ClipboardList",
    roles: ["ADMIN"],
    section: "people",
  },
  {
    webHref: "/dashboard/admin/finance",
    mobileRoute: null,
    labelKey: "dashboard.nav.financials",
    icon: "Wallet",
    roles: ["ADMIN"],
    section: "finance",
  },
  {
    webHref: "/dashboard/coach/plans",
    mobileRoute: null,
    labelKey: "dashboard.nav.workoutPlans",
    icon: "Dumbbell",
    roles: ["ADMIN", "COACH"],
    section: "coaching",
  },
  {
    webHref: "/dashboard/coach/diets",
    mobileRoute: null,
    labelKey: "dashboard.nav.dietPlans",
    icon: "Utensils",
    roles: ["ADMIN", "COACH"],
    section: "coaching",
  },
  {
    webHref: "/dashboard/coach/library",
    mobileRoute: null,
    labelKey: "dashboard.nav.workoutDietLibrary",
    icon: "Users",
    roles: ["ADMIN", "COACH"],
    section: "coaching",
  },
  {
    webHref: "/dashboard/coach/feedback",
    mobileRoute: null,
    labelKey: "dashboard.nav.feedback",
    icon: "MessageSquare",
    roles: ["ADMIN", "COACH"],
    section: "coaching",
  },
  {
    webHref: "/dashboard/qr",
    mobileRoute: "/qr",
    labelKey: "dashboard.nav.myQrCode",
    icon: "QrCode",
    roles: ["CUSTOMER", "COACH", "ADMIN", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"],
    section: "account",
  },
  {
    webHref: "/dashboard/leaves",
    mobileRoute: null,
    labelKey: "dashboard.nav.myLeaves",
    icon: "ClipboardList",
    roles: ["ADMIN", "COACH", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"],
    section: "account",
  },
  {
    webHref: "/dashboard/profile",
    mobileRoute: "/profile",
    labelKey: "dashboard.nav.myProfile",
    icon: "UserCheck",
    roles: ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"],
    section: "account",
  },
  {
    webHref: "/dashboard/member/progress",
    mobileRoute: null,
    labelKey: "dashboard.nav.myProgress",
    icon: "Activity",
    roles: ["CUSTOMER"],
    section: "account",
  },
  {
    webHref: "/dashboard/member/plans",
    mobileRoute: null,
    labelKey: "dashboard.nav.myWorkoutPlans",
    icon: "Dumbbell",
    roles: ["CUSTOMER"],
    section: "account",
  },
  {
    webHref: "/dashboard/member/diets",
    mobileRoute: null,
    labelKey: "dashboard.nav.myDietPlans",
    icon: "Utensils",
    roles: ["CUSTOMER"],
    section: "account",
  },
  {
    webHref: "/dashboard/member/feedback",
    mobileRoute: null,
    labelKey: "dashboard.nav.myFeedback",
    icon: "MessageSquare",
    roles: ["CUSTOMER"],
    section: "account",
  },
  {
    webHref: "/dashboard/member/history",
    mobileRoute: null,
    labelKey: "dashboard.nav.history",
    icon: "ClipboardList",
    roles: ["CUSTOMER"],
    section: "account",
  },
  {
    webHref: "/dashboard/member/achievements",
    mobileRoute: null,
    labelKey: "dashboard.nav.achievements",
    icon: "Trophy",
    roles: ["CUSTOMER"],
    section: "account",
  },
  {
    webHref: "/dashboard/subscription",
    mobileRoute: "/subscription",
    labelKey: "dashboard.nav.subscription",
    icon: "ShieldAlert",
    roles: ["CUSTOMER"],
    section: "account",
  },
  {
    webHref: "/dashboard/support",
    mobileRoute: null,
    labelKey: "dashboard.nav.support",
    icon: "MessageSquare",
    roles: ["CUSTOMER"],
    section: "account",
  },
];

export function getMobileDrawerItems(role: Role | null | undefined, blockedCustomer: boolean) {
  if (!role) {
    return [];
  }

  return mobileDrawerItems.filter((item) => {
    if (!item.roles.includes(role)) {
      return false;
    }

    if (!blockedCustomer) {
      return true;
    }

    return blockedAllowedWebHrefs.some((allowedHref) => item.webHref.startsWith(allowedHref));
  });
}
