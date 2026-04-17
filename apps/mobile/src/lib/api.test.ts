import { describe, expect, it } from "vitest";

import {
  parseAdminApprovalsEnvelope,
  parseApprovalActionResultEnvelope,
  parseInventoryProductEnvelope,
  parseInventoryProductsEnvelope,
} from "./api";

describe("mobile admin api parsers", () => {
  it("parses approval queues and action results", () => {
    const approvals = parseAdminApprovalsEnvelope({
      success: true,
      data: {
        renewals: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            member_id: "22222222-2222-4222-8222-222222222222",
            member_name: "Mona Member",
            member_email: "mona@example.com",
            offer_code: "monthly",
            plan_name: "Monthly",
            duration_days: 30,
            status: "PENDING",
            customer_note: "Paid cash",
            requested_at: "2026-04-17T09:00:00Z",
          },
        ],
        leaves: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            staff_id: "44444444-4444-4444-8444-444444444444",
            staff_name: "Sam Staff",
            staff_email: "sam@example.com",
            start_date: "2026-04-18",
            end_date: "2026-04-19",
            leave_type: "SICK",
            status: "PENDING",
            reason: "Medical",
          },
        ],
      },
    });

    expect(approvals.data.renewals[0].plan_name).toBe("Monthly");
    expect(approvals.data.leaves[0].leave_type).toBe("SICK");

    const result = parseApprovalActionResultEnvelope({
      success: true,
      data: {
        status: "APPROVED",
        request_id: "11111111-1111-4111-8111-111111111111",
        subscription_id: "55555555-5555-4555-8555-555555555555",
        transaction_id: "66666666-6666-4666-8666-666666666666",
      },
    });

    expect(result.data.transaction_id).toBe("66666666-6666-4666-8666-666666666666");
  });

  it("parses mobile inventory product payloads", () => {
    const product = {
      id: "77777777-7777-4777-8777-777777777777",
      name: "Protein Bar",
      sku: "BAR-001",
      category: "SNACK",
      price: 3.5,
      cost_price: 1.25,
      stock_quantity: 4,
      low_stock_threshold: 6,
      low_stock_restock_target: 24,
      low_stock_acknowledged_at: null,
      low_stock_snoozed_until: null,
      is_active: true,
      image_url: null,
      created_at: "2026-04-17T09:00:00Z",
    };

    expect(parseInventoryProductEnvelope({ success: true, data: product }).data.name).toBe("Protein Bar");
    expect(parseInventoryProductsEnvelope({ success: true, data: { items: [product] } }).data.items[0].category).toBe("SNACK");
  });
});
