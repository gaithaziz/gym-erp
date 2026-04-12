import { describe, expect, it } from "vitest";

import {
  localizeMessageType,
  localizePaymentMethod,
  localizeRenewalStatus,
  localizeSubscriptionStatus,
  localizeTicketCategory,
  localizeTicketStatus,
} from "./mobile-format";

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

  it("falls back gracefully for unknown values", () => {
    expect(localizeMessageType("CUSTOM_TYPE", false)).toBe("CUSTOM_TYPE");
    expect(localizePaymentMethod(undefined, true)).toBe("غير معروف");
  });
});
