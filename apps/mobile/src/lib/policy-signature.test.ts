import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MobileBootstrap } from "@gym-erp/contracts";

import {
  applyPolicySignatureCache,
  clearPolicySignatureState,
  loadPolicySignatureState,
  persistPolicySignatureState,
} from "./policy-signature";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
}));

function makeBootstrap(version = "1.0"): MobileBootstrap {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "test@example.com",
      gym_id: "00000000-0000-4000-8000-000000000010",
      full_name: "Test User",
      phone_number: null,
      profile_picture_url: null,
      role: "CUSTOMER",
      date_of_birth: null,
      emergency_contact: null,
      bio: null,
      subscription_status: "ACTIVE",
      subscription_end_date: null,
      subscription_plan_name: "Monthly",
      is_subscription_blocked: false,
      block_reason: null,
      is_impersonated: false,
    },
    role: "CUSTOMER",
    subscription: {
      status: "ACTIVE",
      end_date: null,
      plan_name: "Monthly",
      is_blocked: false,
      block_reason: null,
    },
    gym: {
      gym_name: "Demo Gym",
      logo_url: null,
      primary_color: "#208AEF",
      secondary_color: "#F97316",
      support_email: null,
      support_phone: null,
    },
    policy: {
      current_policy_version: version,
      requires_signature: true,
      locale_signatures: {},
    },
    home_branch: null,
    accessible_branches: [],
    capabilities: [],
    enabled_modules: [],
    notification_settings: {
      push_enabled: true,
      chat_enabled: true,
      support_enabled: true,
      billing_enabled: true,
      announcements_enabled: true,
    },
  };
}

describe("policy signature cache", () => {
  beforeEach(() => {
    store.clear();
  });

  it("stores and loads a shared signature", async () => {
    await persistPolicySignatureState("user-1", {
      version: "1.2",
      signedAt: "2026-05-02T00:00:00.000Z",
    });

    await expect(loadPolicySignatureState("user-1")).resolves.toEqual({
      version: "1.2",
      signedAt: "2026-05-02T00:00:00.000Z",
    });
  });

  it("applies matching cache entries to both locales", () => {
    const bootstrap = makeBootstrap("2.0");
    const signed = applyPolicySignatureCache(bootstrap, {
      version: "2.0",
      signedAt: "2026-05-02T00:00:00.000Z",
    });

    expect(signed.policy.locale_signatures.ar).toBe(true);
    expect(signed.policy.locale_signatures.en).toBe(true);
    expect(signed.policy.current_policy_version).toBe("2.0");
  });

  it("ignores stale cache entries", () => {
    const bootstrap = makeBootstrap("2.0");
    const unchanged = applyPolicySignatureCache(bootstrap, {
      version: "1.0",
      signedAt: "2026-05-02T00:00:00.000Z",
    });

    expect(unchanged.policy.locale_signatures.en ?? false).toBe(false);
  });

  it("clears the shared signature entry for a user", async () => {
    await persistPolicySignatureState("user-1", {
      version: "1.0",
      signedAt: "2026-05-02T00:00:00.000Z",
    });

    await clearPolicySignatureState("user-1");

    await expect(loadPolicySignatureState("user-1")).resolves.toBeNull();
  });
});
