import type { AuthUser } from "@gym-erp/contracts";

export const ACCESS_TOKEN_KEY = "auth.access_token";
export const REFRESH_TOKEN_KEY = "auth.refresh_token";

export function isBlockedCustomer(user: AuthUser | null): boolean {
  return Boolean(
    user &&
      user.role === "CUSTOMER" &&
      (user.is_subscription_blocked ||
        ["EXPIRED", "FROZEN", "NONE"].includes(user.subscription_status)),
  );
}
