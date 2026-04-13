import {
  parseAuthUser,
  parseMobileBootstrap,
  parseMobileCheckInLookupResult,
  parseMobileCheckInResult,
  parseMobileCoachFeedback,
  parseMobileCoachPlans,
  parseMobileCustomerBilling,
  parseMobileCustomerHome,
  parseMobileCustomerNotifications,
  parseMobileCustomerPlans,
  parseMobileCustomerProgress,
  parseMobilePosSummary,
  parseMobileStaffHome,
  parseMobileStaffMemberDetail,
  parseMobileStaffMemberRegistrationResult,
  parseTokenPair,
  type AuthUser,
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
  type MobilePosSummary,
  type MobileStaffHome,
  type MobileStaffMemberDetail,
  type MobileStaffMemberRegistrationResult,
  type TokenPair,
} from "@gym-erp/contracts";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";

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
