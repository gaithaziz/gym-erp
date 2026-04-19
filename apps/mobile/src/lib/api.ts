import {
  parseAuthUser,
  parseMobileBootstrap,
  parseMobileCheckInLookupResult,
  parseMobileCheckInResult,
  parseMobileCoachFeedback,
  parseMobileCoachPlans,
  parseMobileAdminAuditSummary,
  parseMobileAdminApprovals,
  parseMobileAdminFinanceSummary,
  parseMobileAdminHome,
  parseMobileAdminInventorySummary,
  parseMobileAdminOperationsSummary,
  parseMobileAdminPeopleSummary,
  parseMobileAdminStaffDetail,
  parseMobileAdminStaffList,
  parseMobileApprovalActionResult,
  parseMobileCustomerBilling,
  parseMobileCustomerHome,
  parseMobileCustomerNotifications,
  parseMobileCustomerPlans,
  parseMobileCustomerProgress,
  parseMobileInventoryProduct,
  parseMobileInventoryProducts,
  parseMobilePosCheckout,
  parseMobilePosSummary,
  parseMobileStaffHome,
  parseMobileStaffMemberDetail,
  parseMobileStaffMemberRegistrationResult,
  parseTokenPair,
  type AuthUser,
  type MobileAdminAuditSummary,
  type MobileAdminApprovals,
  type MobileAdminFinanceSummary,
  type MobileAdminHome,
  type MobileAdminInventorySummary,
  type MobileAdminOperationsSummary,
  type MobileAdminPeopleSummary,
  type MobileAdminStaffDetail,
  type MobileAdminStaffList,
  type MobileApprovalActionResult,
  type MobileBootstrap,
  type MobileCheckInLookupResult,
  type MobileCheckInResult,
  type MobileCoachFeedback,
  type MobileCoachPlans,
  type MobileCustomerBilling,
  type MobileCustomerHome,
  type MobileCustomerNotifications,
  type MobileCustomerPlans,
  type MobileCustomerProgress,
  type MobileInventoryProduct,
  type MobileInventoryProducts,
  type MobilePosSummary,
  type MobilePosCheckout,
  type MobileStaffHome,
  type MobileStaffMemberDetail,
  type MobileStaffMemberRegistrationResult,
  type TokenPair,
} from "@gym-erp/contracts";
import { Platform } from "react-native";

const LOCALHOST_API_BASE_URL = "http://localhost:8000/api/v1";
const ANDROID_EMULATOR_API_BASE_URL = "http://10.0.2.2:8000/api/v1";
const DEFAULT_API_BASE_URL = Platform.OS === "android" ? ANDROID_EMULATOR_API_BASE_URL : LOCALHOST_API_BASE_URL;

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

export type Envelope<T> = {
  data: T;
  message?: string | null;
  success: boolean;
};

export type MobileFeedbackHistory = {
  workout_feedback: Array<{
    id: string;
    plan_id: string;
    plan_name: string;
    date: string;
    completed: boolean;
    difficulty_rating?: number | null;
    comment?: string | null;
  }>;
  diet_feedback: Array<{
    id: string;
    diet_plan_id: string;
    diet_plan_name?: string | null;
    coach_id?: string | null;
    rating: number;
    comment?: string | null;
    created_at: string;
  }>;
  gym_feedback: Array<{
    id: string;
    category: string;
    rating: number;
    comment?: string | null;
    created_at: string;
  }>;
};

export type NotificationSettings = {
  push_enabled: boolean;
  chat_enabled: boolean;
  support_enabled: boolean;
  billing_enabled: boolean;
  announcements_enabled: boolean;
};

export type MobileProfile = AuthUser;

export type MobileGamificationStats = {
  total_visits: number;
  streak: {
    current_streak: number;
    best_streak: number;
    last_visit_date?: string | null;
  };
  weekly_progress?: {
    current: number;
    goal: number;
  };
  badges: Array<{
    id: string;
    badge_type: string;
    badge_name: string;
    badge_description?: string | null;
    earned_at?: string | null;
  }>;
};

export type AccessScanResult = {
  status: string;
  user_name: string;
  reason?: string | null;
  kiosk_id?: string | null;
  scan_time?: string | null;
};

export function parseEnvelope<T>(input: unknown): Envelope<T> {
  const payload = input as Envelope<T>;
  if (!payload || typeof payload !== "object" || !("success" in payload)) {
    throw new Error("Invalid API response");
  }
  return payload;
}

export function parseLoginEnvelope(input: unknown): Envelope<TokenPair> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseTokenPair(payload.data),
  };
}

export function parseBootstrapEnvelope(input: unknown): Envelope<MobileBootstrap> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileBootstrap(payload.data),
  };
}

export function parseHomeEnvelope(input: unknown): Envelope<MobileCustomerHome> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCustomerHome(payload.data),
  };
}

export function parseBillingEnvelope(input: unknown): Envelope<MobileCustomerBilling> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCustomerBilling(payload.data),
  };
}

export function parsePlansEnvelope(input: unknown): Envelope<MobileCustomerPlans> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCustomerPlans(payload.data),
  };
}

export function parseProgressEnvelope(input: unknown): Envelope<MobileCustomerProgress> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCustomerProgress(payload.data),
  };
}

export function parseNotificationsEnvelope(input: unknown): Envelope<MobileCustomerNotifications> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCustomerNotifications(payload.data),
  };
}

export function parseProfileEnvelope(input: unknown): Envelope<MobileProfile> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseAuthUser(payload.data),
  };
}

export function parseStaffHomeEnvelope(input: unknown): Envelope<MobileStaffHome> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileStaffHome(payload.data),
  };
}

export function parseAdminHomeEnvelope(input: unknown): Envelope<MobileAdminHome> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminHome(payload.data),
  };
}

export function parseAdminPeopleSummaryEnvelope(input: unknown): Envelope<MobileAdminPeopleSummary> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminPeopleSummary(payload.data),
  };
}

export function parseAdminStaffListEnvelope(input: unknown): Envelope<MobileAdminStaffList> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminStaffList(payload.data),
  };
}

export function parseAdminStaffDetailEnvelope(input: unknown): Envelope<MobileAdminStaffDetail> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminStaffDetail(payload.data),
  };
}

export function parseAdminOperationsSummaryEnvelope(input: unknown): Envelope<MobileAdminOperationsSummary> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminOperationsSummary(payload.data),
  };
}

export function parseAdminFinanceSummaryEnvelope(input: unknown): Envelope<MobileAdminFinanceSummary> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminFinanceSummary(payload.data),
  };
}

export function parseAdminAuditSummaryEnvelope(input: unknown): Envelope<MobileAdminAuditSummary> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminAuditSummary(payload.data),
  };
}

export function parseAdminInventorySummaryEnvelope(input: unknown): Envelope<MobileAdminInventorySummary> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminInventorySummary(payload.data),
  };
}

export function parseAdminApprovalsEnvelope(input: unknown): Envelope<MobileAdminApprovals> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileAdminApprovals(payload.data),
  };
}

export function parseApprovalActionResultEnvelope(input: unknown): Envelope<MobileApprovalActionResult> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileApprovalActionResult(payload.data),
  };
}

export function parseInventoryProductsEnvelope(input: unknown): Envelope<MobileInventoryProducts> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileInventoryProducts(payload.data),
  };
}

export function parseInventoryProductEnvelope(input: unknown): Envelope<MobileInventoryProduct> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileInventoryProduct(payload.data),
  };
}

export function parseStaffMemberDetailEnvelope(input: unknown): Envelope<MobileStaffMemberDetail> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileStaffMemberDetail(payload.data),
  };
}

export function parseStaffMemberRegistrationEnvelope(input: unknown): Envelope<MobileStaffMemberRegistrationResult> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileStaffMemberRegistrationResult(payload.data),
  };
}

export function parseCheckInLookupEnvelope(input: unknown): Envelope<MobileCheckInLookupResult> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCheckInLookupResult(payload.data),
  };
}

export function parseCheckInResultEnvelope(input: unknown): Envelope<MobileCheckInResult> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCheckInResult(payload.data),
  };
}

export function parsePosSummaryEnvelope(input: unknown): Envelope<MobilePosSummary> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobilePosSummary(payload.data),
  };
}

export function parsePosCheckoutEnvelope(input: unknown): Envelope<MobilePosCheckout> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobilePosCheckout(payload.data),
  };
}

export function parseCoachFeedbackEnvelope(input: unknown): Envelope<MobileCoachFeedback> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCoachFeedback(payload.data),
  };
}

export function parseCoachPlansEnvelope(input: unknown): Envelope<MobileCoachPlans> {
  const payload = parseEnvelope<unknown>(input);
  return {
    ...payload,
    data: parseMobileCoachPlans(payload.data),
  };
}

// ---------------------------------------------------------------------------
// Class Scheduling Types & Helpers
// ---------------------------------------------------------------------------

export type ClassReservationStatus = "PENDING" | "RESERVED" | "WAITLISTED" | "CANCELLED" | "REJECTED" | "NO_SHOW";
export type ClassSessionStatus = "SCHEDULED" | "CANCELLED" | "COMPLETED";

export type ClassSession = {
  id: string;
  template_id: string;
  template_name: string;
  session_name: string | null;
  display_name: string;
  coach_id: string;
  coach_name: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  capacity_override: number | null;
  status: ClassSessionStatus;
  notes: string | null;
  reserved_count: number;
  pending_count: number;
  waitlist_count: number;
};

export type ClassReservation = {
  reservation_id: string;
  status: ClassReservationStatus;
  reserved_at: string;
  session: ClassSession;
};

export type ClassTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  capacity: number;
  color: string | null;
  is_active: boolean;
  created_at: string;
};

export type StaffSessionReservation = {
  id: string;
  session_id: string;
  member_id: string;
  member_name: string | null;
  status: ClassReservationStatus;
  attended: boolean;
  reserved_at: string;
  cancelled_at: string | null;
};

export function parseUpcomingClassesEnvelope(input: unknown): Envelope<ClassSession[]> {
  return parseEnvelope<ClassSession[]>(input);
}

export function parseMyReservationsEnvelope(input: unknown): Envelope<ClassReservation[]> {
  return parseEnvelope<ClassReservation[]>(input);
}

export function parseClassTemplatesEnvelope(input: unknown): Envelope<ClassTemplate[]> {
  return parseEnvelope<ClassTemplate[]>(input);
}

export function parseClassSessionsEnvelope(input: unknown): Envelope<ClassSession[]> {
  return parseEnvelope<ClassSession[]>(input);
}

export function parseSessionReservationsEnvelope(input: unknown): Envelope<StaffSessionReservation[]> {
  return parseEnvelope<StaffSessionReservation[]>(input);
}
