import { describe, expect, it } from "vitest";

import { parseDeepLink, parseNotificationDeepLink } from "./deep-link";

describe("parseDeepLink", () => {
  it("parses all supported simple routes", () => {
    expect(parseDeepLink("gymerp://notifications")).toBe("/notifications");
    expect(parseDeepLink("gymerp://chat")).toBe("/chat");
    expect(parseDeepLink("gymerp://support")).toBe("/ticket");
    expect(parseDeepLink("gymerp://billing")).toBe("/billing");
    expect(parseDeepLink("gymerp://profile")).toBe("/profile");
    expect(parseDeepLink("gymerp://leaves")).toBe("/leaves");
  });

  it("parses tab-level routes", () => {
    expect(parseDeepLink("gymerp://home")).toBe("/(tabs)/home");
    expect(parseDeepLink("gymerp://plans")).toBe("/(tabs)/plans");
    expect(parseDeepLink("gymerp://progress")).toBe("/(tabs)/progress");
  });

  it("parses member deep link with id", () => {
    expect(parseDeepLink("gymerp://member/abc-123")).toEqual({
      pathname: "/(tabs)/members",
      params: { memberId: "abc-123" },
    });
  });

  it("returns null for member without id", () => {
    expect(parseDeepLink("gymerp://member/")).toBeNull();
    expect(parseDeepLink("gymerp://member")).toBeNull();
  });

  it("returns null for unknown routes", () => {
    expect(parseDeepLink("gymerp://unknown-screen")).toBeNull();
    expect(parseDeepLink("gymerp://admin/dashboard")).toBeNull();
  });

  it("returns null for null, undefined, or empty input", () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink(undefined)).toBeNull();
    expect(parseDeepLink("")).toBeNull();
    expect(parseDeepLink("   ")).toBeNull();
  });

  it("handles paths without scheme prefix (bare paths)", () => {
    // When passed a bare screen name like "notifications" without gymerp://
    expect(parseDeepLink("notifications")).toBe("/notifications");
    expect(parseDeepLink("chat")).toBe("/chat");
    expect(parseDeepLink("member/user-99")).toEqual({
      pathname: "/(tabs)/members",
      params: { memberId: "user-99" },
    });
  });

  it("ignores query strings", () => {
    expect(parseDeepLink("gymerp://support?type=freeze")).toBe("/ticket");
    expect(parseDeepLink("gymerp://notifications?unread=3")).toBe("/notifications");
  });

  it("trims whitespace from input", () => {
    expect(parseDeepLink("  gymerp://chat  ")).toBe("/chat");
  });
});

describe("parseNotificationDeepLink", () => {
  it("reads the url field", () => {
    expect(parseNotificationDeepLink({ url: "gymerp://notifications" })).toBe("/notifications");
  });

  it("reads the deep_link field", () => {
    expect(parseNotificationDeepLink({ deep_link: "gymerp://billing" })).toBe("/billing");
  });

  it("reads the screen field", () => {
    expect(parseNotificationDeepLink({ screen: "chat" })).toBe("/chat");
  });

  it("prefers url over deep_link", () => {
    expect(parseNotificationDeepLink({ url: "gymerp://support", deep_link: "gymerp://billing" })).toBe("/ticket");
  });

  it("returns null for missing or empty data", () => {
    expect(parseNotificationDeepLink(null)).toBeNull();
    expect(parseNotificationDeepLink(undefined)).toBeNull();
    expect(parseNotificationDeepLink({})).toBeNull();
    expect(parseNotificationDeepLink({ url: 42 })).toBeNull();
  });
});
