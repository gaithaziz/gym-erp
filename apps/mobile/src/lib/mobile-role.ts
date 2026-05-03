import type { Capability, EnabledModule, MobileBootstrap, Role } from "@gym-erp/contracts";

export const ADMIN_CONTROL_ROLES = ["ADMIN", "MANAGER"] as const;
export const SUPPORT_STAFF_ROLES = ["ADMIN", "MANAGER", "RECEPTION", "FRONT_DESK"] as const;
export const REGISTRATION_ROLES = ["ADMIN", "MANAGER", "RECEPTION", "FRONT_DESK"] as const;
export const RECEPTION_DESK_ROLES = ["RECEPTION", "FRONT_DESK"] as const;
export const LOST_AND_FOUND_ROLES = ["RECEPTION", "FRONT_DESK", "EMPLOYEE"] as const;
export const LEAVE_VIEW_ROLES = ["COACH", "EMPLOYEE", "RECEPTION", "FRONT_DESK", "CASHIER"] as const;
export const COACH_REVIEW_ROLES = ["ADMIN", "MANAGER", "COACH"] as const;
export const CLASS_MANAGEMENT_ROLES = ["ADMIN", "MANAGER", "COACH"] as const;
export const ADMIN_AUDIT_ROLES = ["ADMIN"] as const;

export function getCurrentRole(bootstrap: MobileBootstrap | null): Role | null {
  return bootstrap?.role ?? null;
}

export function isCustomerRole(role: Role | null | undefined) {
  return role === "CUSTOMER";
}

export function isAdminControlRole(role: Role | null | undefined) {
  return Boolean(role && ADMIN_CONTROL_ROLES.includes(role as (typeof ADMIN_CONTROL_ROLES)[number]));
}

export function isSupportStaffRole(role: Role | null | undefined) {
  return Boolean(role && SUPPORT_STAFF_ROLES.includes(role as (typeof SUPPORT_STAFF_ROLES)[number]));
}

export function canRegisterMembers(role: Role | null | undefined) {
  return Boolean(role && REGISTRATION_ROLES.includes(role as (typeof REGISTRATION_ROLES)[number]));
}

export function isReceptionDeskRole(role: Role | null | undefined) {
  return Boolean(role && RECEPTION_DESK_ROLES.includes(role as (typeof RECEPTION_DESK_ROLES)[number]));
}

export function isCoachRole(role: Role | null | undefined) {
  return role === "COACH";
}

export function isCashierRole(role: Role | null | undefined) {
  return role === "CASHIER";
}

export function canAccessLostFound(role: Role | null | undefined, customer: boolean) {
  return customer || Boolean(role && LOST_AND_FOUND_ROLES.includes(role as (typeof LOST_AND_FOUND_ROLES)[number]));
}

export function canViewLeaves(role: Role | null | undefined) {
  return Boolean(role && LEAVE_VIEW_ROLES.includes(role as (typeof LEAVE_VIEW_ROLES)[number]));
}

export function canReviewCoachSessions(role: Role | null | undefined) {
  return Boolean(role && COACH_REVIEW_ROLES.includes(role as (typeof COACH_REVIEW_ROLES)[number]));
}

export function canManageClasses(role: Role | null | undefined) {
  return Boolean(role && CLASS_MANAGEMENT_ROLES.includes(role as (typeof CLASS_MANAGEMENT_ROLES)[number]));
}

export function canViewAdminAudit(role: Role | null | undefined) {
  return Boolean(role && ADMIN_AUDIT_ROLES.includes(role as (typeof ADMIN_AUDIT_ROLES)[number]));
}

export function hasCapability(bootstrap: MobileBootstrap | null, capability: Capability) {
  return Boolean(bootstrap?.capabilities.includes(capability));
}

export function hasModule(bootstrap: MobileBootstrap | null, module: EnabledModule) {
  return Boolean(bootstrap?.enabled_modules.includes(module));
}

export function isStaffRole(role: Role | null | undefined) {
  return Boolean(role && role !== "CUSTOMER");
}

export function mobileProfilePath() {
  return "/mobile/me/profile";
}

export function mobilePasswordPath() {
  return "/mobile/me/profile/password";
}

export function mobileProfilePicturePath() {
  return "/mobile/me/profile/picture";
}

export function mobileNotificationsPath() {
  return "/mobile/me/notifications";
}

export function mobileNotificationSettingsPath() {
  return "/mobile/me/notification-settings";
}

export function mobileChatContactsPath() {
  return "/mobile/chat/contacts";
}

export function mobileChatThreadsPath() {
  return "/mobile/chat/threads";
}

export function mobileSupportTicketsPath() {
  return "/mobile/support/tickets";
}

export function mobileLostFoundItemsPath() {
  return "/mobile/lost-found/items";
}
