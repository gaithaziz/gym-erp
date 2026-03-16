import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AxiosError } from "axios";

import { parseStandardResponse, parseTokenPair, type AuthUser } from "@gym-erp/contracts";

import { SessionContext } from "@/src/core/auth/use-session";
import { clearPersistedTokens, configureApiAuth, fetchCurrentUser } from "@/src/core/api/client";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/src/core/auth/auth-store";
import type { LoginInput, SessionContextValue, SessionState } from "@/src/core/auth/session-types";
import { api, persistTokenPair } from "@/src/core/api/client";
import { secureStorageDriver } from "@/src/core/storage/secure-storage";

const initialState: SessionState = {
  status: "bootstrapping",
  accessToken: null,
  refreshToken: null,
  user: null,
};

async function readStoredState(): Promise<Pick<SessionState, "accessToken" | "refreshToken">> {
  const [accessToken, refreshToken] = await Promise.all([
    secureStorageDriver.getItem(ACCESS_TOKEN_KEY),
    secureStorageDriver.getItem(REFRESH_TOKEN_KEY),
  ]);

  return { accessToken, refreshToken };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>(initialState);

  const finalizeAuthenticatedState = useCallback(async (user: AuthUser) => {
    const stored = await readStoredState();
    setState({
      status: "authenticated",
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      user,
    });
  }, []);

  const markAnonymous = useCallback(async () => {
    await clearPersistedTokens();
    setState({
      status: "anonymous",
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const user = await fetchCurrentUser();
    await finalizeAuthenticatedState(user);
  }, [finalizeAuthenticatedState]);

  const bootstrap = useCallback(async () => {
    const stored = await readStoredState();
    if (!stored.accessToken && !stored.refreshToken) {
      setState({
        status: "anonymous",
        accessToken: null,
        refreshToken: null,
        user: null,
      });
      return;
    }

    try {
      await refreshProfile();
    } catch {
      await markAnonymous();
    }
  }, [markAnonymous, refreshProfile]);

  useEffect(() => {
    configureApiAuth({
      onSessionInvalid: async () => {
        queryClient.clear();
        await markAnonymous();
      },
      onSubscriptionBlocked: () => {
        router.replace("/subscription");
      },
    });

    void bootstrap();
  }, [queryClient]);

  const login = useCallback(async ({ email, password }: LoginInput) => {
      const response = await api.post("/auth/login", { email, password });
      const envelope = parseStandardResponse<unknown>(response.data);
      const tokens = parseTokenPair(envelope.data);

      await persistTokenPair(tokens);
      const user = await fetchCurrentUser();
      await finalizeAuthenticatedState(user);
    }, [finalizeAuthenticatedState]);

  const logout = useCallback(async () => {
      queryClient.clear();
      await markAnonymous();
      router.replace("/login");
    }, [markAnonymous, queryClient]);

  const refreshProfileAction = useCallback(async () => {
      try {
        await refreshProfile();
      } catch (error) {
        if (error instanceof AxiosError) {
          await markAnonymous();
          router.replace("/login");
          return;
        }
        throw error;
      }
    }, [markAnonymous, refreshProfile]);

  const applyUser = useCallback(async (user: AuthUser) => {
    const stored = await readStoredState();
    setState({
      status: "authenticated",
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      user,
    });
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    ...state,
    login,
    logout,
    refreshProfile: refreshProfileAction,
    applyUser,
  }), [applyUser, login, logout, refreshProfileAction, state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
