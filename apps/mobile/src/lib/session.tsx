import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import * as SecureStore from "expo-secure-store";

import {
  API_BASE_URL,
  parseBootstrapEnvelope,
  parseEnvelope,
  parseLoginEnvelope,
  type Envelope,
} from "@/lib/api";
import { getPushRegistration, type PushRegistration } from "@/lib/push-notifications";
import type { MobileBootstrap, TokenPair } from "@gym-erp/contracts";

const TOKEN_STORAGE_KEY = "gymerpmobiletokens";
const PUSH_STORAGE_KEY = "gymerpmobilepushregistration";
const BRANCH_STORAGE_KEY_PREFIX = "gymerpmobileselectedbranch";

type SessionStatus = "loading" | "signed_out" | "signed_in";

type SessionContextValue = {
  apiBaseUrl: string;
  bootstrap: MobileBootstrap | null;
  selectedBranchId: string | null;
  setSelectedBranchId: (branchId: string | null) => Promise<void>;
  error: string | null;
  status: SessionStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  authorizedRequest: <T>(path: string, init?: RequestInit) => Promise<Envelope<T>>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function supportsBranchSelection(bootstrap: MobileBootstrap | null) {
  return bootstrap?.role === "ADMIN" || bootstrap?.role === "MANAGER";
}

function branchStorageKey(userId: string) {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return `${BRANCH_STORAGE_KEY_PREFIX}${hash.toString(36)}`;
}

function describeConnectionIssue() {
  return `Unable to reach ${API_BASE_URL}. If you're on a physical device, set EXPO_PUBLIC_API_BASE_URL to your computer's LAN IP.`;
}

function resolveBranchSelection(
  bootstrap: MobileBootstrap,
  preferredBranchId: string | null,
): string | null {
  if (!supportsBranchSelection(bootstrap)) {
    return null;
  }
  const accessibleIds = new Set((bootstrap.accessible_branches ?? []).map((item) => item.id));
  if (preferredBranchId && accessibleIds.has(preferredBranchId)) {
    return preferredBranchId;
  }
  const homeBranchId = bootstrap.home_branch?.id ?? null;
  if (homeBranchId && accessibleIds.has(homeBranchId)) {
    return homeBranchId;
  }
  const firstBranchId = bootstrap.accessible_branches?.[0]?.id ?? null;
  return firstBranchId;
}

async function readJsonResponse<T>(response: Response): Promise<Envelope<T>> {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(response.ok ? "Empty API response" : `Request failed (${response.status})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const compact = raw.replace(/\s+/g, " ").trim();
    const fallback = compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
    throw new Error(
      response.ok ? "Invalid API response" : fallback || `Request failed (${response.status})`,
    );
  }

  if (parsed && typeof parsed === "object" && "success" in parsed) {
    return parseEnvelope<T>(parsed);
  }

  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const detail = (parsed as { detail?: unknown }).detail;
    return {
      success: false,
      message: typeof detail === "string" ? detail : `Request failed (${response.status})`,
      data: undefined as T,
    };
  }

  if (response.ok) {
    return {
      success: true,
      data: parsed as T,
    };
  }

  return {
    success: false,
    message: `Request failed (${response.status})`,
    data: undefined as T,
  };
}

async function persistTokenPair(value: TokenPair | null) {
  if (!value) {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, JSON.stringify(value));
}

async function loadTokenPair() {
  const raw = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as TokenPair;
}

async function persistPushRegistration(value: PushRegistration | null) {
  if (!value) {
    await SecureStore.deleteItemAsync(PUSH_STORAGE_KEY);
    return;
  }
  await SecureStore.setItemAsync(PUSH_STORAGE_KEY, JSON.stringify(value));
}

async function loadPushRegistration() {
  const raw = await SecureStore.getItemAsync(PUSH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as PushRegistration;
}

async function persistSelectedBranch(userId: string, branchId: string | null) {
  const key = branchStorageKey(userId);
  if (!branchId) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, branchId);
}

async function loadSelectedBranch(userId: string) {
  return SecureStore.getItemAsync(branchStorageKey(userId));
}

async function sendDeviceRegistration(path: string, accessToken: string, registration: PushRegistration) {
  await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(registration),
  });
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [tokenPair, setTokenPair] = useState<TokenPair | null>(null);
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(null);
  const tokenPairRef = useRef<TokenPair | null>(null);

  useEffect(() => {
    tokenPairRef.current = tokenPair;
  }, [tokenPair]);

  const signOut = useCallback(async () => {
    const current = tokenPairRef.current;
    const registration = await loadPushRegistration();
    if (current?.access_token && registration) {
      await sendDeviceRegistration("/mobile/devices/unregister", current.access_token, registration).catch(() => undefined);
    }
    setTokenPair(null);
    setBootstrap(null);
    setSelectedBranchIdState(null);
    setError(null);
    tokenPairRef.current = null;
    await persistTokenPair(null);
    await persistPushRegistration(null);
    setStatus("signed_out");
  }, []);

  const refreshAccessToken = useCallback(async () => {
    const current = tokenPairRef.current;
    if (!current?.refresh_token) {
      throw new Error("Missing refresh token");
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${current.refresh_token}`,
      },
    });

    const payload = parseLoginEnvelope(await readJsonResponse<TokenPair>(response));
    const nextPair = payload.data;
    tokenPairRef.current = nextPair;
    setTokenPair(nextPair);
    await persistTokenPair(nextPair);
    return nextPair;
  }, []);

  const authorizedRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const pair = tokenPairRef.current;
      if (!pair?.access_token) {
        throw new Error("You are signed out");
      }

      const doRequest = async (accessToken: string) =>
        fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers: {
            Accept: "application/json",
            ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
            ...(init.headers ?? {}),
            Authorization: `Bearer ${accessToken}`,
          },
        });

      let response = await doRequest(pair.access_token);
      if (response.status === 401) {
        const nextPair = await refreshAccessToken();
        response = await doRequest(nextPair.access_token);
      }

      const payload = await readJsonResponse<T>(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Request failed");
      }
      return payload;
    },
    [refreshAccessToken],
  );

  const refreshBootstrap = useCallback(async () => {
    const payload = await authorizedRequest<MobileBootstrap>("/mobile/bootstrap");
    const parsed = parseBootstrapEnvelope(payload);
    const storedBranch = await loadSelectedBranch(parsed.data.user.id);
    const resolvedBranch = resolveBranchSelection(parsed.data, storedBranch);
    setBootstrap(parsed.data);
    setSelectedBranchIdState(resolvedBranch);
    await persistSelectedBranch(parsed.data.user.id, resolvedBranch);
  }, [authorizedRequest]);

  const setSelectedBranchId = useCallback(
    async (nextBranchId: string | null) => {
      const current = bootstrap;
      if (!current || !supportsBranchSelection(current)) {
        setSelectedBranchIdState(null);
        return;
      }
      const resolved = resolveBranchSelection(current, nextBranchId);
      setSelectedBranchIdState(resolved);
      await persistSelectedBranch(current.user.id, resolved);
    },
    [bootstrap],
  );

  const registerCurrentDevice = useCallback(async (accessToken: string) => {
    try {
      const registration = await getPushRegistration();
      if (!registration) {
        await persistPushRegistration(null);
        return;
      }
      await sendDeviceRegistration("/mobile/devices/register", accessToken, registration);
      await persistPushRegistration(registration);
    } catch {
      await persistPushRegistration(null);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        const payload = parseLoginEnvelope(await readJsonResponse<TokenPair>(response));
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || "Login failed");
        }

        setTokenPair(payload.data);
        tokenPairRef.current = payload.data;
        await persistTokenPair(payload.data);

        const bootstrapResponse = await fetch(`${API_BASE_URL}/mobile/bootstrap`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${payload.data.access_token}`,
          },
        });
        const bootstrapPayload = parseBootstrapEnvelope(await readJsonResponse<MobileBootstrap>(bootstrapResponse));
        if (!bootstrapResponse.ok || !bootstrapPayload.success) {
          throw new Error(bootstrapPayload.message || "Bootstrap failed");
        }

        const resolvedBranch = resolveBranchSelection(bootstrapPayload.data, await loadSelectedBranch(bootstrapPayload.data.user.id));
        setBootstrap(bootstrapPayload.data);
        setSelectedBranchIdState(resolvedBranch);
        await persistSelectedBranch(bootstrapPayload.data.user.id, resolvedBranch);
        setStatus("signed_in");
        void registerCurrentDevice(payload.data.access_token);
      } catch (caught) {
        await signOut();
        if (caught instanceof TypeError || (caught instanceof Error && caught.message === "Network request failed")) {
          throw new Error(describeConnectionIssue());
        }
        throw caught;
      }
    },
    [registerCurrentDevice, signOut],
  );

  useEffect(() => {
    let alive = true;

    async function restore() {
      try {
        const stored = await loadTokenPair();
        if (!stored || !alive) {
          setStatus("signed_out");
          return;
        }
        setTokenPair(stored);
        tokenPairRef.current = stored;

        const response = await fetch(`${API_BASE_URL}/mobile/bootstrap`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${stored.access_token}`,
          },
        });

        if (response.status === 401) {
          await refreshAccessToken();
          const refreshed = tokenPairRef.current;
          if (!refreshed) {
            throw new Error("Session refresh failed");
          }
          const retry = await fetch(`${API_BASE_URL}/mobile/bootstrap`, {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${refreshed.access_token}`,
            },
          });
          const payload = parseBootstrapEnvelope(await readJsonResponse<MobileBootstrap>(retry));
          if (!retry.ok || !payload.success) {
            throw new Error(payload.message || "Bootstrap failed");
          }
          if (alive) {
            const resolvedBranch = resolveBranchSelection(payload.data, await loadSelectedBranch(payload.data.user.id));
            setBootstrap(payload.data);
            setSelectedBranchIdState(resolvedBranch);
            await persistSelectedBranch(payload.data.user.id, resolvedBranch);
            setStatus("signed_in");
            void registerCurrentDevice(refreshed.access_token);
          }
          return;
        }

        const payload = parseBootstrapEnvelope(await readJsonResponse<MobileBootstrap>(response));
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || "Bootstrap failed");
        }

        if (alive) {
          const resolvedBranch = resolveBranchSelection(payload.data, await loadSelectedBranch(payload.data.user.id));
          setBootstrap(payload.data);
          setSelectedBranchIdState(resolvedBranch);
          await persistSelectedBranch(payload.data.user.id, resolvedBranch);
          setStatus("signed_in");
          void registerCurrentDevice(stored.access_token);
        }
      } catch (caught) {
        if (!alive) {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Session restore failed");
        await signOut();
      }
    }

    void restore();

    return () => {
      alive = false;
    };
  }, [refreshAccessToken, registerCurrentDevice, signOut]);

  const value = useMemo<SessionContextValue>(
    () => ({
      apiBaseUrl: API_BASE_URL,
      bootstrap,
      selectedBranchId,
      setSelectedBranchId,
      error,
      status,
      signIn,
      signOut,
      refreshBootstrap,
      authorizedRequest,
    }),
    [authorizedRequest, bootstrap, selectedBranchId, setSelectedBranchId, error, refreshBootstrap, signIn, signOut, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}
