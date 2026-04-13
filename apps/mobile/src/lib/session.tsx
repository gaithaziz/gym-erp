import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import * as SecureStore from "expo-secure-store";

import {
  API_BASE_URL,
  parseBootstrapEnvelope,
  parseEnvelope,
  parseLoginEnvelope,
  type Envelope,
} from "@/lib/api";
import type { MobileBootstrap, TokenPair } from "@gym-erp/contracts";

const TOKEN_STORAGE_KEY = "gym-erp.mobile.tokens";

type SessionStatus = "loading" | "signed_out" | "signed_in";

type SessionContextValue = {
  apiBaseUrl: string;
  bootstrap: MobileBootstrap | null;
  error: string | null;
  status: SessionStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  authorizedRequest: <T>(path: string, init?: RequestInit) => Promise<Envelope<T>>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

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

  return parseEnvelope<T>(parsed);
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

export function SessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [tokenPair, setTokenPair] = useState<TokenPair | null>(null);
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const tokenPairRef = useRef<TokenPair | null>(null);

  useEffect(() => {
    tokenPairRef.current = tokenPair;
  }, [tokenPair]);

  const signOut = useCallback(async () => {
    setTokenPair(null);
    setBootstrap(null);
    setError(null);
    tokenPairRef.current = null;
    await persistTokenPair(null);
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
    setBootstrap(parsed.data);
  }, [authorizedRequest]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
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

      setBootstrap(bootstrapPayload.data);
      setStatus("signed_in");
    },
    [],
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
            setBootstrap(payload.data);
            setStatus("signed_in");
          }
          return;
        }

        const payload = parseBootstrapEnvelope(await readJsonResponse<MobileBootstrap>(response));
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || "Bootstrap failed");
        }

        if (alive) {
          setBootstrap(payload.data);
          setStatus("signed_in");
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
  }, [refreshAccessToken, signOut]);

  const value = useMemo<SessionContextValue>(
    () => ({
      apiBaseUrl: API_BASE_URL,
      bootstrap,
      error,
      status,
      signIn,
      signOut,
      refreshBootstrap,
      authorizedRequest,
    }),
    [authorizedRequest, bootstrap, error, refreshBootstrap, signIn, signOut, status],
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
