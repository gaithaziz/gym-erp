import type { Capability, EnabledModule, MobileBootstrap, Role } from "@gym-erp/contracts";

export function getCurrentRole(bootstrap: MobileBootstrap | null): Role | null {
  return bootstrap?.role ?? null;
}

export function isCustomerRole(role: Role | null | undefined) {
  return role === "CUSTOMER";
}

export function isAdminControlRole(role: Role | null | undefined) {
  return role === "ADMIN" || role === "MANAGER";
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
