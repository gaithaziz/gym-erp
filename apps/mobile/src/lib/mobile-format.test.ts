import { describe, expect, it } from "vitest";
import { parseMobileStaffMemberRegistrationResult } from "@gym-erp/contracts";

import {
  localizeAccessReason,
  localizeAccessStatus,
  localizeAuditAction,
  localizeFinanceCategory,
  localizeFinanceTransactionType,
  localizeLostFoundStatus,
  localizeMessageType,
  localizeNotificationEventType,
  localizeNotificationStatus,
  localizePaymentMethod,
  localizeRole,
  localizeRenewalStatus,
  localizeSubscriptionStatus,
  localizeTicketCategory,
  localizeTicketStatus,
} from "./mobile-format";
import { parseScannedKioskId, parseScannedKioskPayload } from "./mobile-scan";

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

  it("localizes admin operational values", () => {
    expect(localizeRole("FRONT_DESK", false)).toBe("Front desk");
    expect(localizeFinanceTransactionType("EXPENSE", true)).toBe("مصروف");
    expect(localizeFinanceCategory("POS_SALE", false)).toBe("POS sale");
    expect(localizeAuditAction("PAYROLL_AUTOMATION_RUN", true)).toBe("تشغيل أتمتة الرواتب");
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

  it("parses typed kiosk qr payloads", () => {
    expect(parseScannedKioskPayload('{\"type\":\"staff_check_in\",\"kiosk_id\":\"staff-start-main\"}')).toEqual({
      kind: "staff_check_in",
      kioskId: "staff-start-main",
    });
    expect(parseScannedKioskPayload("gymerp://kiosk/front-door-01")).toEqual({
      kind: "client_entry",
      kioskId: "front-door-01",
    });
    expect(parseScannedKioskId('{\"type\":\"staff_check_out\",\"kiosk_id\":\"staff-end-main\"}')).toBeNull();
  });

  it("falls back gracefully for unknown values", () => {
    expect(localizeMessageType("CUSTOM_TYPE", false)).toBe("CUSTOM_TYPE");
    expect(localizePaymentMethod(undefined, true)).toBe("غير معروف");
  });

  it("parses mobile staff member registration results", () => {
    const parsed = parseMobileStaffMemberRegistrationResult({
      member: {
        id: "11111111-1111-4111-8111-111111111111",
        full_name: "Registered Member",
        email: "registered@example.com",
        phone_number: "+15550001111",
        subscription: { status: "NONE", end_date: null, plan_name: null },
        latest_biometric_date: null,
      },
    });
    expect(parsed.member.email).toBe("registered@example.com");
  });
});
