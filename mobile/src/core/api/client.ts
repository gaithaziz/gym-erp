import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import {
  parseAuthUser,
  parseStandardResponse,
  parseTokenPair,
  SUBSCRIPTION_BLOCKED_CODE,
  type AuthUser,
  type TokenPair,
} from "@gym-erp/contracts";

import { env } from "@/src/core/config/env";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/src/core/auth/auth-store";
import { secureStorageDriver } from "@/src/core/storage/secure-storage";

type AuthConfig = {
  onSessionInvalid?: () => Promise<void> | void;
  onSubscriptionBlocked?: () => void;
};

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean; _fallbackTried?: boolean };

let authConfig: AuthConfig = {};
let refreshPromise: Promise<string | null> | null = null;
const isWebBrowser = typeof window !== "undefined" && typeof document !== "undefined";

export const api = axios.create({
  baseURL: env.apiUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

function getFallbackApiUrls(currentBaseUrl?: string): string[] {
  if (!isWebBrowser) return [];

  const baseUrl = normalizeBaseUrl(currentBaseUrl ?? env.apiUrl);
  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    return [];
  }

  const locationHost =
    typeof globalThis.location?.hostname === "string" ? globalThis.location.hostname.trim() : "";
  const candidates = new Set<string>();
  const addCandidate = (hostname: string) => {
    if (!hostname || hostname === parsed.hostname) return;
    candidates.add(
      normalizeBaseUrl(`${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`),
    );
  };

  addCandidate(locationHost);
  addCandidate("127.0.0.1");
  addCandidate("localhost");

  return [...candidates];
}

function extractErrorCode(error: AxiosError): string | null {
  const data = error.response?.data as
    | { code?: unknown; detail?: { code?: unknown } | string }
    | undefined;

  if (typeof data?.code === "string") return data.code;
  if (data?.detail && typeof data.detail === "object" && "code" in data.detail) {
    return typeof data.detail.code === "string" ? data.detail.code : null;
  }
  return null;
}

async function getStoredTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    secureStorageDriver.getItem(ACCESS_TOKEN_KEY),
    secureStorageDriver.getItem(REFRESH_TOKEN_KEY),
  ]);

  if (!accessToken && !refreshToken) return null;

  return {
    access_token: accessToken ?? "",
    refresh_token: refreshToken ?? "",
    token_type: "bearer",
  };
}

export async function persistTokenPair(tokens: TokenPair): Promise<void> {
  await Promise.all([
    secureStorageDriver.setItem(ACCESS_TOKEN_KEY, tokens.access_token),
    secureStorageDriver.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token),
  ]);
}

export async function clearPersistedTokens(): Promise<void> {
  await Promise.all([
    secureStorageDriver.deleteItem(ACCESS_TOKEN_KEY),
    secureStorageDriver.deleteItem(REFRESH_TOKEN_KEY),
  ]);
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens?.refresh_token) return null;

  try {
    const response = await axios.post(
      `${env.apiUrl}/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${tokens.refresh_token}` } },
    );
    const envelope = parseStandardResponse<unknown>(response.data);
    const refreshedTokens = parseTokenPair(envelope.data);
    await persistTokenPair(refreshedTokens);
    return refreshedTokens.access_token;
  } catch {
    return null;
  }
}

api.interceptors.request.use(async (config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData && config.headers) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  }

  const accessToken = await secureStorageDriver.getItem(ACCESS_TOKEN_KEY);
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as RetryConfig | undefined;
    const errorCode = extractErrorCode(error);
    const url = originalRequest?.url ?? "";
    const isAuthRoute = url.includes("/auth/login") || url.includes("/auth/refresh");

    if (!error.response && originalRequest && !originalRequest._fallbackTried) {
      originalRequest._fallbackTried = true;

      for (const fallbackApiUrl of getFallbackApiUrls(originalRequest.baseURL)) {
        try {
          return await api.request({
            ...originalRequest,
            baseURL: fallbackApiUrl,
          });
        } catch (fallbackError) {
          const axiosFallbackError = fallbackError as AxiosError;
          if (axiosFallbackError.response) {
            return Promise.reject(fallbackError);
          }
        }
      }
    }

    if (status === 403 && errorCode === SUBSCRIPTION_BLOCKED_CODE) {
      authConfig.onSubscriptionBlocked?.();
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const nextAccessToken = await refreshPromise;
      if (nextAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return api.request(originalRequest);
      }

      await clearPersistedTokens();
      await authConfig.onSessionInvalid?.();
    }

    return Promise.reject(error);
  },
);

export function configureApiAuth(nextConfig: AuthConfig): void {
  authConfig = nextConfig;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await api.get("/auth/me");
  const envelope = parseStandardResponse<unknown>(response.data);
  return parseAuthUser(envelope.data);
}
