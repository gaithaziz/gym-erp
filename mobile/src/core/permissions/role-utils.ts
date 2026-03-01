import type { Role } from "@gym-erp/contracts";

export function roleAllows(role: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(role);
}
