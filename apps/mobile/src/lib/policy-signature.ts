import * as SecureStore from "expo-secure-store";

import type { MobileBootstrap } from "@gym-erp/contracts";

export type PolicyLocale = "en" | "ar";

export type PolicySignatureCacheEntry = {
  version: string;
  signedAt: string;
};

const POLICY_SIGNATURE_STORAGE_KEY_PREFIX = "gymerpmobilepolicysignature";

function policySignatureStorageKey(userId: string) {
  let hash = 0;
  const input = userId;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `${POLICY_SIGNATURE_STORAGE_KEY_PREFIX}${hash.toString(36)}`;
}

function legacyPolicySignatureStorageKey(userId: string, locale: PolicyLocale) {
  let hash = 0;
  const input = `${userId}:${locale}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `${POLICY_SIGNATURE_STORAGE_KEY_PREFIX}${hash.toString(36)}`;
}

export async function persistPolicySignatureState(
  userId: string,
  value: PolicySignatureCacheEntry | null,
) {
  const key = policySignatureStorageKey(userId);
  if (!value) {
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(legacyPolicySignatureStorageKey(userId, "en")),
      SecureStore.deleteItemAsync(legacyPolicySignatureStorageKey(userId, "ar")),
    ]);
    return;
  }
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

export async function loadPolicySignatureState(userId: string) {
  const raw = await SecureStore.getItemAsync(policySignatureStorageKey(userId))
    || await SecureStore.getItemAsync(legacyPolicySignatureStorageKey(userId, "en"))
    || await SecureStore.getItemAsync(legacyPolicySignatureStorageKey(userId, "ar"));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PolicySignatureCacheEntry> | null;
    if (!parsed || typeof parsed.version !== "string" || typeof parsed.signedAt !== "string") {
      return null;
    }
    return parsed as PolicySignatureCacheEntry;
  } catch {
    return null;
  }
}

export async function clearPolicySignatureState(userId: string) {
  await persistPolicySignatureState(userId, null);
}

export function applyPolicySignatureCache(
  bootstrap: MobileBootstrap,
  cache: PolicySignatureCacheEntry | null,
) {
  if (!cache || cache.version !== bootstrap.policy.current_policy_version) {
    return bootstrap;
  }

  return {
    ...bootstrap,
    policy: {
      ...bootstrap.policy,
      locale_signatures: {
        ...(bootstrap.policy.locale_signatures ?? {}),
        en: true,
        ar: true,
      },
    },
  };
}

export async function hydratePolicySignatureCache(bootstrap: MobileBootstrap) {
  const cache = await loadPolicySignatureState(bootstrap.user.id);
  return applyPolicySignatureCache(bootstrap, cache);
}
