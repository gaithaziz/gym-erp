import {
  parseAuthUser,
  parseMobileBootstrap,
  parseMobileCustomerBilling,
  parseMobileCustomerHome,
  parseMobileCustomerNotifications,
  parseMobileCustomerPlans,
  parseMobileCustomerProgress,
  parseTokenPair,
  type AuthUser,
  type MobileBootstrap,
  type MobileCustomerBilling,
  type MobileCustomerHome,
  type MobileCustomerNotifications,
  type MobileCustomerPlans,
  type MobileCustomerProgress,
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

