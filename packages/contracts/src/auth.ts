import { z } from "zod";

export const ROLE_VALUES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "FRONT_DESK",
  "RECEPTION",
  "COACH",
  "EMPLOYEE",
  "CASHIER",
  "CUSTOMER",
] as const;

export const SUBSCRIPTION_STATUS_VALUES = [
  "ACTIVE",
  "FROZEN",
  "EXPIRED",
  "NONE",
] as const;

export const SUBSCRIPTION_BLOCK_REASON_VALUES = [
  "SUBSCRIPTION_EXPIRED",
  "SUBSCRIPTION_FROZEN",
  "NO_ACTIVE_SUBSCRIPTION",
] as const;

export const roleSchema = z.enum(ROLE_VALUES);
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUS_VALUES);
export const subscriptionBlockReasonSchema = z.enum(SUBSCRIPTION_BLOCK_REASON_VALUES);

export type Role = z.infer<typeof roleSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type SubscriptionBlockReason = z.infer<typeof subscriptionBlockReasonSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().nullable().optional().default(null),
  role: roleSchema,
  gym_id: z.string().uuid(),
  home_branch_id: z.string().uuid().nullable().optional(),
  profile_picture_url: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  emergency_contact: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  subscription_status: subscriptionStatusSchema,
  subscription_end_date: z.string().nullable().optional(),
  subscription_plan_name: z.string().nullable().optional(),
  is_subscription_blocked: z.boolean(),
  block_reason: subscriptionBlockReasonSchema.nullable().optional(),
  is_impersonated: z.boolean().optional().default(false),
});

export const tokenPairSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().min(1),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;

export function parseAuthUser(input: unknown): AuthUser {
  return authUserSchema.parse(input);
}

export function parseTokenPair(input: unknown): TokenPair {
  return tokenPairSchema.parse(input);
}
