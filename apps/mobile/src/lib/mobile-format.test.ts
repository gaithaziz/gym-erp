import { describe, expect, it } from "vitest";

import {
  localizeAccessReason,
  localizeAccessStatus,
  localizeLostFoundStatus,
  localizeMessageType,
  localizeNotificationEventType,
  localizeNotificationStatus,
  localizePaymentMethod,
  localizeRenewalStatus,
  localizeSubscriptionStatus,
  localizeTicketCategory,
  localizeTicketStatus,
} from "./mobile-format";
import { parseScannedKioskId } from "./mobile-scan";

describe("mobile-format", () => {
  it("localizes subscription status for Arabic", () => {
    expect(localizeSubscriptionStatus("ACTIVE", true)).toBe("نشط");
    expect(localizeSubscriptionStatus("EXPIRED", true)).toBe("منتهي");
  });

  it("localizes renewal status for English", () => {
    expect(localizeRenewalStatus("PENDING", false)).toBe("Pending");
    expect(localizeRenewalStatus("APPROVED", false)).toBe("Approved");
  });

  it("localizes ticket category and status", () => {
    expect(localizeTicketCategory("TECHNICAL", true)).toBe("تقني");
    expect(localizeTicketStatus("IN_PROGRESS", false)).toBe("In progress");
  });

  it("localizes payment and message types", () => {
    expect(localizePaymentMethod("CASH", true)).toBe("نقداً");
    expect(localizeMessageType("VOICE", false)).toBe("Voice note");
  });

  it("localizes access and notification values", () => {
    expect(localizeAccessStatus("GRANTED", false)).toBe("Granted");
    expect(localizeAccessReason("SUBSCRIPTION_EXPIRED", true)).toBe("الاشتراك منتهي");
    expect(localizeNotificationEventType("SUPPORT_REPLY", false)).toBe("Support reply");
    expect(localizeNotificationStatus("SENT", true)).toBe("تم الإرسال");
    expect(localizeLostFoundStatus("UNDER_REVIEW", false)).toBe("Under review");
  });

  it("parses kiosk ids from raw and json qr payloads", () => {
    expect(parseScannedKioskId("front-door-01")).toBe("front-door-01");
    expect(parseScannedKioskId('{\"kiosk_id\":\"front-desk-02\"}')).toBe("front-desk-02");
    expect(parseScannedKioskId("not valid !!!")).toBeNull();
  });

  it("falls back gracefully for unknown values", () => {
    expect(localizeMessageType("CUSTOM_TYPE", false)).toBe("CUSTOM_TYPE");
    expect(localizePaymentMethod(undefined, true)).toBe("غير معروف");
  });
});
