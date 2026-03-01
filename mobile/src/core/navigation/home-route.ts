import type { AuthUser } from "@gym-erp/contracts";

import { isBlockedCustomer } from "@/src/core/auth/auth-store";

export function getHomeRoute(user: AuthUser): "/" | "/subscription" {
  return isBlockedCustomer(user) ? "/subscription" : "/";
}
